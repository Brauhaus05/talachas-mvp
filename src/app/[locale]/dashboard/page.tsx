import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { getMyBookings } from "@/lib/data/bookings";
import { getUnreadMap } from "@/lib/data/chat";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { BookingCard } from "./booking-card";
import { cancelBooking, tipBooking } from "./actions";

const TIP_PRESETS = [50, 100, 200];

export default async function ClientDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const { booked, paid, tipped } = await searchParams;
  const user = await getAppUser();

  // The layout already guaranteed a signed-in user; send the other roles to
  // their own dashboards so /dashboard is always the client home.
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }
  if (user.role === "talachero") {
    redirect(`/${locale}/dashboard/talachero` as Route);
  }
  if (user.role === "admin") {
    redirect(`/${locale}/dashboard/admin` as Route);
  }

  const t = await getTranslations("dashboard");
  const bookings = await getMyBookings();
  const unreadMap = await getUnreadMap();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold">{t("client_title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">{t("client_subtitle")}</p>
      </div>

      {(booked || paid || tipped) && (
        <div
          role="status"
          className="border-border-strong bg-surface-muted text-text-primary flex items-start gap-3 rounded-md border px-4 py-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {paid ? t("paid_success") : tipped ? t("tip_success") : t("booking_success")}
          </span>
        </div>
      )}

      {bookings.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("client_title")}</CardTitle>
            <CardDescription>{t("client_empty")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/talacheros" className={buttonVariants()}>
              {t("client_browse_cta")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bookings.map((b) => (
            <BookingCard
              key={b.id}
              bookingId={b.id}
              unread={unreadMap.get(b.id) ?? 0}
              serviceSlug={b.serviceSlug}
              party={t("booking_with", { name: b.talacheroName ?? "" })}
              slotStart={b.slotStart}
              status={b.status}
              paymentStatus={b.paymentStatus}
              price={b.price}
              locale={locale}
              actions={
                b.status === "requested" || b.status === "confirmed" ? (
                  <form action={cancelBooking}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <button
                      type="submit"
                      className="border-border-strong text-text-primary hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      {t("action_cancel")}
                    </button>
                  </form>
                ) : b.status === "completed" ? (
                  <form action={tipBooking} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <span className="text-text-secondary text-xs">{t("tip_prompt")}</span>
                    {TIP_PRESETS.map((a) => (
                      <button
                        key={a}
                        type="submit"
                        name="amount"
                        value={a}
                        className="border-border-strong text-text-primary hover:bg-surface-muted rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                      >
                        +${a}
                      </button>
                    ))}
                  </form>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
