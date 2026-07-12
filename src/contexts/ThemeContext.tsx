import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

type Theme = 'dark' | 'light';

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
    const cached = localStorage.getItem('theme-preference');
    if (cached === 'light' || cached === 'dark') {
      return cached;
    }
  }
  return 'dark'; // Default
};

// Apply dark class immediately to prevent flash
if (typeof document !== 'undefined') {
  const initialTheme = getInitialTheme();
  if (initialTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const { user, profile } = useAuth();

  // Sync with profile preference when it loads
  useEffect(() => {
    if (profile?.theme_preference) {
      const savedTheme = profile.theme_preference as Theme;
      setThemeState(savedTheme);
      applyTheme(savedTheme);
      // Cache for faster load next time
      localStorage.setItem('theme-preference', savedTheme);
    }
  }, [profile?.theme_preference]);

  // Apply theme to document
  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // Save theme to backend
  const saveThemeToBackend = async (newTheme: Theme) => {
    if (!user) return;

    try {
      await supabase
        .from('profiles')
        .update({ theme_preference: newTheme })
        .eq('id', user.id);
    } catch (error) {
      // Theme save is non-critical; silently ignored
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme-preference', newTheme);
    saveThemeToBackend(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
