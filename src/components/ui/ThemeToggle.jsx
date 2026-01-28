import { Moon, Sun } from 'lucide-react'
import { Button } from './Button'
import { useTheme } from '../../hooks/useTheme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button
      aria-label="Toggle theme"
      variant="ghost"
      onClick={toggle}
      className="h-10 w-10 p-0 rounded-full"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  )
}
