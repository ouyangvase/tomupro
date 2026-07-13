import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const THEME_PREFERENCE_KEY = 'theme-preference';
const THEME_USER_CHOICE_KEY = 'theme-user-choice';
const LIGHT_THEME_RESET_KEY = 'tomupro-light-theme-reset-20260713';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Apply theme immediately on page load (before React hydrates)
const getInitialTheme = (): Theme => {
  // Check localStorage for cached preference (faster than waiting for DB)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, 'light');
      localStorage.setItem(LIGHT_THEME_RESET_KEY, 'done');
      localStorage.removeItem(THEME_USER_CHOICE_KEY);
    } catch {
      // Theme cache is non-critical.
    }
  }
  return 'light'; // Default
};

// Force the production app back to the original light shell before React hydrates.
if (typeof document !== 'undefined') {
  getInitialTheme();
  document.documentElement.classList.remove('dark');
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('light');

  // Keep the app in the previous light theme even if an old profile/browser value says dark.
  useEffect(() => {
    applyTheme('light');
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, 'light');
      localStorage.setItem(LIGHT_THEME_RESET_KEY, 'done');
      localStorage.removeItem(THEME_USER_CHOICE_KEY);
    } catch {
      // Theme cache is non-critical.
    }
  }, []);

  // Apply theme to document. Dark is intentionally disabled for this production shell.
  const applyTheme = (_newTheme: Theme) => {
    document.documentElement.classList.remove('dark');
  };

  const setTheme = (_newTheme: Theme) => {
    setThemeState('light');
    applyTheme('light');
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, 'light');
      localStorage.removeItem(THEME_USER_CHOICE_KEY);
    } catch {
      // Theme cache is non-critical.
    }
  };

  const toggleTheme = () => {
    setTheme('light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
