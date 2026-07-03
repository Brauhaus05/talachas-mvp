import { setRequestLocale, getTranslations } from "next-intl/server";
import { SearchResults } from "./search-results";
import { listTalacheros } from "@/lib/data/talacheros";

export default async function TalacherosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const talacheros = await listTalacheros();

  return (
    <main className="mx-auto max-w-7xl px-10 py-12">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-text-muted text-xs tracking-widest uppercase">
          {t("search.city_label")}
        </p>
        <h1 className="text-text-primary text-4xl font-semibold tracking-tight">
          {t("search.page_title")}
        </h1>
      </div>
      <SearchResults talacheros={talacheros} />
    </main>
  );
}
