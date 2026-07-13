import { Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-10 w-10 rounded-full"
        >
          <Sun className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
          <span className="sr-only">Light theme active</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Light theme active</p>
      </TooltipContent>
    </Tooltip>
  );
}
