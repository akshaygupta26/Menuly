"use client";

import { cn } from "@/lib/utils";

interface ShimmerSkeletonProps {
  className?: string;
}

export function ShimmerSkeleton({ className }: ShimmerSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]",
        "bg-gradient-to-r from-[#f0f0f0] via-[#e8e8e8] to-[#f0f0f0]",
        className
      )}
    />
  );
}
