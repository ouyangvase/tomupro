import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (val: number) => string;
}

export function AnimatedCounter({
  value,
  duration = 600,
  prefix = '',
  suffix = '',
  className = '',
  formatter,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted = formatter
    ? formatter(display)
    : `${prefix}${Math.round(display).toLocaleString()}${suffix}`;

  return <span className={className}>{formatted}</span>;
}
