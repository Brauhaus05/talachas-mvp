"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

/** Labelled form control, matching the booking form's field styling. */
export function AuthField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-text-secondary text-xs font-medium tracking-wider uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Error banner. Grayscale only (PRD §5): meaning is carried by an icon + text,
 * never by a red fill.
 */
export function AuthFormError({ code }: { code: string }) {
  const t = useTranslations("auth");
  return (
    <div
      role="alert"
      className="border-border-strong bg-surface-muted text-text-primary flex items-start gap-3 rounded-md border px-4 py-3 text-sm"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{t(`error_${code}`)}</span>
    </div>
  );
}
