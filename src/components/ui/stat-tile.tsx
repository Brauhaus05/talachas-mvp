import { cn } from "@/lib/utils";

export interface StatTileProps {
  value: string;
  label: string;
  className?: string;
}

export function StatTile({ value, label, className }: StatTileProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface-raised flex flex-col gap-1 rounded-xl border p-4",
        className
      )}
    >
      <span className="text-text-primary text-2xl font-semibold">{value}</span>
      <span className="text-text-muted text-xs uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
