"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

/** Renders a labelled action button that requires a second click to submit the
 * enclosing form. `tone="danger"` (Ban/Delete/Refund) gets the high-emphasis
 * solid style; `tone="neutral"` (Unban) gets the lighter outline style. When
 * armed, focus moves to the Confirm button for keyboard/SR users. */
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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60";
  const outline = "border-border-strong text-text-primary border hover:bg-surface-muted";
  const solid = "bg-action-primary text-text-inverse hover:bg-action-primary-hover";

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${base} ${tone === "danger" ? solid : outline}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button ref={confirmRef} type="submit" disabled={pending} className={`${base} ${solid}`}>
        {t("confirm")}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className={`${base} ${outline}`}
      >
        {t("cancel")}
      </button>
    </span>
  );
}
