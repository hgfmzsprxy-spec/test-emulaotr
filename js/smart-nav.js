(function () {
  "use strict";

  var prefetched = {};
  var CHECKOUT_ASSETS = [
    "/css/checkout.css",
    "/css/site-theme.css",
    "/css/acc-auth.css",
    "/js/auth.js",
    "/js/supabase-config.js",
    "/js/smart-nav.js",
    "https://js.stripe.com/v3/",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Roboto:wght@400;500;600;700;800;900&display=swap"
  ];
  var WARM_PAGES = ["/subscriptions/", "/account/", "/affiliates/", "/login/", "/register/"];

  function originOf() {
    return location.origin;
  }

  function sameOrigin(url) {
    try {
      return new URL(url, location.href).origin === originOf();
    } catch (e) {
      return false;
    }
  }

  function parsed(url) {
    try {
      return new URL(url, location.href);
    } catch (e) {
      return null;
    }
  }

  function isOrderCreate(url) {
    var u = parsed(url);
    if (!u) return false;
    var path = (u.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/order";
  }

  function isInternalNav(url) {
    var u = parsed(url);
    if (!u || u.origin !== originOf()) return false;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (/^\/api(\/|$)/.test(u.pathname)) return false;
    if (isOrderCreate(u.href)) return false;
    return true;
  }

  function isSameDocument(url) {
    var u = parsed(url);
    if (!u) return false;
    return u.pathname === location.pathname && u.search === location.search;
  }

  function prefetchHref(url, as) {
    var u = parsed(url);
    if (!u) return;
    var key = (as || "fetch") + ":" + u.href;
    if (prefetched[key]) return;
    prefetched[key] = true;
    var link = document.createElement("link");
    link.rel = as === "style" || as === "script" || as === "image" || as === "font" ? "preload" : "prefetch";
    if (as && link.rel === "preload") link.as = as;
    link.href = u.href;
    if (as === "font") link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  function warmupList(urls) {
    for (var i = 0; i < urls.length; i++) prefetchHref(urls[i]);
  }

  function warmupCheckout() {
    warmupList(CHECKOUT_ASSETS);
    prefetchHref("/checkout/");
    prefetchHref("/checkout/index.html");
  }

  function extractAssets(html, base) {
    var out = [];
    var re = /<(?:link|script|img)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi;
    var match;
    while ((match = re.exec(html))) {
      var raw = match[1];
      if (!raw || raw.indexOf("data:") === 0) continue;
      try {
        out.push(new URL(raw, base).href);
      } catch (e) {}
    }
    return out;
  }

  function prefetchPage(url) {
    var u = parsed(url);
    if (!u || !isInternalNav(u.href) || isSameDocument(u.href)) return;
    u.hash = "";
    prefetchHref(u.href);
    if (prefetched["doc:" + u.href]) return;
    prefetched["doc:" + u.href] = true;
    fetch(u.href, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) return "";
        return res.text();
      })
      .then(function (html) {
        if (!html) return;
        var assets = extractAssets(html, u.href);
        for (var i = 0; i < assets.length && i < 40; i++) {
          var href = assets[i];
          if (
            !sameOrigin(href) &&
            href.indexOf("stripe.com") < 0 &&
            href.indexOf("googleapis.com") < 0 &&
            href.indexOf("gstatic.com") < 0 &&
            href.indexOf("supabase") < 0 &&
            href.indexOf("fontawesome") < 0 &&
            href.indexOf("jsdelivr") < 0
          ) {
            continue;
          }
          if (/\.css(\?|$)/i.test(href)) prefetchHref(href, "style");
          else if (/\.js(\?|$)/i.test(href)) prefetchHref(href, "script");
          else if (/\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(href)) prefetchHref(href, "image");
          else prefetchHref(href);
        }
      })
      .catch(function () {});
  }

  function injectSpeculation() {
    if (document.getElementById("gc-speculation")) return;
    var spec = document.createElement("script");
    spec.id = "gc-speculation";
    spec.type = "speculationrules";
    spec.textContent = JSON.stringify({
      prerender: [
        {
          source: "document",
          where: {
            and: [
              { href_matches: "/*" },
              { not: { href_matches: ["/api/*", "/order", "/order?*"] } },
              { not: { selector_matches: "[target=_blank], [download], [rel~=external]" } }
            ]
          },
          eagerness: "moderate"
        }
      ],
      prefetch: [
        {
          source: "document",
          where: {
            and: [
              { href_matches: "/*" },
              { not: { href_matches: ["/api/*", "/order", "/order?*"] } }
            ]
          },
          eagerness: "eager"
        }
      ]
    });
    document.head.appendChild(spec);
  }

  function fromAnchor(node) {
    if (!node || !node.closest) return null;
    return node.closest("a[href]");
  }

  function onPointer(event) {
    var anchor = fromAnchor(event.target);
    if (!anchor) return;
    var href = anchor.href;
    if (isOrderCreate(href) || (/plan=/.test(anchor.getAttribute("href") || "") && /\/order/.test(href))) {
      warmupCheckout();
      return;
    }
    if (!isInternalNav(href) || isSameDocument(href)) return;
    prefetchPage(href);
  }

  function idleWarm() {
    warmupList(WARM_PAGES);
    for (var i = 0; i < WARM_PAGES.length; i++) prefetchPage(WARM_PAGES[i]);
    if (location.pathname === "/" || /index\.html$/i.test(location.pathname)) warmupCheckout();
  }

  document.addEventListener("pointerenter", onPointer, true);
  document.addEventListener("focusin", onPointer, true);
  document.addEventListener("touchstart", onPointer, { capture: true, passive: true });

  injectSpeculation();

  if (window.requestIdleCallback) window.requestIdleCallback(idleWarm, { timeout: 1200 });
  else setTimeout(idleWarm, 400);
})();
