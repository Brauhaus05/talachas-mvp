import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { BookingForm } from "./booking-form";
import { getTalacheroById } from "@/lib/data/talacheros";
import { Avatar } from "@/components/ui/avatar";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ locale: string; talacheroId: string }>;
}) {
  const { locale, talacheroId } = await params;
  setRequestLocale(locale);
  const talachero = await getTalacheroById(talacheroId);
  if (!talachero) notFound();

  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-3xl px-10 py-12">
      <ol className="text-text-muted mb-8 flex items-center gap-3 text-xs tracking-widest uppercase">
        <li className="text-text-primary font-semibold">
          1. {t("booking.step_details")}
        </li>
        <span aria-hidden>→</span>
        <li>2. {t("booking.step_summary")}</li>
      </ol>

      <div className="mb-8 flex items-center gap-4">
        <Avatar initials={talachero.initials} size="md" />
        <div className="flex flex-col">
          <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
            {t("booking.page_title")}
          </h1>
          <p className="text-text-muted text-sm">
            {t("checkout.with_talachero", { name: talachero.name })}
          </p>
        </div>
      </div>

      <BookingForm talacheroId={talachero.id} allowedServices={talachero.services} />
    </main>
  );
}
