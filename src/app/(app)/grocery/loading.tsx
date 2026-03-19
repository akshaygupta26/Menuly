import { ShimmerSkeleton } from "@/components/shared/shimmer-skeleton";

export default function GroceryLoading() {
  return (
    <div className="space-y-4 p-6">
      {/* Progress bar skeleton */}
      <ShimmerSkeleton className="h-6 w-full rounded-md" />

      {/* Category groups */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <ShimmerSkeleton className="h-8 w-40 rounded-md" />
          {Array.from({ length: 3 }).map((_, j) => (
            <ShimmerSkeleton key={j} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
