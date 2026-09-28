import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Route } from 'lucide-react';
import tomuAuthHero from '@/assets/tomupro-auth-hero.png';
import { ScrollScrubVideo } from './ScrollScrubVideo';

type HeroMotionMediaProps = {
  desktopVideoSrc?: string;
  mobileVideoSrc?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

function canUseMotion() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const connection = (navigator as NavigatorWithConnection).connection;
  return !connection?.saveData && connection?.effectiveType !== 'slow-2g';
}

export function HeroMotionMedia({
  desktopVideoSrc = '/landing/tomupro-operations-diagnostic.mp4',
  mobileVideoSrc,
}: HeroMotionMediaProps) {
  const scrubShellRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const activeVideoSrc = isMobile && mobileVideoSrc ? mobileVideoSrc : desktopVideoSrc;

  useEffect(() => {
    setMotionEnabled(canUseMotion());

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleViewportChange = () => setIsMobile(mediaQuery.matches);
    handleViewportChange();
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  const animatePointer = () => {
    const element = visualRef.current;
    if (!element) return;

    const target = pointerTargetRef.current;
    const current = pointerCurrentRef.current;
    current.x += (target.x - current.x) * 0.14;
    current.y += (target.y - current.y) * 0.14;

    element.style.setProperty('--hero-tilt-x', `${current.y * -1.2}deg`);
    element.style.setProperty('--hero-tilt-y', `${current.x * 1.2}deg`);
    element.style.setProperty('--hero-shift-x', `${current.x * 7}px`);
    element.style.setProperty('--hero-shift-y', `${current.y * 5}px`);

    if (Math.abs(target.x - current.x) > 0.01 || Math.abs(target.y - current.y) > 0.01) {
      pointerFrameRef.current = requestAnimationFrame(animatePointer);
    } else {
      pointerFrameRef.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!motionEnabled || !window.matchMedia('(pointer: fine)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerTargetRef.current = {
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    };
    if (pointerFrameRef.current === null) pointerFrameRef.current = requestAnimationFrame(animatePointer);
  };

  const resetPointer = () => {
    pointerTargetRef.current = { x: 0, y: 0 };
    if (motionEnabled && pointerFrameRef.current === null) pointerFrameRef.current = requestAnimationFrame(animatePointer);
  };

  return (
    <div ref={scrubShellRef} className="auth-hero-scrub-shell">
      <div
        ref={visualRef}
        className={`auth-hero-sticky-media auth-hero-visual relative overflow-hidden rounded-[2rem] border border-white/80 bg-[#dce4ed] p-2 shadow-[0_30px_80px_rgba(10,20,40,0.16)] sm:rounded-[2.8rem] sm:p-3${motionEnabled ? ' auth-motion-enabled' : ''}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
      >
        <div className="auth-media-stage relative overflow-hidden rounded-[1.5rem] sm:rounded-[2.25rem]">
          <img
            src={tomuAuthHero}
            alt="TOMUPRO courier loading parcels into a delivery van"
            className="auth-media-poster h-[480px] w-full object-cover sm:h-[610px] lg:h-[690px]"
            fetchPriority="high"
          />
          <ScrollScrubVideo
            targetRef={scrubShellRef}
            src={activeVideoSrc}
            poster={tomuAuthHero}
            className="auth-media-video absolute inset-0 h-full w-full object-cover"
          />
          <div className="auth-image-shade absolute inset-0" aria-hidden="true" />
          <div className="auth-route-line auth-route-line-one" aria-hidden="true" />
          <div className="auth-route-line auth-route-line-two" aria-hidden="true" />
          <div className="auth-hero-diagnostic-frame" aria-hidden="true">
            <div className="auth-hero-diagnostic-grid" />
            <div className="auth-hero-diagnostic-orbit auth-hero-diagnostic-orbit-one" />
            <div className="auth-hero-diagnostic-orbit auth-hero-diagnostic-orbit-two" />
            <div className="auth-hero-diagnostic-scan" />
            <div className="auth-hero-diagnostic-piece auth-hero-diagnostic-piece-one"><span>01</span><span>SCAN</span></div>
            <div className="auth-hero-diagnostic-piece auth-hero-diagnostic-piece-two"><span>02</span><span>ROUTE</span></div>
            <div className="auth-hero-diagnostic-piece auth-hero-diagnostic-piece-three"><span>03</span><span>HANDOFF</span></div>
            <div className="auth-hero-diagnostic-readout"><span className="auth-live-dot auth-live-dot-green" /> SYSTEM DIAGNOSTICS / SCROLL LINKED</div>
            <div className="auth-hero-diagnostic-corner auth-hero-diagnostic-corner-one" />
            <div className="auth-hero-diagnostic-corner auth-hero-diagnostic-corner-two" />
          </div>
          <div className="auth-tracking-card absolute left-4 top-4 rounded-2xl border border-white/70 bg-[#fffefa]/95 p-4 shadow-xl backdrop-blur-md sm:left-8 sm:top-8 sm:min-w-[245px]">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#3b8b59]"><span className="auth-live-dot auth-live-dot-green" /> Scroll-linked status</div>
            <p className="text-lg font-black text-[#0a1428]">Out for delivery</p>
            <p className="mt-1 text-xs font-semibold text-[#758197]">Illustrative operations view</p>
          </div>
          <div className="auth-delivered-card absolute bottom-4 left-4 right-4 rounded-2xl border border-white/70 bg-[#fffefa]/95 p-4 shadow-xl backdrop-blur-md sm:bottom-8 sm:left-auto sm:right-8 sm:w-[360px]">
            <div className="flex items-center gap-3">
              <div className="auth-check-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#dff3e5] text-[#3b8b59]"><Check className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="font-black text-[#3b8b59]">Delivery handoff</p><p className="truncate text-xs font-semibold text-[#758197]">A clear final status for every parcel</p></div>
              <p className="ml-auto hidden text-right text-[10px] font-extrabold text-[#758197] sm:block">TOMU<br />SYSTEM</p>
            </div>
          </div>
        </div>
        <div className="auth-hero-chip absolute -right-2 top-[42%] hidden rounded-2xl border border-[#eadbbd] bg-[#fffefa] p-4 shadow-xl lg:block">
          <Route className="mb-3 h-5 w-5 text-[#bd8b2d]" />
          <p className="text-2xl font-black text-[#0a1428]">04</p>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#758197]">districts connected</p>
        </div>
      </div>
    </div>
  );
}
