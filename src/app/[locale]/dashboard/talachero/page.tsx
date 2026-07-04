import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getTalacheroBookings } from "@/lib/data/bookings";
import { PlaceholderPanel } from "../dashboard-ui";
import { BookingCard } from "../booking-card";
import { acceptBooking, rejectBooking, cancelBooking, completeBooking } from "../actions";
import { PaymentsPanel } from "./payments-panel";

export default async function TalacheroDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getAppUser();

  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  // Role guard: only talacheros belong here; anyone else goes to their own home.
  if (user.role !== "talachero") {
    redirect(`/${locale}${dashboardPathForRole(user.role)}` as Route);
  }

  const t = await getTranslations("dashboard");
  const bookings = await getTalacheroBookings();
  const pending = bookings.filter((b) => b.status === "requested");
  const active = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "in_progress"
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">
          {t("talachero_title")}
        </h1>
        <p className="text-text-secondary mt-1 text-sm">{t("talachero_subtitle")}</p>
      </div>

      <PaymentsPanel />

      {/* Incoming requests */}
      <section className="flex flex-col gap-4">
        <h2 className="text-text-primary text-lg font-semibold">{t("requests_title")}</h2>
        {pending.length === 0 ? (
          <p className="text-text-secondary text-sm">{t("requests_empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pending.map((b) => (
              <BookingCard
                key={b.id}
                serviceSlug={b.serviceSlug}
                party={t("booking_from", { name: b.clientName ?? "" })}
                slotStart={b.slotStart}
                status={b.status}
                paymentStatus={b.paymentStatus}
                price={b.price}
                locale={locale}
                actions={
                  <>
                    <form action={acceptBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        className="bg-action-primary text-text-inverse hover:bg-action-primary-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {t("action_accept")}
                      </button>
                    </form>
                    <form action={rejectBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        className="border-border-strong text-text-primary hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {t("action_reject")}
                      </button>
                    </form>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Active (accepted) bookings */}
      {active.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-text-primary text-lg font-semibold">
            {t("talachero_requests")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {active.map((b) => (
              <BookingCard
                key={b.id}
                serviceSlug={b.serviceSlug}
                party={t("booking_from", { name: b.clientName ?? "" })}
                slotStart={b.slotStart}
                status={b.status}
                paymentStatus={b.paymentStatus}
                price={b.price}
                locale={locale}
                actions={
                  <>
                    {b.status === "confirmed" && (
                      <form action={completeBooking}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button
                          type="submit"
                          className="bg-action-primary text-text-inverse hover:bg-action-primary-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                        >
                          {t("action_complete")}
                        </button>
                      </form>
                    )}
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        className="border-border-strong text-text-primary hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {t("action_cancel")}
                      </button>
                    </form>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Still-placeholder tools */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PlaceholderPanel
          title={t("talachero_profile")}
          description={t("talachero_profile_desc")}
          comingSoon={t("coming_soon")}
        />
        <PlaceholderPanel
          title={t("talachero_schedule")}
          description={t("talachero_schedule_desc")}
          comingSoon={t("coming_soon")}
        />
      </div>
    </div>
  );
}
