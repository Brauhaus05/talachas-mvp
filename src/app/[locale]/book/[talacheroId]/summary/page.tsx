import { notFound } from "next/navigation";
import { setRequestLocale, getLocale } from "next-intl/server";
import { getTalacheroById } from "@/lib/data/talacheros";
import type { ServiceSlug } from "@/lib/mock/services";
import { CheckoutView, type CheckoutData } from "./checkout-view";

const PLATFORM_FEE_PCT = 0.15;
const TZ = "America/Mexico_City";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; talacheroId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, talacheroId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const currentLocale = await getLocale();

  const talachero = await getTalacheroById(talacheroId);
  if (!talachero) notFound();

  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

  const service = (str(sp.service) || talachero.primaryService) as ServiceSlug;
  const description = str(sp.description);
  const address = str(sp.address);
  const slotId = str(sp.slotId);
  const slotStart = str(sp.slotStart);
  const hours = Math.max(1, Math.min(8, Number(str(sp.hours)) || 2));

  // A slot must have been chosen on the previous step.
  if (!slotId || !slotStart) notFound();

  const start = new Date(slotStart);
  const date = new Intl.DateTimeFormat(currentLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(start);
  const time = new Intl.DateTimeFormat(currentLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(start);

  const subtotal = talachero.hourlyRateMxn * hours;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_PCT);
  const total = subtotal + platformFee;

  const data: CheckoutData = {
    talacheroId: talachero.id,
    talacheroName: talachero.name,
    talacheroInitials: talachero.initials,
    slotId,
    service,
    description,
    address,
    date,
    time,
    hours,
    hourlyRateMxn: talachero.hourlyRateMxn,
    subtotalMxn: subtotal,
    platformFeeMxn: platformFee,
    totalMxn: total,
    currencyLocale: currentLocale,
  };

  return <CheckoutView data={data} />;
}
