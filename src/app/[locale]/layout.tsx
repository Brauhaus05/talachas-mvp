import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Barlow, Jost } from "next/font/google";
import { routing } from "@/i18n/routing";
import { TopNavBar } from "@/components/layout/top-nav-bar";
import { Footer } from "@/components/layout/footer";
import "../globals.css";

// Barlow carries text; Jost is the shippable stand-in for Futura, which is
// licence-blocked (DESIGN-SYSTEM.md §4 decision 3).
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
});

export const metadata: Metadata = {
  title: "Talachas",
  description: "Tus tareas hechas por manos expertas.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${barlow.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="bg-background text-text-primary flex min-h-full flex-col">
        <NextIntlClientProvider>
          <TopNavBar />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
