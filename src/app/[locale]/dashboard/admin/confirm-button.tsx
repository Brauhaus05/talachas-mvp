"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

/** Renders a labelled action button that requires a second click to submit the
 * enclosing form. `tone="danger"` styles destructive actions (ban, delete,
 * refund); `tone="neutral"` for reversible ones (unban). */
export function ConfirmButton({
  label,
  tone = "danger",
}: {
  label: string;
  tone?: "danger" | "neutral";
}) {
  const t = useTranslations("admin");
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  const base = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60";
  const danger = "border-border-strong text-text-primary border hover:bg-surface-muted";
  const primary = "bg-action-primary text-text-inverse hover:bg-action-primary-hover";

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${base} ${tone === "danger" ? danger : primary}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="submit" disabled={pending} className={`${base} ${primary}`}>
        {t("confirm")}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className={`${base} ${danger}`}
      >
        {t("cancel")}
      </button>
    </span>
  );
}
