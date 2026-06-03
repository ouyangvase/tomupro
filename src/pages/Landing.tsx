import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

const ASSETS = "/landing";

// Demo parcel data for the marketing tracking widget.
// TODO: wire to your real tracking lookup if you want it live on the public page.
const PARCELS: Record<string, { status: string; loc: string; eta: string }> = {
  "310724636": { status: "Out for Delivery", loc: "Sengkurong Hub, Brunei-Muara", eta: "Today, before 5:00 PM" },
  "310724700": { status: "Delivered", loc: "Kuala Belait", eta: "Delivered · 1:20 PM" },
};

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trackNo, setTrackNo] = useState("");
  const [trackRes, setTrackRes] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".tomupro-landing .rv").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function track() {
    const no = trackNo.trim();
    if (!no) return setTrackRes(null);
    const p = PARCELS[no];
    setTrackRes(p ? { found: true, no, ...p } : { found: false, no });
  }

  function sendMsg() {
    if (!form.name.trim() || !form.email.trim()) {
      alert("Please enter your name and email.");
      return;
    }
    // TODO: persist to Supabase (e.g. supabase.from('contact_messages').insert(...))
    setSent(true);
  }

  const upd = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const noop = (e: any) => e.preventDefault();

  return (
    <div className="tomupro-landing">
      {/* ===== NAV ===== */}
      <header className="pnav">
        <div className="pnav-inner">
          <a href="#home" className="pbrand">
            <img src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO" />
            <span className="wm">
              <b>TOMU<span>PRO</span></b>
              <small>Brunei Logistics Operating System</small>
            </span>
          </a>
          <nav className={"plinks" + (menuOpen ? " open" : "")} id="plinks">
            <a href="#services">Solutions</a>
            <a href="#features">Features</a>
            <a href="#" onClick={noop}>Pricing</a>
            <a href="#" onClick={noop}>Blog</a>
            <a href="#track">Tracking</a>
            <a href="#contact">Contact</a>
            <Link to="/auth" className="menu-only mlogin">Merchant Login</Link>
            <a href="#contact" className="menu-only mdemo">Book Demo</a>
          </nav>
          <div className="pnav-cta">
            <Link to="/auth" className="pbtn-login" title="Merchant Cloud System login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
              Merchant Login
            </Link>
            <a href="#contact" className="pbtn-demo">Book Demo</a>
          </div>
          <button className="pmenu" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">☰</button>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="phero" id="home">
        <div className="phero-bg" />
        <div className="phero-overlay" />
        <div className="phero-inner">
          <div className="phero-label">Brunei Logistics Operating System</div>
          <h1>Deliver More.<br />Manage Less.</h1>
          <p className="phero-sub">
            Manage deliveries, COD payouts, warehouse operations, runners and merchants from one intelligent platform built for Brunei.
          </p>
          <div className="phero-cta">
            <a href="#contact" className="pbtn pbtn-gold">Book a Demo <span>→</span></a>
            <a href="#dashboard" className="pbtn pbtn-ghost">View Dashboard</a>
          </div>
          <div className="phero-mobile-img" />
          <div className="phero-metrics">
            <div className="gcard"><div className="n">120+</div><div className="l">Active Merchants</div></div>
            <div className="gcard"><div className="n">500,000+</div><div className="l">Parcels Managed</div></div>
            <div className="gcard"><div className="n">4</div><div className="l">Districts Covered</div></div>
            <div className="gcard"><div className="n">Weekly</div><div className="l">COD Payouts</div></div>
          </div>
        </div>
      </section>

      {/* ===== SERVICE 1: LAST MILE ===== */}
      <section id="services">
        <div className="wrap split rv">
          <div className="txt">
            <div className="eyebrow">Last-Mile Delivery</div>
            <h2>From Small Parcels to Bulky Loads</h2>
            <p>An economical delivery service for small, large, heavy and irregular-sized parcels — delivered by car, van or pick-up, up to 500&nbsp;kg, from just BND&nbsp;2.</p>
            <div className="svc-tags">
              <span className="svc-tag">Last-Mile Delivery</span>
              <span className="svc-tag">Warehousing</span>
              <span className="svc-tag">COD Management</span>
            </div>
            <a href="#contact" className="btn btn-line">Learn More</a>
          </div>
          <div className="media">
            <img src={`${ASSETS}/truck-last-mile.jpg`} alt="TOMUPRO last-mile delivery truck" />
          </div>
        </div>
      </section>

      {/* ===== SERVICE 2: MERCHANT CLOUD ===== */}
      <section id="dashboard" style={{ background: "var(--soft)" }}>
        <div className="wrap split rev rv">
          <div className="screen">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-merchant.jpg`} alt="TOMUPRO merchant dashboard" />
          </div>
          <div className="txt">
            <div className="eyebrow">Merchant Cloud System</div>
            <h2>Track Every Delivery in One Place</h2>
            <p>One-stop solution for merchants to manage orders, routes, pickups and drop-offs. See every shipment&rsquo;s live status from a single, simple dashboard.</p>
            <Link to="/auth" className="btn btn-line">Merchant Login</Link>
          </div>
        </div>
      </section>

      {/* ===== COD PAYOUT & FINANCE ===== */}
      <section>
        <div className="wrap split rv">
          <div className="txt">
            <div className="eyebrow">COD Payout &amp; Finance</div>
            <h2>Cash on Delivery, Settled Weekly</h2>
            <p>Collect cash on delivery and get paid straight to your bank account — every week. Track collections, reconciliation and payouts in one clear finance dashboard, with no manual matching.</p>
            <a href="#contact" className="btn btn-line">Learn More</a>
          </div>
          <div className="screen">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-cod.jpg`} alt="TOMUPRO COD payout and finance dashboard" />
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="feat-sec">
        <div className="wrap">
          <div className="feat-head rv">
            <h2>Everything Your Business Needs</h2>
            <p>Convenient, cost-effective shipping for individuals and small to medium businesses selling online and in-store.</p>
          </div>
          <div className="feats">
            <div className="feat rv">
              <div className="ic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6h20l8 8v28H10z" /><path d="M30 6v8h8" /><path d="M16 24h16M16 30h16M16 36h10" /></svg></div>
              <h3>Business Insights &amp; Reports</h3>
              <p>A clear dashboard helps you understand your shipments and make better decisions.</p>
            </div>
            <div className="feat rv">
              <div className="ic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 10v28M14 10v28M18 10v28M24 10v28M28 10v28M34 10v28M38 10v28" strokeLinecap="round" /></svg></div>
              <h3>Real-Time Tracking</h3>
              <p>Know exactly where your parcels are, with a status update for every delivery.</p>
            </div>
            <div className="feat rv">
              <div className="ic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><rect x="6" y="9" width="36" height="24" rx="3" /><path d="M18 39h12M24 33v6" strokeLinecap="round" /></svg></div>
              <h3>Manage It All in One Place</h3>
              <p>Book pick-up and delivery from your PC or mobile — wherever you are.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FULFILLMENT + TRACK ===== */}
      <section className="full" id="track">
        <div className="full-bg" />
        <div className="full-overlay" />
        <div className="full-inner wrap rv">
          <h2>Fulfillment Center</h2>
          <p>Pick &amp; pack, warehousing and last-mile delivery.</p>
          <p className="sm">Get your own warehouse space in Brunei.</p>
        </div>
        <div className="track-wrap rv">
          <h3>Track Your Parcel</h3>
          <div className="track-row">
            <input
              type="text"
              value={trackNo}
              onChange={(e) => setTrackNo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && track()}
              placeholder="Enter tracking number…"
            />
            <button className="btn btn-primary" onClick={track}>Track</button>
          </div>
          <div className="track-eg">Example: 310724636</div>
          <div className="track-result">
            {trackRes && !trackRes.found && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 18, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                No parcel found for <b>{trackRes.no}</b>. Try the example number 310724636.
              </div>
            )}
            {trackRes && trackRes.found && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 20, background: "var(--soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 600, fontSize: 15 }}>#{trackRes.no}</span>
                  <span style={{ background: "#e7f2ec", color: "var(--green)", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20 }}>{trackRes.status}</span>
                </div>
                <div style={{ fontSize: 14, color: "var(--body-ink)" }}>⚲ {trackRes.loc}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{trackRes.eta}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== MERCHANT SUCCESS STORY ===== */}
      <section className="success" id="success">
        <div className="wrap success-grid">
          <div className="rv">
            <span className="badge-gold">★ Merchant Success Story</span>
            <h2>Helping Brunei Businesses<br />Deliver More, Worry Less</h2>
            <p className="lead">From local startups to established brands, TOMUPRO empowers businesses across Brunei with reliable delivery solutions, real-time tracking, and outstanding support.</p>
            <div className="stats-card">
              <div>
                <div className="stat-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /></svg></div>
                <div className="stat-n">98%</div><div className="stat-l">On-time Delivery</div><div className="stat-s">Across Brunei</div>
              </div>
              <div>
                <div className="stat-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg></div>
                <div className="stat-n">2.5X</div><div className="stat-l">Business Growth</div><div className="stat-s">Average increase in delivery capacity</div>
              </div>
              <div>
                <div className="stat-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><circle cx="9" cy="10" r="0.5" fill="currentColor" /><circle cx="15" cy="10" r="0.5" fill="currentColor" /></svg></div>
                <div className="stat-n">1,200+</div><div className="stat-l">Happy Merchants</div><div className="stat-s">Trust TOMUPRO every day</div>
              </div>
            </div>
            <div className="tst">
              <img className="av" src={`${ASSETS}/merchant-avatar.jpg`} alt="Little Daisy Boutique" />
              <div>
                <div className="nm">Little Daisy Boutique</div>
                <div className="ro">Fashion Retailer, Brunei</div>
                <div className="qt">“TOMUPRO has transformed our delivery operations. Our customers love the fast and reliable service, and we love how easy it is to manage everything in one place.”</div>
                <div className="pn">Nurul Afiqah</div>
                <div className="pr">Founder</div>
              </div>
            </div>
          </div>
          <div className="rv">
            <div className="success-photo"><img src={`${ASSETS}/merchant-photo.jpg`} alt="Little Daisy Boutique founder" /></div>
            <div className="quote-card"><span className="qm">“</span><p>The real-time tracking and dedicated support from TOMUPRO give us peace of mind and help us focus on growing our business.</p></div>
          </div>
        </div>
      </section>

      {/* ===== CONTACT ===== */}
      <section id="contact">
        <div className="wrap contact-grid">
          <div className="contact-head rv">
            <div className="eyebrow">Get In Touch</div>
            <h2>Contact Us</h2>
            <div className="cinfo"><div className="lbl">Phone</div><a href="tel:+6732428829">+673 242 8829</a></div>
            <div className="cinfo"><div className="lbl">Email</div><a href="mailto:info@tomupro.com">info@tomupro.com</a></div>
            <div className="cinfo"><div className="lbl">Address</div><div className="addr">Sengkurong Commercial Center,<br />Mukim Sengkurong, Bandar Seri Begawan,<br />Brunei-Muara</div></div>
          </div>
          <div className="form rv">
            {!sent ? (
              <div>
                <div className="field"><label>Your Name <span className="req">*</span></label><input type="text" value={form.name} onChange={upd("name")} /></div>
                <div className="field"><label>Your Email <span className="req">*</span></label><input type="email" value={form.email} onChange={upd("email")} /></div>
                <div className="field"><label>Subject</label><input type="text" value={form.subject} onChange={upd("subject")} /></div>
                <div className="field"><label>Your Message</label><textarea rows={5} value={form.message} onChange={upd("message")} /></div>
                <button className="btn btn-primary" onClick={sendMsg}>Send Message</button>
              </div>
            ) : (
              <div className="form-ok show">
                <div className="ok-ic">✓</div>
                <h3>Message Sent</h3>
                <p>Thanks for reaching out — our team will get back to you shortly.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer>
        <div className="wrap foot">
          <div className="fbrand">
            <div className="fbrand-top"><img className="fgriffin" src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO" /><b>TOMU<span>PRO</span></b></div>
            <p>A one-stop solution for online retailers offering their products to Brunei — and vice versa.</p>
          </div>
          <div>
            <h5>Contact Us</h5>
            <div className="frow2"><span className="i">✉</span><a href="mailto:info@tomupro.com">info@tomupro.com</a></div>
            <div className="frow2"><span className="i">⚲</span><span>Sengkurong Commercial Center, BSB, Brunei-Muara</span></div>
            <div className="frow2"><span className="i">☎</span><span>Office: +673 242 8829</span></div>
          </div>
          <div>
            <h5>Operating Hours</h5>
            <div className="hours">
              <div><span className="d">Mon – Thu</span><span className="t">8:00am – 5:00pm</span></div>
              <div><span className="d">Friday</span><span className="t">8–12pm · 2–5pm</span></div>
              <div><span className="d">Saturday</span><span className="t">8:00am – 1:00pm</span></div>
              <div><span className="d">Sunday</span><span className="t">Closed</span></div>
            </div>
          </div>
          <div>
            <h5>Search</h5>
            <div className="fsearch"><input type="text" placeholder="Search…" /><button>⌕</button></div>
          </div>
        </div>
        <div className="foot-bottom">© 2026 <b>TOMUPRO</b> Brunei. All rights reserved. · Powered by TOMUPRO</div>
      </footer>
    </div>
  );
}
