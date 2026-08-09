import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const THEME_PREFERENCE_KEY = 'theme-preference';
const THEME_USER_CHOICE_KEY = 'theme-user-choice';

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
  if (typeof window !== 'undefined') {
    try {
      const storedTheme = localStorage.getItem(THEME_USER_CHOICE_KEY)
        || localStorage.getItem(THEME_PREFERENCE_KEY);

      if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme;
      }
    } catch {
      // Theme cache is non-critical.
    }
  }

  return 'light';
};

const initialTheme = getInitialTheme();

const applyTheme = (newTheme: Theme) => {
  document.documentElement.classList.toggle('dark', newTheme === 'dark');
  document.documentElement.style.colorScheme = newTheme;
};

// Apply the cached theme before React renders to avoid a flash of the wrong theme.
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  document.documentElement.style.colorScheme = initialTheme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, newTheme);
      localStorage.setItem(THEME_USER_CHOICE_KEY, newTheme);
    } catch {
      // Theme cache is non-critical.
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
