"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, AlertCircle, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import type { OnboardingStatus } from "@/lib/data/talacheros";
import { submitForReview, type SubmitState } from "./onboarding-actions";

function Step({
  done,
  title,
  desc,
  href,
  editLabel,
}: {
  done: boolean;
  title: string;
  desc: string;
  href?: string;
  editLabel?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="text-text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      ) : (
        <Circle className="text-text-muted mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      )}
      <div className="flex-1">
        <p className="text-text-primary text-sm font-medium">{title}</p>
        <p className="text-text-secondary text-xs">{desc}</p>
      </div>
      {href && (
        <Link href={href} className={buttonVariants({ size: "xs", variant: "outline" })}>
          {editLabel}
        </Link>
      )}
    </li>
  );
}

export function OnboardingChecklist({ initial }: { initial: OnboardingStatus }) {
  const t = useTranslations("onboarding");
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitForReview,
    { status: "idle" }
  );

  const banner =
    "flex items-start gap-3 rounded-md border border-border-strong bg-surface-muted px-4 py-3 text-sm text-text-primary";

  if (initial.status === "verified") {
    return (
      <div role="status" className={banner}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">{t("live_title")}</p>
          <p className="text-text-secondary text-xs">{t("live_body")}</p>
        </div>
      </div>
    );
  }

  const canSubmit =
    initial.profileComplete &&
    initial.hasAvailability &&
    (initial.status === "pending" || initial.status === "rejected");
  const errorMsg =
    state.status === "error" ? t(`error_${state.error ?? "generic"}`) : null;

  return (
    <section className="border-border flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-text-primary text-lg font-semibold">{t("title")}</h2>
        <p className="text-text-secondary mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {initial.status === "in_review" && (
        <div role="status" className={banner}>
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("in_review_title")}</p>
            <p className="text-text-secondary text-xs">{t("in_review_body")}</p>
          </div>
        </div>
      )}

      {initial.status === "rejected" && (
        <div role="alert" className={banner}>
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("rejected_title")}</p>
            {initial.rejectionReason && (
              <p className="text-text-primary mt-1 text-sm">
                &ldquo;{initial.rejectionReason}&rdquo;
              </p>
            )}
            <p className="text-text-secondary mt-1 text-xs">{t("rejected_body")}</p>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        <Step
          done={initial.profileComplete}
          title={t("step_profile")}
          desc={t("step_profile_desc")}
          href="/dashboard/talachero/profile"
          editLabel={t("edit")}
        />
        <Step
          done={initial.hasAvailability}
          title={t("step_availability")}
          desc={t("step_availability_desc")}
          href="/dashboard/talachero/availability"
          editLabel={t("edit")}
        />
        <Step
          done={initial.chargesEnabled}
          title={t("step_payments")}
          desc={t("step_payments_desc")}
        />
      </ul>

      {errorMsg && (
        <div role="alert" className={banner}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {initial.status !== "in_review" && (
        <form action={formAction} className="w-fit">
          <Button type="submit" size="sm" loading={pending} disabled={!canSubmit}>
            {initial.status === "rejected" ? t("resubmit") : t("submit")}
          </Button>
        </form>
      )}
    </section>
  );
}
