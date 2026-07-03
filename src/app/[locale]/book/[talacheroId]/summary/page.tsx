import { notFound } from "next/navigation";
import { setRequestLocale, getLocale } from "next-intl/server";
import { getTalacheroById } from "@/lib/data/talacheros";
import type { ServiceSlug } from "@/lib/mock/services";
import { CheckoutView, type CheckoutData } from "./checkout-view";

const PLATFORM_FEE_PCT = 0.15;

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

  const service = (
    typeof sp.service === "string" ? sp.service : talachero.primaryService
  ) as ServiceSlug;
  const description = typeof sp.description === "string" ? sp.description : "";
  const address = typeof sp.address === "string" ? sp.address : "";
  const date = typeof sp.date === "string" ? sp.date : "";
  const time = typeof sp.time === "string" ? sp.time : "";
  const hours = Math.max(
    1,
    Math.min(8, Number(typeof sp.hours === "string" ? sp.hours : 2) || 2)
  );

  const subtotal = talachero.hourlyRateMxn * hours;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_PCT);
  const total = subtotal + platformFee;

  const data: CheckoutData = {
    talacheroName: talachero.name,
    talacheroInitials: talachero.initials,
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
