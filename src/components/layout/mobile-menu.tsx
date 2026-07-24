"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Mobile navigation menu. The primary nav links are `hidden md:*` in TopNavBar,
 * so on small screens this hamburger surfaces them (Catálogo + auth/dashboard
 * links). Sign-out and the language switcher stay in the header bar itself.
 */
export function MobileMenu({
  isSignedIn,
  dashboardPath,
  unread,
}: {
  isSignedIn: boolean;
  dashboardPath: string;
  unread: number;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const linkClass =
    "text-text-secondary hover:text-text-primary flex items-center gap-2 py-2 text-sm";

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("nav.menu_close") : t("nav.menu_open")}
        onClick={() => setOpen((v) => !v)}
        className="text-text-secondary hover:text-text-primary inline-flex h-9 w-9 items-center justify-center"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden />
        ) : (
          <Menu className="h-5 w-5" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 top-20 z-40 cursor-default"
          />
          <div className="border-border bg-background absolute inset-x-0 top-20 z-50 border-b shadow-sm">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-10 py-4">
              <Link href="/talacheros" onClick={close} className={linkClass}>
                {t("nav.catalog")}
              </Link>

              {isSignedIn ? (
                <Link href={dashboardPath} onClick={close} className={linkClass}>
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
              ) : (
                <>
                  <Link href="/auth/sign-up" onClick={close} className={linkClass}>
                    {t("nav.become_talachero")}
                  </Link>
                  <Link href="/auth/sign-in" onClick={close} className={linkClass}>
                    {t("nav.login")}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
