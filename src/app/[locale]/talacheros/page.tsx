import { setRequestLocale, getTranslations } from "next-intl/server";
import { SearchResults } from "./search-results";
import { TALACHEROS } from "@/lib/mock/talacheros";

export default async function TalacherosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="mx-auto max-w-7xl px-10 py-12">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-text-muted text-xs uppercase tracking-widest">
          {t("search.city_label")}
        </p>
        <h1 className="text-text-primary text-4xl font-semibold tracking-tight">
          {t("search.page_title")}
        </h1>
      </div>
      <SearchResults talacheros={TALACHEROS} />
    </main>
  );
}
