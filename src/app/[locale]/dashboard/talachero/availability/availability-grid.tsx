"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Lock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailabilitySlotView } from "@/lib/data/talacheros";
import { openSlot, closeSlot } from "./actions";

const TZ = "America/Mexico_City";
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8..19
const HORIZON_DAYS = 14;

type CellState =
  | { kind: "empty" }
  | { kind: "open"; slotId: string }
  | { kind: "booked" };

function keyOf(date: string, hour: number) {
  return `${date}|${hour}`;
}

export function AvailabilityGrid({ initial }: { initial: AvailabilitySlotView[] }) {
  const t = useTranslations("availability");
  const locale = useLocale();

  // Current CDMX civil date + hour (to disable past cells).
  const nowParts = useMemo(() => {
    const d = new Date();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
    );
    return { date, hour };
  }, []);

  // 14 civil dates from today. Anchor at noon UTC so adding whole days never
  // rolls the calendar date (Mexico has no DST regardless).
  const dates = useMemo(() => {
    const [y, m, d] = nowParts.date.split("-").map(Number);
    const anchor = Date.UTC(y, m - 1, d, 12);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return Array.from({ length: HORIZON_DAYS }, (_, i) =>
      fmt.format(new Date(anchor + i * 86400000))
    );
  }, [nowParts.date]);

  const labelFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [locale]
  );

  const [cells, setCells] = useState<Map<string, CellState>>(() => {
    const map = new Map<string, CellState>();
    for (const s of initial) {
      map.set(
        keyOf(s.date, s.hour),
        s.status === "booked" ? { kind: "booked" } : { kind: "open", slotId: s.id }
      );
    }
    return map;
  });

  const [week, setWeek] = useState(0); // 0 or 1
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visibleDates = dates.slice(week * 7, week * 7 + 7);

  function isPast(date: string, hour: number) {
    return date < nowParts.date || (date === nowParts.date && hour <= nowParts.hour);
  }

  function toggle(date: string, hour: number) {
    const k = keyOf(date, hour);
    const cur = cells.get(k) ?? { kind: "empty" };
    if (cur.kind === "booked" || isPast(date, hour)) return;
    // Ignore clicks while an open is still in flight (no real slotId yet), so a
    // fast double-click can never send the "pending" sentinel to closeSlot.
    if (cur.kind === "open" && cur.slotId === "pending") return;
    setError(null);

    if (cur.kind === "empty") {
      setCells((prev) => new Map(prev).set(k, { kind: "open", slotId: "pending" }));
      startTransition(async () => {
        const res = await openSlot(date, hour);
        if (res.ok) {
          setCells((prev) => new Map(prev).set(k, { kind: "open", slotId: res.slotId }));
        } else {
          setCells((prev) => new Map(prev).set(k, { kind: "empty" }));
          setError(res.error);
        }
      });
    } else {
      const slotId = cur.slotId;
      setCells((prev) => new Map(prev).set(k, { kind: "empty" }));
      startTransition(async () => {
        const res = await closeSlot(slotId);
        if (!res.ok) {
          setCells((prev) =>
            new Map(prev).set(
              k,
              res.error === "slot_booked" ? { kind: "booked" } : { kind: "open", slotId }
            )
          );
          setError(res.error);
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {[0, 1].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWeek(w)}
            aria-pressed={week === w}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              week === w
                ? "border-border-strong bg-surface-muted text-text-primary"
                : "border-border text-text-secondary hover:bg-surface-muted"
            )}
          >
            {t(w === 0 ? "week_1" : "week_2")}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-text-primary text-sm">
          {t(`error_${error}`)}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10" />
              {visibleDates.map((d) => (
                <th
                  key={d}
                  className="text-text-secondary min-w-[64px] text-xs font-medium capitalize"
                >
                  {labelFmt.format(new Date(`${d}T12:00:00Z`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td className="text-text-muted pr-1 text-right align-middle text-xs">
                  {String(h).padStart(2, "0")}h
                </td>
                {visibleDates.map((d) => {
                  const cur = cells.get(keyOf(d, h)) ?? { kind: "empty" };
                  const past = isPast(d, h);
                  const booked = cur.kind === "booked";
                  const open = cur.kind === "open";
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        onClick={() => toggle(d, h)}
                        disabled={booked || past}
                        aria-pressed={open}
                        aria-label={t(
                          past
                            ? "cell_past"
                            : open
                              ? "cell_open"
                              : booked
                                ? "cell_booked"
                                : "cell_closed",
                          { hour: h }
                        )}
                        className={cn(
                          "flex h-9 w-full min-w-[64px] items-center justify-center rounded-md border text-xs transition-colors",
                          past && "border-border bg-background opacity-40",
                          !past &&
                            booked &&
                            "border-border-strong bg-surface-muted text-text-muted cursor-not-allowed",
                          !past &&
                            open &&
                            "border-border-strong bg-action-primary text-text-inverse",
                          !past &&
                            !open &&
                            !booked &&
                            "border-border bg-background text-text-secondary hover:bg-surface-muted"
                        )}
                      >
                        {booked ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                        ) : open ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-text-muted text-xs">{t("legend")}</p>
    </div>
  );
}
