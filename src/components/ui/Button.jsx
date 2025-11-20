import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-base transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]'

const variants = {
  primary: 'bg-[#0EA5E9] text-white hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] hover:-translate-y-[1px]',
  outline: 'border border-[#1A1A1A] text-white bg-[#111111] hover:bg-[#1A1A1A] hover:border-[#1F1F1F]',
  ghost: 'text-white hover:bg-[#111111]',
  glass: 'bg-[#111111] border border-[#1A1A1A] text-white hover:bg-[#1A1A1A]',
  gradient: 'text-white bg-[#0EA5E9] hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] hover:-translate-y-[1px]',
}

export const Button = forwardRef(({ className, variant = 'primary', asChild, ...props }, ref) => {
  const Comp = asChild ? motion.span : motion.button
  return (
    <Comp
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(base, variants[variant], className)}
      {...props}
    />
  )
})
Button.displayName = 'Button'
