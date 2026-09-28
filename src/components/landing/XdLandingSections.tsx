import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Instagram, Mail, MapPin, Phone, Route, Truck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { Reveal } from './XdReveal';

type XdStat = { value: number; suffix: string; label: string; icon: 'box' | 'teams' | 'uptime' | 'truck' };

const STATS: XdStat[] = [
  { value: 10, suffix: 'K+', label: 'Orders Processed', icon: 'box' },
  { value: 50, suffix: '+', label: 'Active Teams', icon: 'teams' },
  { value: 99, suffix: '%', label: 'System Uptime', icon: 'uptime' },
  { value: 500, suffix: 'K+', label: 'Deliveries Tracked', icon: 'truck' },
];

function StatIcon({ type }: { type: XdStat['icon'] }) {
  if (type === 'truck') return <Truck className="h-8 w-8" strokeWidth={1.4} />;
  if (type === 'uptime') return <Route className="h-8 w-8" strokeWidth={1.4} />;
  if (type === 'teams') return <span className="text-3xl leading-none">♧</span>;
  return <span className="text-3xl leading-none">⌂</span>;
}

export function XdStatsSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true);
        observer.disconnect();
      }
    }, { threshold: 0.28 });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="xd-stats-section relative overflow-hidden" aria-label="TOMUPRO results">
      <div className="xd-soft-radial absolute inset-0" aria-hidden="true" />
      <div className="relative grid w-full grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat, index) => (
          <Reveal key={stat.label} delay={index * 80} className="xd-stat-cell">
            <div className="xd-stat-icon"><StatIcon type={stat.icon} /></div>
            <p className="xd-stat-value"><AnimatedCounter value={started ? stat.value : 0} formatter={(value) => `${Math.round(value)}${stat.suffix}`} /></p>
            <p className="xd-stat-label">{stat.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function XdBulkySection() {
  return (
    <section id="services" className="xd-bulky-section relative overflow-hidden" aria-labelledby="bulky-title">
      <picture className="xd-bulky-media absolute inset-0 block h-full w-full">
        <source media="(max-width: 767px)" srcSet="/landing/tomupro-bulky-mobile-2k.png" />
        <img src="/landing/tomupro-bulky-wide-2k.png" alt="Courier handing bulky parcels to a customer" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <div className="xd-bulky-overlay absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-[720px] max-w-[1440px] items-center px-5 py-24 sm:px-10 lg:min-h-[clamp(720px,56.25vw,900px)] lg:px-20">
        <Reveal className="max-w-[650px]">
          <h2 id="bulky-title" className="xd-display-heading max-w-[560px]">From Small Parcels<br />to Bulky Loads</h2>
          <p className="mt-8 max-w-[540px] text-base leading-7 text-white/82 sm:text-lg">An economical delivery service for small, large, heavy and irregular-sized parcels delivered by car, van or pick-up, up to 500 kg, from just BND 2.</p>
          <a href="#contact" className="xd-gold-button mt-10 inline-flex h-14 items-center justify-center px-8">Learn more <ArrowRight className="ml-3 h-5 w-5" /></a>
        </Reveal>
      </div>
    </section>
  );
}

type ProductFeature = { icon: 'route' | 'ai' | 'driver'; label: string };

function ProductFeatureList({ items }: { items: ProductFeature[] }) {
  return (
    <div className="mt-12 grid grid-cols-3 gap-5 sm:gap-8">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="xd-line-icon mx-auto mb-4">{item.icon === 'route' ? <Route className="h-9 w-9" strokeWidth={1.25} /> : item.icon === 'ai' ? <span className="text-3xl">AI</span> : <Truck className="h-9 w-9" strokeWidth={1.25} />}</div>
          <p className="text-sm leading-5 text-white/82">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function XdProductSection({
  id,
  title,
  description,
  image,
  imageAlt,
  features,
  reverse = false,
}: {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  features: ProductFeature[];
  reverse?: boolean;
}) {
  return (
    <section id={id} className="xd-product-section relative overflow-hidden" aria-labelledby={`${id}-title`}>
      <div className={`relative mx-auto grid max-w-[1440px] items-center gap-14 px-5 py-24 sm:px-10 lg:min-h-[700px] lg:gap-20 lg:py-32 ${reverse ? 'lg:grid-cols-[1.05fr_0.95fr]' : 'lg:grid-cols-[0.95fr_1.05fr]'}`}>
        <Reveal className={reverse ? 'lg:order-2' : ''}>
          <div className="xd-product-shot-wrap">
            <img src={image} alt={imageAlt} className="xd-product-shot" />
            <div className="xd-shot-reflection" style={{ backgroundImage: `url(${image})` }} aria-hidden="true" />
          </div>
        </Reveal>
        <Reveal delay={120} className={reverse ? 'lg:order-1' : ''}>
          <h2 id={`${id}-title`} className="xd-display-heading max-w-[620px]">{title}</h2>
          <p className="mt-8 max-w-[560px] text-base leading-7 text-white/82 sm:text-lg">{description}</p>
          <ProductFeatureList items={features} />
        </Reveal>
      </div>
    </section>
  );
}

export function XdFeatureGridSection() {
  const cards = [
    { image: '/landing/tomupro-feature-route-2k.png', alt: 'Intelligent delivery routes across a container port', title: 'Smart Route Optimization', body: 'AI plans efficient delivery routes to reduce time, fuel cost and manual coordination.' },
    { image: '/landing/tomupro-feature-tracking-2k.png', alt: 'Live parcel tracking across a freight rail terminal', title: 'Real-Time Parcel Tracking', body: 'Live GPS tracking for every parcel and every operational handoff.' },
    { image: '/landing/tomupro-feature-cod-2k.png', alt: 'Mobile payment confirmation beside a delivery parcel', title: 'COD Management', body: 'Cash-on-delivery support with reconciliation, payout tracking and reports.' },
  ];

  return (
    <section className="xd-feature-grid-section" aria-label="TOMUPRO capabilities">
      <div className="grid lg:grid-cols-3">
        {cards.map((card, index) => (
          <Reveal key={card.title} delay={index * 80} className="h-full">
            <article className="xd-feature-card group relative h-[560px] overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r last:border-r-0">
              <img src={card.image} alt={card.alt} loading="lazy" width={1744} height={2336} className="absolute inset-0 h-full w-full object-cover" />
              <div className="xd-feature-card-overlay absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-8 sm:p-10">
                <div className="xd-feature-symbol mb-7">{index === 0 ? 'AI' : index === 1 ? <Route className="h-9 w-9" strokeWidth={1.25} /> : <WalletCards className="h-9 w-9" strokeWidth={1.25} />}</div>
                <h3 className="text-xl font-semibold tracking-[-0.025em] text-white sm:text-2xl">{card.title}</h3>
                <p className="mt-4 max-w-[330px] text-sm leading-6 text-white/78 sm:text-base">{card.body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function XdTestimonialSection() {
  return (
    <section id="about" className="xd-testimonial-section relative overflow-hidden" aria-labelledby="testimonial-title">
      <picture className="xd-testimonial-media absolute inset-0 block h-full w-full">
        <source media="(max-width: 767px)" srcSet="/landing/tomupro-testimonial-mobile-2k.png" />
        <img src="/landing/tomupro-testimonial-wide-2k.png" alt="TOMUPRO team member in a warehouse" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <div className="xd-testimonial-photo-fade absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-[720px] max-w-[1440px] items-center justify-end px-5 py-24 sm:px-10 lg:min-h-[clamp(720px,56.25vw,900px)] lg:px-20">
        <Reveal delay={120} className="max-w-[760px]">
          <p className="xd-quote-mark">“</p>
          <p className="max-w-[720px] text-2xl italic leading-[1.2] text-white/90 sm:text-4xl">The real-time tracking and dedicated support from TOMUPRO give us peace of mind.</p>
          <h2 id="testimonial-title" className="xd-display-heading mt-12 max-w-[720px]">Helping Brunei Businesses<br />Deliver More, Worry Less</h2>
          <p className="mt-8 max-w-[650px] text-base leading-7 text-white/82 sm:text-lg">From local startups to established brands, TOMUPRO empowers businesses across Brunei with reliable delivery, real-time tracking and operational support.</p>
          <div className="xd-testimonial-metrics mt-12 grid max-w-[700px] grid-cols-3 gap-5">
            <div><p className="xd-metric-value">98%</p><p className="font-semibold text-white">On-time Delivery</p><p className="mt-1 text-sm text-white/65">Across Brunei</p></div>
            <div><p className="xd-metric-value">2.5X</p><p className="font-semibold text-white">Business Growth</p><p className="mt-1 text-sm text-white/65">Average Capacity Increase</p></div>
            <div><p className="xd-metric-value">1,200+</p><p className="font-semibold text-white">Happy Merchants</p><p className="mt-1 text-sm text-white/65">Trust TOMUPRO everyday</p></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function XdCtaSection({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <section className="xd-cta-section relative overflow-hidden" aria-labelledby="cta-title">
      <div className="absolute inset-0 bg-[#101326]" aria-hidden="true" />
      <picture className="xd-cta-media absolute inset-0 block h-full w-full">
        <source media="(max-width: 767px)" srcSet="/landing/tomupro-cta-mobile-2k.png" />
        <img src="/landing/tomupro-cta-wide-2k.png" alt="Courier ready to deliver a parcel by scooter" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <div className="xd-cta-backdrop absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-[640px] max-w-[1440px] flex-col items-center justify-center px-5 py-24 text-center sm:px-10 lg:items-start lg:text-left">
        <Reveal className="lg:ml-[5%]">
          <h2 id="cta-title" className="xd-display-heading max-w-[680px]">Ready to Scale Your<br />Deliveries?</h2>
          <p className="mt-8 max-w-[720px] text-base text-white/85 sm:text-lg">Join businesses across Brunei who trust TOMUPRO to power their logistics.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button type="button" onClick={onSignup} className="xd-gold-button h-14 px-8">Book a demo</Button>
            <Button type="button" onClick={onLogin} className="xd-white-button h-14 px-8">Merchant login</Button>
          </div>
        </Reveal>
      </div>
      <div className="xd-cta-contact-info" aria-label="TOMUPRO contact details">
        <XdContactInfo />
      </div>
    </section>
  );
}

export function XdContactInfo() {
  return (
    <div className="xd-contact-info-grid">
      <a href="tel:+6738136587" className="xd-contact-item"><span className="xd-contact-icon"><Phone className="h-6 w-6" /></span><strong>PHONE</strong><span>+673 813 6587</span></a>
      <a href="https://www.instagram.com/tomupro/" target="_blank" rel="noreferrer" className="xd-contact-item"><span className="xd-contact-icon"><Instagram className="h-6 w-6" /></span><strong>INSTAGRAM</strong><span>@tomupro</span></a>
      <a href="mailto:info@tomupro.com" className="xd-contact-item"><span className="xd-contact-icon"><Mail className="h-6 w-6" /></span><strong>EMAIL</strong><span>info@tomupro.com</span></a>
      <div className="xd-contact-item"><span className="xd-contact-icon"><MapPin className="h-6 w-6" /></span><strong>ADDRESS</strong><span>Sengkurong Commercial Center, Mukim Sengkurong, Bandar Seri Begawan, Brunei-Muara</span></div>
    </div>
  );
}

export function XdFooterLinks({ onLogin }: { onLogin: () => void }) {
  return (
    <footer className="xd-footer">
      <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-10 lg:px-20">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr]">
          <div><img src="/landing/tomupro-logo-public.png?v=2026081101" alt="TOMUPRO logo" className="h-11 w-36 object-cover" /><div className="mt-10 grid gap-6 sm:grid-cols-2"><a href="tel:+6738136587" className="xd-footer-contact"><Phone className="h-5 w-5" /> <span><b>PHONE</b><br />+673 813 6587</span></a><a href="mailto:info@tomupro.com" className="xd-footer-contact"><Mail className="h-5 w-5" /> <span><b>EMAIL</b><br />info@tomupro.com</span></a></div></div>
          <div className="xd-footer-contact"><MapPin className="h-5 w-5" /><span><b>ADDRESS</b><br />Sengkurong Commercial Center,<br />Mukim Sengkurong, Bandar Seri<br />Begawan, Brunei-Muara</span></div>
          <div><p className="xd-footer-heading">Quick Links</p><a href="#services">Services</a><a href="#features">Features</a><a href="#tracking">Track Parcel</a><a href="/blog">Blog</a></div>
          <div><p className="xd-footer-heading">Follow us on</p><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noreferrer" className="flex items-center gap-3"><Instagram className="h-5 w-5" /> @tomupro</a><button type="button" onClick={onLogin} className="mt-5 text-left text-white/75 transition-colors hover:text-white">Merchant login</button></div>
        </div>
      </div>
      <div className="xd-footer-bottom">2026 TOMUPRO Brunei. All rights reserved.</div>
    </footer>
  );
}
