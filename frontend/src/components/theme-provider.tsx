import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * App-wide light/dark/system theme. Wraps next-themes, which toggles the `dark` class on <html>
 * (matching the `.dark` tokens in index.css) and remembers the choice in localStorage.
 *
 * Read or change the theme anywhere with `useTheme()` from 'next-themes'.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
      // next-themes renders an inline <script> meant for server rendering. In this client-only app it
      // never runs and React 19 warns about it, so mark it as inert data. index.html applies the
      // saved theme before React loads instead, which prevents the flash of the wrong theme.
      scriptProps={{ type: 'application/json' }}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
