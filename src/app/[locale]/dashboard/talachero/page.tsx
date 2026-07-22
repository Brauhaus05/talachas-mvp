import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getTalacheroBookings } from "@/lib/data/bookings";
import { getUnreadMap } from "@/lib/data/chat";
import { getMyOnboardingStatus } from "@/lib/data/talacheros";
import { Button } from "@/components/ui/button";
import { BookingCard } from "../booking-card";
import { acceptBooking, rejectBooking, cancelBooking, completeBooking } from "../actions";
import { PaymentsPanel } from "./payments-panel";
import { OnboardingChecklist } from "./onboarding-checklist";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

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
  const unreadMap = await getUnreadMap();
  const onboarding = await getMyOnboardingStatus();
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

      {onboarding && <OnboardingChecklist initial={onboarding} />}

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
                bookingId={b.id}
                unread={unreadMap.get(b.id) ?? 0}
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
                      <Button type="submit" size="xs">
                        {t("action_accept")}
                      </Button>
                    </form>
                    <form action={rejectBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Button type="submit" size="xs" variant="outline">
                        {t("action_reject")}
                      </Button>
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
                bookingId={b.id}
                unread={unreadMap.get(b.id) ?? 0}
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
                        <Button type="submit" size="xs">
                          {t("action_complete")}
                        </Button>
                      </form>
                    )}
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Button type="submit" size="xs" variant="outline">
                        {t("action_cancel")}
                      </Button>
                    </form>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Still-placeholder tools */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_profile")}</CardTitle>
            <CardDescription>{t("talachero_profile_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/profile"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_profile_cta")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_schedule")}</CardTitle>
            <CardDescription>{t("talachero_schedule_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/availability"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_schedule_cta")}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("talachero_earnings")}</CardTitle>
            <CardDescription>{t("talachero_earnings_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/talachero/earnings"
              className={buttonVariants({ size: "sm" })}
            >
              {t("talachero_earnings_cta")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
