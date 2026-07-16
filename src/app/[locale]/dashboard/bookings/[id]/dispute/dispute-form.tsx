"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { raiseDispute, type DisputeState } from "./actions";

const ERROR_KEYS: Record<string, string> = {
  empty_reason: "error_empty_reason",
  not_refundable: "error_not_refundable",
  already_disputed: "error_already_disputed",
};

export function DisputeForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("disputes");
  const [state, formAction, pending] = useActionState<DisputeState, FormData>(
    raiseDispute,
    {}
  );

  const errorMsg = state.error ? t(ERROR_KEYS[state.error] ?? "error_generic") : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="flex flex-col gap-2">
        <span className="text-text-secondary text-sm font-medium">
          {t("reason_label")}
        </span>
        <textarea
          name="reason"
          rows={5}
          required
          placeholder={t("reason_placeholder")}
          className="border-border-strong bg-surface text-text-primary rounded-md border px-3 py-2 text-sm"
        />
      </label>

      {errorMsg && (
        <p role="alert" className="text-text-primary text-sm">
          {errorMsg}
        </p>
      )}

      <Button type="submit" size="sm" loading={pending} className="w-fit">
        {t("submit")}
      </Button>
    </form>
  );
}
