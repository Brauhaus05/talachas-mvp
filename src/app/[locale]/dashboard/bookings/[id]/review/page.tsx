import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getAppUser } from "@/lib/auth";
import { getMyBookings } from "@/lib/data/bookings";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const user = await getAppUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in` as Route);
  }

  // Only the booking's client can review it, only when completed and unreviewed.
  const booking = (await getMyBookings()).find((b) => b.id === id);
  if (!booking || booking.status !== "completed" || booking.hasReview) {
    notFound();
  }

  const t = await getTranslations("reviews");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={"/dashboard" as Route}
          className="text-text-secondary hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-text-primary text-2xl font-semibold">{t("title")}</h1>
        <p className="text-text-secondary mt-1 text-sm">
          {t("subtitle", { name: booking.talacheroName ?? "" })}
        </p>
      </div>
      <ReviewForm bookingId={booking.id} />
    </div>
  );
}
