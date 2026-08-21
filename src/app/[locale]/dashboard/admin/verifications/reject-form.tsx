"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { rejectTalachero } from "../actions";

function RejectSubmit() {
  const t = useTranslations("admin");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="destructive" loading={pending}>
      {t("action_reject")}
    </Button>
  );
}

/** Reveals a required reason textarea, then submits rejectTalachero. Kept
 * separate from ConfirmButton because rejection needs a reason input. */
export function RejectForm({ talacheroId }: { talacheroId: string }) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={() => setOpen(true)}>
        {t("action_reject")}
      </Button>
    );
  }

  return (
    <form action={rejectTalachero} className="flex flex-col gap-2">
      <input type="hidden" name="talacheroId" value={talacheroId} />
      <label className="flex flex-col gap-1">
        <span className="text-text-secondary text-xs font-medium">
          {t("reject_reason_label")}
        </span>
        <textarea
          name="reason"
          required
          rows={2}
          placeholder={t("reject_reason_placeholder")}
          className="border-border bg-surface text-text-primary min-w-[220px] border px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <RejectSubmit />
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
