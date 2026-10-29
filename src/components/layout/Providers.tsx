'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RefreshProvider } from '@/lib/refresh';
import { usePersistentFlag } from '@/lib/browserState';

type Theme = 'dark' | 'light';

const THEME_KEY = 'filetrust-explorer-theme';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within Providers');
  }
  return value;
}

/// What the operating system asks for, when nothing has been saved yet.
const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

/// Accepts both what this key holds now and what it held before it was a flag.
const readTheme = (raw: string) => raw === 'light' || raw === '1';

export function Providers({ children }: { children: React.ReactNode }) {
  // Stored as a flag because there are two themes. The store is the source of
  // truth, so nothing has to wait a render for the saved value to arrive.
  const [isLight, setIsLight] = usePersistentFlag(THEME_KEY, prefersLight, readTheme);
  const theme: Theme = isLight ? 'light' : 'dark';
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const themeValue = useMemo(
    () => ({
      theme,
      toggleTheme: () => setIsLight(current => !current),
    }),
    [theme, setIsLight]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    // Writing to the document is what an effect is for: it is the one thing
    // here that is genuinely an external system being told about React's state.
  }, [theme]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <QueryClientProvider client={client}>
        <RefreshProvider>{children}</RefreshProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
