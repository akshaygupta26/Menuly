"use client";

import { X } from "lucide-react";

interface PageGuideBannerProps {
  icon: string;
  title: string;
  description: string;
  onDismiss: () => void;
}

export function PageGuideBanner({
  icon,
  title,
  description,
  onDismiss,
}: PageGuideBannerProps) {
  return (
    <div className="animate-page-enter mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/5 p-4">
      <span className="mt-0.5 text-xl">{icon}</span>
      <div className="flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss guide"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
