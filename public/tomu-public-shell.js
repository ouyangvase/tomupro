(function () {
  var PROJECT_REF = "dtcchduronwsyunyakxj";
  var SUPABASE_URL = "https://" + PROJECT_REF + ".supabase.co";
  var STORAGE_KEY = "sb-" + PROJECT_REF + "-auth-token";
  var authConfigPromise = null;

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

  function getMainBundleUrl() {
    var scripts = Array.prototype.slice.call(document.querySelectorAll("script[src]"));
    var main = scripts.find(function (script) {
      return /\/assets\/index-.*\.js/.test(script.getAttribute("src") || "");
    });
    return main ? new URL(main.getAttribute("src"), window.location.origin).toString() : null;
  }

  async function getAuthConfig() {
    if (authConfigPromise) return authConfigPromise;
    authConfigPromise = (async function () {
      var bundleUrl = getMainBundleUrl();
      if (!bundleUrl) throw new Error("Unable to locate app bundle.");
      var text = await fetch(bundleUrl, { cache: "force-cache" }).then(function (res) {
        if (!res.ok) throw new Error("Unable to read app bundle.");
        return res.text();
      });
      var urlMatch = text.match(/https:\/\/dtcchduronwsyunyakxj\.supabase\.co/);
      var keyMatches = text.match(/eyJ[A-Za-z0-9_\-.]{120,}/g) || [];
      var anonKey = keyMatches.find(function (token) {
        try {
          var payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          return payload && payload.role === "anon";
        } catch (_) {
          return false;
        }
      }) || keyMatches[0];
      if (!urlMatch || !anonKey) throw new Error("Unable to locate public auth config.");
      return { url: urlMatch[0], key: anonKey };
    })();
    return authConfigPromise;
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

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function formatBlogDate(value) {
    if (!value) return "TOMUPRO Blog";
    try {
      return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
    } catch (_) {
      return "TOMUPRO Blog";
    }
  }

  /* Blog functions removed — blog content lives only at /blog */

  function buildShell() {
    var shell = document.createElement("div");
    shell.id = "tomu-public-shell";
    shell.className = "tomupro-landing";
    shell.innerHTML = [
      '<header class="pnav">',
      '  <div class="pnav-inner">',
      '    <a href="#home" class="pbrand"><img src="/landing/logo-griffin.png" alt="TOMUPRO logo"><div class="pbrand-text"><b>TOMU<span>PRO</span></b><small>Brunei Logistics Operating System</small></div></a>',
      '    <nav class="plinks"><a href="#services">Solutions</a><a href="#features">Features</a><a href="#track">Tracking</a><a href="/blog">Blog</a><a href="#success">About</a><a href="#contact">Contact</a></nav>',
      '    <div class="pnav-cta"><button class="pbtn-login" data-open-auth="login">Log In</button><button class="pbtn-demo" data-open-auth="signup">Get Started -></button></div>',
      '  </div>',
      '</header>',
      '<section class="phero" id="home"><div class="phero-inner">',
      '  <div class="phero-text rv in"><div class="phero-badge"><span class="phero-badge-dot"></span>AI-Powered Operations</div><h1>AI Logistics<br>Platform &amp;<br><span class="phero-accent">Last-Mile<br>Delivery</span><br>in Brunei</h1><p class="phero-sub">TOMUPRO is an AI-powered logistics platform in Brunei that provides last-mile delivery, fulfillment, courier services, and delivery management systems for businesses.</p><div class="phero-cta"><button class="pbtn pbtn-dark" data-open-auth="signup">Start Free -></button><a href="#dashboard" class="pbtn pbtn-outline-dark">Watch Demo</a></div><div class="phero-trust">No credit card required - 5 min setup - Free forever plan</div></div>',
      '  <div class="phero-visual rv in"><div class="dash-mock"><div class="dash-bar"><div class="dash-dots"><span></span><span></span><span></span></div><div class="dash-url">app.tomu.my/dashboard</div><div class="dash-notif"><span class="notif-dot"></span>Order Delivered</div></div><div class="dash-body"><div class="dash-stats"><div class="dstat"><div class="dstat-label">Total Orders</div><div class="dstat-val">2,847</div><div class="dstat-badge green">+12.5%</div></div><div class="dstat"><div class="dstat-label">In Transit</div><div class="dstat-val">48</div><div class="dstat-badge blue">+3 today</div></div><div class="dstat"><div class="dstat-label">Revenue</div><div class="dstat-val">BND 84.2k</div><div class="dstat-badge green">+8.3%</div></div></div><div class="dash-chart-title">Weekly Performance</div><div class="dash-chart"><div class="dash-bar-item" style="height:45%"></div><div class="dash-bar-item" style="height:55%"></div><div class="dash-bar-item" style="height:40%"></div><div class="dash-bar-item" style="height:65%"></div><div class="dash-bar-item" style="height:50%"></div><div class="dash-bar-item md" style="height:75%"></div><div class="dash-bar-item" style="height:60%"></div><div class="dash-bar-item hi" style="height:88%"></div><div class="dash-bar-item hi" style="height:72%"></div><div class="dash-bar-item hi" style="height:95%"></div></div><div class="dash-orders"><div class="do-row"><div class="do-icon">PKG</div><div class="do-info"><div class="do-id">ORD-2847</div><div class="do-loc">BSB -> Tutong</div></div><div class="do-status delivered">Delivered</div></div><div class="do-row"><div class="do-icon">TRK</div><div class="do-info"><div class="do-id">ORD-2846</div><div class="do-loc">Seria -> KB</div></div><div class="do-status transit">In Transit</div></div><div class="do-row"><div class="do-icon">COD</div><div class="do-info"><div class="do-id">ORD-2845</div><div class="do-loc">COD - BND 18.50</div></div><div class="do-status pending">Pending</div></div></div></div></div><div class="float-card fc-top"><div class="fc-icon">OK</div><div><div class="fc-title">Order Delivered</div><div class="fc-sub">ORD-2847 - just now</div></div></div><div class="float-card fc-bottom"><div class="fc-icon">12</div><div><div class="fc-title">12 Drivers Active</div><div class="fc-sub">All routes covered</div></div></div></div>',
      '</div></section>',
      '<div class="stats-strip"><div class="stats-inner"><div class="sstat in"><div class="sstat-icon">PKG</div><div class="sstat-num">10,000<span>+</span></div><div class="sstat-label">Orders Processed</div></div><div class="sstat in"><div class="sstat-icon">TEAM</div><div class="sstat-num">50<span>+</span></div><div class="sstat-label">Active Teams</div></div><div class="sstat in"><div class="sstat-icon">UP</div><div class="sstat-num">99.9<span>%</span></div><div class="sstat-label">System Uptime</div></div><div class="sstat in"><div class="sstat-icon">TRK</div><div class="sstat-num">500k<span>+</span></div><div class="sstat-label">Deliveries Tracked</div></div></div></div>',
      '<section id="services"><div class="wrap split rv in"><div class="txt"><div class="eyebrow">Last-Mile Delivery</div><h2>From Small Parcels<br>to Bulky Loads</h2><p>An economical delivery service for small, large, heavy and irregular-sized parcels delivered by car, van or pick-up, up to 500 kg, from just BND 2.</p><div class="svc-tags"><span class="svc-tag">Last-Mile Delivery</span><span class="svc-tag">Warehousing</span><span class="svc-tag">COD Management</span></div><a href="#contact" class="btn btn-line">Learn More</a></div><div class="media photo-card"><img src="/landing/truck-last-mile.jpg" alt="TOMUPRO last-mile delivery truck"><div class="photo-overlay"><div class="photo-tag">Last-Mile - Brunei-wide</div></div></div></div></section>',
      '<section id="dashboard" class="section-alt"><div class="wrap split rev rv in"><div class="screen screen-lg"><div class="screen-bar"><span></span><span></span><span></span></div><img src="/landing/dashboard-merchant.jpg" alt="TOMUPRO merchant dashboard"></div><div class="txt"><div class="eyebrow">Merchant Cloud System</div><h2>Track Every Delivery<br>in One Place</h2><p>One-stop solution for merchants to manage orders, routes, pickups and drop-offs. See every shipment live from one dashboard.</p><div class="check-list"><div class="check-item"><span class="check-mark">OK</span> Real-time parcel tracking</div><div class="check-item"><span class="check-mark">OK</span> AI route optimization</div><div class="check-item"><span class="check-mark">OK</span> Driver and fleet management</div></div><button class="btn btn-line" data-open-auth="login">Merchant Login</button></div></div></section>',
      '<section><div class="wrap split rv in"><div class="txt"><div class="eyebrow">COD Payout &amp; Finance</div><h2>Cash on Delivery,<br>Settled Weekly</h2><p>Collect cash on delivery and get paid straight to your bank account every week. Track collections, reconciliation and payouts with no manual matching.</p><div class="check-list"><div class="check-item"><span class="check-mark">OK</span> Automated reconciliation</div><div class="check-item"><span class="check-mark">OK</span> Weekly bank transfers</div><div class="check-item"><span class="check-mark">OK</span> Full payment reports</div></div></div><div class="screen screen-lg"><div class="screen-bar"><span></span><span></span><span></span></div><img src="/landing/dashboard-cod.jpg" alt="TOMUPRO COD payout dashboard"></div></div></section>',
      '<section class="feat-sec" id="features"><div class="wrap"><div class="feat-head rv in"><div class="eyebrow" style="text-align:center">Platform Features</div><h2>Everything Your Business Needs</h2><p>One platform to manage your entire delivery operation from dispatch to doorstep to payment.</p></div><div class="feats-v2"><div class="feat-card in"><div class="feat-index">01</div><div class="feat-media"><img src="/landing/feature-ai-routing-premium.png" alt="Premium AI route optimization visual"></div><div class="feat-card-body"><div class="feat-card-tag">AI Routing</div><h3>Smart Route Optimization</h3><p>AI plans efficient delivery routes to reduce time, fuel cost and manual coordination.</p><span class="feat-arrow">-></span></div></div><div class="feat-card in"><div class="feat-index">02</div><div class="feat-media"><img src="/landing/feature-tracking-premium.png" alt="Premium parcel tracking visual"></div><div class="feat-card-body"><div class="feat-card-tag">Tracking</div><h3>Real-Time Parcel Tracking</h3><p>Live GPS tracking for every parcel and every operational handoff.</p><span class="feat-arrow">-></span></div></div><div class="feat-card in"><div class="feat-index">03</div><div class="feat-media"><img src="/landing/feature-cod-premium.png" alt="Premium COD management visual"></div><div class="feat-card-body"><div class="feat-card-tag">Payments</div><h3>COD Management</h3><p>Cash-on-delivery support with reconciliation, payout tracking and reports.</p><span class="feat-arrow">-></span></div></div></div></div></section>',
      '<section class="full" id="track"><div class="full-bg"></div><div class="full-overlay"></div><div class="full-inner wrap rv in"><div class="eyebrow" style="color:#D4AF37;text-align:center">Fulfillment Center</div><h2>Warehouse, Pick &amp; Pack,<br>Last-Mile Delivery</h2><p>Get warehouse space in Brunei. We handle storage, picking, packing and final delivery.</p></div><div class="track-wrap rv in"><h3>Track Your Parcel</h3><div class="track-row"><input type="text" data-track-input placeholder="Enter tracking number..."><button class="btn btn-primary" data-track-button>Track</button></div><div class="track-eg">Example: 310724636</div><div class="track-result" data-track-result></div></div></section>',
      '<section class="success" id="success"><div class="wrap success-grid"><div class="rv in"><span class="badge-gold">Merchant Success Story</span><h2>Helping Brunei Businesses<br>Deliver More, Worry Less</h2><p class="lead">From local startups to established brands, TOMUPRO empowers businesses across Brunei with reliable delivery, real-time tracking and operational support.</p><div class="stats-card"><div><div class="stat-n">98%</div><div class="stat-l">On-time Delivery</div><div class="stat-s">Across Brunei</div></div><div><div class="stat-n">2.5X</div><div class="stat-l">Business Growth</div><div class="stat-s">Average capacity increase</div></div><div><div class="stat-n">1,200+</div><div class="stat-l">Happy Merchants</div><div class="stat-s">Trust TOMUPRO every day</div></div></div></div><div class="rv in"><div class="success-photo"><img src="/landing/merchant-photo.jpg" alt="TOMUPRO merchant"></div><div class="quote-card"><span class="qm">"</span><p>The real-time tracking and dedicated support from TOMUPRO give us peace of mind.</p></div></div></div></section>',
      '<section class="cta-banner"><div class="wrap cta-inner rv in"><div class="eyebrow" style="color:#D4AF37;text-align:center">Get Started</div><h2>Ready to Scale Your<br><span class="cta-accent">Deliveries?</span></h2><p>Join businesses across Brunei who trust TOMUPRO to power their logistics.</p><div class="cta-btns"><a href="#contact" class="pbtn pbtn-gold">Book a Demo -></a><button class="pbtn pbtn-ghost-light" data-open-auth="login">Merchant Login</button></div></div></section>',
      '<section id="contact"><div class="wrap contact-grid"><div class="contact-head rv in"><div class="eyebrow">Get In Touch</div><h2>Contact Us</h2><div class="cinfo"><div class="lbl">Phone</div><a href="tel:+6738136587">+673 813 6587</a></div><div class="cinfo"><div class="lbl">Instagram</div><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer">@tomupro</a></div><div class="cinfo"><div class="lbl">Email</div><a href="mailto:info@tomupro.com">info@tomupro.com</a></div><div class="cinfo"><div class="lbl">Address</div><div class="addr">Sengkurong Commercial Center,<br>Mukim Sengkurong, Bandar Seri Begawan,<br>Brunei-Muara</div></div></div><div class="form rv in"><div class="field"><label>Your Name</label><input type="text"></div><div class="field"><label>Your Email</label><input type="email"></div><div class="field"><label>Your Message</label><textarea rows="5"></textarea></div><button class="btn btn-primary" type="button">Send Message</button></div></div></section>',
      '<footer><div class="wrap foot"><div class="fbrand"><div class="fbrand-top"><img class="fgriffin" src="/landing/logo-griffin.png" alt="TOMUPRO"><b>TOMU<span>PRO</span></b></div><p>A one-stop solution for Brunei delivery operations.</p></div><div><h5>Quick Links</h5><div class="frow2"><a href="#services">Services</a></div><div class="frow2"><a href="#features">Features</a></div><div class="frow2"><a href="#track">Track Parcel</a></div><div class="frow2"><a href="/blog">Blog</a></div></div><div><h5>Contact</h5><div class="frow2"><a href="mailto:info@tomupro.com">info@tomupro.com</a></div><div class="frow2"><a href="tel:+6738136587">+673 813 6587</a></div><div class="frow2"><a href="https://www.instagram.com/tomupro/" target="_blank" rel="noopener noreferrer">Instagram @tomupro</a></div></div></div><div class="foot-bottom">2026 TOMUPRO Brunei. All rights reserved.</div></footer>',
      '<div class="public-auth-modal" data-public-auth-modal aria-hidden="true"><div class="public-auth-backdrop" data-close-auth></div><div class="public-auth-card"><button class="public-auth-close" data-close-auth aria-label="Close">x</button><div class="public-auth-layout"><div class="public-auth-visual"><img src="/landing/auth-premium-visual.png" alt="Premium TOMUPRO access visual"><div class="public-auth-visual-shade"></div><div class="public-auth-proof"><span>TOMUPRO Access</span><strong>Welcome <em>Back</em></strong><p>Sign in to continue managing your deliveries, tracking orders and growing your business.</p></div></div><div class="public-auth-panel"><div class="public-auth-tabs"><button data-auth-tab="login" class="active">Log In</button><button data-auth-tab="signup">Get Started</button></div><form data-auth-panel="login" data-login-form><label>Email<input name="email" type="email" required placeholder="Enter your email address"></label><label>Password<input name="password" type="password" required placeholder="Enter your password"></label><div data-form-message class="public-form-message"></div><button type="submit" class="public-auth-submit">Sign In -></button></form><form data-auth-panel="signup" data-signup-form hidden><label>Display Name<input name="display_name" type="text" required placeholder="John Doe"></label><label>Email<input name="email" type="email" required placeholder="Enter your email address"></label><label>Password<input name="password" type="password" required minlength="8" placeholder="Minimum 8 characters"></label><label>Admin Code <span>Optional</span><input name="invite_code" type="text" placeholder="TOMU-SP-XXXX"></label><div data-form-message class="public-form-message"></div><button type="submit" class="public-auth-submit">Create Account -></button></form></div></div></div></div>'
    ].join("");
    document.body.insertBefore(shell, document.body.firstChild);
  }

  function bindShell() {
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
    if (login) login.addEventListener("submit", handleLogin);
    if (signup) signup.addEventListener("submit", handleSignup);
    if (track) track.addEventListener("click", trackParcel);
    window.addEventListener("scroll", function () {
      var nav = document.querySelector("#tomu-public-shell .pnav");
      if (nav) nav.classList.toggle("pnav-scrolled", window.scrollY > 40);
    }, { passive: true });
  }

  function activateIfNeeded() {
    var existing = document.getElementById("tomu-public-shell");
    if (shouldShowShell()) {
      document.body.classList.add("tomu-public-active");
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
