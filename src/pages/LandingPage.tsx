import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { validateInviteCode } from '@/hooks/useInviteCodes';
import tomuAuthHero from '@/assets/tomupro-auth-hero.png';
import { AppLogo } from '@/components/brand/AppLogo';
import { AppName } from '@/components/brand/AppName';
import {
  Package, MapPin, BarChart3, Truck, ShieldCheck, Clock, Users, Zap,
  Menu, X, Warehouse, ShoppingCart, Store, Briefcase, Ticket,
  ArrowRight, Globe, Mail, Monitor, Smartphone, TrendingUp,
  CheckCircle2, Quote, Activity, DollarSign, Route, Bell, Eye, Instagram,
  Layers, Target, Gauge, ChevronRight, ChevronDown, Star, Play, Rocket,
  Box, Shield, LineChart, Cpu, Sparkles, Settings, LayoutDashboard, Banknote,
  Send, Phone, Building2, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { z } from 'zod';

/* ─── Schemas ─────────────────────────────────────────────────────── */
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
  { label: 'Services', href: '#features' },
  { label: 'Delivery Areas', href: '#coverage' },
  { label: 'Tracking', href: '#solutions' },
  { label: 'Pricing', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

/* ─── Animated Counter Hook ───────────────────────────────────────── */
function useCounter(end: number, duration = 2000, trigger = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let start = 0;
    const step = end / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= end) { setVal(end); clearInterval(id); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [end, duration, trigger]);
  return val;
}

/* ─── Intersection Observer Hook ──────────────────────────────────── */
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN                                                              */
/* ═══════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => { if (user && !authLoading) navigate('/'); }, [user, authLoading, navigate]);

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab);
    setLoginOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#0F172A] overflow-x-hidden antialiased">
      <Navbar onLogin={() => openAuth('login')} onSignup={() => openAuth('signup')} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <HeroSection onLogin={() => openAuth('login')} onSignup={() => openAuth('signup')} />
      <TrustStats />
      <WhatWeDoSection />
      <FeaturesSection />
      <WhyChooseSection />
      <VisionMission />
      <SolutionsSection />
      <ProductPreview />
      <TestimonialsSection />
      <CTASection onLogin={() => openAuth('signup')} />
      <FAQSection />
      <SEOLogisticsSection />
      <ContactSection />
      <Footer />
      <LoginModal open={loginOpen} initialTab={authTab} onClose={() => setLoginOpen(false)} signIn={signIn} signUp={signUp} navigate={navigate} toast={toast} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  NAVBAR                                                            */
/* ═══════════════════════════════════════════════════════════════════ */
/* PLACEHOLDER: Navbar */
function Navbar({
  onLogin,
  onSignup,
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  onLogin: () => void;
  onSignup: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
      scrolled
        ? 'bg-white/80 backdrop-blur-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-[#e5e2db]'
        : 'bg-transparent'
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-[72px]">
          <a href="#hero" className="flex items-center gap-3 group">
            <AppLogo size="sm" className="h-10 w-10 transition-transform group-hover:scale-105" />
            <span className="leading-tight">
              <AppName highlight className="block text-xl font-extrabold tracking-tight" accentClass="text-[#B8860B]" />
              <span className="hidden sm:block text-[11px] font-medium text-[#64748B] tracking-[0.02em]">Brunei Logistics Operating System</span>
            </span>
          </a>
          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] transition-colors rounded-lg hover:bg-[#f5f3ef]"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-3">
            <Button variant="ghost" onClick={onLogin} className="text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] h-9 px-4">
              Log in
            </Button>
            <Button onClick={onSignup} className="rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white h-11 px-6 text-sm font-semibold shadow-sm">
              Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex lg:hidden items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onLogin} className="text-xs font-medium h-8 px-3">Login</Button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-[#64748B]">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-2xl border-b border-[#e5e2db] animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="block py-2.5 px-3 text-sm font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-[#f5f3ef] rounded-lg">
                {item.label}
              </a>
            ))}
            <div className="pt-3 border-t border-[#e5e2db]">
              <Button onClick={() => { setMobileMenuOpen(false); onSignup(); }} className="w-full rounded-full bg-[#0F172A] text-white h-10">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  HERO                                                              */
/* ═══════════════════════════════════════════════════════════════════ */
function HeroSection({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <section id="hero" className="relative pt-24 lg:pt-28 pb-14 lg:pb-20 overflow-hidden bg-[#F8F7F2]">
      {/* ── Background ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white to-transparent" />
        <div className="absolute left-[8%] top-[22%] h-[420px] w-[420px] rounded-full border border-[#B8860B]/10" />
        <div className="absolute left-[16%] top-[17%] h-[210px] w-[210px] rounded-full border border-dashed border-[#B8860B]/15" />
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(#0F172A 1px, transparent 1px), linear-gradient(90deg, #0F172A 1px, transparent 1px)', backgroundSize: '80px 80px' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-12">
        <div className="grid min-h-[650px] items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8">

          {/* ── LEFT: Content (~45%) ── */}
          <div className="max-w-2xl lp-fade-up">
            {/* Badge */}
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#D9C190] bg-white/85 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#96710A] shadow-sm">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B8860B] opacity-40" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#B8860B]" />
              </span>
              Trusted across Brunei
            </div>

            {/* Headline — 2 lines, one gold keyword */}
            <h1 className="mb-7 text-[3.35rem] font-black leading-none tracking-normal text-[#071226] sm:text-[4.2rem] lg:text-[5.4rem] xl:text-[6.15rem]">
              Brunei Delivery &amp;
              <br />
              Logistics,
              <br />
              <span className="text-[#B8860B]">Made Simple</span>
            </h1>

            {/* SEO paragraph — natural keyword integration */}
            <p className="mb-8 max-w-xl text-lg leading-8 text-[#566173] lg:text-xl">
              Same-day parcel delivery, COD collection, warehouse fulfillment, courier service, and delivery management for Brunei businesses.
            </p>

            {/* CTA buttons — side by side */}
            <div className="mb-8 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={onSignup}
                className="h-14 rounded-2xl bg-[#071226] px-8 text-base font-bold text-white shadow-xl shadow-[#071226]/15 transition-all hover:-translate-y-0.5 hover:bg-[#13213A]"
              >
                Start Shipping <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onLogin}
                className="h-14 rounded-2xl border-[#B7BECC] bg-white/80 px-8 text-base font-bold text-[#071226] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <Package className="mr-2 h-5 w-5" /> Track Parcel
              </Button>
            </div>

            {/* Trust text row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold text-[#071226]">
              {['Bandar Seri Begawan', 'Kuala Belait', 'Tutong', 'Muara'].map((area) => (
                <span key={area} className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#B8860B]" />
                  {area}
                </span>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Dashboard Visual (~55%) ── */}
          <div className="relative min-h-[520px] lg:min-h-[680px]">
            <div className="absolute -right-8 top-0 hidden h-full w-[74%] rounded-[3rem] bg-white/70 shadow-[0_30px_90px_rgba(15,23,42,0.08)] lg:block" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-white bg-white shadow-[0_32px_90px_rgba(15,23,42,0.18)]">
              <img
                src={tomuAuthHero}
                alt="TOMUPRO courier loading parcels into a delivery van at a Brunei warehouse"
                className="h-[520px] w-full object-cover object-center lg:h-[680px]"
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white/40 via-white/5 to-transparent" />
              <div className="absolute left-5 top-5 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur-md sm:left-8 sm:top-8">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#15803D]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
                  Live Tracking
                </div>
                <p className="text-lg font-extrabold text-[#071226]">Out for Delivery</p>
                <p className="text-sm text-[#64748B]">Order ORD-78456</p>
                <p className="mt-1 text-xs font-semibold text-[#94A3B8]">Estimated 10:30 AM</p>
              </div>
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl backdrop-blur-md sm:left-auto sm:right-8 sm:w-[430px]">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold text-[#15803D]">Delivered</p>
                    <p className="truncate text-sm text-[#64748B]">Order ORD-78455 delivered to customer</p>
                  </div>
                  <div className="hidden text-right text-xs font-semibold text-[#64748B] sm:block">
                    <p>09:41 AM</p>
                    <p>Today</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 rounded-2xl border border-[#E8D9B7] bg-white p-4 shadow-2xl lg:block">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F8F0DF] text-[#B8860B]">
                <Route className="h-6 w-6" />
              </div>
              <p className="text-3xl font-black text-[#B8860B]">4</p>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748B]">Districts</p>
            </div>
            <div className="hidden" aria-hidden="true">

              {/* Main dashboard card with browser chrome */}
              <div className="relative rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(15,23,42,0.12)] border border-[#E2E8F0]/80">
                <div className="bg-white p-1">
                  {/* Browser chrome bar */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] rounded-t-xl border-b border-[#F1F5F9]">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#FCA5A5]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#FDE68A]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#86EFAC]" />
                    </div>
                    <div className="flex-1 mx-10">
                      <div className="h-6 bg-white rounded-lg border border-[#E2E8F0] flex items-center px-3">
                        <div className="h-2 w-2 rounded-full bg-[#22C55E] mr-2" />
                        <span className="text-[10px] text-[#94A3B8] font-medium tracking-wide">app.tomu.my/dashboard</span>
                      </div>
                    </div>
                  </div>

                  {/* Dashboard body */}
                  <div className="bg-[#FAFAF9] p-5 lg:p-6 space-y-4">
                    {/* 3 KPI cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total Orders', val: '2,847', change: '+12.5%', color: '#B8860B' },
                        { label: 'In Transit', val: '48', change: '+3 today', color: '#3B82F6' },
                        { label: 'Revenue', val: 'RM 84.2k', change: '+8.3%', color: '#22C55E' },
                      ].map((m) => (
                        <div key={m.label} className="bg-white rounded-xl p-3.5 border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <p className="text-[9px] text-[#94A3B8] font-semibold uppercase tracking-wider">{m.label}</p>
                          <p className="text-base lg:text-lg font-bold text-[#0F172A] mt-1.5 tracking-tight">{m.val}</p>
                          <p className="text-[10px] font-semibold mt-1" style={{ color: m.color }}>{m.change}</p>
                        </div>
                      ))}
                    </div>

                    {/* Gold bar chart */}
                    <div className="bg-white rounded-xl p-4 border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-[#0F172A]">Weekly Performance</span>
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#B8860B] animate-pulse" />
                          <span className="text-[10px] text-[#B8860B] font-semibold">Live</span>
                        </div>
                      </div>
                      <div className="flex items-end gap-[6px] h-20">
                        {[30, 48, 40, 65, 50, 75, 58, 82, 68, 88, 76, 60].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-[3px]"
                            style={{
                              height: `${h}%`,
                              background: `linear-gradient(to top, #B8860B${i >= 9 ? 'DD' : '55'}, #D4A843${i >= 9 ? 'DD' : '55'})`,
                              opacity: 0,
                              animation: 'lp-fade-up 0.4s ease-out both',
                              animationDelay: `${0.8 + i * 0.07}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Floating notification cards ── */}
              {/* Top-right: Order Delivered */}
              <div className="absolute -top-5 -right-4 lg:-right-10 lp-glass rounded-xl px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] hidden sm:flex items-center gap-3 lp-float-sm border border-white/70">
                <div className="h-9 w-9 rounded-lg bg-[#ECFDF5] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4.5 w-4.5 text-[#22C55E]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[#0F172A]">Order Delivered</p>
                  <p className="text-[9px] text-[#94A3B8] mt-0.5">ORD-2847 just now</p>
                </div>
              </div>

              {/* Bottom-left: Drivers Active */}
              <div className="absolute -bottom-5 -left-3 lg:-left-8 lp-glass rounded-xl px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] hidden sm:flex items-center gap-3 lp-float-sm border border-white/70" style={{ animationDelay: '1.2s' }}>
                <div className="h-9 w-9 rounded-lg bg-[#FEF3C7] flex items-center justify-center shrink-0">
                  <Truck className="h-4.5 w-4.5 text-[#B8860B]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[#0F172A]">12 Drivers Active</p>
                  <p className="text-[9px] text-[#94A3B8] mt-0.5">All routes covered</p>
                </div>
              </div>

              {/* Mid-right: Revenue metric */}
              <div className="absolute top-[58%] -right-3 lg:-right-12 lp-glass rounded-xl px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] hidden sm:flex items-center gap-3 lp-float-sm border border-white/70" style={{ animationDelay: '2.2s' }}>
                <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4.5 w-4.5 text-[#3B82F6]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[#0F172A]">Revenue +8.3%</p>
                  <p className="text-[9px] text-[#94A3B8] mt-0.5">vs last week</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TRUST STATS                                                       */
/* ═══════════════════════════════════════════════════════════════════ */
function TrustStats() {
  const { ref, inView } = useInView(0.3);
  const orders = useCounter(10000, 2500, inView);
  const teams = useCounter(50, 2000, inView);
  const uptime = useCounter(99, 2000, inView);
  const deliveries = useCounter(500, 2200, inView);

  return (
    <section id="coverage" ref={ref} className="relative bg-[#F8F7F2] pb-16 lg:pb-24">
      {/* Speed lines background */}
      <div className="hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#B8860B]/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#B8860B]/20 to-transparent" />
        {/* Diagonal speed lines */}
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[1px] bg-gradient-to-r from-transparent via-[#B8860B]/10 to-transparent lp-speed-line-diag"
            style={{
              top: `${20 + i * 15}%`,
              left: '-10%',
              right: '-10%',
              transform: 'rotate(-2deg)',
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 mx-auto max-w-[1480px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            { value: 'Last-mile Delivery', label: 'Fast same-day and next-day delivery across Brunei.', metric: `${deliveries}k+ tracked`, icon: Truck },
            { value: 'Fulfillment', label: 'Pick, pack, store, and dispatch from secure centers.', metric: `${orders.toLocaleString()}+ orders`, icon: Warehouse },
            { value: 'COD Payouts', label: 'Cash on Delivery collection with clear weekly reporting.', metric: `${uptime}.9% uptime`, icon: Banknote },
            { value: 'Team Operations', label: 'Admin, manager, runner, and salesperson workflows in one system.', metric: `${teams}+ active teams`, icon: Users },
          ].map((s) => (
            <div key={s.value} className="group rounded-[1.35rem] border border-[#E8E1D2] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#F4EBDC] text-[#071226] transition-colors group-hover:bg-[#E6CF9D]">
                <s.icon className="h-7 w-7" />
              </div>
              <p className="text-xl font-extrabold tracking-[-0.02em] text-[#071226]">{s.value}</p>
              <p className="mt-2 min-h-[48px] text-sm leading-6 text-[#64748B]">{s.label}</p>
              <p className="mt-5 inline-flex rounded-full bg-[#F8F0DF] px-3 py-1 text-xs font-bold text-[#96710A]">{s.metric}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  WHAT WE DO                                                        */
/* ═══════════════════════════════════════════════════════════════════ */
function WhatWeDoSection() {
  const { ref, inView } = useInView(0.2);

  const capabilities = [
    { icon: Package, label: 'Order Management' },
    { icon: Zap, label: 'Automated Dispatch' },
    { icon: MapPin, label: 'Real-Time Tracking' },
    { icon: Truck, label: 'Fleet Management' },
    { icon: Warehouse, label: 'Warehouse Inventory' },
    { icon: DollarSign, label: 'Financial Reconciliation' },
  ];

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className={cn(inView ? 'lp-fade-up' : 'opacity-0')}>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-6">
            What TOMUPRO Does
          </h2>
          <p className="text-[#64748B] text-base lg:text-lg leading-relaxed max-w-3xl mx-auto mb-12">
            TOMUPRO is an AI-powered logistics platform built for businesses in Brunei. It handles everything from order intake to last-mile delivery, covering order management, automated dispatch, real-time tracking, fleet management, warehouse inventory, cash on delivery (COD) reconciliation, and financial reporting. Used by eCommerce sellers, retail shops, logistics companies, and warehouse operators, TOMUPRO provides one dashboard for complete operations visibility across your entire supply chain.
          </p>
        </div>

        <div className={cn(
          'grid grid-cols-2 sm:grid-cols-3 gap-4 lg:gap-5',
          inView ? 'lp-fade-up' : 'opacity-0'
        )} style={{ animationDelay: '0.2s' }}>
          {capabilities.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-[#F1F5F9] bg-[#FAFAF9] hover:border-[#E2E8F0] transition-colors">
              <div className="h-10 w-10 rounded-lg bg-[#B8860B]/[0.08] flex items-center justify-center">
                <c.icon className="h-5 w-5 text-[#B8860B]" />
              </div>
              <span className="text-sm font-medium text-[#334155]">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  FEATURES                                                          */
/* ═══════════════════════════════════════════════════════════════════ */
function FeaturesSection() {
  const { ref, inView } = useInView(0.1);
  const features = [
    { icon: Package, title: 'Order Management', desc: 'Full order lifecycle from booking to delivery. Real-time status updates, smart validation, and automated workflows.', color: '#B8860B' },
    { icon: Truck, title: 'Fleet Dispatch', desc: 'Assign runners and drivers with intelligent routing. Monitor deliveries in real-time across your entire fleet.', color: '#3B82F6' },
    { icon: Warehouse, title: 'Inventory Control', desc: 'Multi-warehouse stock management with inbound tracking, adjustments, and comprehensive audit trails.', color: '#8B5CF6' },
    { icon: LineChart, title: 'Finance & Reports', desc: 'Revenue tracking, expense claims, cash settlements, and delivery charge reconciliation in one dashboard.', color: '#22C55E' },
    { icon: Users, title: 'Team Management', desc: 'Role-based access for admin, runner, driver, and manager. Performance tracking and leaderboards.', color: '#F59E0B' },
    { icon: Shield, title: 'Audit & Compliance', desc: 'Complete audit logs, stock integrity checks, and reconciliation tools for full operational transparency.', color: '#EC4899' },
  ];

  return (
    <section ref={ref} id="features" className="py-24 lg:py-32 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <Layers className="h-3.5 w-3.5" /> PLATFORM
          </div>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4">
            Smart Delivery Management System for Businesses
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            A unified platform that connects every part of your logistics business, from order intake to final delivery. Our dispatch management system automates operations so your team can focus on growth.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={cn(
                'group relative rounded-2xl p-6 lg:p-7 border border-[#F1F5F9] bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#0F172A]/[0.03] hover:border-[#E2E8F0]',
                inView ? 'lp-fade-up' : 'opacity-0'
              )}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110" style={{ backgroundColor: `${f.color}10` }}>
                <f.icon className="h-5 w-5" style={{ color: f.color }} />
              </div>
              <h3 className="text-base font-semibold text-[#0F172A] mb-2">{f.title}</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">{f.desc}</p>
              <div className="mt-5 flex items-center text-[13px] font-medium text-[#B8860B] opacity-0 group-hover:opacity-100 transition-opacity">
                Learn more <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  WHY CHOOSE TOMUPRO                                                */
/* ═══════════════════════════════════════════════════════════════════ */
function WhyChooseSection() {
  const { ref, inView } = useInView(0.1);

  const reasons = [
    { icon: MapPin, title: 'Built for Brunei', desc: 'Designed for local delivery patterns, road networks, and business practices across all four districts.' },
    { icon: Cpu, title: 'AI-Powered Dispatch', desc: 'Smart driver assignment based on location, capacity, and priority for optimal delivery performance.' },
    { icon: Activity, title: 'Real-Time Tracking', desc: 'Live GPS tracking for every delivery with automated customer updates at each milestone.' },
    { icon: LayoutDashboard, title: 'Complete Platform', desc: 'Orders, dispatch, inventory, finance, and team management unified in one powerful dashboard.' },
    { icon: Sparkles, title: 'Free to Start', desc: 'No upfront costs, no credit card required. Start operating immediately with our free plan.' },
    { icon: TrendingUp, title: 'Scales With You', desc: 'Works for 10 deliveries or 10,000 per day. Grow without changing platforms or tools.' },
  ];

  return (
    <section ref={ref} className="py-24 lg:py-32 bg-[#FAFAF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <ShieldCheck className="h-3.5 w-3.5" /> WHY US
          </div>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4">
            Why Choose TOMUPRO
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            Purpose-built for Brunei logistics with AI at its core and designed to grow with your business.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 lg:gap-6 max-w-5xl mx-auto">
          {reasons.map((r, i) => (
            <div
              key={r.title}
              className={cn(
                'flex items-start gap-4 bg-white rounded-2xl p-6 border border-[#F1F5F9] hover:border-[#E2E8F0] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300',
                inView ? 'lp-fade-up' : 'opacity-0'
              )}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-[#B8860B]/[0.08]">
                <r.icon className="h-5 w-5 text-[#B8860B]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#0F172A] mb-1.5">{r.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  VISION / MISSION                                                  */
/* ═══════════════════════════════════════════════════════════════════ */
function VisionMission() {
  const { ref, inView } = useInView(0.15);

  return (
    <section ref={ref} id="about" className="py-24 lg:py-32 bg-[#0B1120] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#B8860B]/[0.04] rounded-full blur-[150px] -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#B8860B]/[0.03] rounded-full blur-[120px] translate-y-1/3 -translate-x-1/4" />
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #B8860B 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        {/* Speed accent lines */}
        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#B8860B]/15 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/10 text-[#D4A843] text-xs font-semibold mb-4">
            <Target className="h-3.5 w-3.5" /> OUR MISSION
          </div>
          <h2 className={cn(
            'text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-white mb-6',
            inView ? 'lp-fade-up' : 'opacity-0'
          )}>
            Real-Time Tracking &amp; AI Route Optimization
          </h2>
          <p className={cn(
            'text-[#94A3B8] text-lg max-w-2xl mx-auto leading-relaxed',
            inView ? 'lp-fade-up' : 'opacity-0'
          )} style={{ animationDelay: '0.15s' }}>
            We believe every logistics team deserves enterprise-grade tools. TOMUPRO is a logistics and delivery management platform in Brunei that brings the power of AI-driven operations to businesses of all sizes across Southeast Asia.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {[
            {
              icon: Rocket,
              title: 'Vision',
              text: 'To become the operating system for logistics businesses in ASEAN, where every order, delivery, and transaction flows through one intelligent platform.',
            },
            {
              icon: Target,
              title: 'Mission',
              text: 'Empower teams with real-time visibility, AI-assisted decisions, and automated workflows that eliminate manual overhead and drive operational excellence.',
            },
          ].map((item, i) => (
            <div
              key={item.title}
              className={cn(
                'rounded-2xl p-7 lg:p-8 border border-[#1E293B] bg-[#0F172A]/60 backdrop-blur-sm hover:border-[#B8860B]/20 transition-all duration-500',
                inView ? 'lp-fade-up' : 'opacity-0'
              )}
              style={{ animationDelay: `${0.2 + i * 0.15}s` }}
            >
              <div className="h-11 w-11 rounded-xl bg-[#B8860B]/10 flex items-center justify-center mb-5">
                <item.icon className="h-5 w-5 text-[#D4A843]" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">{item.title}</h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Key advantages row */}
        <div className={cn(
          'mt-12 lg:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto',
          inView ? 'lp-fade-up' : 'opacity-0'
        )} style={{ animationDelay: '0.5s' }}>
          {[
            { value: '60%', label: 'Time Saved', icon: Clock },
            { value: '90%', label: 'Error Reduction', icon: ShieldCheck },
            { value: '100%', label: 'Visibility', icon: Eye },
            { value: '3x', label: 'Growth Capacity', icon: TrendingUp },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-4 rounded-xl border border-[#1E293B] bg-[#0F172A]/40">
              <p className="text-2xl lg:text-3xl font-bold text-[#D4A843]">{stat.value}</p>
              <p className="text-xs text-[#64748B] mt-1 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SOLUTIONS / INDUSTRIES                                            */
/* ═══════════════════════════════════════════════════════════════════ */
function SolutionsSection() {
  const { ref, inView } = useInView(0.1);
  const solutions = [
    { icon: Truck, title: 'Delivery Companies', desc: 'End-to-end delivery management with driver tracking, proof of delivery, and route optimization.', color: '#3B82F6' },
    { icon: ShoppingCart, title: 'E-commerce Businesses', desc: 'Seamless order fulfillment from online store to customer doorstep with real-time updates.', color: '#8B5CF6' },
    { icon: Warehouse, title: 'Warehouses & 3PL', desc: 'Multi-location inventory management with stock transfers, audits, and real-time balance tracking.', color: '#22C55E' },
    { icon: Store, title: 'Retail Chains', desc: 'Centralized operations across multiple outlets with unified reporting and inventory sync.', color: '#F59E0B' },
    { icon: Briefcase, title: 'SMEs & Startups', desc: 'Enterprise-grade tools scaled for small teams. Affordable, powerful, and ready in minutes.', color: '#EC4899' },
    { icon: Box, title: 'Food & Beverage', desc: 'Temperature-sensitive logistics with time-critical delivery tracking and batch management.', color: '#EF4444' },
  ];

  return (
    <section ref={ref} id="solutions" className="py-24 lg:py-32 bg-[#FAFAF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <Gauge className="h-3.5 w-3.5" /> INDUSTRIES
          </div>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4">
            Fulfillment &amp; Logistics Solutions for Brunei Companies
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            Whether you deliver parcels, manage warehouses, or run retail operations -- TOMUPRO adapts to your workflow.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {solutions.map((s, i) => (
            <div
              key={s.title}
              className={cn(
                'flex items-start gap-4 bg-white rounded-xl p-5 border border-[#F1F5F9] hover:border-[#E2E8F0] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group',
                inView ? 'lp-fade-up' : 'opacity-0'
              )}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110" style={{ backgroundColor: `${s.color}10` }}>
                <s.icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <div>
                <h3 className="font-semibold text-[#0F172A] mb-1">{s.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  PRODUCT PREVIEW                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
function ProductPreview() {
  const [activeTab, setActiveTab] = useState(0);
  const { ref, inView } = useInView(0.1);

  const screens = [
    {
      label: 'Dashboard',
      icon: Monitor,
      desc: 'Your operations command center with real-time KPIs, activity feed, and performance trends.',
      metrics: [
        { label: 'Active Orders', value: '324' },
        { label: 'Drivers Online', value: '12' },
        { label: 'Revenue Today', value: 'RM 4.2k' },
      ],
    },
    {
      label: 'Orders',
      icon: Package,
      desc: 'Full order lifecycle management with booking, status tracking, and batch operations.',
      metrics: [
        { label: 'New Today', value: '47' },
        { label: 'In Transit', value: '28' },
        { label: 'Delivered', value: '156' },
      ],
    },
    {
      label: 'Dispatch',
      icon: Truck,
      desc: 'Intelligent assignment of runners and drivers with route optimization and live tracking.',
      metrics: [
        { label: 'Runners', value: '8' },
        { label: 'Drivers', value: '14' },
        { label: 'Routes', value: '6' },
      ],
    },
    {
      label: 'Finance',
      icon: DollarSign,
      desc: 'Claims management, cash settlements, delivery charges, and comprehensive financial reporting.',
      metrics: [
        { label: 'Claims', value: '12' },
        { label: 'Settled', value: 'RM 24k' },
        { label: 'Pending', value: '3' },
      ],
    },
    {
      label: 'Mobile',
      icon: Smartphone,
      desc: 'Optimized mobile experience for field teams with offline support and push notifications.',
      metrics: [
        { label: 'Active Users', value: '34' },
        { label: 'Avg Response', value: '2.3s' },
        { label: 'Uptime', value: '99.9%' },
      ],
    },
  ];

  const active = screens[activeTab];

  return (
    <section ref={ref} className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <Monitor className="h-3.5 w-3.5" /> PREVIEW
          </div>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4">
            See TOMUPRO in action
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            Clean, modern interfaces designed for speed and clarity across every device.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-[#F8FAFC] rounded-xl p-1 border border-[#F1F5F9]">
            {screens.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveTab(i)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                  activeTab === i
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                )}
              >
                <s.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview card */}
        <div className={cn(
          'max-w-4xl mx-auto rounded-2xl border border-[#E2E8F0] bg-[#FAFAF9] shadow-xl shadow-[#0F172A]/[0.04] overflow-hidden',
          inView ? 'lp-fade-up' : 'opacity-0'
        )}>
          <div className="p-6 lg:p-10">
            <div className="flex flex-col lg:flex-row gap-8 items-center">
              <div className="flex-1">
                <div className="h-10 w-10 rounded-xl bg-[#B8860B]/10 flex items-center justify-center mb-4">
                  <active.icon className="h-5 w-5 text-[#B8860B]" />
                </div>
                <h3 className="text-xl font-bold text-[#0F172A] mb-2">{active.label}</h3>
                <p className="text-[#64748B] text-sm leading-relaxed mb-6">{active.desc}</p>
                <div className="grid grid-cols-3 gap-3">
                  {active.metrics.map((m) => (
                    <div key={m.label} className="bg-white rounded-lg p-3 border border-[#F1F5F9]">
                      <p className="text-lg font-bold text-[#0F172A]">{m.value}</p>
                      <p className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 w-full">
                {/* Simulated screen */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#F1F5F9]">
                    <div className="h-2 w-2 rounded-full bg-[#FCA5A5]" />
                    <div className="h-2 w-2 rounded-full bg-[#FDE68A]" />
                    <div className="h-2 w-2 rounded-full bg-[#86EFAC]" />
                  </div>
                  <div className="p-4 space-y-3 aspect-[4/3]">
                    <div className="flex gap-2">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="flex-1 bg-[#F8FAFC] rounded-lg p-2 border border-[#F1F5F9]">
                          <div className="h-1.5 w-2/3 bg-[#E2E8F0] rounded-full" />
                          <div className="h-3 w-1/2 bg-[#B8860B]/20 rounded-full mt-2" />
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#F8FAFC] rounded-lg p-3 border border-[#F1F5F9] flex-1">
                      <div className="flex items-end gap-1 h-20">
                        {[40, 65, 50, 78, 55, 82, 60, 90, 70, 85].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm"
                            style={{
                              height: `${h}%`,
                              background: `linear-gradient(to top, #B8860B${i > 6 ? 'CC' : '60'}, #D4A843${i > 6 ? 'CC' : '60'})`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    {[1, 2].map((n) => (
                      <div key={n} className="flex items-center gap-3 bg-[#F8FAFC] rounded-lg p-2 border border-[#F1F5F9]">
                        <div className="h-6 w-6 rounded-full bg-[#B8860B]/10" />
                        <div className="flex-1 space-y-1">
                          <div className="h-1.5 w-3/4 bg-[#E2E8F0] rounded-full" />
                          <div className="h-1.5 w-1/2 bg-[#F1F5F9] rounded-full" />
                        </div>
                        <div className="h-5 w-14 bg-[#ECFDF5] rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TESTIMONIALS                                                      */
/* ═══════════════════════════════════════════════════════════════════ */
function TestimonialsSection() {
  const { ref, inView } = useInView(0.1);
  const testimonials = [
    { quote: 'TOMUPRO transformed how we manage deliveries. We can now track every order and every driver in real time. Our efficiency improved by 40% in the first month.', name: 'Ahmad Rizal', role: 'Operations Manager', company: 'SwiftDeliver Sdn Bhd', rating: 5 },
    { quote: 'The inventory system alone saved us countless hours. No more spreadsheet nightmares. Everything is synced across our 3 warehouses automatically.', name: 'Sarah Chen', role: 'Warehouse Lead', company: 'MegaStore Retail', rating: 5 },
    { quote: 'Staff performance improved significantly since we started using the dashboards. The leaderboard feature created healthy competition among our drivers.', name: 'Hj Ismail', role: 'Business Owner', company: 'BN Express Logistics', rating: 5 },
  ];

  return (
    <section ref={ref} id="testimonials" className="py-24 lg:py-32 bg-[#FAFAF9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <Star className="h-3.5 w-3.5" /> TESTIMONIALS
          </div>
          <h2 className="text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4">
            Trusted by growing teams
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            See what operations teams across the region are saying about TOMUPRO.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={cn(
                'bg-white rounded-2xl p-6 lg:p-7 border border-[#F1F5F9] hover:shadow-xl hover:-translate-y-1 transition-all duration-300',
                inView ? 'lp-fade-up' : 'opacity-0'
              )}
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-[#B8860B] text-[#B8860B]" />
                ))}
              </div>
              <p className="text-[#334155] leading-relaxed mb-6 text-[15px]">"{t.quote}"</p>
              <div className="flex items-center gap-3 pt-5 border-t border-[#F1F5F9]">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#B8860B] to-[#D4A843] flex items-center justify-center text-white font-semibold text-sm">{t.name[0]}</div>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">{t.name}</p>
                  <p className="text-xs text-[#94A3B8]">{t.role}, {t.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  CTA                                                               */
/* ═══════════════════════════════════════════════════════════════════ */
function CTASection({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="py-24 lg:py-32 bg-[#0B1120] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#B8860B]/[0.05] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#B8860B]/[0.03] rounded-full blur-[120px]" />
        {/* Speed lines */}
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[1px] bg-gradient-to-r from-transparent via-[#B8860B]/12 to-transparent lp-speed-line"
            style={{ top: `${30 + i * 20}%`, animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/10 text-[#D4A843] text-xs font-semibold mb-6">
          <Sparkles className="h-3.5 w-3.5" /> GET STARTED
        </div>
        <h2 className="text-3xl lg:text-5xl font-bold tracking-[-0.02em] text-white mb-6">
          Ready to accelerate<br />your operations?
        </h2>
        <p className="text-lg text-[#94A3B8] mb-10 max-w-xl mx-auto">
          Join teams across Southeast Asia that trust TOMUPRO to run their business smarter, faster, and with complete visibility.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Button onClick={onLogin} className="rounded-full bg-[#B8860B] hover:bg-[#9A7209] text-white h-12 px-8 text-[15px] font-medium shadow-xl shadow-[#B8860B]/20 hover:-translate-y-0.5 transition-all">
            Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="rounded-full border-[#334155] text-[#CBD5E1] hover:bg-[#1E293B] hover:text-white h-12 px-8 text-[15px] font-medium hover:-translate-y-0.5 transition-all">
              <Instagram className="h-4 w-4 mr-2" /> Contact Us
            </Button>
          </a>
        </div>
        <p className="text-xs text-[#475569] mt-6">No credit card required. Free plan available.</p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  FAQ SECTION                                                       */
/* ═══════════════════════════════════════════════════════════════════ */
function FAQSection() {
  const { ref, inView } = useInView(0.1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'What is last mile delivery?',
      a: 'Last mile delivery is the final step of the delivery process, from distribution hub to the customer\'s door. It is the most critical and costly part of logistics, often accounting for over 50% of total shipping costs.',
    },
    {
      q: 'How does TOMUPRO\'s delivery tracking work?',
      a: 'TOMUPRO provides real-time GPS tracking on every driver in your fleet. Both businesses and customers can see live delivery progress and receive automated status updates at every milestone.',
    },
    {
      q: 'What is a delivery management system?',
      a: 'A delivery management system is software that automates order dispatch, driver assignment, route planning, and delivery tracking. It replaces manual coordination with digital workflows, reducing errors and improving efficiency.',
    },
    {
      q: 'Is TOMUPRO suitable for small businesses?',
      a: 'Yes, TOMUPRO is designed to work at any scale. A free plan is available with no minimum order volume required, making it accessible for small businesses and startups.',
    },
    {
      q: 'What areas in Brunei does TOMUPRO cover?',
      a: 'TOMUPRO provides nationwide coverage across all four districts in Brunei: Brunei-Muara, Tutong, Belait, and Temburong. The platform is optimized for local road networks and delivery patterns.',
    },
    {
      q: 'How does AI improve delivery operations?',
      a: 'AI optimizes routes, assigns drivers intelligently based on location and capacity, predicts demand patterns, and reduces failed deliveries through smart scheduling. This leads to faster deliveries and lower operational costs.',
    },
    {
      q: 'Can I use TOMUPRO for eCommerce fulfillment?',
      a: 'Yes, TOMUPRO offers full fulfillment support from warehouse inventory management to order picking, packing, and last-mile delivery. It integrates the entire eCommerce fulfillment workflow in one platform.',
    },
    {
      q: 'What is a dispatch management system?',
      a: 'A dispatch management system automatically assigns delivery orders to the right drivers based on location, vehicle capacity, and delivery priority. It eliminates manual dispatch decisions and ensures optimal resource utilization.',
    },
    {
      q: 'How much does TOMUPRO cost?',
      a: 'TOMUPRO offers a free plan to get started with no credit card required. Pricing scales based on delivery volume and features needed, so you only pay for what you use as your business grows.',
    },
    {
      q: 'How do I get started with TOMUPRO?',
      a: 'Sign up at tomu.my, set up your team, and start managing deliveries immediately. No technical setup or hardware installation is required — you can be operational within minutes.',
    },
    {
      q: 'Do you deliver in Bandar Seri Begawan?',
      a: 'Yes, TOMUPRO provides full delivery coverage in Bandar Seri Begawan and surrounding areas including Gadong, Kiulap, Berakas, Kiarong, and Rimba. We offer same-day and next-day delivery options for businesses operating in the capital.',
    },
    {
      q: 'Is TOMUPRO available in Kuala Belait and Seria?',
      a: 'Yes, TOMUPRO serves the entire Belait District including Kuala Belait, Seria, and Labi. Businesses in these areas can use our platform for local deliveries as well as cross-district logistics to Brunei-Muara, Tutong, and Temburong.',
    },
    {
      q: 'What delivery services are available in Tutong?',
      a: 'TOMUPRO covers Tutong District including Tutong Town, Pekan Tutong, and surrounding kampongs. Our logistics network enables efficient deliveries between Tutong and other districts, with optimized routes for the local road network.',
    },
    {
      q: 'Can I ship parcels to Temburong District?',
      a: 'Yes, TOMUPRO provides delivery services to Temburong District including Bangar Town. While Temburong is geographically separated, our route optimization accounts for the Temburong Bridge and ferry connections to ensure timely deliveries.',
    },
    {
      q: 'Does TOMUPRO support cash on delivery (COD)?',
      a: 'Yes, TOMUPRO fully supports cash on delivery across all districts in Brunei. Drivers collect payment at the customer\'s door, and the amount is recorded in the system immediately. Every COD transaction is tracked and reconciled automatically, giving businesses full visibility over collected payments without manual cash counting.',
    },
    {
      q: 'Is TOMUPRO a trusted courier service in Brunei?',
      a: 'TOMUPRO is trusted by businesses across Brunei for reliable courier and delivery operations. Every delivery is GPS-tracked in real-time, customers receive automated status updates, and businesses get full performance analytics. Our platform serves companies in Bandar Seri Begawan, Kuala Belait, Seria, Tutong, and Muara with consistent, accountable service.',
    },
  ];

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.a,
        },
      })),
    });
    document.head.appendChild(script);
    return () => { document.getElementById('faq-schema')?.remove(); };
  }, []);

  return (
    <section ref={ref} className="py-24 lg:py-32 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
            <CheckCircle2 className="h-3.5 w-3.5" /> FAQ
          </div>
          <h2 className={cn(
            'text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-4',
            inView ? 'lp-fade-up' : 'opacity-0'
          )}>
            Frequently Asked Questions
          </h2>
          <p className={cn(
            'text-[#64748B] text-lg',
            inView ? 'lp-fade-up' : 'opacity-0'
          )} style={{ animationDelay: '0.1s' }}>
            Everything you need to know about TOMUPRO and delivery management.
          </p>
        </div>

        <div className={cn(
          'space-y-3',
          inView ? 'lp-fade-up' : 'opacity-0'
        )} style={{ animationDelay: '0.2s' }}>
          {faqs.map((faq, i) => (
            <div key={i} className="border border-[#F1F5F9] rounded-xl overflow-hidden bg-[#FAFAF9] hover:border-[#E2E8F0] transition-colors">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left"
              >
                <span className="text-[15px] font-medium text-[#0F172A]">{faq.q}</span>
                <ChevronDown className={cn(
                  'h-5 w-5 text-[#94A3B8] shrink-0 transition-transform duration-200',
                  openIndex === i && 'rotate-180'
                )} />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5 pt-0">
                  <p className="text-sm text-[#64748B] leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SEO: LOGISTICS & DELIVERY SOLUTIONS SECTION                       */
/* ═══════════════════════════════════════════════════════════════════ */
function SEOLogisticsSection() {
  const { ref, inView } = useInView(0.1);
  return (
    <section ref={ref} className="py-20 lg:py-28 bg-white border-t border-[#F1F5F9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/5 text-[#B8860B] text-xs font-semibold mb-4">
              <MapPin className="h-3.5 w-3.5" /> BRUNEI
            </div>
            <h2 className={cn(
              'text-3xl lg:text-[2.75rem] font-bold tracking-[-0.02em] text-[#0F172A] mb-5',
              inView ? 'lp-fade-up' : 'opacity-0'
            )}>
              Logistics &amp; Delivery Solutions in Brunei
            </h2>
          </div>

          <div className={cn(
            'prose prose-lg max-w-none text-[#475569] leading-relaxed',
            inView ? 'lp-fade-up' : 'opacity-0'
          )} style={{ animationDelay: '0.15s' }}>
            <p className="text-base lg:text-[17px] mb-6">
              TOMUPRO supports eCommerce, retail, and warehouse businesses with a complete logistics solution, including delivery service, inventory tracking, and fulfillment operations. Whether you need a courier service, last-mile delivery, or a full logistics management system, TOMUPRO provides a scalable platform built for Brunei businesses.
            </p>
            <p className="text-base lg:text-[17px] mb-6">
              Our delivery tracking system gives businesses real-time visibility into every order, from dispatch to doorstep. With AI route optimization, automated dispatch management, and comprehensive fleet tracking, TOMUPRO helps logistics companies in Brunei reduce costs, improve delivery times, and scale operations efficiently.
            </p>

            <h3 className="text-lg font-semibold text-[#0F172A] mt-8 mb-3">Delivery Services Across All Brunei Districts</h3>
            <p className="text-base lg:text-[17px] mb-6">
              TOMUPRO provides comprehensive delivery coverage across Brunei Darussalam, serving businesses and customers in <strong>Bandar Seri Begawan</strong>, <strong>Kuala Belait</strong>, <strong>Seria</strong>, <strong>Tutong Town</strong>, and <strong>Muara</strong>. Our logistics network extends to all four districts — Brunei-Muara, Belait, Tutong, and Temburong — ensuring reliable same-day and next-day delivery options nationwide.
            </p>
            <p className="text-base lg:text-[17px] mb-8">
              Whether you're shipping parcels from Gadong to Kiulap, fulfilling eCommerce orders in Kuala Belait, or managing courier deliveries across Seria and Tutong, our AI-powered route optimization ensures the fastest, most cost-effective routes for every delivery in Brunei.
            </p>

            <h3 className="text-lg font-semibold text-[#0F172A] mt-8 mb-3">Trusted Courier &amp; Cash on Delivery (COD) Services</h3>
            <p className="text-base lg:text-[17px] mb-8">
              TOMUPRO is a trusted courier and delivery platform in Brunei with full cash on delivery (COD) support. Drivers collect payment at the door, and every COD transaction is recorded and reconciled automatically — eliminating manual cash counting errors. Whether collecting COD payments in Bandar Seri Begawan, handling fulfillment orders in Kuala Belait, or running same-day courier deliveries in Seria and Tutong, businesses across Brunei rely on TOMUPRO for secure, trackable, and accountable delivery operations.
            </p>
          </div>

          {/* Service cards grid */}
          <div className={cn(
            'grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10',
            inView ? 'lp-fade-up' : 'opacity-0'
          )} style={{ animationDelay: '0.3s' }}>
            {[
              { icon: Truck, title: 'Last-Mile Delivery', desc: 'End-to-end last-mile delivery management with real-time tracking for Brunei businesses.' },
              { icon: Package, title: 'Order Fulfillment', desc: 'Automated order fulfillment from warehouse to customer doorstep with full visibility.' },
              { icon: Route, title: 'Route Optimization', desc: 'AI-powered route planning to reduce delivery times and fuel costs across Brunei.' },
              { icon: Warehouse, title: 'Warehouse Management', desc: 'Multi-location inventory control with stock transfers, audits, and balance tracking.' },
              { icon: Users, title: 'Fleet Management', desc: 'Driver and runner management with performance tracking and dispatch automation.' },
              { icon: Banknote, title: 'Cash on Delivery (COD)', desc: 'Secure COD collection with automated payment reconciliation for every delivery.' },
            ].map((s) => (
              <div key={s.title} className="p-5 rounded-xl border border-[#F1F5F9] bg-[#FAFAF9]">
                <s.icon className="h-5 w-5 text-[#B8860B] mb-3" />
                <h3 className="text-sm font-semibold text-[#0F172A] mb-1.5">{s.title}</h3>
                <p className="text-xs text-[#64748B] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Business info for Google Business readiness */}
          <div className={cn(
            'mt-12 p-6 rounded-2xl bg-[#FAFAF9] border border-[#F1F5F9] flex flex-col sm:flex-row items-start sm:items-center gap-6',
            inView ? 'lp-fade-up' : 'opacity-0'
          )} style={{ animationDelay: '0.45s' }}>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#0F172A] mb-1">TOMUPRO — Trusted Courier &amp; Delivery Platform</p>
              <p className="text-xs text-[#64748B]">Brunei Darussalam &bull; hello@tomu.my &bull; tomu.my</p>
              <p className="text-xs text-[#94A3B8] mt-1">Delivery Service &bull; Courier Service &bull; Fulfillment &bull; COD</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center hover:bg-[#F8FAFC] transition-colors">
                <Instagram className="h-3.5 w-3.5 text-[#64748B]" />
              </a>
              <a href="mailto:hello@tomu.my" className="h-8 w-8 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center hover:bg-[#F8FAFC] transition-colors">
                <Mail className="h-3.5 w-3.5 text-[#64748B]" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  CONTACT / REGISTER INTEREST                                       */
/* ═══════════════════════════════════════════════════════════════════ */
function ContactSection() {
  const [form, setForm] = useState({ full_name: '', company_name: '', phone: '', email: '', business_type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { ref, inView } = useInView(0.15);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.full_name.trim()) { setError('Full name is required'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('Valid email is required'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('https://dtcchduronwsyunyakxj.supabase.co/functions/v1/submit-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#B8860B]/40 focus:border-[#B8860B] transition-all';

  return (
    <section id="contact" ref={ref} className="py-24 lg:py-32 bg-[#0B1120] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-[400px] h-[400px] bg-[#B8860B]/[0.04] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#B8860B]/[0.03] rounded-full blur-[150px]" />
      </div>
      <div className={cn(
        'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 transition-all duration-700',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      )}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left — Info */}
          <div className="lg:pt-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B8860B]/10 text-[#D4A843] text-xs font-semibold mb-6">
              <Send className="h-3.5 w-3.5" /> GET IN TOUCH
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-[-0.02em] text-white mb-4">
              Register Your Interest
            </h2>
            <p className="text-lg text-[#94A3B8] mb-10 max-w-md leading-relaxed">
              Leave your details and our team will contact you shortly.
            </p>
            <div className="space-y-5">
              <a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group">
                <div className="h-11 w-11 rounded-xl bg-[#1E293B] flex items-center justify-center group-hover:bg-[#B8860B]/20 transition-colors">
                  <Instagram className="h-5 w-5 text-[#94A3B8] group-hover:text-[#D4A843] transition-colors" />
                </div>
                <span className="text-[#CBD5E1] group-hover:text-white transition-colors font-medium">@tomupro</span>
              </a>
              <a href="mailto:hello@tomu.my" className="flex items-center gap-4 group">
                <div className="h-11 w-11 rounded-xl bg-[#1E293B] flex items-center justify-center group-hover:bg-[#B8860B]/20 transition-colors">
                  <Mail className="h-5 w-5 text-[#94A3B8] group-hover:text-[#D4A843] transition-colors" />
                </div>
                <span className="text-[#CBD5E1] group-hover:text-white transition-colors font-medium">hello@tomu.my</span>
              </a>
              <a href="https://tomu.my" className="flex items-center gap-4 group">
                <div className="h-11 w-11 rounded-xl bg-[#1E293B] flex items-center justify-center group-hover:bg-[#B8860B]/20 transition-colors">
                  <Globe className="h-5 w-5 text-[#94A3B8] group-hover:text-[#D4A843] transition-colors" />
                </div>
                <span className="text-[#CBD5E1] group-hover:text-white transition-colors font-medium">tomu.my</span>
              </a>
            </div>
          </div>

          {/* Right — Form Card */}
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/20 p-8 lg:p-10">
            {submitted ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-[#B8860B]/10 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="h-8 w-8 text-[#B8860B]" />
                </div>
                <h3 className="text-xl font-bold text-[#0F172A] mb-3">Thank you!</h3>
                <p className="text-[#64748B] leading-relaxed max-w-sm mx-auto">
                  Your interest has been registered. Our team will contact you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h3 className="text-lg font-bold text-[#0F172A] mb-1">Fill in your details</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1.5">Full Name *</label>
                    <input name="full_name" value={form.full_name} onChange={handleChange} placeholder="John Doe" required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1.5">Company Name</label>
                    <input name="company_name" value={form.company_name} onChange={handleChange} placeholder="Your Company" className={inputCls} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1.5">Phone Number</label>
                    <input name="phone" value={form.phone} onChange={handleChange} placeholder="+673 xxx xxxx" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#475569] mb-1.5">Email Address *</label>
                    <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@company.com" required className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1.5">Business Type</label>
                  <select name="business_type" value={form.business_type} onChange={handleChange} className={inputCls}>
                    <option value="">Select your business type</option>
                    <option value="E-commerce">E-commerce</option>
                    <option value="Retail">Retail</option>
                    <option value="F&B">Food & Beverage</option>
                    <option value="Logistics">Logistics / Courier</option>
                    <option value="Warehouse / 3PL">Warehouse / 3PL</option>
                    <option value="SME">SME / Startup</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1.5">Message / Notes</label>
                  <textarea name="message" value={form.message} onChange={handleChange} placeholder="Tell us about your needs..." rows={4} className={cn(inputCls, 'resize-none')} />
                </div>
                {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-[#B8860B] hover:bg-[#9A7209] text-white font-semibold text-[15px] shadow-lg shadow-[#B8860B]/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Interest
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  FOOTER                                                            */
/* ═══════════════════════════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="bg-[#080D19] text-[#94A3B8] py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-5 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <AppLogo size="sm" className="h-8 w-8" />
              <AppName highlight className="text-lg font-bold text-white tracking-tight" accentClass="text-[#B8860B]" />
            </div>
            <p className="text-sm text-[#64748B] leading-relaxed max-w-sm mb-6">
              Brunei's trusted courier and delivery platform. Last-mile delivery, fulfillment, COD, and logistics management across Bandar Seri Begawan, Kuala Belait, Seria, Tutong, and Muara.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-lg bg-[#1E293B] flex items-center justify-center hover:bg-[#B8860B]/20 transition-colors">
                <Instagram className="h-4 w-4 text-[#94A3B8]" />
              </a>
              <a href="mailto:hello@tomu.my" className="h-9 w-9 rounded-lg bg-[#1E293B] flex items-center justify-center hover:bg-[#B8860B]/20 transition-colors">
                <Mail className="h-4 w-4 text-[#94A3B8]" />
              </a>
              <a href="https://tomu.my" className="h-9 w-9 rounded-lg bg-[#1E293B] flex items-center justify-center hover:bg-[#B8860B]/20 transition-colors">
                <Globe className="h-4 w-4 text-[#94A3B8]" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Platform</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Solutions', href: '#solutions' },
                { label: 'About', href: '#about' },
                { label: 'Blog', href: '/blog' },
              ].map((l) => (
                <li key={l.label}><a href={l.href} className="text-[#64748B] hover:text-white transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: 'Last-Mile Delivery', href: '/last-mile-delivery-brunei' },
                { label: 'Courier Service', href: '/courier-service-brunei' },
                { label: 'Same Day Delivery', href: '/same-day-delivery-brunei' },
                { label: 'Parcel Delivery', href: '/parcel-delivery-brunei' },
                { label: 'eCommerce Delivery', href: '/ecommerce-delivery-brunei' },
                { label: 'Fulfillment Service', href: '/fulfillment-service-brunei' },
                { label: 'Logistics Company', href: '/logistics-company-brunei' },
                { label: 'Delivery Management', href: '/delivery-management-system' },
                { label: 'Delivery App', href: '/delivery-app-brunei' },
              ].map((l) => (
                <li key={l.label}><a href={l.href} className="text-[#64748B] hover:text-white transition-colors">{l.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Contact</h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#64748B] hover:text-white transition-colors"><Instagram className="h-3.5 w-3.5" /> @tomupro</a></li>
              <li className="flex items-center gap-2 text-[#64748B]"><Mail className="h-3.5 w-3.5" /> hello@tomu.my</li>
              <li className="flex items-center gap-2 text-[#64748B]"><Globe className="h-3.5 w-3.5" /> tomu.my</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#1E293B] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#475569]">&copy; {new Date().getFullYear()} <AppName />. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-[#475569]">
            <a href="#" className="hover:text-[#B8860B] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#B8860B] transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  LOGIN MODAL                                                       */
/* ═══════════════════════════════════════════════════════════════════ */
function LoginModal({
  open, initialTab, onClose, signIn, signUp, navigate, toast,
}: {
  open: boolean; initialTab: 'login' | 'signup'; onClose: () => void;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName: string, role: string) => Promise<{ error: any }>;
  navigate: (path: string) => void; toast: (opts: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(initialTab);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setForgotMode(false);
      setForgotSent(false);
    }
  }, [initialTab, open]);

  const friendlyError = (msg: string) => {
    const lower = msg.toLowerCase();
    if (lower.includes('already registered') || lower.includes('already been registered')) return 'This email is already registered. Please log in instead.';
    if (lower.includes('invalid login credentials')) return 'Invalid email or password.';
    if (lower.includes('email') && lower.includes('invalid')) return 'Please enter a valid email address.';
    if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('least'))) return 'Password is too weak. Use at least 8 characters.';
    if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
    if (lower.includes('database')) return 'Signup failed. Please try again.';
    return msg;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) { toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message }); return; }
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Login Failed', description: friendlyError(error.message) });
    } else { onClose(); navigate('/'); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = signupSchema.safeParse({ email: signupEmail, password: signupPassword, displayName });
    if (!result.success) { toast({ variant: 'destructive', title: 'Validation Error', description: result.error.errors[0].message }); return; }
    setLoading(true);
    let assignedRole: string = 'driver';
    if (inviteCode.trim()) {
      setCodeStatus('validating');
      const validatedRole = await validateInviteCode(inviteCode.trim());
      if (validatedRole) { assignedRole = validatedRole; setCodeStatus('valid'); toast({ title: 'Code Applied', description: `Role: ${assignedRole}` }); }
      else { setCodeStatus('invalid'); toast({ variant: 'destructive', title: 'Invalid Code', description: 'Invalid or expired.' }); }
    }
    const { error } = await signUp(signupEmail, signupPassword, displayName, assignedRole);
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Signup Failed', description: friendlyError(error.message) });
    } else { toast({ title: 'Account Created', description: 'Welcome to TOMUPRO!' }); onClose(); navigate('/'); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      toast({ variant: 'destructive', title: 'Invalid Email', description: 'Please enter a valid email address.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: friendlyError(error.message) });
    } else {
      setForgotSent(true);
    }
  };

  if (!open) return null;

  const inputCls = 'h-12 bg-[#FAFAF9] border-[#E2E8F0] focus:border-[#B8860B] focus:ring-[#B8860B]/20 rounded-xl text-sm';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#071226]/55 backdrop-blur-md" onClick={onClose} />
      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200 md:grid-cols-[0.95fr_1fr]">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[#F8FAFC] text-[#94A3B8] hover:text-[#0F172A] transition-colors z-10">
          <X className="h-5 w-5" />
        </button>
        <div className="relative hidden min-h-[620px] overflow-hidden bg-[#071226] md:block">
          <img src={tomuAuthHero} alt="Brunei delivery van and warehouse" className="h-full w-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071226] via-[#071226]/45 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-10 text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#E6CF9D] backdrop-blur">
              TOMUPRO Access
            </div>
            <h2 className="max-w-md text-5xl font-black leading-[0.96] tracking-[-0.045em]">
              Run delivery operations with clarity.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/80">
              Sign in to manage orders, runners, inventory, COD payouts, and customer deliveries across Brunei.
            </p>
          </div>
        </div>
        <div className="max-h-[92vh] overflow-y-auto px-6 pb-8 pt-8 sm:px-10 sm:pt-10">
          <div className="pb-5">
            <div className="mb-4 flex items-center gap-3">
              <AppLogo size="md" className="h-12 w-12" />
              <div>
                <h2 className="text-2xl font-black tracking-[-0.03em] text-[#071226]"><AppName highlight accentClass="text-[#B8860B]" /></h2>
                <p className="text-sm font-medium text-[#64748B]">Brunei Logistics Operating System</p>
              </div>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'signup')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 p-1 bg-[#F8FAFC] rounded-xl mb-6 border border-[#F1F5F9]">
              <TabsTrigger value="login" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0F172A] text-[#94A3B8] text-sm font-bold">Log In</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#0F172A] text-[#94A3B8] text-sm font-bold">Get Started</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              {forgotMode ? (
                forgotSent ? (
                  <div className="text-center py-4 space-y-4">
                    <div className="h-14 w-14 rounded-full bg-[#22C55E]/10 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7 text-[#22C55E]" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[#0F172A] mb-1">Check your email</h3>
                      <p className="text-sm text-[#64748B]">We sent a password reset link to <strong>{forgotEmail}</strong></p>
                    </div>
                    <button onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); }} className="text-sm text-[#B8860B] hover:underline font-medium">
                      Back to Login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center mb-2">
                      <h3 className="text-base font-semibold text-[#0F172A]">Forgot Password?</h3>
                      <p className="text-xs text-[#94A3B8] mt-1">Enter your email and we'll send you a reset link.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-forgot-email" className="text-xs font-medium text-[#475569]">Email</Label>
                      <Input id="m-forgot-email" type="email" placeholder="you@example.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required className={inputCls} />
                    </div>
                    <Button type="submit" className="w-full h-11 rounded-xl bg-[#B8860B] hover:bg-[#9A7209] text-white font-medium shadow-sm" disabled={loading}>
                      {loading ? 'Sending...' : 'Send Reset Link'}
                    </Button>
                    <div className="text-center">
                      <button type="button" onClick={() => setForgotMode(false)} className="text-sm text-[#64748B] hover:text-[#0F172A] font-medium">
                        Back to Login
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-login-email" className="text-xs font-medium text-[#475569]">Email</Label>
                    <Input id="m-login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="m-login-pw" className="text-xs font-medium text-[#475569]">Password</Label>
                      <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(loginEmail); }} className="text-xs text-[#B8860B] hover:underline font-medium">
                        Forgot password?
                      </button>
                    </div>
                    <Input id="m-login-pw" type="password" placeholder="Enter password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className={inputCls} />
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-medium shadow-sm" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="m-name" className="text-xs font-medium text-[#475569]">Display Name</Label>
                  <Input id="m-name" type="text" placeholder="John Doe" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-signup-email" className="text-xs font-medium text-[#475569]">Email</Label>
                  <Input id="m-signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-signup-pw" className="text-xs font-medium text-[#475569]">Password</Label>
                  <Input id="m-signup-pw" type="password" placeholder="Min 8 characters" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-code" className="text-xs font-medium text-[#475569] flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5" /> Admin Code <span className="text-[#94A3B8]">(Optional)</span>
                  </Label>
                  <Input
                    id="m-code" type="text" placeholder="TOMU-SP-XXXX"
                    value={inviteCode} onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setCodeStatus('idle'); }}
                    className={cn(inputCls, 'font-mono uppercase', codeStatus === 'valid' && 'border-[#22C55E] bg-[#22C55E]/5', codeStatus === 'invalid' && 'border-[#EF4444] bg-[#EF4444]/5')}
                  />
                  {codeStatus === 'valid' && <p className="text-xs text-[#22C55E]">Valid code applied</p>}
                  {codeStatus === 'invalid' && <p className="text-xs text-[#EF4444]">Invalid or expired code</p>}
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white font-medium shadow-sm" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
