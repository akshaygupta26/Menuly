"use client";

interface GroceryProgressBarProps {
  checked: number;
  total: number;
}

export function GroceryProgressBar({ checked, total }: GroceryProgressBarProps) {
  const percent = total > 0 ? (checked / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-muted-foreground">Shopping Progress</span>
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
          style={{
            width: `${percent}%`,
            transition: `width var(--duration-smooth) var(--ease-out)`,
          }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-primary">
        {checked} / {total}
      </span>
    </div>
  );
}
