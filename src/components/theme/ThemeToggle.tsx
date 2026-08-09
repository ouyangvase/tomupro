import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const nextThemeLabel = isDark ? 'light' : 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${nextThemeLabel} theme`}
          aria-pressed={isDark}
          className="h-10 w-10 rounded-full"
        >
          {isDark ? (
            <Sun className="h-5 w-5 text-foreground transition-colors" />
          ) : (
            <Moon className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          )}
          <span className="sr-only">Switch to {nextThemeLabel} theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Switch to {nextThemeLabel} theme</p>
      </TooltipContent>
    </Tooltip>
  );
}
