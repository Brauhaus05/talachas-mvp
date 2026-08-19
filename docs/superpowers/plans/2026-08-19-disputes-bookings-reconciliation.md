# Disputes ↔ Bookings Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/bookings` and `/admin/disputes` agree about a booking's payment state, and give the client a terminal state when their report is resolved.

**Architecture:** Reconcile through the existing `SECURITY DEFINER` RPC layer. `refundBookingIfCaptured` stops returning a bare `boolean` and returns a discriminated outcome, so callers can tell "refund failed" from "already refunded". `forceRefund` then closes an open dispute after a successful refund, and `resolveDispute` records an already-refunded booking instead of silently no-opping. `get_my_bookings` swaps `has_dispute` for `dispute_status` so the client card can render a terminal state.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions) · Supabase Postgres (RLS + `SECURITY DEFINER` RPCs) · Stripe Connect · next-intl · TypeScript strict · pnpm.

**Design doc:** `docs/superpowers/specs/2026-08-19-disputes-bookings-reconciliation-design.md`

---

## ⚠️ Verification model — read before starting

**This repo has no test runner.** CLAUDE.md defines verification as `pnpm typecheck` + `pnpm lint` + `pnpm build` clean, plus manually exercising flows. Do **not** scaffold Vitest/Jest to satisfy a TDD habit — that is a larger, unrequested change to the project. Every task below therefore ends with a concrete *verification* step (a command with expected output, or a SQL assertion) in place of a red/green test cycle.

**Two standing gotchas that will bite you:**

1. **Use `pnpm exec supabase migration up --local`, NEVER `db reset`.** A reset wipes talachero Stripe onboarding (`stripe_account_id`, `charges_enabled`), and Carlos is onboarded locally.
2. **Format only files you touched.** `pnpm format` reformats unrelated Phase 1 files (known prettier drift).

**Prerequisite:** local Supabase stack running (`open -a Docker` then `pnpm exec supabase start`). Ports are remapped +1000 (API `:55321`).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20260819120001_dispute_reconciliation.sql` | create | `get_my_bookings` OUT columns + one-time backfill |
| `src/lib/supabase/database.types.ts` | regenerate | generated — never hand-edit |
| `src/lib/stripe/refunds.ts` | modify | `RefundOutcome` union replaces `boolean` |
| `src/app/[locale]/dashboard/admin/actions.ts` | modify | both admin refund paths reconcile disputes |
| `src/lib/data/bookings.ts` | modify | `disputeStatus` replaces `hasDispute` on `ClientBooking` |
| `src/app/[locale]/dashboard/page.tsx` | modify | client card terminal dispute states |
| `src/app/[locale]/dashboard/admin/payment-badge.tsx` | create | shared translated payment chip (both admin tables) |
| `src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx` | modify | payment + resolved columns |
| `src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx` | modify | use the translated badge |
| `src/lib/notifications/templates.ts` | modify | `disputeDismissedEmail` |
| `src/lib/notifications/notify.ts` | modify | `notifyDisputeDismissed` |
| `messages/es.json`, `messages/en.json` | modify | new keys, kept in sync |

`payment-badge.tsx` sits in the admin folder rather than `src/components/ui/` to match `confirm-button.tsx`, which is already an admin-local shared component imported as `../confirm-button`.

`src/lib/supabase/types.ts` needs **no** change — `DisputeStatus` is already exported there.

---

## Task 1: Migration — `dispute_status` + backfill

**Files:**
- Create: `supabase/migrations/20260819120001_dispute_reconciliation.sql`
- Regenerate: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819120001_dispute_reconciliation.sql`:

```sql
-- Sprint 3 · Disputes ↔ bookings reconciliation.
--
-- 1) get_my_bookings exposes dispute_status in place of has_dispute, so the
--    client dashboard can render a terminal state for a resolved report. Today
--    a dismissed dispute reads "Reporte en revisión" forever, and a refunded one
--    shows nothing at all (the card's payment_status='captured' gate stops
--    matching once the refund lands).
-- 2) One-time backfill closing disputes whose booking was already refunded
--    out-of-band (admin force-refund, or a refund issued from the Stripe
--    dashboard), which leaves them stuck 'open' with no correct resolution path.

-- ---- get_my_bookings: has_dispute → dispute_status --------------------------
-- CREATE OR REPLACE cannot alter a function's OUT columns → DROP then CREATE.
-- disputes.booking_id is UNIQUE, so the scalar subquery returns at most one row;
-- NULL means "no dispute", exactly the old has_dispute = false.
drop function if exists public.get_my_bookings();

create function public.get_my_bookings()
returns table (
  id             uuid,
  status         public.booking_status,
  payment_status text,
  price          numeric,
  currency       text,
  address        text,
  created_at     timestamptz,
  talachero_id   uuid,
  talachero_name text,
  service_slug   text,
  slot_start     timestamptz,
  has_review     boolean,
  dispute_status public.dispute_status
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.status, b.payment_status, b.price, b.currency, b.address,
    b.created_at, tp.id, tu.full_name, sc.slug, s.start_time,
    exists (select 1 from reviews r
            where r.booking_id = b.id and r.author_id = auth.uid()) as has_review,
    (select d.status from disputes d where d.booking_id = b.id) as dispute_status
  from bookings b
  join talachero_profiles tp on tp.id = b.talachero_id
  join users tu on tu.id = tp.user_id
  join service_categories sc on sc.id = b.service_category_id
  left join availability_slots s on s.id = b.slot_id
  where b.client_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_bookings() to authenticated;

-- ---- backfill: close disputes already settled by a refund -------------------
-- resolved_by is deliberately left NULL: no admin decided these, so
-- "resolved_by IS NULL" is the honest audit marker for a system reconciliation.
update public.disputes d
   set status      = 'refunded',
       resolved_at = now(),
       admin_note  = coalesce(
                       d.admin_note,
                       'Cerrada automáticamente: la reserva ya estaba reembolsada.')
  from public.bookings b
 where b.id = d.booking_id
   and d.status = 'open'
   and b.payment_status = 'refunded';
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm exec supabase migration up --local`

Expected: `Applying migration 20260819120001_dispute_reconciliation.sql...` and a clean exit. **If you see `supabase db reset` in your shell history, do not run it.**

- [ ] **Step 3: Verify the function's new shape**

Run:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -c \
  "select column_name, data_type from information_schema.columns
    where table_name = 'get_my_bookings' order by ordinal_position;"
```

Expected: 13 rows ending with `has_review | boolean` and `dispute_status | USER-DEFINED`. There must be **no** `has_dispute` row.

- [ ] **Step 4: Verify the backfill left nothing stuck**

Run:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -c \
  "select count(*) as stuck from disputes d join bookings b on b.id = d.booking_id
    where d.status = 'open' and b.payment_status = 'refunded';"
```

Expected: `stuck | 0`.

- [ ] **Step 5: Regenerate DB types**

Run: `pnpm exec supabase gen types typescript --local > src/lib/supabase/database.types.ts`

Then confirm the change landed:

Run: `grep -c "dispute_status" src/lib/supabase/database.types.ts`

Expected: a non-zero count. `src/lib/supabase/types.ts` needs no edit — `DisputeStatus` is already exported.

> **Note:** `pnpm typecheck` will now FAIL at `src/lib/data/bookings.ts:52` (`r.has_dispute` no longer exists). That is expected and is fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260819120001_dispute_reconciliation.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): get_my_bookings exposes dispute_status + backfill settled disputes"
```

---

## Task 2: `refundBookingIfCaptured` → discriminated outcome

**Files:**
- Modify: `src/lib/stripe/refunds.ts:19-36`
- Modify: `src/app/[locale]/dashboard/admin/actions.ts` (both call sites)

- [ ] **Step 1: Replace the return type in `refunds.ts`**

Replace the whole `refundBookingIfCaptured` function (keep `refundCapturedBooking` above it untouched) with:

```ts
/** Outcome of an attempted refund. `already_refunded` is split out from the
 * failure cases deliberately: nothing is owed to Stripe, but a dispute on that
 * booking should still close as refunded. Collapsing it into a bare `false` is
 * what made the disputes-queue "Reembolsar" button a silent no-op. */
export type RefundOutcome = "refunded" | "already_refunded" | "not_refundable" | "error";

/** Look up a booking and, if it's captured with a payment intent, issue a full
 * refund (best-effort). The charge.refunded webhook reconciles payment_status +
 * the ledger. Shared by the admin force-refund and dispute-resolution paths. */
export async function refundBookingIfCaptured(bookingId: string): Promise<RefundOutcome> {
  const { data: booking } = await createServiceClient()
    .from("bookings")
    .select("stripe_payment_intent_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return "not_refundable";
  if (booking.payment_status === "refunded") return "already_refunded";
  if (booking.payment_status !== "captured" || !booking.stripe_payment_intent_id) {
    return "not_refundable";
  }
  try {
    await refundCapturedBooking(booking.stripe_payment_intent_id);
    return "refunded";
  } catch {
    return "error";
  }
}
```

- [ ] **Step 2: Rewrite `forceRefund` in `actions.ts`**

Replace the existing `forceRefund` function and add the helper directly above it:

```ts
/** Close an open dispute on a booking that was just refunded from the bookings
 * surface, so the two admin queues agree. admin_resolve_dispute self-gates on
 * is_admin() and only accepts an 'open' dispute, which also settles the race
 * with an admin resolving the same dispute from the other surface. */
async function closeOpenDisputeAsRefunded(bookingId: string): Promise<void> {
  const { data: dispute } = await createServiceClient()
    .from("disputes")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "open")
    .maybeSingle();
  if (!dispute) return;
  const supabase = await createClient();
  await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: dispute.id,
    p_refunded: true,
  });
}

/** Force-refund a captured booking. Required authorization check: this path
 * reads via the service client (bypasses RLS) and calls no is_admin()-guarded
 * RPC for the refund itself, so this is the only gate. The charge.refunded
 * webhook reconciles payment_status + ledger. The dispute close is sequenced
 * AFTER the refund and is best-effort — a dispute-write failure must never
 * strand the money. */
export async function forceRefund(formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const outcome = await refundBookingIfCaptured(bookingId);
  if (outcome === "refunded") {
    await closeOpenDisputeAsRefunded(bookingId);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/dashboard/admin/bookings`);
  revalidatePath(`/${locale}/dashboard/admin/disputes`);
}
```

- [ ] **Step 3: Rewrite `resolveDispute` in `actions.ts`**

Replace the existing `resolveDispute` function with:

```ts
/** Resolve a dispute. `action` is "refund" or "dismiss". Admin-only (this reads
 * via the service client, so the role check is the app-level gate;
 * admin_resolve_dispute also self-gates on is_admin()).
 *
 * Refund path: record the dispute as refunded when the money is with the client
 * — either because we just refunded it, or because a force-refund / a refund
 * issued straight from the Stripe dashboard got there first ("already_refunded").
 * A genuine failure still leaves the dispute open so the admin can retry or
 * dismiss (no phantom "refunded").
 *
 * Dismiss path: record the dismissal and tell the client. The refund path sends
 * no email here — notifyRefundIssued already fires from charge.refunded. */
export async function resolveDispute(formData: FormData) {
  const disputeId = String(formData.get("disputeId") ?? "");
  const action = String(formData.get("action") ?? "");
  const user = await getAppUser();
  if (user?.role !== "admin") return;

  const locale = await getLocale();
  const { data: dispute } = await createServiceClient()
    .from("disputes")
    .select("booking_id")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute?.booking_id) {
    revalidatePath(`/${locale}/dashboard/admin/disputes`);
    return;
  }

  let refunded = false;
  if (action === "refund") {
    const outcome = await refundBookingIfCaptured(dispute.booking_id);
    refunded = outcome === "refunded" || outcome === "already_refunded";
    if (!refunded) {
      revalidatePath(`/${locale}/dashboard/admin/disputes`);
      return;
    }
  }

  const supabase = await createClient();
  await supabase.rpc("admin_resolve_dispute", {
    p_dispute_id: disputeId,
    p_refunded: refunded,
  });

  if (!refunded) {
    await notifyDisputeDismissed(dispute.booking_id);
  }

  revalidatePath(`/${locale}/dashboard/admin/disputes`);
  revalidatePath(`/${locale}/dashboard/admin/bookings`);
}
```

- [ ] **Step 4: Add the notify import**

`notifyDisputeDismissed` does not exist until Task 5. To keep this task committable on its own, add the import **and** create the function stub now — Task 5 fills in the template.

In `src/app/[locale]/dashboard/admin/actions.ts`, add to the import block:

```ts
import { notifyDisputeDismissed } from "@/lib/notifications/notify";
```

In `src/lib/notifications/notify.ts`, append a placeholder-free minimal version that already works (it reuses the existing `refundEmail` shape only as a structural model — the dedicated template lands in Task 5):

```ts
/** → client, when an admin dismisses their dispute. The refund path is NOT
 * covered here: notifyRefundIssued already fires from charge.refunded, so
 * emailing on both would double up. Best-effort; never throws. */
export async function notifyDisputeDismissed(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = disputeDismissedEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyDisputeDismissed(${bookingId}) failed:`, err);
  }
}
```

and add `disputeDismissedEmail` to the existing `./templates` import list at the top of `notify.ts`.

**This references a template that does not exist yet. Go do Task 5 now, in full, then come back to Step 5 below.** Task 5 creates `disputeDismissedEmail` and its message copy; without it `pnpm typecheck` cannot pass. Do not attempt to stub the template — a throwaway stub would have to be deleted in Task 5 anyway.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`

Expected: PASS once Tasks 3 and 5 are also done. If run in isolation, the only permitted remaining errors are `has_dispute` in `src/lib/data/bookings.ts` (Task 3) and the missing template (Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe/refunds.ts "src/app/[locale]/dashboard/admin/actions.ts"
git commit -m "feat(admin): reconcile disputes across both refund paths"
```

---

## Task 3: Client dashboard terminal dispute states

**Files:**
- Modify: `src/lib/data/bookings.ts:18,52`
- Modify: `src/app/[locale]/dashboard/page.tsx:145-156`
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Swap the field on `ClientBooking`**

In `src/lib/data/bookings.ts`, change the type import on line 3:

```ts
import type { BookingStatus, DisputeStatus } from "@/lib/supabase/types";
```

In the `ClientBooking` interface, replace `hasDispute: boolean;` with:

```ts
  disputeStatus: DisputeStatus | null;
```

In the `getMyBookings` mapper, replace `hasDispute: r.has_dispute,` with:

```ts
    disputeStatus: r.dispute_status,
```

Leave `TalacheroBooking` and `getTalacheroBookings` untouched.

- [ ] **Step 2: Render the terminal states**

In `src/app/[locale]/dashboard/page.tsx`, replace the block starting at line 145 (`{b.paymentStatus === "captured" &&`) through its closing `))}` — the whole dispute conditional — with:

```tsx
                    {b.disputeStatus === "open" ? (
                      <span className="text-text-secondary text-xs">
                        {t("dispute_pending")}
                      </span>
                    ) : b.disputeStatus === "refunded" ? (
                      <span className="text-text-secondary text-xs">
                        {t("dispute_refunded")}
                      </span>
                    ) : b.disputeStatus === "dismissed" ? (
                      <span className="text-text-secondary text-xs">
                        {t("dispute_reviewed")}
                      </span>
                    ) : b.paymentStatus === "captured" ? (
                      <Link
                        href={`/dashboard/bookings/${b.id}/dispute` as Route}
                        className="border-border-strong text-text-primary hover:bg-surface-muted w-fit rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {t("dispute_cta")}
                      </Link>
                    ) : null}
```

The `captured` gate now guards **only** the CTA (you can only report a problem on money actually taken); a resolved dispute renders regardless of payment state. Do **not** touch the tip block's own `captured` gate at line 112 — that one is correct and was fixed in PR #24.

- [ ] **Step 3: Add the two message keys**

In `messages/es.json`, in the `dashboard` object next to `dispute_pending`:

```json
    "dispute_refunded": "Reporte resuelto — reembolsado",
    "dispute_reviewed": "Reporte revisado",
```

In `messages/en.json`, same position in `dashboard`:

```json
    "dispute_refunded": "Report resolved — refunded",
    "dispute_reviewed": "Report reviewed",
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`

Expected: PASS (no `has_dispute` / `hasDispute` errors remain).

Run: `grep -rn "hasDispute\|has_dispute" src/`

Expected: **no output.** Any hit is a missed consumer.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/bookings.ts "src/app/[locale]/dashboard/page.tsx" messages/es.json messages/en.json
git commit -m "feat(dashboard): terminal client states for resolved disputes"
```

---

## Task 4: Translated payment badge + disputes columns

**Files:**
- Create: `src/app/[locale]/dashboard/admin/payment-badge.tsx`
- Modify: `src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx`
- Modify: `src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx`
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Create the shared badge**

Create `src/app/[locale]/dashboard/admin/payment-badge.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

/** The full set allowed by the bookings.payment_status CHECK constraint
 * (20260703170001_stripe_fields.sql:33). */
const KNOWN = ["none", "authorized", "captured", "refunded", "failed"] as const;

function isKnown(status: string): status is (typeof KNOWN)[number] {
  return (KNOWN as readonly string[]).includes(status);
}

/** Translated payment_status chip, shared by the bookings and disputes tables —
 * both previously rendered the raw column, so operators saw the untranslated
 * string "captured". Unknown values fall back to the raw string so a future
 * status degrades visibly instead of throwing on a missing key. */
export async function PaymentBadge({ status }: { status: string }) {
  const t = await getTranslations("admin");
  return <Badge variant="muted">{isKnown(status) ? t(`payment_${status}`) : status}</Badge>;
}
```

- [ ] **Step 2: Add the message keys**

In `messages/es.json`, in the `admin` object next to the existing `status_*` keys:

```json
    "payment_none": "Sin pago",
    "payment_authorized": "Autorizado",
    "payment_captured": "Cobrado",
    "payment_refunded": "Reembolsado",
    "payment_failed": "Fallido",
    "col_resolved": "Resuelta",
```

In `messages/en.json`, same position in `admin`:

```json
    "payment_none": "No payment",
    "payment_authorized": "Authorized",
    "payment_captured": "Charged",
    "payment_refunded": "Refunded",
    "payment_failed": "Failed",
    "col_resolved": "Resolved",
```

`col_payment` ("Pago"/"Payment") and `col_date` already exist — do not re-add them.

- [ ] **Step 3: Use the badge in the bookings table**

In `src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx`, replace the `Badge` import with the new component:

```tsx
import { PaymentBadge } from "../payment-badge";
```

Delete the now-unused `import { Badge } from "@/components/ui/badge";` line, and replace the payment cell:

```tsx
              <td className="px-4 py-3">
                <PaymentBadge status={b.paymentStatus} />
              </td>
```

- [ ] **Step 4: Add payment + resolved columns to the disputes table**

In `src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx`, add the import alongside the existing `Badge` import (the dispute-status badge still uses `Badge` directly):

```tsx
import { PaymentBadge } from "../payment-badge";
```

Add a date formatter right after the existing `const locale = await getLocale();` line, mirroring `earnings-table.tsx:13`:

```tsx
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
  });
```

In `<thead>`, insert two `<th>` cells between the existing `col_status` and `col_actions` headers:

```tsx
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_payment")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("col_resolved")}
            </th>
```

In `<tbody>`, insert the matching two `<td>` cells between the status cell and the actions cell:

```tsx
              <td className="px-4 py-3">
                <PaymentBadge status={d.paymentStatus} />
              </td>
              <td className="text-text-secondary px-4 py-3">
                {d.resolvedAt ? dateFmt.format(new Date(d.resolvedAt)) : "—"}
              </td>
```

No data-layer change is needed: `admin_list_disputes` already returns `payment_status` and `resolved_at`, and `AdminDispute` already carries `paymentStatus` and `resolvedAt`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS. Lint may still report the 2 pre-existing warnings in `onboarding-actions.ts` — those are untouched and expected.

Run: `grep -rn "{b.paymentStatus}" "src/app/[locale]/dashboard/admin/"`

Expected: **no output** (no raw payment status left in either admin table).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/dashboard/admin/payment-badge.tsx" "src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx" "src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx" messages/es.json messages/en.json
git commit -m "feat(admin): translated payment badge + disputes payment/resolved columns"
```

---

## Task 5: Dismissal email

**Files:**
- Modify: `src/lib/notifications/templates.ts`
- Modify: `src/lib/notifications/notify.ts`
- Modify: `messages/es.json`, `messages/en.json`

- [ ] **Step 1: Add the template**

In `src/lib/notifications/templates.ts`, append after `refundEmail`:

```ts
/** → client, when an admin dismisses their dispute. Deliberately neutral: the
 * app offers no appeal path and no reason field, so the email states closure
 * rather than a verdict. */
export function disputeDismissedEmail(
  locale: string,
  recipientName: string | null,
  counterpartyName: string | null,
  b: BookingFacts
): EmailContent {
  const t = makeT(locale);
  const body =
    paragraph(t("emails.greeting", { name: recipientName ?? "" })) +
    paragraph(t("emails.dispute_dismissed.intro", { talachero: counterpartyName ?? "Talachas" })) +
    row(t("emails.service_label"), serviceLabel(locale, b.serviceSlug));
  return {
    subject: t("emails.dispute_dismissed.subject"),
    html: layout(locale, t("emails.dispute_dismissed.heading"), body),
  };
}
```

- [ ] **Step 2: Wire it into `notify.ts`**

Add `disputeDismissedEmail` to the existing import list from `./templates`. If Task 2 Step 4 already appended `notifyDisputeDismissed`, it now compiles unchanged. If not, append it:

```ts
/** → client, when an admin dismisses their dispute. The refund path is NOT
 * covered here: notifyRefundIssued already fires from charge.refunded, so
 * emailing on both would double up. Best-effort; never throws. */
export async function notifyDisputeDismissed(bookingId: string): Promise<void> {
  try {
    const ctx = await getNotificationContext(createServiceClient(), bookingId);
    if (!ctx) return;
    const email = disputeDismissedEmail(
      ctx.client.locale,
      ctx.client.name,
      ctx.talachero.name,
      ctx.booking
    );
    await sendEmail({ to: ctx.client.email, ...email });
  } catch (err) {
    console.error(`[notifications] notifyDisputeDismissed(${bookingId}) failed:`, err);
  }
}
```

- [ ] **Step 3: Add the email copy**

In `messages/es.json`, in the `emails` object after the `refund` object:

```json
    "dispute_dismissed": {
      "subject": "Revisamos tu reporte",
      "heading": "Reporte revisado",
      "intro": "Revisamos el reporte de tu reserva con {talachero}. El caso quedó cerrado."
    },
```

In `messages/en.json`, same position in `emails`:

```json
    "dispute_dismissed": {
      "subject": "We've reviewed your report",
      "heading": "Report reviewed",
      "intro": "We've reviewed the report for your booking with {talachero}. The case is now closed."
    },
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/templates.ts src/lib/notifications/notify.ts messages/es.json messages/en.json
git commit -m "feat(notifications): email the client when a dispute is dismissed"
```

---

## Task 6: Full verification

**Files:** none modified (verification only, plus HANDOFF at the end)

- [ ] **Step 1: Message-key parity**

Run:

```bash
node -e "
const es=require('./messages/es.json'),en=require('./messages/en.json');
const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?keys(v,p+k+'.'):[p+k]);
const a=new Set(keys(es)),b=new Set(keys(en));
const missEn=[...a].filter(k=>!b.has(k)),missEs=[...b].filter(k=>!a.has(k));
console.log('es',a.size,'en',b.size);
if(missEn.length||missEs.length){console.log('missing in en:',missEn);console.log('missing in es:',missEs);process.exit(1)}
console.log('parity OK');
"
```

Expected: `es 431 en 431` and `parity OK`. The baseline before this work is 420/420; this plan adds exactly 11 leaf keys — 2 (`dashboard`) + 6 (`admin`) + 3 (`emails.dispute_dismissed`). A count other than 431 means a key was missed or duplicated.

- [ ] **Step 2: Static verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`

Expected: all three clean. Build must succeed; the 2 pre-existing `onboarding-actions.ts` lint warnings are acceptable, anything new is not.

- [ ] **Step 3: Format only touched files**

Run:

```bash
pnpm exec prettier --write \
  "src/app/[locale]/dashboard/page.tsx" \
  "src/app/[locale]/dashboard/admin/actions.ts" \
  "src/app/[locale]/dashboard/admin/payment-badge.tsx" \
  "src/app/[locale]/dashboard/admin/bookings/bookings-table.tsx" \
  "src/app/[locale]/dashboard/admin/disputes/disputes-table.tsx" \
  src/lib/data/bookings.ts src/lib/stripe/refunds.ts \
  src/lib/notifications/notify.ts src/lib/notifications/templates.ts
```

Do **not** run bare `pnpm format` — it reformats unrelated Phase 1 files.

- [ ] **Step 4: Manual flow — force-refund reconciles the dispute**

With `pnpm dev` running:

1. Sign in as `mariana.ruiz@demo.talachas.mx` (`password123`), find a `captured` booking, click **Reportar un problema**, submit.
2. Sign in as `admin@talachas.mx`, go to `/dashboard/admin/disputes` — the dispute shows `Abierta` with payment `Cobrado`.
3. Go to `/dashboard/admin/bookings`, click **Reembolsar** on that same booking, confirm.
4. Back on `/dashboard/admin/disputes`: the dispute now reads `Reembolsada`, payment `Reembolsado`, a resolved date is filled in, and the action buttons are gone.
5. As Mariana, the booking card reads **"Reporte resuelto — reembolsado"**.

Expected: every one of those. Step 4 failing means `closeOpenDisputeAsRefunded` isn't firing; check that the Stripe refund actually returned `"refunded"` (the local webhook must be running: `stripe listen --forward-to localhost:3000/api/stripe/webhook`).

- [ ] **Step 5: Manual flow — dismissal**

1. Raise a second dispute as Mariana on another `captured` booking.
2. As admin, click **Descartar** on it.
3. Mariana's card reads **"Reporte revisado"** — not "Reporte en revisión".
4. With `EMAIL_DEV_REDIRECT` set to a real inbox, the dismissal email arrives with subject "Revisamos tu reporte".

- [ ] **Step 6: Manual flow — the previously-stuck case**

Simulate an out-of-band refund to confirm the button no longer no-ops:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -c \
  "update bookings set payment_status='refunded'
    where id = (select booking_id from disputes where status='open' limit 1);"
```

Then click **Reembolsar** on that dispute in the admin queue.

Expected: the dispute closes as `Reembolsada` (the `already_refunded` branch), rather than the page reloading unchanged as it does today.

- [ ] **Step 7: Update HANDOFF.md**

Move the two dispute follow-ups out of "Small follow-ups" and record the change under a dated entry, noting that the two admin surfaces now reconcile and that `has_dispute` was replaced by `dispute_status`.

- [ ] **Step 8: Final commit + push**

```bash
git add -A
git commit -m "docs: HANDOFF — disputes <-> bookings reconciliation"
git push -u origin feat/disputes-bookings-reconciliation
```

Then open a PR against `main`. **Cloud DB note for the PR description:** this migration must reach the cloud via `supabase db push` using the **pooler** `--db-url` (the direct `db.<ref>` host is IPv6-only and times out), and the owner runs it — the password is theirs. The backfill `UPDATE` will run against production data on that push.

---

## Notes for the implementer

- **Task order matters.** Task 1 intentionally leaves `pnpm typecheck` red (the generated types drop `has_dispute` before Task 3 removes its consumer). Tasks 2 and 5 are mutually dependent on one import — do 2's Steps 1–3, then 5, then 2's verification.
- **`admin_resolve_dispute` is unchanged** and requires `status = 'open'`. That is deliberate: it is the concurrency guard when two admins act on the same dispute from different surfaces. Do not relax it.
- **Never write `disputes` directly from a server action.** `INSERT/UPDATE/DELETE` is revoked from `authenticated` precisely so writes flow through audited RPCs; the service client could bypass it but would skip `resolved_by`.
- **The refund path sends no dispute email.** `notifyRefundIssued` already fires from `charge.refunded`. Adding one would double-email the client.
