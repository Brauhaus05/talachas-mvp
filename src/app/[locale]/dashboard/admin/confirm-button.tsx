"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Renders a labelled action button that requires a second click to submit the
 * enclosing form.
 *
 * `tone` is semantic, not an emphasis dial: `"danger"` (Ban/Delete/Refund) gets
 * the destructive style, `"primary"` (Approve) gets the magenta fill, and
 * `"neutral"` (Unban/Dismiss) gets the plain outline. It used to mean emphasis
 * — "danger" was simply how you got the solid style back when primary was
 * near-black — which is why Approve was once tagged danger.
 *
 * When armed, focus moves to the Confirm button for keyboard/SR users. */
const TRIGGER_VARIANT = {
  danger: "destructive",
  primary: "primary",
  neutral: "outline",
} as const;

/** Confirming a destructive act must stay destructive; everything else commits
 * with the normal primary. */
const CONFIRM_VARIANT = {
  danger: "destructive",
  primary: "primary",
  neutral: "primary",
} as const;

export function ConfirmButton({
  label,
  tone = "danger",
}: {
  label: string;
  tone?: "danger" | "primary" | "neutral";
}) {
  const t = useTranslations("admin");
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  if (!armed) {
    return (
      <Button
        type="button"
        size="sm"
        variant={TRIGGER_VARIANT[tone]}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        ref={confirmRef}
        type="submit"
        size="sm"
        variant={CONFIRM_VARIANT[tone]}
        loading={pending}
      >
        {t("confirm")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setArmed(false)}>
        {t("cancel")}
      </Button>
    </span>
  );
}
