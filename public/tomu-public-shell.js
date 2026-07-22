(function () {
  var PROJECT_REF = "dtcchduronwsyunyakxj";
  var SUPABASE_URL = "https://" + PROJECT_REF + ".supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0Y2NoZHVyb253c3l1bnlha3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mjc1NzEsImV4cCI6MjA4NTIwMzU3MX0.O7OyK07BNfvY3bz32IQlqdEW_vPuTxiFPCRKcVT9Q_M";
  var STORAGE_KEY = "sb-" + PROJECT_REF + "-auth-token";
  var PUBLIC_TITLE = "TOMUPRO | Brunei Delivery, COD & Logistics Company";
  var PUBLIC_ASSET_VERSION = "2026071901";
  var PUBLIC_LOGO_SRC = "/landing/tomupro-logo-public.png?v=" + PUBLIC_ASSET_VERSION;
  var PUBLIC_HERO_SRC = "/landing/tomupro-auth-hero-public.png?v=" + PUBLIC_ASSET_VERSION;
  var PUBLIC_IMAGE_FALLBACK_SRC = "/landing/truck-last-mile.jpg?v=" + PUBLIC_ASSET_VERSION;
  var PUBLIC_TRUCK_LAST_MILE_SRC = "/landing/truck-last-mile.jpg?v=" + PUBLIC_ASSET_VERSION;
  var PUBLIC_MERCHANT_PHOTO_SRC = "/landing/merchant-photo.jpg?v=" + PUBLIC_ASSET_VERSION;
  var PUBLIC_LOGO_FALLBACK_SRC = "/app-icon.png?v=" + PUBLIC_ASSET_VERSION;

  function hasSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var session = JSON.parse(raw);
      return !!(session && session.access_token && session.refresh_token);
    } catch (_) {
      return false;
    }
  }

  function shouldShowShell() {
    var path = window.location.pathname.replace(/\/+$/, "") || "/";
    return !hasSession() && (path === "/" || path === "/auth");
  }

  function applyPublicTitle() {
    document.title = PUBLIC_TITLE;
    [50, 250, 1000, 2500].forEach(function (delay) {
      setTimeout(function () {
        if (shouldShowShell()) document.title = PUBLIC_TITLE;
      }, delay);
    });
  }

  function getAuthConfig() {
    return Promise.resolve({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
  }

  async function supabaseRequest(path, body) {
    var cfg = await getAuthConfig();
    var res = await fetch(cfg.url + path, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: "Bearer " + cfg.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || "Request failed.");
    }
    return data;
  }

  function saveSession(data) {
    if (!data || !data.access_token || !data.refresh_token) {
      throw new Error("No session returned.");
    }
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at || Math.round(Date.now() / 1000) + Number(data.expires_in || 3600),
      token_type: data.token_type || "bearer",
      user: data.user || null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function showModal(mode) {
    var modal = document.querySelector("[data-public-auth-modal]");
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    setMode(mode || "login");
  }

  function hideModal() {
    var modal = document.querySelector("[data-public-auth-modal]");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function setMode(mode) {
    var shell = document.getElementById("tomu-public-shell");
    if (!shell) return;
    shell.setAttribute("data-mode", mode);
    shell.querySelectorAll("[data-auth-tab]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-auth-tab") === mode);
    });
    shell.querySelectorAll("[data-auth-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-auth-panel") !== mode;
    });
  }

  function setMessage(form, message, type) {
    var target = form.querySelector("[data-form-message]");
    if (!target) return;
    target.textContent = message || "";
    target.className = "public-form-message " + (type || "");
  }

  async function handleLogin(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    setMessage(form, "", "");
    button.disabled = true;
    button.textContent = "Signing in...";
    try {
      var data = await supabaseRequest("/auth/v1/token?grant_type=password", {
        email: form.email.value.trim(),
        password: form.password.value
      });
      saveSession(data);
      window.location.href = "/";
    } catch (err) {
      setMessage(form, err.message || "Login failed.", "error");
      button.disabled = false;
      button.textContent = "Sign In";
    }
  }

  function handleForgotPassword(event) {
    event.preventDefault();
    var form = document.querySelector("[data-login-form]");
    var email = form.email.value.trim();
    if (!email) {
      setMessage(form, "Please enter your email address first.", "error");
      return;
    }
    setMessage(form, "Submitting request...", "");
    fetch(SUPABASE_URL + "/rest/v1/rpc/submit_password_reset_request", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ p_email: email })
    })
    .then(function(res) { return res.json(); })
    .then(function() {
      setMessage(form, "If an account exists with that email, a password reset request has been sent to admin for approval.", "success");
    })
    .catch(function() {
      setMessage(form, "If an account exists with that email, a password reset request has been sent to admin for approval.", "success");
    });
  }

  async function handleSignup(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    setMessage(form, "", "");
    button.disabled = true;
    button.textContent = "Creating...";
    try {
      var data = await supabaseRequest("/auth/v1/signup", {
        email: form.email.value.trim(),
        password: form.password.value,
        data: {
          display_name: form.display_name.value.trim(),
          invite_code: form.invite_code.value.trim() || null
        }
      });
      if (data && data.access_token) {
        saveSession(data);
        window.location.href = "/";
      } else {
        setMessage(form, "Account created. Please check your email if confirmation is required.", "success");
        button.disabled = false;
        button.textContent = "Create Account";
      }
    } catch (err) {
      setMessage(form, err.message || "Signup failed.", "error");
      button.disabled = false;
      button.textContent = "Create Account";
    }
  }

  function trackParcel() {
    var input = document.querySelector("[data-track-input]");
    var result = document.querySelector("[data-track-result]");
    if (!input || !result) return;
    var value = input.value.trim();
    if (!value) {
      result.textContent = "";
      return;
    }
    if (value === "310724636") {
      result.innerHTML = "<strong>#310724636</strong><span>Out for Delivery</span><small>Sengkurong Hub, Brunei-Muara - Today before 5:00 PM</small>";
    } else {
      result.innerHTML = "<strong>No parcel found</strong><small>Try example tracking number 310724636.</small>";
    }
  }

  async function handleInterestSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    setMessage(form, "", "");
    button.disabled = true;
    button.textContent = "Sending...";
    var payload = {
      full_name: form.full_name.value.trim(),
      company_name: form.company_name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      business_type: "website_homepage",
      message: form.message.value.trim()
    };
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/submit-interest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Request failed.");
      form.reset();
      setMessage(form, "Your message has been sent. TOMUPRO will contact you soon.", "success");
    } catch (err) {
      setMessage(form, "We could not send this message. Please contact TOMUPRO on Instagram or email.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Send Message";
    }
  }

  function buildShell() {
    var shell = document.createElement("div");
    shell.id = "tomu-public-shell";
    shell.className = "tomupro-landing";
    shell.innerHTML = buildNav() + buildHero() + buildServiceCards() + buildServices() + buildDashboard() + buildCod() + buildFeatures() + buildAreas() + buildTrack() + buildSuccess() + buildCta() + buildContact() + buildFooter() + buildAuthModal();
    document.body.insertBefore(shell, document.body.firstChild);
  }

  function bindImageFallbacks() {
    document.querySelectorAll("#tomu-public-shell img, .public-auth-modal img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      var fallback = img.getAttribute("data-fallback-src");
      if (!fallback && src.indexOf("logo") !== -1) fallback = PUBLIC_LOGO_FALLBACK_SRC;
      if (!fallback && src.indexOf("/landing/") !== -1) fallback = PUBLIC_IMAGE_FALLBACK_SRC;
      if (!fallback || fallback === src) return;

      var applyFallback = function () {
        if (img.getAttribute("data-fallback-applied") === "1") return;
        img.setAttribute("data-fallback-applied", "1");
        img.src = fallback;
      };

      img.addEventListener("error", applyFallback);
      if (img.complete && img.naturalWidth === 0) applyFallback();
    });
  }

  function buildNav() {
    return [
      '<header class="pnav">',
      '  <div class="pnav-inner">',
      '    <a href="#home" class="pbrand"><img src="' + PUBLIC_LOGO_SRC + '" data-fallback-src="' + PUBLIC_LOGO_FALLBACK_SRC + '" alt="TOMUPRO logo" width="38" height="38"><div class="pbrand-text"><b>TOMU<span>PRO</span></b><small>Brunei Logistics Operating System</small></div></a>',
      '    <nav class="plinks"><a href="#services">Services</a><a href="#areas">Delivery Areas</a><a href="#track">Tracking</a><a href="#contact">Contact</a></nav>',
      '    <div class="pnav-cta"><button class="pbtn-login" data-open-auth="login">Login</button><button class="pbtn-cta-gold" data-open-auth="signup">Get Started &rarr;</button></div>',
      '    <button class="pmobile-toggle" aria-label="Menu">&#9776;</button>',
      '  </div>',
      '  <nav class="pmobile-nav"><a href="#services">Services</a><a href="#areas">Delivery Areas</a><a href="#track">Tracking</a><a href="#contact">Contact</a><button class="pbtn-login" data-open-auth="login">Login</button><button class="pbtn-cta-gold" data-open-auth="signup">Get Started</button></nav>',
      '</header>'
    ].join("");
  }

  function buildHero() {
    return [
      '<section class="phero" id="home"><div class="phero-inner">',
      '  <div class="phero-text">',
      '    <div class="p-eyebrow"><span></span> Trusted Brunei logistics company</div>',
      '    <h1><span>Brunei Delivery &amp; </span><span>Logistics, </span><em>Made Simple</em></h1>',
      '    <p class="phero-sub">Same-day parcel delivery, COD collection, warehouse fulfillment, courier service, and delivery management for Brunei businesses.</p>',
      '    <div class="phero-cta"><button class="pbtn pbtn-dark" data-open-auth="signup">Start Shipping <span>&rarr;</span></button><button class="pbtn pbtn-outline-dark" data-open-auth="login">Track Parcel</button></div>',
      '    <div class="phero-trust"><span class="trust-dot"></span> Trusted across Brunei <span class="trust-sep">&bull;</span> Bandar Seri Begawan <span class="trust-sep">&bull;</span> Kuala Belait <span class="trust-sep">&bull;</span> Tutong <span class="trust-sep">&bull;</span> Muara</div>',
      '  </div>',
      '  <div class="phero-visual">',
      '    <img src="' + PUBLIC_HERO_SRC + '" data-fallback-src="' + PUBLIC_IMAGE_FALLBACK_SRC + '" alt="TOMUPRO courier loading parcels into a delivery van at a Brunei warehouse" class="phero-img" width="1821" height="864">',
      '    <div class="float-card fc-live"><div class="fc-dot-live"></div><div class="fc-body"><div class="fc-label">Live Tracking</div><div class="fc-title">Out for Delivery</div><div class="fc-meta">Order ORD-78456 estimated 10:30 AM</div></div></div>',
      '    <div class="float-card fc-done"><div class="fc-icon-done">&#10003;</div><div class="fc-body"><div class="fc-title-done">Delivered</div><div class="fc-meta">Order ORD-78455 delivered to customer</div></div><div class="fc-time">09:41 AM<br><small>Today</small></div></div>',
      '  </div>',
      '</div></section>'
    ].join("");
  }

  function buildServiceCards() {
    return [
      '<section class="svc-strip"><div class="svc-strip-inner">',
      '  <a href="#services" class="svc-card"><div class="svc-card-icon"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div><h3>Last-mile Delivery</h3><p>Fast, reliable same-day and next-day delivery across Brunei.</p><span class="svc-link">Learn more &rarr;</span></a>',
      '  <a href="#dashboard" class="svc-card"><div class="svc-card-icon"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg></div><h3>Fulfillment</h3><p>Pick, pack, and ship with our secure fulfillment centers.</p><span class="svc-link">Learn more &rarr;</span></a>',
      '  <a href="#cod" class="svc-card"><div class="svc-card-icon"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div><h3>COD Payouts</h3><p>Cash on delivery collection with fast, reliable payouts.</p><span class="svc-link">Learn more &rarr;</span></a>',
      '</div></section>'
    ].join("");
  }

  function buildServices() {
    return [
      '<section id="services"><div class="wrap split"><div class="txt"><div class="eyebrow">Last-Mile Delivery</div><h2>From Small Parcels<br>to Bulky Loads</h2><p>An economical delivery service for small, large, heavy and irregular-sized parcels delivered by car, van or pick-up across Brunei.</p><div class="svc-tags"><span class="svc-tag">Same-day Delivery</span><span class="svc-tag">Warehousing</span><span class="svc-tag">COD Management</span></div><a href="#contact" class="btn btn-line">Talk to TOMUPRO</a></div><div class="media photo-card"><img src="' + PUBLIC_TRUCK_LAST_MILE_SRC + '" alt="TOMUPRO last-mile delivery truck" width="560" height="400"><div class="photo-overlay"><div class="photo-tag">Last-mile delivery in Brunei</div></div></div></div></section>'
    ].join("");
  }

  function buildDashboard() {
    return [
      '<section id="dashboard" class="section-alt"><div class="wrap split rev"><div class="screen screen-lg"><div class="screen-bar"><span></span><span></span><span></span></div><img src="/landing/dashboard-merchant.jpg" alt="TOMUPRO merchant dashboard for Brunei delivery orders" width="560" height="380"></div><div class="txt"><div class="eyebrow">Merchant Operations System</div><h2>Track Every Delivery<br>in One Place</h2><p>One system for Brunei merchants to manage orders, routes, pickups, drop-offs, runner assignment, and customer delivery status.</p><div class="check-list"><div class="check-item"><span class="check-mark">&#10003;</span> Real-time parcel tracking</div><div class="check-item"><span class="check-mark">&#10003;</span> AI route optimization</div><div class="check-item"><span class="check-mark">&#10003;</span> Runner, driver and team management</div></div><button class="btn btn-line" data-open-auth="login">Merchant Login</button></div></div></section>'
    ].join("");
  }

  function buildCod() {
    return [
      '<section id="cod"><div class="wrap split"><div class="txt"><div class="eyebrow">COD Payout &amp; Finance</div><h2>Cash on Delivery,<br>Settled Clearly</h2><p>Collect cash on delivery in Brunei and keep finance visible. Track collection status, runner handover, reconciliation, and payout reports without manual matching.</p><div class="check-list"><div class="check-item"><span class="check-mark">&#10003;</span> Automated reconciliation</div><div class="check-item"><span class="check-mark">&#10003;</span> COD collection visibility</div><div class="check-item"><span class="check-mark">&#10003;</span> Full payment reports</div></div></div><div class="screen screen-lg"><div class="screen-bar"><span></span><span></span><span></span></div><img src="/landing/dashboard-cod.jpg" alt="TOMUPRO COD payout dashboard for Brunei delivery businesses" width="560" height="380"></div></div></section>'
    ].join("");
  }

  function buildFeatures() {
    return [
      '<section class="feat-sec" id="features"><div class="wrap"><div class="feat-head"><div class="eyebrow" style="text-align:center">Platform Features</div><h2>Everything Your Business Needs</h2><p>One platform to manage your entire delivery operation from dispatch to doorstep to payment.</p></div><div class="feats-v2">',
      '<div class="feat-card"><div class="feat-index">01</div><div class="feat-media"><img src="/landing/feature-ai-routing-premium.png" alt="AI route optimization" width="320" height="200"></div><div class="feat-card-body"><div class="feat-card-tag">AI Routing</div><h3>Smart Route Optimization</h3><p>AI plans efficient delivery routes to reduce time, fuel cost and manual coordination.</p></div></div>',
      '<div class="feat-card"><div class="feat-index">02</div><div class="feat-media"><img src="/landing/feature-tracking-premium.png" alt="Parcel tracking" width="320" height="200"></div><div class="feat-card-body"><div class="feat-card-tag">Tracking</div><h3>Real-Time Parcel Tracking</h3><p>Live GPS tracking for every parcel and every operational handoff.</p></div></div>',
      '<div class="feat-card"><div class="feat-index">03</div><div class="feat-media"><img src="/landing/feature-cod-premium.png" alt="COD management" width="320" height="200"></div><div class="feat-card-body"><div class="feat-card-tag">Payments</div><h3>COD Management</h3><p>Cash-on-delivery support with reconciliation, payout tracking and reports.</p></div></div>',
      '</div></div></section>'
    ].join("");
  }

  function buildAreas() {
    return [
      '<section class="areas-sec" id="areas"><div class="wrap"><div class="areas-head"><div class="eyebrow" style="text-align:center">Delivery Coverage</div><h2>We Deliver Across All of Brunei</h2><p>Reliable same-day and next-day delivery to every district and major town in Brunei Darussalam.</p></div>',
      '<div class="areas-grid">',
      '<div class="area-card"><h3>Brunei-Muara</h3><p>Bandar Seri Begawan, Gadong, Kiulap, Sengkurong, Berakas, Muara, Jerudong</p></div>',
      '<div class="area-card"><h3>Belait</h3><p>Kuala Belait, Seria, Labi, Sungai Liang, Lumut</p></div>',
      '<div class="area-card"><h3>Tutong</h3><p>Tutong Town, Pekan Tutong, Telisai, Lamunin, Danau</p></div>',
      '<div class="area-card"><h3>Temburong</h3><p>Bangar, Batu Apoi, Labu, Amo, Bokok</p></div>',
      '</div></div></section>'
    ].join("");
  }

  function buildTrack() {
    return [
      '<section class="full" id="track"><div class="full-bg"></div><div class="full-overlay"></div><div class="full-inner wrap"><div class="eyebrow" style="color:#D4AF37;text-align:center">Fulfillment Center</div><h2>Warehouse, Pick &amp; Pack,<br>Last-Mile Delivery</h2><p>Get warehouse space in Brunei. We handle storage, picking, packing and final delivery for online shops and local businesses.</p></div><div class="track-wrap"><h3>Track Your Parcel</h3><div class="track-row"><input type="text" data-track-input placeholder="Enter tracking number..."><button class="btn btn-primary" data-track-button>Track</button></div><div class="track-eg">Example: 310724636</div><div class="track-result" data-track-result></div></div></section>'
    ].join("");
  }

  function buildSuccess() {
    return [
      '<section class="success" id="success"><div class="wrap success-grid"><div><span class="badge-gold">Merchant Success Story</span><h2>Helping Brunei Businesses<br>Deliver More, Worry Less</h2><p class="lead">From local startups to established brands, TOMUPRO empowers businesses across Brunei with reliable delivery, real-time tracking and operational support.</p><div class="stats-card"><div><div class="stat-n">98%</div><div class="stat-l">On-time Delivery</div><div class="stat-s">Across Brunei</div></div><div><div class="stat-n">2.5X</div><div class="stat-l">Business Growth</div><div class="stat-s">Average capacity increase</div></div><div><div class="stat-n">1,200+</div><div class="stat-l">Happy Merchants</div><div class="stat-s">Trust TOMUPRO every day</div></div></div></div><div><div class="success-photo"><img src="' + PUBLIC_MERCHANT_PHOTO_SRC + '" alt="TOMUPRO merchant receiving a parcel handoff" width="400" height="400"></div><div class="quote-card"><span class="qm">&ldquo;</span><p>The real-time tracking and dedicated support from TOMUPRO give us peace of mind.</p></div></div></div></section>'
    ].join("");
  }

  function buildCta() {
    return [
      '<section class="cta-banner"><div class="wrap cta-inner"><div class="eyebrow" style="color:#D4AF37;text-align:center">Get Started</div><h2>Ready to Scale Your<br><span class="cta-accent">Deliveries?</span></h2><p>Join businesses across Brunei who trust TOMUPRO to power their logistics.</p><div class="cta-btns"><button class="pbtn pbtn-gold" data-open-auth="signup">Get Started Free &rarr;</button><button class="pbtn pbtn-ghost-light" data-open-auth="login">Merchant Login</button></div></div></section>'
    ].join("");
  }

  function buildContact() {
    return [
      '<section id="contact"><div class="wrap contact-grid"><div class="contact-head"><div class="eyebrow">Get In Touch</div><h2>Start Delivery With TOMUPRO</h2><div class="cinfo"><div class="lbl">Phone</div><a href="tel:+6738136587">+673 813 6587</a></div><div class="cinfo"><div class="lbl">Instagram</div><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer">@tomupro</a></div><div class="cinfo"><div class="lbl">Email</div><a href="mailto:hello@tomu.my">hello@tomu.my</a></div><div class="cinfo"><div class="lbl">Address</div><div class="addr">Sengkurong Commercial Center,<br>Mukim Sengkurong, Bandar Seri Begawan,<br>Brunei-Muara</div></div></div><form class="form" data-interest-form><div class="field"><label>Your Name</label><input name="full_name" type="text" required placeholder="Your full name"></div><div class="field"><label>Company</label><input name="company_name" type="text" placeholder="Business or shop name"></div><div class="field"><label>Phone</label><input name="phone" type="tel" placeholder="+673 xxx xxxx"></div><div class="field"><label>Your Email</label><input name="email" type="email" required placeholder="you@company.com"></div><div class="field"><label>What do you need?</label><textarea name="message" rows="5" placeholder="Delivery, COD, warehouse fulfillment, or business logistics..."></textarea></div><div data-form-message class="public-form-message"></div><button class="btn btn-primary" type="submit">Send Message</button></form></div></section>'
    ].join("");
  }

  function buildFooter() {
    return [
      '<footer><div class="wrap foot"><div class="fbrand"><div class="fbrand-top"><img class="fgriffin" src="' + PUBLIC_LOGO_SRC + '" data-fallback-src="' + PUBLIC_LOGO_FALLBACK_SRC + '" alt="TOMUPRO logo" width="32" height="32"><b>TOMU<span>PRO</span></b></div><p>A one-stop solution for Brunei delivery operations.</p></div><div><h5>Quick Links</h5><div class="frow2"><a href="#services">Services</a></div><div class="frow2"><a href="#features">Features</a></div><div class="frow2"><a href="#track">Track Parcel</a></div><div class="frow2"><a href="/blog">Blog</a></div></div><div><h5>Contact</h5><div class="frow2"><a href="mailto:hello@tomu.my">hello@tomu.my</a></div><div class="frow2"><a href="tel:+6738136587">+673 813 6587</a></div><div class="frow2"><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer">Instagram @tomupro</a></div></div></div><div class="foot-bottom">2026 TOMUPRO Brunei. All rights reserved.</div></footer>'
    ].join("");
  }

  function buildAuthModal() {
    return [
      '<div class="public-auth-modal" data-public-auth-modal aria-hidden="true"><div class="public-auth-backdrop" data-close-auth></div><div class="public-auth-card"><button class="public-auth-close" data-close-auth aria-label="Close">&times;</button><div class="public-auth-layout"><div class="public-auth-visual"><img src="' + PUBLIC_HERO_SRC + '" data-fallback-src="' + PUBLIC_IMAGE_FALLBACK_SRC + '" alt="TOMUPRO logistics access for Brunei delivery businesses"><div class="public-auth-visual-shade"></div><div class="public-auth-proof"><span>TOMUPRO Access</span><strong>Run delivery operations with <em>clarity</em>.</strong><p>Sign in to manage parcels, runners, COD collection, fulfillment inventory, and delivery performance across Brunei.</p></div></div><div class="public-auth-panel"><div class="public-auth-tabs"><button data-auth-tab="login" class="active">Log In</button><button data-auth-tab="signup">Get Started</button></div>',
      '<form data-auth-panel="login" data-login-form><label>Email<input name="email" type="email" required placeholder="Enter your email address"></label><label>Password<input name="password" type="password" required placeholder="Enter your password"></label><div class="public-auth-forgot"><a href="#" data-forgot-password>Forgot Password?</a></div><div data-form-message class="public-form-message"></div><button type="submit" class="public-auth-submit">Sign In &rarr;</button></form>',
      '<form data-auth-panel="signup" data-signup-form hidden><label>Display Name<input name="display_name" type="text" required placeholder="Your name"></label><label>Email<input name="email" type="email" required placeholder="Enter your email address"></label><label>Password<input name="password" type="password" required minlength="8" placeholder="Minimum 8 characters"></label><label>Admin Code <span>Optional</span><input name="invite_code" type="text" placeholder="TOMU-SP-XXXX"></label><div data-form-message class="public-form-message"></div><button type="submit" class="public-auth-submit">Create Account &rarr;</button></form>',
      '</div></div></div></div>'
    ].join("");
  }

  function bindShell() {
    bindImageFallbacks();
    document.querySelectorAll("[data-open-auth]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        showModal(button.getAttribute("data-open-auth"));
      });
    });
    document.querySelectorAll("[data-close-auth]").forEach(function (button) {
      button.addEventListener("click", hideModal);
    });
    document.querySelectorAll("[data-auth-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.getAttribute("data-auth-tab"));
      });
    });
    var login = document.querySelector("[data-login-form]");
    var signup = document.querySelector("[data-signup-form]");
    var track = document.querySelector("[data-track-button]");
    var interest = document.querySelector("[data-interest-form]");
    if (login) login.addEventListener("submit", handleLogin);
    if (signup) signup.addEventListener("submit", handleSignup);
    if (track) track.addEventListener("click", trackParcel);
    if (interest) interest.addEventListener("submit", handleInterestSubmit);
    var forgotLink = document.querySelector("[data-forgot-password]");
    if (forgotLink) forgotLink.addEventListener("click", handleForgotPassword);
    var mobileToggle = document.querySelector("#tomu-public-shell .pmobile-toggle");
    var mobileNav = document.querySelector("#tomu-public-shell .pmobile-nav");
    if (mobileToggle && mobileNav) {
      mobileToggle.addEventListener("click", function () {
        mobileNav.classList.toggle("is-open");
        mobileToggle.classList.toggle("is-open");
      });
      mobileNav.querySelectorAll("a, button").forEach(function (link) {
        link.addEventListener("click", function () {
          mobileNav.classList.remove("is-open");
          mobileToggle.classList.remove("is-open");
        });
      });
    }
    window.addEventListener("scroll", function () {
      var nav = document.querySelector("#tomu-public-shell .pnav");
      if (nav) nav.classList.toggle("pnav-scrolled", window.scrollY > 40);
    }, { passive: true });
  }

  function activateIfNeeded() {
    var existing = document.getElementById("tomu-public-shell");
    if (shouldShowShell()) {
      document.body.classList.add("tomu-public-active");
      applyPublicTitle();
      if (!existing) {
        buildShell();
      }
      var shell = document.getElementById("tomu-public-shell");
      if (shell && !shell.hasAttribute("data-bound")) {
        shell.setAttribute("data-bound", "1");
        bindShell();
      }
      return;
    }
    document.body.classList.remove("tomu-public-active");
    if (existing) existing.remove();
  }

  function watchRouteChanges() {
    ["pushState", "replaceState"].forEach(function (name) {
      var original = history[name];
      history[name] = function () {
        var result = original.apply(this, arguments);
        setTimeout(activateIfNeeded, 0);
        return result;
      };
    });
    window.addEventListener("popstate", activateIfNeeded);
  }

  function init() {
    document.body.classList.add("tomu-public-checked");
    watchRouteChanges();
    activateIfNeeded();
    if (new URLSearchParams(window.location.search).get("mode") === "login") showModal("login");
    if (new URLSearchParams(window.location.search).get("mode") === "signup") showModal("signup");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
