import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function Footer() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t("col_services"),
      links: [
        { label: t("services.handyman"), href: "/talacheros" },
        { label: t("services.electrical"), href: "/talacheros" },
        { label: t("services.cleaning"), href: "/talacheros" },
        { label: t("services.moving"), href: "/talacheros" },
      ],
    },
    {
      title: t("col_company"),
      links: [
        { label: t("company.about"), href: "/talacheros" },
        { label: t("company.careers"), href: "/talacheros" },
        { label: t("company.contact"), href: "/talacheros" },
      ],
    },
    {
      title: t("col_support"),
      links: [
        { label: t("support.help"), href: "/talacheros" },
        { label: t("support.faq"), href: "/talacheros" },
        { label: t("support.privacy"), href: "/talacheros" },
        { label: t("support.terms"), href: "/talacheros" },
      ],
    },
  ];

  return (
    <footer className="border-border bg-background mt-24 border-t">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-10 py-16 md:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Link
            href="/"
            className="text-text-primary text-xl font-semibold tracking-tight"
          >
            Talachas
          </Link>
          <p className="text-text-secondary max-w-xs text-sm">
            {t("brand_description")}
          </p>
          <p className="text-text-muted mt-6 text-xs">
            {t("rights", { year })}
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title} className="flex flex-col gap-4">
            <h4 className="text-text-primary text-sm font-semibold">
              {col.title}
            </h4>
            <ul className="flex flex-col gap-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-text-secondary hover:text-text-primary text-sm"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
