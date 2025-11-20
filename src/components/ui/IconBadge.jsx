import { cn } from '../../lib/cn'

export default function IconBadge({ className, children }) {
  return (
    <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-foreground border border-border', className)}>
      {children}
    </div>
  )
}