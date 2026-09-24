import { useRef } from 'react';
import { Activity, Boxes, Crosshair, PackageCheck, ScanLine, ShieldCheck } from 'lucide-react';
import { ScrollScrubVideo } from './ScrollScrubVideo';

const ASSEMBLY_MODULES = [
  { label: 'WAREHOUSE / PICK', detail: 'Scanned', icon: Boxes, className: 'auth-assembly-module-one' },
  { label: 'PACK / DISPATCH', detail: 'Connected', icon: Crosshair, className: 'auth-assembly-module-two' },
  { label: 'DRIVER / DOORSTEP', detail: 'Visible', icon: ShieldCheck, className: 'auth-assembly-module-three' },
];

export function ScrollAssemblySection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="auth-assembly-section relative overflow-hidden px-5 py-24 sm:px-8 lg:px-12 lg:py-36" aria-labelledby="assembly-title">
      <div className="auth-assembly-grid absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div className="max-w-xl">
          <p className="auth-eyebrow">The operating sequence</p>
          <h2 id="assembly-title" className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.05em] text-[#0a1428] sm:text-6xl">
            From warehouse scan to customer handoff.
          </h2>
          <p className="mt-6 text-base leading-7 text-[#68758b] sm:text-lg">
            A single operational thread connects stock, orders, dispatch, drivers, and the final delivery outcome without adding another layer of work.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: ScanLine, label: 'Scan the order', detail: 'Start with a verified handoff' },
              { icon: Activity, label: 'Read the route', detail: 'Keep movement visible' },
              { icon: PackageCheck, label: 'Close the loop', detail: 'Capture the final outcome' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="auth-assembly-step flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3.5 backdrop-blur-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dfc45d] text-black"><Icon className="h-4 w-4" /></div>
                  <div><p className="text-sm font-black text-[#0a1428]">{item.label}</p><p className="mt-0.5 text-xs text-[#7a8494]">{item.detail}</p></div>
                </div>
              );
            })}
          </div>
        </div>

        <div ref={scrollRef} className="auth-assembly-scroll" aria-hidden="true">
          <div className="auth-assembly-viewport">
            <div className="auth-assembly-stage">
              <ScrollScrubVideo
                targetRef={scrollRef}
                poster="/landing/tomupro-auth-hero-public.png"
                className="auth-assembly-video"
                src="/landing/tomupro-operations-diagnostic.mp4"
              />
              <div className="auth-assembly-orbit auth-assembly-orbit-one" />
              <div className="auth-assembly-orbit auth-assembly-orbit-two" />
              <div className="auth-assembly-crosshair auth-assembly-crosshair-one" />
              <div className="auth-assembly-crosshair auth-assembly-crosshair-two" />
              <div className="auth-assembly-scan-line" />
              <div className="auth-assembly-core">
                <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-4">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#dfc45d]">TOMUPRO / LIVE SYSTEM</p><p className="mt-2 text-lg font-black text-white">Delivery sequence</p></div>
                  <span className="auth-assembly-status"><span className="auth-live-dot auth-live-dot-green" /> CLEAR</span>
                </div>
                <div className="auth-assembly-core-grid">
                  <span className="auth-assembly-core-dot auth-assembly-core-dot-one" />
                  <span className="auth-assembly-core-dot auth-assembly-core-dot-two" />
                  <span className="auth-assembly-core-dot auth-assembly-core-dot-three" />
                  <span className="auth-assembly-core-line auth-assembly-core-line-one" />
                  <span className="auth-assembly-core-line auth-assembly-core-line-two" />
                  <span className="auth-assembly-core-line auth-assembly-core-line-three" />
                  <div className="auth-assembly-core-center"><PackageCheck className="h-8 w-8 text-[#bd8b2d]" /><span>ORDER</span></div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-center">
                  <div><p className="text-base font-black text-white">01</p><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-white/55">verified</p></div>
                  <div className="border-x border-white/15"><p className="text-base font-black text-white">04</p><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-white/55">handoffs</p></div>
                  <div><p className="text-base font-black text-white">100%</p><p className="mt-1 text-[8px] font-extrabold uppercase tracking-[0.12em] text-white/55">visible</p></div>
                </div>
              </div>
              {ASSEMBLY_MODULES.map((module) => {
                const Icon = module.icon;
                return (
                  <div key={module.label} className={`auth-assembly-module ${module.className}`}>
                    <Icon className="h-4 w-4 text-[#bd8b2d]" />
                    <div><p className="text-[9px] font-black tracking-[0.12em] text-[#0a1428]">{module.label}</p><p className="mt-1 text-[10px] font-semibold text-[#7a8494]">{module.detail}</p></div>
                  </div>
                );
              })}
              <div className="auth-assembly-corner auth-assembly-corner-one" />
              <div className="auth-assembly-corner auth-assembly-corner-two" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7a8494]"><span>Sequence / warehouse to doorstep</span><span className="inline-flex items-center gap-2 text-[#a3781e]"><span className="auth-live-dot" /> Scroll linked</span></div>
        </div>
      </div>
    </section>
  );
}
