import { ShimmerSkeleton } from "@/components/shared/shimmer-skeleton";

export default function RecipesLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Quick bar skeleton */}
      <ShimmerSkeleton className="h-11 w-full rounded-lg" />

      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <ShimmerSkeleton className="h-9 w-48 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[10px]">
            <ShimmerSkeleton className="aspect-[16/9] w-full" />
            <div className="space-y-2 p-4">
              <ShimmerSkeleton className="h-5 w-3/4" />
              <ShimmerSkeleton className="h-3 w-1/2" />
              <ShimmerSkeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
