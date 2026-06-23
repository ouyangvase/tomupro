import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import capybaraLoading from "@/assets/capybara-loading.png";
import "./Landing.css";

const ASSETS = "/landing";

const PARCELS: Record<string, { status: string; loc: string; eta: string }> = {
  "310724636": { status: "Out for Delivery", loc: "Sengkurong Hub, Brunei-Muara", eta: "Today, before 5:00 PM" },
  "310724700": { status: "Delivered", loc: "Kuala Belait", eta: "Delivered · 1:20 PM" },
};

const solutions = [
  { icon: "🚚", title: "Last-Mile Delivery", body: "Dispatch, assign and monitor deliveries across Brunei from one clean operations screen." },
  { icon: "📦", title: "Fulfillment & Stock", body: "Handle warehouse, pick-pack, inbound, runner stock and order movement without messy spreadsheets." },
  { icon: "💵", title: "COD Collection", body: "Track COD orders, driver collections, runner claims, payouts and reconciliation with confidence." },
];

const features = [
  "Live driver and parcel tracking",
  "Runner inbox and delivery workflow",
  "Bulk import and export tools",
  "COD payout and claim records",
  "Sales, runner and driver dashboards",
  "Audit logs for every movement",
  "Mobile-first operation screens",
  "Notifications for action required orders",
];

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

  return (
    <div className="tomupro-landing">
      <header className={`pnav${scrolled ? " pnav-scrolled" : ""}`}>
        <div className="pnav-inner">
          <a href="#home" className="pbrand" onClick={() => setMenuOpen(false)}>
            <img src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO logo" />
            <div className="pbrand-text">
              <b>TOMU<span>PRO</span></b>
              <small>Premium Logistics OS</small>
            </div>
          </a>

          <nav className={`plinks${menuOpen ? " open" : ""}`} id="plinks">
            <a href="#services" onClick={() => setMenuOpen(false)}>Solutions</a>
            <a href="#track" onClick={() => setMenuOpen(false)}>Tracking</a>
            <a href="#dashboard" onClick={() => setMenuOpen(false)}>Dashboard</a>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
            <Link to="/auth" className="menu-only mlogin">Log In</Link>
            <a href="#contact" className="menu-only mdemo" onClick={() => setMenuOpen(false)}>Book Demo</a>
          </nav>

          <div className="pnav-cta">
            <Link to="/auth" className="pbtn-login">Log In</Link>
            <a href="#contact" className="pbtn-demo">Get Started</a>
          </div>

          <button className="pmenu" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <section className="phero" id="home">
        <div className="premium-glow glow-one" />
        <div className="premium-glow glow-two" />
        <div className="phero-inner">
          <div className="phero-text rv">
            <div className="phero-badge"><span className="phero-badge-dot" /> Built for Brunei delivery teams</div>
            <h1>Run delivery, COD and stock in one premium logistics system.</h1>
            <p className="phero-sub">
              TOMUPRO helps merchants, runners and drivers manage orders from assignment to delivery, claim and payout — with a clean mobile-first operating platform.
            </p>
            <div className="phero-cta">
              <a href="#contact" className="pbtn pbtn-dark">Book Demo</a>
              <Link to="/auth" className="pbtn pbtn-outline-dark">Merchant Login</Link>
            </div>
            <div className="phero-trust">
              <span>✓ Live operations</span>
              <span>✓ COD ready</span>
              <span>✓ Mobile workflow</span>
            </div>
          </div>

          <div className="phero-visual rv">
            <div className="capy-moment capy-hero">
              <img src={capybaraLoading} alt="TOMUPRO capybara assistant" />
              <span>Ops assistant</span>
            </div>
            <div className="dash-mock premium-card">
              <div className="dash-bar">
                <div className="dash-dots"><span /><span /><span /></div>
                <div className="dash-url">app.tomu.my/dashboard</div>
                <div className="dash-notif"><span className="notif-dot" />Live</div>
              </div>
              <div className="dash-body">
                <div className="dash-headline">
                  <div>
                    <small>Today Operation</small>
                    <strong>Runner Control Center</strong>
                  </div>
                  <span>98% On Track</span>
                </div>
                <div className="dash-stats">
                  <div className="dstat"><div className="dstat-label">Orders</div><div className="dstat-val">284</div><div className="dstat-badge green">+18%</div></div>
                  <div className="dstat"><div className="dstat-label">Active Drivers</div><div className="dstat-val">12</div><div className="dstat-badge gold">Live</div></div>
                  <div className="dstat"><div className="dstat-label">COD</div><div className="dstat-val">BND 8.4k</div><div className="dstat-badge green">Matched</div></div>
                </div>
                <div className="route-card">
                  <div className="route-line"><span /> <b>Sengkurong Hub</b> <em>12 orders ready</em></div>
                  <div className="route-line active"><span /> <b>Driver YC</b> <em>Out for delivery</em></div>
                  <div className="route-line"><span /> <b>Runner Review</b> <em>3 pending accept</em></div>
                </div>
                <div className="dash-orders">
                  <div className="do-row"><div className="do-icon">📦</div><div className="do-info"><div className="do-id">ORD-2847</div><div className="do-loc">TRANSFER · Receipt check</div></div><div className="do-status pending">Action</div></div>
                  <div className="do-row"><div className="do-icon">🚚</div><div className="do-info"><div className="do-id">ORD-2846</div><div className="do-loc">BSB → Tutong</div></div><div className="do-status transit">Moving</div></div>
                  <div className="do-row"><div className="do-icon">✅</div><div className="do-info"><div className="do-id">ORD-2845</div><div className="do-loc">COD · BND 18.50</div></div><div className="do-status delivered">Done</div></div>
                </div>
              </div>
            </div>
            <div className="float-card fc-top"><div className="fc-icon">💵</div><div><div className="fc-title">COD matched</div><div className="fc-sub">Payout ready</div></div></div>
            <div className="float-card fc-bottom"><div className="fc-icon">🔔</div><div><div className="fc-title">Action required</div><div className="fc-sub">Runner notified</div></div></div>
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="stats-inner">
          <div className="sstat rv"><div className="sstat-num">10k<span>+</span></div><div className="sstat-label">Orders processed</div></div>
          <div className="sstat rv"><div className="sstat-num">500k<span>+</span></div><div className="sstat-label">Deliveries tracked</div></div>
          <div className="sstat rv"><div className="sstat-num">99.9<span>%</span></div><div className="sstat-label">System uptime</div></div>
          <div className="sstat rv"><div className="sstat-num">50<span>+</span></div><div className="sstat-label">Active teams</div></div>
        </div>
      </section>

      <section id="services" className="services-section">
        <div className="wrap">
          <div className="section-head rv">
            <div className="eyebrow">Solutions</div>
            <h2>Built for real delivery operations, not just tracking numbers.</h2>
            <p>Every screen is designed for merchants, runners, drivers and admins who need speed, clarity and accountability.</p>
          </div>
          <div className="solution-grid">
            {solutions.map((item) => (
              <div className="solution-card rv" key={item.title}>
                <div className="solution-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="tracking-section" id="track">
        <div className="wrap track-grid">
          <div className="track-copy rv">
            <div className="eyebrow">Parcel Tracking</div>
            <h2>Give customers a cleaner way to check delivery status.</h2>
            <p>Keep your current tracking input logic. Customers enter the tracking number and instantly see the parcel status.</p>
            <div className="capy-note"><img src={capybaraLoading} alt="Capybara tracking assistant" /><span>Subtle tracking assistant, never blocking the form.</span></div>
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
                <div className="track-empty">No parcel found for <b>{trackRes.no}</b>. Try the example number 310724636.</div>
              )}
              {trackRes && trackRes.found && (
                <div className="track-found">
                  <div className="track-found-top"><span>#{trackRes.no}</span><b>{trackRes.status}</b></div>
                  <div className="track-loc">⌖ {trackRes.loc}</div>
                  <div className="track-eta">{trackRes.eta}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="dashboard" className="merchant-section">
        <div className="wrap split rev rv">
          <div className="screen screen-lg">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-merchant.jpg`} alt="TOMUPRO merchant dashboard" />
          </div>
          <div className="txt">
            <div className="eyebrow">Merchant Dashboard</div>
            <h2>One place to see orders, runners, drivers and delivery status.</h2>
            <p>From booking sales to ready sales and delivered orders, your team can work from a single operating dashboard.</p>
            <div className="check-list">
              <div className="check-item"><span className="check-mark">✓</span> Order assignment and driver status</div>
              <div className="check-item"><span className="check-mark">✓</span> Runner review and action inbox</div>
              <div className="check-item"><span className="check-mark">✓</span> Desktop and mobile layouts</div>
            </div>
            <Link to="/auth" className="btn btn-line">Merchant Login</Link>
          </div>
        </div>
      </section>

      <section className="cod-section">
        <div className="wrap split rv">
          <div className="txt">
            <div className="eyebrow">COD Payout</div>
            <h2>Clean finance records for cash-on-delivery teams.</h2>
            <p>Track collections, runner claims, delivery outcome and payout history in a way your team can audit anytime.</p>
            <div className="check-list">
              <div className="check-item"><span className="check-mark">✓</span> COD collection visibility</div>
              <div className="check-item"><span className="check-mark">✓</span> Claim batch records</div>
              <div className="check-item"><span className="check-mark">✓</span> Audit log for movement</div>
            </div>
            <a href="#contact" className="btn btn-line">Book Demo</a>
          </div>
          <div className="screen screen-lg">
            <div className="screen-bar"><span /><span /><span /></div>
            <img src={`${ASSETS}/dashboard-cod.jpg`} alt="TOMUPRO COD payout dashboard" />
          </div>
        </div>
      </section>

      <section className="feat-sec" id="features">
        <div className="wrap">
          <div className="section-head rv">
            <div className="eyebrow">Features</div>
            <h2>Premium tools for a faster delivery team.</h2>
            <p>Simple enough for daily operation. Strong enough for scale.</p>
          </div>
          <div className="features-grid">
            {features.map((feature, index) => (
              <div className="feature-pill rv" key={feature}><span>{String(index + 1).padStart(2, "0")}</span>{feature}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-cta" id="contact">
        <div className="wrap contact-grid">
          <div className="contact-head rv">
            <div className="eyebrow">Contact / Book Demo</div>
            <h2>Ready to make delivery operations feel premium?</h2>
            <p>Tell us about your current order volume, delivery process and COD workflow. TOMUPRO can be shaped around your team.</p>
            <div className="capy-note contact-capy"><img src={capybaraLoading} alt="Capybara demo assistant" /><span>Demo assistant ready.</span></div>
            <div className="cinfo"><div className="lbl">Phone</div><a href="tel:+6732428829">+673 242 8829</a></div>
            <div className="cinfo"><div className="lbl">Email</div><a href="mailto:info@tomupro.com">info@tomupro.com</a></div>
            <div className="cinfo"><div className="lbl">Address</div><div className="addr">Sengkurong Commercial Center, Mukim Sengkurong, Bandar Seri Begawan, Brunei-Muara</div></div>
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

      <footer>
        <div className="wrap foot">
          <div className="fbrand">
            <div className="fbrand-top"><img className="fgriffin" src={`${ASSETS}/logo-griffin.png`} alt="TOMUPRO" /><b>TOMU<span>PRO</span></b></div>
            <p>Premium logistics operating system for merchants, runners and drivers in Brunei.</p>
          </div>
          <div>
            <h5>Contact Us</h5>
            <div className="frow2"><span className="i">✉</span><a href="mailto:info@tomupro.com">info@tomupro.com</a></div>
            <div className="frow2"><span className="i">⌖</span><span>Sengkurong Commercial Center, BSB, Brunei-Muara</span></div>
            <div className="frow2"><span className="i">☎</span><span>Office: +673 242 8829</span></div>
          </div>
          <div>
            <h5>Quick Links</h5>
            <div className="frow2"><span className="i">→</span><a href="#services">Solutions</a></div>
            <div className="frow2"><span className="i">→</span><a href="#track">Track Parcel</a></div>
            <div className="frow2"><span className="i">→</span><a href="#features">Features</a></div>
            <div className="frow2"><span className="i">→</span><a href="#contact">Book Demo</a></div>
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
        </div>
        <div className="foot-bottom">© 2026 <b>TOMUPRO</b> Brunei. All rights reserved.</div>
      </footer>
    </div>
  );
}