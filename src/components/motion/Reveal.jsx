import { motion, useAnimation, useInView } from 'framer-motion'
import { useEffect, useRef } from 'react'

export default function Reveal({ children, delay = 0, y = 12, as = 'div', ...rest }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const controls = useAnimation()

  useEffect(() => {
    if (inView) controls.start('visible')
  }, [inView, controls])

  const Component = motion[as] || motion.div

  return (
    <Component
      ref={ref}
      variants={{ hidden: { opacity: 0, y }, visible: { opacity: 1, y: 0 } }}
      initial="hidden"
      animate={controls}
      transition={{ duration: 0.6, delay }}
      {...rest}
    >
      {children}
    </Component>
  )
}
