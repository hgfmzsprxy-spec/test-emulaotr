(function () {
  "use strict";

  var SUB_HREF = "/account/#subscriptions";
  var DEFAULT_FEATURED = "3months";

  function ctas() {
    return document.querySelectorAll(".aim-pricing-cta[data-plan]");
  }

  function cells() {
    return document.querySelectorAll(".aim-pricing-cell[data-pricing-plan]");
  }

  function labelOf(cta) {
    return cta.querySelector("span") || cta;
  }

  function setFeaturedPlan(plan, badgeLabel) {
    var nodes = cells();
    for (var i = 0; i < nodes.length; i++) {
      var cell = nodes[i];
      var id = cell.getAttribute("data-pricing-plan") || "";
      var card = cell.querySelector(".aim-pricing-card");
      var badge = cell.querySelector(".aim-pricing-best-badge");
      var text = cell.querySelector(".aim-pricing-best-badge-text");
      var cta = cell.querySelector(".aim-pricing-cta");
      var featured = id === plan;
      cell.classList.toggle("best", featured);
      if (card) card.classList.toggle("aim-pricing-card-best", featured);
      if (cta) cta.classList.toggle("accent", featured);
      if (badge) {
        if (featured) {
          badge.hidden = false;
          badge.removeAttribute("hidden");
          badge.setAttribute("aria-hidden", "true");
          if (text) text.textContent = badgeLabel;
        } else {
          badge.hidden = true;
          badge.setAttribute("hidden", "");
        }
      }
    }
  }

  function resetCtas() {
    var nodes = ctas();
    for (var i = 0; i < nodes.length; i++) {
      var cta = nodes[i];
      var plan = cta.getAttribute("data-plan") || "";
      var original = cta.getAttribute("data-subscribe-href") || "/order?plan=" + encodeURIComponent(plan);
      cta.classList.remove("is-current", "is-switch");
      cta.setAttribute("href", original);
      cta.removeAttribute("aria-disabled");
      cta.removeAttribute("tabindex");
      cta.onclick = null;
      labelOf(cta).textContent = "SUBSCRIBE";
    }
    setFeaturedPlan(DEFAULT_FEATURED, "MOST CHOSEN");
  }

  function applyOwnedPlan(plan) {
    var nodes = ctas();
    for (var i = 0; i < nodes.length; i++) {
      var cta = nodes[i];
      var id = cta.getAttribute("data-plan") || "";
      if (!cta.getAttribute("data-subscribe-href")) {
        cta.setAttribute("data-subscribe-href", cta.getAttribute("href") || "/order?plan=" + encodeURIComponent(id));
      }
      if (id === plan) {
        cta.classList.add("is-current");
        cta.classList.remove("is-switch");
        cta.removeAttribute("href");
        cta.setAttribute("aria-disabled", "true");
        cta.setAttribute("tabindex", "-1");
        labelOf(cta).textContent = "CURRENT PLAN";
        cta.onclick = function (e) {
          e.preventDefault();
        };
      } else {
        cta.classList.remove("is-current");
        cta.classList.add("is-switch");
        cta.setAttribute("href", SUB_HREF);
        cta.removeAttribute("aria-disabled");
        cta.removeAttribute("tabindex");
        cta.onclick = null;
        labelOf(cta).textContent = "SWITCH PLAN";
      }
    }
    setFeaturedPlan(plan, "ACTUAL PLAN");
  }

  function persistPlan(plan) {
    if (window.gcAuth && typeof window.gcAuth.savePlanHint === "function") {
      window.gcAuth.savePlanHint(plan || "");
      return;
    }
    try {
      var raw = localStorage.getItem("gc_auth_hint");
      if (!raw && !plan) return;
      var hint = raw ? JSON.parse(raw) : {};
      if (!hint || typeof hint !== "object") hint = {};
      if (!hint.name && !hint.userId && !plan) return;
      hint.plan = plan || "";
      localStorage.setItem("gc_auth_hint", JSON.stringify(hint));
      window.__GC_AUTH_HINT = hint;
    } catch (e) {}
  }

  function readHint() {
    if (window.__GC_AUTH_HINT && typeof window.__GC_AUTH_HINT === "object") return window.__GC_AUTH_HINT;
    try {
      return JSON.parse(localStorage.getItem("gc_auth_hint") || "null");
    } catch (e) {
      return null;
    }
  }

  function applyFromHint() {
    var hint = readHint();
    if (hint && hint.plan) applyOwnedPlan(String(hint.plan));
  }

  async function refresh() {
    if (!ctas().length || !window.gcAuth || !window.gcAuth.getSession) return;
    try {
      var sessionRes = await window.gcAuth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) {
        persistPlan("");
        resetCtas();
        return;
      }
      var res = await fetch("/api/account/subscription", {
        headers: { Authorization: "Bearer " + session.access_token }
      });
      if (!res.ok) {
        resetCtas();
        return;
      }
      var data = await res.json().catch(function () {
        return {};
      });
      if (data && data.hasSubscription && data.plan) {
        persistPlan(String(data.plan));
        applyOwnedPlan(String(data.plan));
        return;
      }
      persistPlan("");
      resetCtas();
    } catch (e) {
      resetCtas();
    }
  }

  function boot() {
    applyFromHint();
    refresh();
    if (window.gcAuth && window.gcAuth.client && window.gcAuth.client.auth && window.gcAuth.client.auth.onAuthStateChange) {
      window.gcAuth.client.auth.onAuthStateChange(function () {
        refresh();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
