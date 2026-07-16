"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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

  if (!armed) {
    return (
      <Button
        type="button"
        size="sm"
        variant={tone === "danger" ? "primary" : "outline"}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button ref={confirmRef} type="submit" size="sm" loading={pending}>
        {t("confirm")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setArmed(false)}>
        {t("cancel")}
      </Button>
    </span>
  );
}
