import { useEffect, useRef, useState, type RefObject } from 'react';

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type ScrollScrubVideoProps = {
  src: string;
  poster: string;
  targetRef: RefObject<HTMLElement | null>;
  className?: string;
};

function canUseScrubbedMedia() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const connection = (navigator as NavigatorWithConnection).connection;
  return !connection?.saveData && connection?.effectiveType !== 'slow-2g';
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Scroll-controlled media for visual storytelling only. The video never
 * plays on its own; its current frame follows the owning section's scroll.
 */
export function ScrollScrubVideo({ src, poster, targetRef, className }: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const target = targetRef.current;
    if (!video || !target) return;

    const enabled = canUseScrubbedMedia();
    setMotionEnabled(enabled);
    if (!enabled) return;

    const cancelFrame = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const syncFrame = () => {
      frameRef.current = null;
      if (!visibleRef.current || document.visibilityState !== 'visible') return;

      const rect = target.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = clamp(-rect.top / travel);
      if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = progress * video.duration;
      }

      frameRef.current = requestAnimationFrame(syncFrame);
    };

    const start = () => {
      if (visibleRef.current) return;
      visibleRef.current = true;
      if (video.readyState === 0) video.load();
      frameRef.current = requestAnimationFrame(syncFrame);
    };

    const stop = () => {
      visibleRef.current = false;
      cancelFrame();
      video.pause();
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start();
      else stop();
    }, { rootMargin: '140px 0px' });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && visibleRef.current) {
        cancelFrame();
        frameRef.current = requestAnimationFrame(syncFrame);
      } else if (document.visibilityState !== 'visible') {
        cancelFrame();
        video.pause();
      }
    };

    observer.observe(target);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [targetRef, src]);

  return (
    <video
      ref={videoRef}
      className={`${className || ''}${videoReady && motionEnabled ? ' auth-scrub-video-ready' : ''}`}
      src={src}
      poster={poster}
      preload={motionEnabled ? 'metadata' : 'none'}
      muted
      playsInline
      aria-hidden="true"
      onLoadedMetadata={() => setVideoReady(true)}
    />
  );
}
