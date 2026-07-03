import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export async function TopNavBar() {
  const t = await getTranslations();

  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-8 px-10">
        <Link
          href="/"
          className="text-text-primary text-2xl font-semibold tracking-tight"
        >
          {t("meta.brand")}
        </Link>

        <div className="border-border bg-surface hidden max-w-md flex-1 items-center gap-3 rounded-full border px-4 py-2 md:flex">
          <Search className="text-text-muted h-4 w-4" aria-hidden />
          <input
            type="search"
            placeholder={t("nav.search_placeholder")}
            className="text-text-primary placeholder:text-text-muted w-full bg-transparent text-sm focus:outline-none"
            aria-label={t("nav.search_placeholder")}
          />
        </div>

        <nav className="ml-auto flex items-center gap-6">
          <Link
            href="/talacheros"
            className="text-text-secondary hover:text-text-primary hidden text-sm md:inline-block"
          >
            {t("nav.how_it_works")}
          </Link>
          <Link
            href="/talacheros"
            className="text-text-secondary hover:text-text-primary hidden text-sm md:inline-block"
          >
            {t("nav.become_talachero")}
          </Link>
          <Link
            href="/talacheros"
            className="text-text-secondary hover:text-text-primary hidden text-sm md:inline-block"
          >
            {t("nav.login")}
          </Link>
          <Link
            href="/talacheros"
            className="bg-action-primary text-text-inverse hover:bg-action-primary-hover inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
          >
            {t("nav.signup")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
