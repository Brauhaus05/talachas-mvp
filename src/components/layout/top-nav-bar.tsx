import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAppUser, dashboardPathForRole } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data/chat";
import { signOut } from "@/app/[locale]/auth/actions";
import { LocaleSwitcher } from "./locale-switcher";

export async function TopNavBar() {
  const t = await getTranslations();
  const user = await getAppUser();
  const unread = user ? await getUnreadCount() : 0;

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
            {t("nav.catalog")}
          </Link>

          {user ? (
            <>
              <Link
                href={dashboardPathForRole(user.role)}
                className="text-text-secondary hover:text-text-primary relative hidden items-center gap-2 text-sm md:inline-flex"
              >
                {t("dashboard.nav_dashboard")}
                {unread > 0 && (
                  <span
                    aria-label={t("dashboard.unread_aria", { count: unread })}
                    className="bg-action-primary text-text-inverse inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
                  >
                    {unread}
                  </span>
                )}
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-text-secondary hover:text-text-primary text-sm"
                >
                  {t("auth.sign_out")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/auth/sign-up"
                className="text-text-secondary hover:text-text-primary hidden text-sm md:inline-block"
              >
                {t("nav.become_talachero")}
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-text-secondary hover:text-text-primary hidden text-sm md:inline-block"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/auth/sign-up"
                className="bg-action-primary text-text-inverse hover:bg-action-primary-hover inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
              >
                {t("nav.signup")}
              </Link>
            </>
          )}
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
