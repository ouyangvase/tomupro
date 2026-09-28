import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { HeroMotionMedia } from '@/components/landing/HeroMotionMedia';
import { XdBulkySection, XdContactInfo, XdCtaSection, XdFeatureGridSection, XdFooterLinks, XdProductSection, XdStatsSection, XdTestimonialSection } from '@/components/landing/XdLandingSections';
import { useToast } from '@/hooks/use-toast';
import { validateInviteCode } from '@/hooks/useInviteCodes';
import { AppName } from '@/components/brand/AppName';
import tomuAuthHero from '@/assets/tomupro-auth-hero.png';
import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Layers3,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  Phone,
  Route,
  Truck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import type { AppRole } from '@/types/database';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2).max(100),
});

const NAV_ITEMS = [
  { label: 'Solutions', href: '#services' },
  { label: 'Features', href: '#features' },
  { label: 'Tracking', href: '#tracking' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

const MESSAGE_TEMPLATES = [
  { id: 'book-demo', label: 'Book a demo', message: 'I would like to book a demo of TOMUPRO.' },
  { id: 'delivery-solution', label: 'Delivery solution', message: 'I would like to discuss a delivery solution for my business.' },
  { id: 'tracking-operations', label: 'Tracking & operations', message: 'I would like to learn more about tracking and delivery operations.' },
  { id: 'cod-management', label: 'COD management', message: 'I would like to learn more about COD management.' },
];

const MOBILE_HERO_MOTION_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_3HhEvG6HKL4SAfFzDVODHPPnb0Q/hf_20260816_061649_9edfe3b9-2c3a-499c-966f-c7a85643f84a.mp4';

const SERVICES = [
  {
    number: '01',
    title: 'Same-day delivery',
    description: 'Move parcels across Brunei with clear pickup windows and delivery status from dispatch to doorstep.',
    icon: Truck,
  },
  {
    number: '02',
    title: 'COD collection',
    description: 'Keep cash and transfer collections visible, reconciled, and ready for your team to act on.',
    icon: PackageCheck,
  },
  {
    number: '03',
    title: 'Fulfillment control',
    description: 'Coordinate stock, orders, runners, and drivers from one operational view built for daily work.',
    icon: Layers3,
  },
  {
    number: '04',
    title: 'Delivery intelligence',
    description: 'Turn every update into a reliable operational record so your next decision is easier to make.',
    icon: BarChart3,
  },
];

const DISTRICTS = ['Brunei-Muara', 'Tutong', 'Belait', 'Temburong'];

type ToastOptions = {
  variant?: 'default' | 'destructive';
  title?: ReactNode;
  description?: ReactNode;
};

function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn('auth-reveal', visible && 'auth-reveal-visible', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

function shouldRenderLegacyHero() {
  return false;
}

function PublicLogo({ className }: { className?: string }) {
  return <img src="/landing/tomupro-logo-public.png?v=2026081101" alt="TOMUPRO logo" className={className} />;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user && !authLoading) navigate('/');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user && searchParams.get('signup') === '1') {
      setAuthTab('signup');
      setLoginOpen(true);
    }
  }, [searchParams, user]);

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab);
    setLoginOpen(true);
  };

  return (
    <main className="auth-page auth-xd-landing min-h-screen overflow-x-hidden bg-black text-white antialiased">
      <MarketingNav
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onLogin={() => openAuth('login')}
        onSignup={() => openAuth('signup')}
      />
      <Hero onSignup={() => openAuth('signup')} onLogin={() => openAuth('login')} />
      <XdStatsSection />
      <XdBulkySection />
      <XdProductSection
        id="tracking"
        title={'Track Every Delivery\nin One Place'}
        description="One-stop solution for merchants to manage orders, routes, pickups and drop-offs. See every shipment live from one dashboard."
        image="/landing/xd-dashboard-merchant.png"
        imageAlt="TOMUPRO merchant dashboard with live fleet and recent orders"
        features={[{ icon: 'route', label: 'Real-time parcel\ntracking' }, { icon: 'ai', label: 'AI route\noptimization' }, { icon: 'driver', label: 'Driver and fleet\nmanagement' }]}
      />
      <XdProductSection
        id="cod"
        title={'Cash on Delivery,\nSettled Weekly'}
        description="Collect cash on delivery and get paid straight to your bank account every week. Track collections, reconciliation and payouts with no manual matching."
        image="/landing/xd-dashboard-cod.png"
        imageAlt="TOMUPRO COD payout dashboard"
        reverse
        features={[{ icon: 'route', label: 'Automated\nreconciliation' }, { icon: 'ai', label: 'Weekly bank\ntransfers' }, { icon: 'driver', label: 'Full payment\nreports' }]}
      />
      <div id="features"><XdFeatureGridSection /></div>
      <XdTestimonialSection />
      <XdCtaSection onSignup={() => openAuth('signup')} onLogin={() => openAuth('login')} />
      <ContactSection />
      <XdFooterLinks onLogin={() => openAuth('login')} />
      <LoginModal
        open={loginOpen}
        initialTab={authTab}
        onClose={() => setLoginOpen(false)}
        signIn={signIn}
        signUp={signUp}
        navigate={navigate}
        toast={toast}
      />
    </main>
  );
}

function MarketingNav({
  mobileMenuOpen,
  setMobileMenuOpen,
  onLogin,
  onSignup,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (value: boolean) => void;
  onLogin: () => void;
  onSignup: () => void;
}) {
  return (
    <header className="auth-nav-wrap fixed inset-x-0 top-0 z-50 bg-black">
      <nav className="auth-nav mx-auto flex min-h-[70px] max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
        <a href="#hero" className="flex min-w-0 items-center gap-3" aria-label="TOMUPRO home">
          <PublicLogo className="h-9 w-28 object-cover sm:h-10 sm:w-32" />
        </a>

        <div className="hidden items-center gap-5 xl:flex">
          {NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href} className="auth-xd-nav-link text-[10px] font-medium uppercase tracking-[0.08em] text-white/75 transition-colors hover:text-white">
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 xl:flex">
          <button type="button" onClick={onLogin} className="auth-xd-pill h-9 rounded-full bg-white px-5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#111] transition-transform hover:-translate-y-0.5">
            Log in
          </button>
          <Button type="button" onClick={onSignup} className="auth-xd-pill h-9 rounded-full bg-white px-5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#111] transition-transform hover:-translate-y-0.5">
            Get started
          </Button>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <button type="button" onClick={onLogin} className="rounded-full bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#111]">Log in</button>
          <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-full p-2 text-white" aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="mx-4 mb-3 rounded-2xl border border-white/15 bg-black/95 p-3 shadow-xl backdrop-blur-xl xl:hidden">
          {NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75 hover:bg-white/10 hover:text-white">
              {item.label}
            </a>
          ))}
          <Button type="button" onClick={() => { setMobileMenuOpen(false); onSignup(); }} className="mt-2 h-11 w-full rounded-xl bg-white text-[11px] font-bold uppercase tracking-[0.08em] text-[#111] hover:bg-white/90">
            Get started
          </Button>
        </div>
      )}
    </header>
  );
}

function Hero({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <section id="hero" className="auth-xd-hero relative isolate flex min-h-screen items-end overflow-hidden bg-black text-white">
      <video className="auth-xd-hero-media absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline poster="/landing/tomupro-auth-hero-public.png" aria-hidden="true">
        <source src="/landing/tomupro-hero-motion.mp4" type="video/mp4" />
      </video>
      <video className="auth-xd-hero-mobile-video absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline poster="/landing/tomupro-auth-hero-mobile-2k.png" aria-hidden="true">
        <source src={MOBILE_HERO_MOTION_URL} type="video/mp4" />
      </video>
      <img src="/landing/tomupro-auth-hero-mobile-2k.png" alt="" className="auth-xd-hero-mobile absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      <img src="/landing/tomupro-auth-hero-public.png" alt="" className="auth-xd-hero-fallback absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      <div className="auth-xd-hero-overlay absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 pb-20 pt-32 sm:px-8 sm:pb-24 lg:px-12 lg:pb-28">
        <div className="max-w-[600px]">
          <h1 className="auth-xd-hero-title text-[3.25rem] font-normal leading-[0.98] tracking-[-0.055em] sm:text-[4.7rem] lg:text-[5.25rem]">
            AI Logistics Platform &<br />
            Last-Mile Delivery<br />
            in Brunei
          </h1>
          <p className="mt-8 max-w-[530px] text-sm leading-6 text-white/90 sm:text-base sm:leading-7">
            TOMUPRO is an AI-powered logistics platform in Brunei that provides last-mile delivery, fulfillment, courier services, and delivery management systems for businesses.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="button" onClick={onSignup} className="auth-xd-hero-button h-12 rounded-xl bg-[#dfc45d] px-7 text-[11px] font-bold uppercase tracking-[0.06em] text-[#111] hover:bg-[#ecd675]">
              Start free
            </Button>
            <a href="#services" className="auth-xd-hero-button inline-flex h-12 items-center justify-center rounded-xl bg-white px-7 text-[11px] font-bold uppercase tracking-[0.06em] text-[#111] transition-transform hover:-translate-y-0.5">
              Watch demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const items = [
    { value: '01', label: 'warehouse' },
    { value: '02', label: 'pick + pack' },
    { value: '03', label: 'dispatch' },
    { value: '04', label: 'doorstep' },
  ];
  return (
    <section className="border-y border-white/15 bg-black px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-7 sm:grid-cols-4 sm:gap-y-0">
        {items.map((item, index) => (
          <Reveal key={item.label} delay={index * 80} className={cn('px-3 sm:px-8', index > 0 && 'sm:border-l sm:border-white/15')}>
            <p className="text-3xl font-black tracking-[-0.04em] text-[#dfc45d] sm:text-4xl">{item.value}</p>
            <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/55">{item.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ServicesSection() {
  return (
    <section id="services" className="bg-black px-5 py-24 sm:px-8 lg:px-12 lg:py-36">
      <div className="mx-auto max-w-[1440px]">
        <Reveal className="max-w-2xl">
          <p className="auth-eyebrow">One system, every handoff</p>
          <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">Everything your delivery day needs to stay clear.</h2>
          <p className="mt-6 text-base leading-7 text-white/65 sm:text-lg">TOMUPRO connects the people, parcels, and numbers behind each delivery so your team can move with less friction.</p>
        </Reveal>
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service, index) => {
            const Icon = service.icon;
            return (
              <Reveal key={service.number} delay={index * 80} className="h-full">
                <article className="auth-service-card group flex h-full min-h-[286px] flex-col rounded-[1.75rem] border border-white/15 bg-[#0d0d0d] p-7 transition-transform duration-500 hover:-translate-y-2 hover:border-[#dfc45d] hover:shadow-[0_22px_50px_rgba(0,0,0,0.35)]">
                  <div className="flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#dfc45d] text-[#111] transition-colors group-hover:bg-white group-hover:text-[#111]"><Icon className="h-5 w-5" /></div><span className="text-xs font-black tracking-[0.16em] text-white/35">{service.number}</span></div>
                  <h3 className="mt-10 text-xl font-black tracking-[-0.025em] text-white">{service.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{service.description}</p>
                  <div className="mt-auto flex items-center gap-2 pt-7 text-xs font-extrabold uppercase tracking-[0.12em] text-[#bd8b2d]">View capability <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DispatchNetworkSection() {
  const nodes = [
    { label: 'WAREHOUSE', detail: 'stock ready', className: 'auth-network-node-one' },
    { label: 'ORDER', detail: 'handoff verified', className: 'auth-network-node-two' },
    { label: 'DRIVER', detail: 'route in motion', className: 'auth-network-node-three' },
    { label: 'CUSTOMER', detail: 'delivery outcome', className: 'auth-network-node-four' },
  ];

  return (
    <section className="auth-network-section relative overflow-hidden bg-[#080808] px-5 py-24 text-white sm:px-8 lg:px-12 lg:py-36" aria-labelledby="network-title">
      <div className="auth-dark-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
        <Reveal>
          <p className="auth-eyebrow auth-eyebrow-dark">Dispatch / one connected view</p>
          <h2 id="network-title" className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl">The route is only useful when the whole operation can see it.</h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#b4bfd1] sm:text-lg">TOMUPRO brings orders, areas, stock, runners, drivers, and delivery outcomes into the same operational line.</p>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e5c477]">
            <span>Orders</span><span>Areas</span><span>Drivers</span><span>Delivery status</span>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="auth-network-visual" aria-hidden="true">
            <div className="auth-network-lines"><span /><span /><span /><span /></div>
            <div className="auth-network-orbit auth-network-orbit-one" />
            <div className="auth-network-orbit auth-network-orbit-two" />
            <div className="auth-network-core"><PackageCheck className="h-8 w-8 text-[#e5c477]" /><span>TOMUPRO</span><small>OPERATING LINE</small></div>
            {nodes.map((node) => <div key={node.label} className={`auth-network-node ${node.className}`}><span className="auth-network-node-dot" /><p>{node.label}</p><small>{node.detail}</small></div>)}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TrackingSection({ onLogin }: { onLogin: () => void }) {
  return (
    <section id="tracking" className="relative overflow-hidden bg-black px-5 py-24 text-white sm:px-8 lg:px-12 lg:py-36">
      <div className="auth-dark-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-16 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="auth-eyebrow auth-eyebrow-dark">Public parcel tracking</p>
          <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl">A quiet signal from warehouse to doorstep.</h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#b4bfd1] sm:text-lg">Enter an order code to see its safe customer-facing status. Private order details stay inside the TOMUPRO operations portal.</p>
          <button type="button" onClick={onLogin} className="mt-9 inline-flex items-center gap-3 text-sm font-extrabold text-[#e5c477] transition-colors hover:text-white">Open the operations portal <ArrowRight className="h-4 w-4" /></button>
        </Reveal>

        <Reveal delay={120}>
          <PublicTrackingCard />
        </Reveal>
      </div>
    </section>
  );
}

type PublicTrackingResponse = {
  found?: boolean;
  orderCode?: string;
  status?: string;
};

function PublicTrackingCard() {
  const [orderCode, setOrderCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublicTrackingResponse | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const handleTracking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = orderCode.trim();
    if (!value) return;

    setLoading(true);
    setResult(null);
    setRequestFailed(false);

    const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: { p_order_code: string }) => Promise<{ data: unknown; error: { message?: string } | null }>;
    const { data, error } = await rpc('track_public_order', { p_order_code: value });
    setLoading(false);

    if (error) {
      setRequestFailed(true);
      return;
    }

    setResult((data || { found: false }) as PublicTrackingResponse);
  };

  return (
    <div className="auth-tracking-card-panel">
      <div className="flex items-start justify-between gap-5 border-b border-white/10 pb-6">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#e5c477]">Track your parcel</p><h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">Where is it now?</h3></div>
        <Route className="mt-1 h-6 w-6 shrink-0 text-[#e5c477]" aria-hidden="true" />
      </div>
      <form onSubmit={handleTracking} className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Label htmlFor="public-order-code" className="sr-only">Order ID or order code</Label>
        <Input id="public-order-code" value={orderCode} onChange={(event) => setOrderCode(event.target.value)} placeholder="Enter order ID or code..." autoComplete="off" className="h-14 rounded-xl border-white/15 bg-white/[0.08] text-white placeholder:text-[#8996ab] focus:border-[#e5c477] focus:ring-[#e5c477]/20" />
        <Button type="submit" disabled={loading || !orderCode.trim()} className="h-14 rounded-xl bg-[#e5c477] px-7 font-black text-[#0a1428] hover:bg-[#f4d98c]">{loading ? 'Checking...' : 'Track'}</Button>
      </form>
      <div className="mt-7 min-h-[88px]" aria-live="polite">
        {requestFailed && <div className="rounded-xl border border-[#e47f76]/35 bg-[#7d302d]/20 px-4 py-3"><p className="font-bold text-[#ffd0c9]">We could not check that order right now.</p><p className="mt-1 text-sm text-[#c8a8a8]">Please try again.</p></div>}
        {!requestFailed && result && !result.found && <div className="rounded-xl border border-[#e5c477]/30 bg-[#e5c477]/10 px-4 py-3"><p className="font-bold text-[#f4d98c]">Order not found.</p><p className="mt-1 text-sm text-[#b4bfd1]">Please check your Order ID and try again.</p></div>}
        {!requestFailed && result?.found && <div className="rounded-xl border border-[#65c98b]/35 bg-[#1b6f4a]/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-mono text-sm font-bold text-white">{result.orderCode}</p><span className="rounded-full bg-[#65c98b]/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#a5f1bc]">{result.status}</span></div><p className="mt-3 text-xs text-[#b4bfd1]">This is the public status only. Sign in to view operational details.</p></div>}
        {!result && !requestFailed && <p className="text-sm text-[#8d9bb0]">Public results show only the order code and customer-facing status.</p>}
      </div>
      <div className="mt-7 grid grid-cols-4 border-t border-white/10 pt-5 text-center text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#8d9bb0]"><span>Received</span><span>Preparing</span><span>Out for delivery</span><span>Delivered</span></div>
    </div>
  );
}

function CoverageSection() {
  return (
    <section id="coverage" className="bg-black px-5 py-24 sm:px-8 lg:px-12 lg:py-36">
      <div className="mx-auto grid max-w-[1440px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <Reveal>
          <div className="auth-coverage-map relative min-h-[430px] overflow-hidden rounded-[2rem] border border-white/15 bg-[#0d0d0d] p-6 sm:p-10">
            <div className="auth-map-arc auth-map-arc-one" aria-hidden="true" /><div className="auth-map-arc auth-map-arc-two" aria-hidden="true" />
            <div className="absolute left-[18%] top-[23%] h-3 w-3 rounded-full bg-[#bd8b2d] shadow-[0_0_0_8px_rgba(189,139,45,0.12)]" /><div className="absolute right-[23%] top-[37%] h-3 w-3 rounded-full bg-[#bd8b2d] shadow-[0_0_0_8px_rgba(189,139,45,0.12)]" /><div className="absolute left-[41%] bottom-[23%] h-3 w-3 rounded-full bg-[#bd8b2d] shadow-[0_0_0_8px_rgba(189,139,45,0.12)]" /><div className="absolute right-[16%] bottom-[19%] h-3 w-3 rounded-full bg-[#bd8b2d] shadow-[0_0_0_8px_rgba(189,139,45,0.12)]" />
            <div className="relative z-10 flex h-full min-h-[370px] flex-col justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#dfc45d]">Coverage network</p><p className="mt-3 max-w-xs text-3xl font-black tracking-[-0.04em] text-white">Close to every handoff that matters.</p></div><div className="flex items-end justify-between"><div><p className="text-5xl font-black tracking-[-0.06em] text-[#dfc45d]">04</p><p className="mt-1 text-xs font-bold text-white/55">districts connected</p></div><div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur"><Globe2 className="h-6 w-6 text-[#dfc45d]" /></div></div></div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <p className="auth-eyebrow">Built for Brunei</p>
          <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">Local movement. Professional control.</h2>
          <p className="mt-6 text-base leading-7 text-white/65 sm:text-lg">Whether you are sending across town or coordinating multiple teams, TOMUPRO keeps the operational picture consistent.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {DISTRICTS.map((district) => <div key={district} className="flex items-center gap-3 rounded-xl border border-white/15 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white/85"><MapPin className="h-4 w-4 text-[#dfc45d]" />{district}<Check className="ml-auto h-4 w-4 text-[#dfc45d]" /></div>)}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="about" className="border-y border-white/15 bg-[#080808] px-5 py-20 sm:px-8 lg:px-12 lg:py-28" aria-labelledby="about-title">
      <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-24">
        <Reveal>
          <p className="auth-eyebrow">About TOMUPRO</p>
          <h2 id="about-title" className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">Built for the work behind every delivery.</h2>
        </Reveal>
        <Reveal delay={120} className="max-w-3xl">
          <p className="text-base leading-7 text-white/65 sm:text-lg">TOMUPRO is a Brunei-based logistics and delivery operations platform operated by Tomu Enterprise, a registered sole proprietorship in Brunei Darussalam under Business Registration No. P30014276.</p>
          <p className="mt-5 text-base leading-7 text-white/65 sm:text-lg">TOMUPRO helps businesses manage last-mile delivery, dispatch, driver operations, pickup scheduling, order tracking, COD collection, fulfillment workflows, and delivery performance from one platform.</p>
          <div className="mt-8 flex flex-wrap gap-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#dfc45d]"><span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Brunei Darussalam</span><span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">Tomu Enterprise</span><span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">P30014276</span></div>
        </Reveal>
      </div>
    </section>
  );
}

function ContactSection() {
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');

  const handleInterestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSubmitting(true);
    setFormMessage(null);

    const { error } = await supabase.functions.invoke('submit-interest', {
      body: {
        full_name: String(values.get('full_name') || '').trim(),
        company_name: String(values.get('company_name') || '').trim(),
        phone: String(values.get('phone') || '').trim(),
        email: String(values.get('email') || '').trim(),
        business_type: 'website_homepage',
        message: String(values.get('message') || '').trim(),
      },
    });

    setSubmitting(false);
    if (error) {
      setFormMessage({ type: 'error', text: 'We could not send this message. Please contact TOMUPRO by email or Instagram.' });
      return;
    }

    form.reset();
    setMessage('');
    setMessageTemplate('');
    setFormMessage({ type: 'success', text: 'Your message has been sent. TOMUPRO will contact you soon.' });
  };

  const inputClass = 'h-14 rounded-2xl border-0 bg-white text-base text-[#1d2130] placeholder:text-[#9b9eaa] shadow-[0_8px_16px_rgba(0,0,0,0.12)] focus:border-[#dfc45d] focus:ring-2 focus:ring-[#dfc45d]/30';

  return (
    <section id="contact" className="xd-contact-section relative overflow-hidden">
      <div className="xd-contact-backdrop absolute inset-0" aria-hidden="true" />
      <div className="xd-contact-content relative mx-auto w-full max-w-[1440px] px-5 py-20 sm:px-10 lg:px-20 lg:py-28">
        <Reveal>
          <div className="hidden md:block"><XdContactInfo /></div>
          <form onSubmit={handleInterestSubmit} className="xd-contact-form mx-auto mt-20 grid max-w-[1000px] gap-x-14 gap-y-7 lg:grid-cols-2">
            <div className="space-y-3"><Label htmlFor="interest-full-name" className="text-xs font-bold uppercase tracking-[0.08em] text-white">Name</Label><Input id="interest-full-name" name="full_name" required placeholder="Enter your name" className={inputClass} /></div>
            <div className="space-y-3"><Label htmlFor="interest-email" className="text-xs font-bold uppercase tracking-[0.08em] text-white">Email</Label><Input id="interest-email" name="email" type="email" required placeholder="Enter Email" className={inputClass} /></div>
            <div className="space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
              <div className="flex items-center justify-between gap-3"><Label htmlFor="interest-message" className="text-xs font-bold uppercase tracking-[0.08em] text-white">Message</Label><select id="interest-message-template" aria-label="Message template" value={messageTemplate} onChange={(event) => { const selected = event.target.value; setMessageTemplate(selected); const template = MESSAGE_TEMPLATES.find((item) => item.id === selected); if (template) setMessage(template.message); }} className="xd-message-template"><option value="">Choose template</option>{MESSAGE_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}<option value="custom">Write my own</option></select></div>
              <Textarea id="interest-message" name="message" rows={6} value={message} onChange={(event) => { setMessage(event.target.value); setMessageTemplate('custom'); }} placeholder="Choose a template or write your own message" className="min-h-[172px] rounded-2xl border-0 bg-white text-base text-[#1d2130] placeholder:text-[#9b9eaa] shadow-[0_8px_16px_rgba(0,0,0,0.12)] focus:border-[#dfc45d] focus:ring-2 focus:ring-[#dfc45d]/30" />
            </div>
            <div className="flex flex-col items-center gap-4 lg:col-span-2"><p aria-live="polite" className={cn('text-sm font-semibold', formMessage?.type === 'success' ? 'text-[#b8efc4]' : formMessage?.type === 'error' ? 'text-[#ffd0c9]' : 'text-white/70')}>{formMessage?.text}</p><Button type="submit" disabled={submitting} className="xd-gold-button h-12 min-w-[170px]">{submitting ? 'Sending...' : 'Submit'}</Button></div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ onLogin }: { onLogin: () => void }) {
  return (
    <footer className="border-t border-white/15 bg-black px-5 py-12 text-white sm:px-8 lg:px-12">
      <div className="auth-xd-footer-copy mx-auto max-w-[1440px]"><div className="flex flex-col justify-between gap-10 sm:flex-row sm:items-start"><div><PublicLogo className="h-9 w-28 object-cover" /><p className="mt-4 max-w-xs text-sm leading-6 text-[#68758b]">A clearer operating system for Brunei delivery and logistics.</p><p className="mt-4 max-w-sm text-xs leading-5 text-[#7f8998]">Operated by Tomu Enterprise · Business Registration No. P30014276 · Brunei Darussalam</p></div><div className="grid grid-cols-2 gap-x-12 gap-y-8 text-sm sm:grid-cols-3"><div><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9c7624]">Explore</p><a href="#about" className="block py-1 text-[#526076] hover:text-[#0a1428]">About</a><a href="#services" className="block py-1 text-[#526076] hover:text-[#0a1428]">Services</a><a href="#tracking" className="block py-1 text-[#526076] hover:text-[#0a1428]">Tracking</a><a href="#coverage" className="block py-1 text-[#526076] hover:text-[#0a1428]">Coverage</a><a href="/blog" className="block py-1 text-[#526076] hover:text-[#0a1428]">Blog</a></div><div><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9c7624]">Portal</p><button type="button" onClick={onLogin} className="block py-1 text-left text-[#526076] hover:text-[#0a1428]">Login</button><a href="#contact" className="block py-1 text-[#526076] hover:text-[#0a1428]">Get started</a></div><div><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9c7624]">Contact</p><a href="mailto:hello@tomu.my" className="flex items-center gap-2 py-1 text-[#526076] hover:text-[#0a1428]"><Mail className="h-3.5 w-3.5" />hello@tomu.my</a><a href="tel:+6738136587" className="flex items-center gap-2 py-1 text-[#526076] hover:text-[#0a1428]"><Phone className="h-3.5 w-3.5" />+673 813 6587</a><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noreferrer" className="block py-1 text-[#526076] hover:text-[#0a1428]">Instagram @tomupro</a></div></div></div><div className="mt-10 flex flex-col justify-between gap-3 border-t border-[#d4cdbf] pt-6 text-xs text-[#8892a1] sm:flex-row"><span>© {new Date().getFullYear()} <AppName />. All rights reserved.</span><span>Made for Brunei businesses.</span></div></div>
    </footer>
  );
}

function LoginModal({
  open, initialTab, onClose, signIn, signUp, navigate, toast,
}: {
  open: boolean;
  initialTab: 'login' | 'signup';
  onClose: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string, role: AppRole, runnerCode?: string, inviteCode?: string, referralCode?: string) => Promise<{ error: Error | null }>;
  navigate: (path: string) => void;
  toast: (options: ToastOptions) => void;
}) {
  const [loading, setLoading] = useState(false);
  const signupRequestRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(initialTab);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setForgotMode(false);
    setForgotSent(false);
    setReferralCode(sessionStorage.getItem('tomupro-referral-code') || '');
  }, [initialTab, open]);

  const friendlyError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes('already registered') || lower.includes('already been registered') || lower.includes('account with this email already exists')) return 'This email is already registered. Please log in instead.';
    if (lower.includes('invalid login credentials')) return 'Invalid email or password.';
    if (lower.includes('email') && lower.includes('invalid')) return 'Please enter a valid email address.';
    if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('least'))) return 'Password is too weak. Use at least 8 characters.';
    if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
    if (lower.includes('invalid or expired invite code')) return 'This admin code is invalid, expired, or already fully used.';
    if (lower.includes('database')) return 'Signup failed. Please try again.';
    return message;
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) { toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message }); return; }
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) toast({ variant: 'destructive', title: 'Login Failed', description: friendlyError(error.message) });
    else { onClose(); navigate('/'); }
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || signupRequestRef.current) return;

    const normalizedEmail = signupEmail.trim().toLowerCase();
    const result = signupSchema.safeParse({ email: normalizedEmail, password: signupPassword, displayName });
    if (!result.success) { toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message }); return; }

    signupRequestRef.current = true;
    setLoading(true);

    try {
      let assignedRole: AppRole = 'driver';
      let runnerCode: string | undefined;
      let adminInviteCode: string | undefined;
      if (inviteCode.trim()) {
        setCodeStatus('validating');
        const normalizedCode = inviteCode.trim().toUpperCase();
        const { data: runnerCodeResult, error: runnerCodeError } = await supabase.rpc('validate_runner_code', { p_code: normalizedCode });
        const runnerValidation = runnerCodeResult as { success?: boolean; runner_name?: string; runner_code?: string } | null;
        if (!runnerCodeError && runnerValidation?.success) {
          runnerCode = runnerValidation.runner_code || normalizedCode;
          setCodeStatus('valid');
        } else {
          const validatedRole = await validateInviteCode(normalizedCode);
          if (validatedRole) { assignedRole = validatedRole as AppRole; adminInviteCode = normalizedCode; setCodeStatus('valid'); }
          else { setCodeStatus('invalid'); toast({ variant: 'destructive', title: 'Invalid Code', description: 'Enter a valid Runner Code or Admin Code.' }); return; }
        }
      }
      const { error } = await signUp(normalizedEmail, signupPassword, displayName.trim(), assignedRole, runnerCode, adminInviteCode, referralCode || undefined);
      if (error) toast({ variant: 'destructive', title: 'Signup Failed', description: friendlyError(error.message) });
      else {
        sessionStorage.removeItem('tomupro-referral-code');
        toast({ title: 'Account Created', description: 'Welcome to TOMUPRO!' });
        onClose();
        navigate('/');
      }
    } finally {
      signupRequestRef.current = false;
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) { toast({ variant: 'destructive', title: 'Invalid Email', description: 'Please enter a valid email address.' }); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (error) toast({ variant: 'destructive', title: 'Error', description: friendlyError(error.message) });
    else setForgotSent(true);
  };

  if (!open) return null;
  const inputClass = 'h-12 rounded-xl border-[#dfe3e9] bg-[#faf9f5] text-sm text-[#0a1428] focus:border-[#bd8b2d] focus:ring-[#bd8b2d]/20';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="TOMUPRO account access">
      <button type="button" className="absolute inset-0 cursor-default bg-[#071226]/60 backdrop-blur-md" onClick={onClose} aria-label="Close account access" />
      <div className="relative grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white bg-[#fbfaf7] shadow-2xl md:grid-cols-[0.9fr_1fr]">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full p-2 text-[#7e8998] hover:bg-[#f0ece4] hover:text-[#0a1428]" aria-label="Close"><X className="h-5 w-5" /></button>
        <div className="relative hidden min-h-[620px] overflow-hidden bg-[#0a1428] md:block"><img src={tomuAuthHero} alt="TOMUPRO delivery operations" className="h-full w-full object-cover opacity-55" /><div className="absolute inset-0 bg-gradient-to-t from-[#0a1428] via-[#0a1428]/45 to-transparent" /><div className="absolute bottom-0 left-0 p-10 text-white"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#e5c477]">TOMUPRO access</p><h2 className="mt-5 max-w-sm text-5xl font-black leading-[0.95] tracking-[-0.05em]">Run the day with clarity.</h2><p className="mt-5 max-w-sm text-sm leading-6 text-[#b4bfd1]">Manage orders, runners, inventory, COD payouts, and customer deliveries across Brunei.</p></div></div>
        <div className="max-h-[92vh] overflow-y-auto px-6 py-8 sm:px-10 sm:py-10"><div className="mb-7 flex items-center gap-3"><PublicLogo className="h-10 w-28 object-cover" /><div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#7e8998]">Brunei logistics operating system</p><p className="mt-1 text-sm font-black text-[#0a1428]">Welcome to the control room</p></div></div><Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'signup')}><TabsList className="mb-6 grid w-full grid-cols-2 rounded-xl border border-[#e8e4dc] bg-[#f1ede5] p-1"><TabsTrigger value="login" className="rounded-lg text-sm font-bold text-[#7e8998] data-[state=active]:bg-white data-[state=active]:text-[#0a1428] data-[state=active]:shadow-sm">Log in</TabsTrigger><TabsTrigger value="signup" className="rounded-lg text-sm font-bold text-[#7e8998] data-[state=active]:bg-white data-[state=active]:text-[#0a1428] data-[state=active]:shadow-sm">Get started</TabsTrigger></TabsList><TabsContent value="login">{forgotMode ? (forgotSent ? <div className="space-y-4 py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#dff3e5] text-[#3b8b59]"><CheckCircle2 className="h-7 w-7" /></div><h3 className="font-bold text-[#0a1428]">Check your email</h3><p className="text-sm text-[#68758b]">We sent a password reset link to <strong>{forgotEmail}</strong>.</p><button type="button" onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); }} className="text-sm font-bold text-[#a3781e] hover:underline">Back to login</button></div> : <form onSubmit={handleForgotPassword} className="space-y-4"><div><h3 className="font-bold text-[#0a1428]">Forgot password?</h3><p className="mt-1 text-xs text-[#7e8998]">Enter your email and we will send a reset link.</p></div><div className="space-y-1.5"><Label htmlFor="m-forgot-email" className="text-xs font-bold text-[#526076]">Email</Label><Input id="m-forgot-email" type="email" placeholder="you@example.com" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required className={inputClass} /></div><Button type="submit" className="h-11 w-full rounded-xl bg-[#0a1428] text-white hover:bg-[#182744]" disabled={loading}>{loading ? 'Sending...' : 'Send reset link'}</Button><button type="button" onClick={() => setForgotMode(false)} className="w-full text-center text-sm font-bold text-[#68758b] hover:text-[#0a1428]">Back to login</button></form>) : <form onSubmit={handleLogin} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="m-login-email" className="text-xs font-bold text-[#526076]">Email</Label><Input id="m-login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required className={inputClass} /></div><div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="m-login-pw" className="text-xs font-bold text-[#526076]">Password</Label><button type="button" onClick={() => { setForgotMode(true); setForgotEmail(loginEmail); }} className="text-xs font-bold text-[#a3781e] hover:underline">Forgot password?</button></div><Input id="m-login-pw" type="password" placeholder="Enter password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required className={inputClass} /></div><Button type="submit" className="h-12 w-full rounded-xl bg-[#0a1428] font-bold text-white hover:bg-[#182744]" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button></form>}</TabsContent><TabsContent value="signup"><form onSubmit={handleSignup} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="m-name" className="text-xs font-bold text-[#526076]">Display name</Label><Input id="m-name" type="text" placeholder="John Doe" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required className={inputClass} /></div><div className="space-y-1.5"><Label htmlFor="m-signup-email" className="text-xs font-bold text-[#526076]">Email</Label><Input id="m-signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} required className={inputClass} /></div><div className="space-y-1.5"><Label htmlFor="m-signup-pw" className="text-xs font-bold text-[#526076]">Password</Label><Input id="m-signup-pw" type="password" placeholder="Min 8 characters" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} required className={inputClass} /></div>{referralCode && <div className="rounded-xl border border-[#cfe6d4] bg-[#f0faf2] px-3 py-2 text-xs font-semibold text-[#3b8b59]">Referral link applied</div>}<div className="space-y-1.5"><Label htmlFor="m-code" className="text-xs font-bold text-[#526076]">Runner or admin code <span className="font-normal text-[#9aa3b0]">(optional)</span></Label><Input id="m-code" type="text" placeholder="Runner code or TOMU-SP-XXXX" value={inviteCode} onChange={(event) => { setInviteCode(event.target.value.toUpperCase()); setCodeStatus('idle'); }} className={cn(inputClass, 'font-mono uppercase', codeStatus === 'valid' && 'border-[#3b8b59]', codeStatus === 'invalid' && 'border-[#d85b51]')} />{codeStatus === 'valid' && <p className="text-xs text-[#3b8b59]">Valid code applied.</p>}{codeStatus === 'invalid' && <p className="text-xs text-[#d85b51]">Invalid or expired code.</p>}{codeStatus === 'idle' && <p className="text-xs leading-5 text-[#8a95a5]">Without an admin code, you will register as a driver and link to a runner on first login.</p>}</div><Button type="submit" className="h-12 w-full rounded-xl bg-[#0a1428] font-bold text-white hover:bg-[#182744]" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</Button></form></TabsContent></Tabs></div>
      </div>
    </div>
  );
}
