import { useEffect, useState } from 'react'

// Minimal theme manager using documentElement class and localStorage
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    return mql.matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    // Apply theme class immediately
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Persist to localStorage
    localStorage.setItem('theme', theme)
  }, [theme])

  // Apply theme on mount to ensure sync with inline script
  useEffect(() => {
    const root = document.documentElement
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') {
      if ((saved === 'dark' && !root.classList.contains('dark')) ||
          (saved === 'light' && root.classList.contains('dark'))) {
        root.classList.toggle('dark', saved === 'dark')
      }
    }
  }, [])

  return { theme, setTheme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }
}
