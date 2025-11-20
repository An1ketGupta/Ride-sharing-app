import { cn } from '../../lib/cn';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-muted/50',
        className
      )}
      {...props}
    />
  );
}

export function RideCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6 border border-white/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-6 w-20 ml-auto rounded-full" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="flex md:flex-col items-center md:items-end gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function BookingCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6 border border-white/20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20 ml-auto rounded-full" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function PaymentCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6 border-l-4 border-l-emerald-600 border-y border-r border-white/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid sm:grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}


