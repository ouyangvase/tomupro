import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

const ASSETS = "/landing";

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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".tomupro-landing .rv").forEach((el) => io.observe(el));

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
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
    setSent(true);
  }

  const upd = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const noop = (e: any) => e.preventDefault();

  return (
    <div className="tomupro-landing">

      {/* ===== NAV ===== */}
      <header className={`pnav${scrolled ? " pnav-scrolled" : ""}`}>
        <div className="pnav-inner">
          <a href="#home" className="pbrand">
            <img src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO logo" />
            <div className="pbrand-text">
              <b>TOMU<span>PRO</span></b>
              <small>Brunei Logistics Operating System</small>
            </div>
          </a>
          <nav className={"plinks" + (menuOpen ? " open" : "")} id="plinks">
            <a href="#services">Solutions</a>
            <a href="#features">Features</a>
            <a href="#track">Tracking</a>
            <a href="#success">About</a>
            <a href="#contact">Contact</a>
            <Link to="/auth" className="menu-only mlogin">Merchant Login</Link>
            <a href="#contact" className="menu-only mdemo">Book Demo</a>
          </nav>
          <div className="pnav-cta">
            <Link to="/auth" className="pbtn-login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
              Log In
            </Link>
            <a href="#contact" className="pbtn-demo">Get Started →</a>
          </div>
          <button className="pmenu" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">☰</button>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="phero" id="home">
        <div className="phero-inner">

          {/* Left: text */}
          <div className="phero-text rv">
            <div className="phero-badge">
              <span className="phero-badge-dot" />
              AI-Powered Operations
            </div>
            <h1>
              AI Logistics<br />
              Platform &amp;<br />
              <span className="phero-accent">Last-Mile<br />Delivery</span><br />
              in Brunei
            </h1>
            <p className="phero-sub">
              TOMUPRO is an AI-powered logistics platform in Brunei that provides last-mile delivery,
              fulfillment, courier services, and delivery management systems for businesses.
            </p>
            <div className="phero-cta">
              <a href="#contact" className="pbtn pbtn-dark">Start Free →</a>
              <a href="#dashboard" className="pbtn pbtn-outline-dark">▶ Watch Demo</a>
            </div>
            <div className="phero-trust">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              No credit card required &nbsp;·&nbsp;
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>
              &nbsp; 5 min setup &nbsp;·&nbsp;
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              &nbsp; Free forever plan
            </div>
          </div>

          {/* Right: dashboard mockup */}
          <div className="phero-visual rv">
            <div className="dash-mock">
              <div className="dash-bar">
                <div className="dash-dots"><span /><span /><span /></div>
                <div className="dash-url">app.tomu.my/dashboard</div>
                <div className="dash-notif">
                  <span className="notif-dot" />Order Delivered
                </div>
              </div>
              <div className="dash-body">
                <div className="dash-stats">
                  <div className="dstat">
                    <div className="dstat-label">Total Orders</div>
                    <div className="dstat-val">2,847</div>
                    <div className="dstat-badge green">+12.5%</div>
                  </div>
                  <div className="dstat">
                    <div className="dstat-label">In Transit</div>
                    <div className="dstat-val">48</div>
                    <div className="dstat-badge blue">+3 today</div>
                  </div>
                  <div className="dstat">
                    <div className="dstat-label">Revenue</div>
                    <div className="dstat-val" style={{fontSize:"18px"}}>BND 84.2k</div>
                    <div className="dstat-badge green">+8.3%</div>
                  </div>
                </div>
                <div className="dash-chart-title">Weekly Performance</div>
                <div className="dash-chart">
                  {[45,55,40,65,50,75,60,88,72,95].map((h, i) => (
                    <div key={i} className={`dash-bar-item${i >= 7 ? " hi" : i === 5 ? " md" : ""}`} style={{height:`${h}%`}} />
                  ))}
                </div>
                <div className="dash-orders">
                  <div className="do-row">
                    <div className="do-icon" style={{background:"#dcfce7"}}>📦</div>
                    <div className="do-info"><div className="do-id">ORD-2847</div><div className="do-loc">BSB → Tutong</div></div>
                    <div className="do-status delivered">Delivered</div>
                  </div>
                  <div className="do-row">
                    <div className="do-icon" style={{background:"#dbeafe"}}>🚚</div>
                    <div className="do-info"><div className="do-id">ORD-2846</div><div className="do-loc">Seria → KB</div></div>
                    <div className="do-status transit">In Transit</div>
                  </div>
                  <div className="do-row">
                    <div className="do-icon" style={{background:"#fef9c3"}}>💵</div>
                    <div className="do-info"><div className="do-id">ORD-2845</div><div className="do-loc">COD · BND 18.50</div></div>
                    <div className="do-status pending">Pending</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Floating cards */}
            <div className="float-card fc-top">
              <div className="fc-icon" style={{background:"#dcfce7"}}>✅</div>
              <div><div className="fc-title">Order Delivered</div><div className="fc-sub">ORD-2847 · just now</div></div>
            </div>
            <div className="float-card fc-bottom">
              <div className="fc-icon" style={{background:"#dbeafe"}}>🚚</div>
              <div><div className="fc-title">12 Drivers Active</div><div className="fc-sub">All routes covered</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS STRIP ===== */}
      <div className="stats-strip">
        <div className="stats-inner">
          <div className="sstat rv">
            <div className="sstat-icon">📦</div>
            <div className="sstat-num">10,000<span>+</span></div>
            <div className="sstat-label">Orders Processed</div>
          </div>
          <div className="sstat rv">
            <div className="sstat-icon">👥</div>
            <div className="sstat-num">50<span>+</span></div>
            <div className="sstat-label">Active Teams</div>
          </div>
          <div className="sstat rv">
            <div className="sstat-icon">📈</div>
            <div className="sstat-num">99.9<span>%</span></div>
            <div className="sstat-label">System Uptime</div>
          </div>
          <div className="sstat rv">
            <div className="sstat-icon">🚚</div>
            <div className="sstat-num">500k<span>+</span></div>
            <div className="sstat-label">Deliveries Tracked</div>
          </div>
        </div>
      </div>

      {/* ===== SERVICE 1: LAST MILE ===== */}
      <section id="services">
        <div className="wrap split rv">
          <div className="txt">
            <div className="eyebrow">Last-Mile Delivery</div>
            <h2>From Small Parcels<br />to Bulky Loads</h2>
            <p>An economical delivery service for small, large, heavy and irregular-sized parcels — delivered by car, van or pick-up, up to 500&nbsp;kg, from just BND&nbsp;2.</p>
            <div className="svc-tags">
              <span className="svc-tag">Last-Mile Delivery</span>
              <span className="svc-tag">Warehousing</span>
              <span className="svc-tag">COD Management</span>
            </div>
            <a href="#contact" className="btn btn-line">Learn More</a>
          </div>
          <div className="media photo-card">
            <img src={`${ASSETS}/truck-last-mile.jpg`} alt="TOMUPRO last-mile delivery truck" />
            <div className="photo-overlay">
              <div className="photo-tag">Last-Mile · Brunei-wide</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SERVICE 2: MERCHANT CLOUD ===== */}
      <section id="dashboard" className="section-alt">
        <div className="wrap split rev rv">
          <div className="screen screen-lg">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-merchant.jpg`} alt="TOMUPRO merchant dashboard" />
          </div>
          <div className="txt">
            <div className="eyebrow">Merchant Cloud System</div>
            <h2>Track Every Delivery<br />in One Place</h2>
            <p>One-stop solution for merchants to manage orders, routes, pickups and drop-offs. See every shipment's live status from a single, simple dashboard.</p>
            <div className="check-list">
              <div className="check-item"><span className="check-mark">✓</span> Real-time parcel tracking</div>
              <div className="check-item"><span className="check-mark">✓</span> AI route optimization</div>
              <div className="check-item"><span className="check-mark">✓</span> Driver &amp; fleet management</div>
            </div>
            <Link to="/auth" className="btn btn-line">Merchant Login</Link>
          </div>
        </div>
      </section>

      {/* ===== COD PAYOUT ===== */}
      <section>
        <div className="wrap split rv">
          <div className="txt">
            <div className="eyebrow">COD Payout &amp; Finance</div>
            <h2>Cash on Delivery,<br />Settled Weekly</h2>
            <p>Collect cash on delivery and get paid straight to your bank account — every week. Track collections, reconciliation and payouts with no manual matching.</p>
            <div className="check-list">
              <div className="check-item"><span className="check-mark">✓</span> Automated reconciliation</div>
              <div className="check-item"><span className="check-mark">✓</span> Weekly bank transfers</div>
              <div className="check-item"><span className="check-mark">✓</span> Full payment reports</div>
            </div>
            <a href="#contact" className="btn btn-line">Learn More</a>
          </div>
          <div className="screen screen-lg">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-cod.jpg`} alt="TOMUPRO COD payout and finance dashboard" />
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="feat-sec" id="features">
        <div className="wrap">
          <div className="feat-head rv">
            <div className="eyebrow" style={{textAlign:"center"}}>Platform Features</div>
            <h2>Everything Your Business Needs</h2>
            <p>One platform to manage your entire delivery operation — from dispatch to doorstep to payment.</p>
          </div>
          <div className="feats-v2">
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#1a2744"}}>
                <div className="feat-card-icon">🗺️</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">AI Routing</div>
                <h3>Smart Route Optimization</h3>
                <p>AI automatically plans the most efficient delivery routes. Reduce time on road, fuel costs, and driver fatigue every day.</p>
              </div>
            </div>
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#0f4c35"}}>
                <div className="feat-card-icon">📡</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">Tracking</div>
                <h3>Real-Time Parcel Tracking</h3>
                <p>Live GPS tracking for every parcel. Your customers always know exactly where their order is at every step.</p>
              </div>
            </div>
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#7c3a00"}}>
                <div className="feat-card-icon">💵</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">Payments</div>
                <h3>COD Management</h3>
                <p>Full cash-on-delivery support with automated reconciliation, payout tracking, and payment reports. Zero manual work.</p>
              </div>
            </div>
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#2d1b69"}}>
                <div className="feat-card-icon">📊</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">Analytics</div>
                <h3>Business Insights &amp; Reports</h3>
                <p>Deep insights into delivery rates, team performance, revenue, and operational efficiency — all in one clear dashboard.</p>
              </div>
            </div>
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#0a3d4d"}}>
                <div className="feat-card-icon">👥</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">Fleet</div>
                <h3>Driver &amp; Fleet Management</h3>
                <p>Assign jobs, monitor real-time location, and manage your entire driver team's performance from one dashboard.</p>
              </div>
            </div>
            <div className="feat-card rv">
              <div className="feat-card-top" style={{background:"#3d1a0a"}}>
                <div className="feat-card-icon">🏭</div>
              </div>
              <div className="feat-card-body">
                <div className="feat-card-tag">Fulfillment</div>
                <h3>Warehouse &amp; Inventory</h3>
                <p>End-to-end order fulfillment and inventory management for eCommerce and retail businesses across Brunei.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FULFILLMENT + TRACK ===== */}
      <section className="full" id="track">
        <div className="full-bg" />
        <div className="full-overlay" />
        <div className="full-inner wrap rv">
          <div className="eyebrow" style={{color:"#D4AF37",textAlign:"center"}}>Fulfillment Center</div>
          <h2>Warehouse, Pick &amp; Pack,<br />Last-Mile Delivery</h2>
          <p>Get your own warehouse space in Brunei. We handle storage, picking, packing and final delivery.</p>
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
                <div className="qt">"TOMUPRO has transformed our delivery operations. Our customers love the fast and reliable service, and we love how easy it is to manage everything in one place."</div>
                <div className="pn">Nurul Afiqah</div>
                <div className="pr">Founder</div>
              </div>
            </div>
          </div>
          <div className="rv">
            <div className="success-photo"><img src={`${ASSETS}/merchant-photo.jpg`} alt="Little Daisy Boutique founder" /></div>
            <div className="quote-card"><span className="qm">"</span><p>The real-time tracking and dedicated support from TOMUPRO give us peace of mind and help us focus on growing our business.</p></div>
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section className="cta-banner">
        <div className="wrap cta-inner rv">
          <div className="eyebrow" style={{color:"#D4AF37",textAlign:"center"}}>Get Started</div>
          <h2>Ready to Scale Your<br /><span className="cta-accent">Deliveries?</span></h2>
          <p>Join businesses across Brunei who trust TOMUPRO to power their logistics. Start free, scale as you grow.</p>
          <div className="cta-btns">
            <a href="#contact" className="pbtn pbtn-gold">Book a Demo →</a>
            <Link to="/auth" className="pbtn pbtn-ghost-light">Merchant Login</Link>
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
            <div className="fbrand-top">
              <img className="fgriffin" src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO" />
              <b>TOMU<span>PRO</span></b>
            </div>
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
            <h5>Quick Links</h5>
            <div className="frow2"><span className="i">→</span><a href="#services">Services</a></div>
            <div className="frow2"><span className="i">→</span><a href="#features">Features</a></div>
            <div className="frow2"><span className="i">→</span><a href="#track">Track Parcel</a></div>
            <div className="frow2"><span className="i">→</span><a href="#contact">Contact</a></div>
          </div>
        </div>
        <div className="foot-bottom">© 2026 <b>TOMUPRO</b> Brunei. All rights reserved. · Powered by TOMUPRO</div>
      </footer>

    </div>
  );
}
