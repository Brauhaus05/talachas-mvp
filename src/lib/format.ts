export function formatMxn(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}
