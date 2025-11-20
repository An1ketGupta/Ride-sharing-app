import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]'

const variants = {
  primary: 'bg-primary text-primary-foreground shadow-soft hover:brightness-110',
  outline: 'border border-border text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted/60',
  glass: 'glass text-foreground hover:bg-white/70 hover:dark:bg-white/10',
  gradient: 'text-white bg-[linear-gradient(135deg,#6366f1,40%,#06b6d4)] hover:brightness-110 shadow-glow',
}

export const Button = forwardRef(({ className, variant = 'primary', asChild, ...props }, ref) => {
  const Comp = asChild ? motion.span : motion.button
  return (
    <Comp
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={cn(base, variants[variant], className)}
      {...props}
    />
  )
})
Button.displayName = 'Button'
