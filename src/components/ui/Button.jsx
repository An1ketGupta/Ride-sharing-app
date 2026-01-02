import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'

const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-sm transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]'

const variants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  outline: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  success: 'bg-green-600 text-white hover:bg-green-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
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
