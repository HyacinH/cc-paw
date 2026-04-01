import { useThemeStore } from '../store/theme.store'

export function useMonacoTheme(): 'vs-dark' | 'vs' {
  const { theme } = useThemeStore()
  return theme === 'dark' ? 'vs-dark' : 'vs'
}
