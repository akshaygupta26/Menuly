"use client";

import { useState } from "react";

interface HelpIconProps {
  onClick: () => void;
}

export function HelpIcon({ onClick }: HelpIconProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground/40 transition-colors hover:border-primary/30 hover:text-primary"
        aria-label="Show me around"
      >
        ?
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-muted-foreground shadow-md">
          Show me around
        </div>
      )}
    </div>
  );
}
