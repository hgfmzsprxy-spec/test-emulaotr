(function () {
  "use strict";

  var root = "../";
  var currentUser = null;
  var ordersCache = [];
  var subCache = null;

  function $(id) {
    return document.getElementById(id);
  }

  function looksLikeEmail(value) {
    return /@/.test(String(value || ""));
  }

  function pickDisplayName(source) {
    if (!source || typeof source !== "object") return "";
    var claims = source.custom_claims;
    if (typeof claims === "string") {
      try {
        claims = JSON.parse(claims);
      } catch (err) {
        claims = null;
      }
    }
    if (claims && typeof claims === "object") {
      var globalName = String(claims.global_name || "").trim();
      if (globalName && !looksLikeEmail(globalName)) return globalName;
    }
    var keys = [
      "display_name",
      "global_name",
      "username",
      "full_name",
      "name",
      "preferred_username",
      "user_name"
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
      var value = String(source[keys[i]] || "").trim();
      if (value && !looksLikeEmail(value)) return value;
    }
    return "";
  }

  function displayNameFromUser(user) {
    if (!user) return "";
    var name = pickDisplayName(user.user_metadata) || pickDisplayName(user.raw_user_meta_data);
    if (!name && user.identities && user.identities.length) {
      for (var i = 0; i < user.identities.length; i++) {
        name = pickDisplayName(user.identities[i].identity_data);
        if (name) break;
      }
    }
    if (!name && user.email) name = String(user.email).split("@")[0];
    return name || "User";
  }

  function socialAvatarUrl(user) {
    if (!user) return "";
    var meta = user.user_metadata || {};
    if (meta.avatar_url || meta.picture) return meta.avatar_url || meta.picture;
    var identities = user.identities || [];
    for (var i = 0; i < identities.length; i++) {
      var data = identities[i].identity_data || {};
      if (data.avatar_url || data.picture) return data.avatar_url || data.picture;
    }
    return "";
  }

  function avatarColor(seed) {
    var palette = ["#e11d48", "#f97316", "#ca8a04", "#16a34a", "#0d9488", "#0284c7", "#4f46e5", "#7c3aed", "#c026d3", "#db2777"];
    var hash = 0;
    var text = String(seed || "user");
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function firstLetter(name) {
    var match = String(name || "").match(/[A-Za-z0-9\u00C0-\u024F]/);
    return match ? match[0].toUpperCase() : "?";
  }

  function friendlyError(error) {
    if (window.gcAuth && window.gcAuth.friendlyError) return window.gcAuth.friendlyError(error);
    return (error && (error.message || error.error_description)) || "Something went wrong.";
  }

  function loginHref() {
    var next = /\/affiliates(\/|$)/i.test(location.pathname) ? "/affiliates/" : "/account/" + (location.hash || "");
    return root + "login/?next=" + encodeURIComponent(next);
  }

  function isAffiliatesPath() {
    return /\/affiliates(\/|$)/i.test(location.pathname || "");
  }

  function accountRedirect() {
    if (window.gcAuth && window.gcAuth.root) {
      return new URL(window.gcAuth.root + "account/", location.href).href;
    }
    return new URL("/account/", location.origin).href;
  }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-ok", !!ok && !!text);
    el.classList.toggle("is-err", !ok && !!text);
  }

  function identityFor(user, provider) {
    var identities = (user && user.identities) || [];
    for (var i = 0; i < identities.length; i++) {
      if (identities[i].provider === provider) return identities[i];
    }
    return null;
  }

  function identityLabel(identity) {
    var data = (identity && identity.identity_data) || {};
    return data.email || data.full_name || data.name || (data.custom_claims && data.custom_claims.global_name) || "Connected";
  }

  function tabFromHash() {
    if (isAffiliatesPath()) return "affiliates";
    var hash = String(location.hash || "").replace(/^#/, "").toLowerCase();
    if (hash === "purchases" || hash === "orders" || hash === "overview" || hash === "display-name" || hash === "email" || hash === "devices" || hash === "subscriptions" || hash === "affiliates") {
      return hash;
    }
    return "overview";
  }

  var tabLoadSeq = 0;
  var activeTab = "";

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setTabLoading(on) {
    var loader = $("gcAccountTabLoader");
    var pane = document.querySelector(".gc-account-pane:not([hidden])");
    var body = pane && pane.querySelector(".gc-account-pane-b");
    var main = document.querySelector(".gc-account-main");
    if (main) main.setAttribute("aria-busy", on ? "true" : "false");
    if (!loader) return Promise.resolve();

    if (on) {
      document.querySelectorAll(".gc-account-pane-b.is-loading, .gc-account-pane-b.is-reveal").forEach(function (el) {
        el.classList.remove("is-loading", "is-reveal");
      });
      if (!body) return Promise.resolve();
      body.classList.add("is-loading");
      if (loader.parentNode !== body) body.insertBefore(loader, body.firstChild);
      loader.hidden = false;
      loader.classList.remove("is-leaving");
      loader.classList.add("is-on");
      return Promise.resolve();
    }

    var loaded = document.querySelector(".gc-account-pane-b.is-loading") || body;
    loader.classList.add("is-leaving");
    loader.classList.remove("is-on");
    return delay(120).then(function () {
      if (loaded) {
        loaded.classList.remove("is-loading");
        loaded.classList.add("is-reveal");
      }
      return delay(360);
    }).then(function () {
      loader.hidden = true;
      loader.classList.remove("is-leaving");
    });
  }

  async function runTabLoad(work) {
    var token = ++tabLoadSeq;
    await setTabLoading(true);
    var started = Date.now();
    try {
      if (work) await work();
    } finally {
      var left = 380 - (Date.now() - started);
      if (left > 0) await delay(left);
      if (token === tabLoadSeq) await setTabLoading(false);
    }
  }

  function showTab(name) {
    var allowed = {
      overview: 1,
      purchases: 1,
      orders: 1,
      subscriptions: 1,
      affiliates: 1,
      devices: 1,
      "display-name": 1,
      email: 1
    };
    var tab = allowed[name] ? name : "overview";
    if (tab === "affiliates" && !isAffiliatesPath()) {
      location.href = "/affiliates/";
      return;
    }
    if (tab !== "affiliates" && isAffiliatesPath()) {
      location.href = "/account/#" + tab;
      return;
    }
    var sidebarTab = tab === "display-name" || tab === "email" ? "overview" : tab;
    document.querySelectorAll("[data-account-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-account-tab") === sidebarTab;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-account-pane]").forEach(function (pane) {
      pane.hidden = pane.getAttribute("data-account-pane") !== tab;
    });
    if (location.hash.replace(/^#/, "") !== tab && !isAffiliatesPath()) {
      history.replaceState(null, "", "#" + tab);
    }
    if (tab === "display-name") {
      var nameInput = $("gcDisplayName");
      if (nameInput) {
        nameInput.value = "";
        window.setTimeout(function () {
          nameInput.focus();
        }, 0);
      }
      setMsg($("gcDisplayNameMsg"), "", true);
    }
    if (tab === "email") {
      var emailInput = $("gcNewEmail");
      if (emailInput) {
        emailInput.value = "";
        window.setTimeout(function () {
          emailInput.focus();
        }, 0);
      }
      setMsg($("gcEmailMsg"), "", true);
    }
    if (tab === activeTab) return;
    activeTab = tab;
    runTabLoad(function () {
      if (tab === "devices") return loadDevices();
      if (tab === "subscriptions") return loadSubscription();
      if (tab === "affiliates") return window.gcLoadAffiliates ? window.gcLoadAffiliates() : Promise.resolve();
      if (tab === "purchases" || tab === "orders") return loadOrders();
      return Promise.resolve();
    });
  }

  function pillClass(status) {
    if (status === "active") return "gc-pill-active";
    if (status === "canceling" || status === "trialing") return "gc-pill-canceling";
    if (status === "past_due" || status === "unpaid" || status === "canceled") return "gc-pill-pastdue";
    return "gc-pill-unpaid";
  }

  function refPriceHtml(fullPrice, discountedPrice, opts) {
    opts = opts || {};
    if (!discountedPrice) return escapeHtml(fullPrice || "—");
    return (
      '<span class="gc-sub-price-ref' +
      (opts.compact ? " is-compact" : "") +
      '"><span class="gc-sub-price-was">' +
      escapeHtml(fullPrice || "—") +
      '</span><strong>' +
      escapeHtml(discountedPrice) +
      '</strong><span class="gc-sub-ref-badge">REF</span></span>'
    );
  }

  function renderSubscription(data) {
    if (window.gcAuth && typeof window.gcAuth.savePlanHint === "function") {
      window.gcAuth.savePlanHint(data && data.hasSubscription && data.plan ? data.plan : "");
    }
    var empty = $("gcSubEmpty");
    var dash = $("gcSubDash");
    if (!data || !data.hasSubscription) {
      empty.hidden = false;
      dash.hidden = true;
      dash.innerHTML = "";
      return;
    }
    empty.hidden = true;
    dash.hidden = false;
    subCache = data;
    var pending = data.pendingPlan;
    var renewLabel = data.cancelAtPeriodEnd && !pending ? "Access until" : "Renews on";
    var endLabel = formatDate(data.currentPeriodEnd);
    var days = Number(data.daysLeft || 0);
    var dayCopy = days === 1 ? "1 day left in this period" : days + " days left in this period";
    if (days <= 0) dayCopy = "This period has ended";
    var payment = data.paymentMethod || "Billed via Stripe";
    var plans = (data.plans || []).map(function (plan) {
      var current = plan.id === data.plan;
      var scheduled = pending && pending.id === plan.id;
      var action;
      if (current) {
        action = '<button type="button" class="gc-account-btn gc-account-btn-ghost" disabled>Current plan</button>';
      } else if (scheduled) {
        action = '<button type="button" class="gc-account-btn gc-account-btn-ghost" disabled>Starts ' + escapeHtml(formatDate(pending.startAt || data.currentPeriodEnd)) + "</button>";
      } else {
        action = '<button type="button" class="gc-account-btn" data-sub-action="change" data-sub-plan="' + escapeHtml(plan.id) + '">Switch to this plan</button>';
      }
      return (
        '<article class="gc-sub-plan' + (current ? " is-current" : "") + (scheduled ? " is-pending" : "") + '">' +
          '<p class="gc-sub-plan-name">' + escapeHtml(plan.label) + "</p>" +
          '<p class="gc-sub-plan-price">' +
          (current && plan.discountedPrice
            ? refPriceHtml(plan.price, plan.discountedPrice, { compact: true })
            : escapeHtml(plan.price)) +
          "</p>" +
          '<p class="gc-sub-plan-note">' + escapeHtml(plan.cadence) + "</p>" +
          action +
        "</article>"
      );
    }).join("");
    var nextCard = "";
    if (pending && pending.id) {
      nextCard =
        '<div class="gc-sub-next">' +
          '<div class="gc-sub-next-copy">' +
            '<p class="gc-sub-kicker">Scheduled change</p>' +
            "<h3>Next cycle: " + escapeHtml(pending.label) + "</h3>" +
            "<p>You keep <strong>" + escapeHtml(data.label) + "</strong> until <strong>" +
            escapeHtml(formatDate(pending.startAt || data.currentPeriodEnd)) +
            "</strong>.</p>" +
            "<p>The next payment after that date will be for <strong>" +
            escapeHtml(pending.label) +
            "</strong> (" +
            (pending.discountedPrice
              ? '<span class="gc-sub-price-ref is-compact"><strong>' +
                escapeHtml(pending.discountedPrice) +
                '</strong><span class="gc-sub-price-was">' +
                escapeHtml(pending.price) +
                '</span><span class="gc-sub-ref-badge">REF</span></span>'
              : escapeHtml(pending.price)) +
            ") instead of " + escapeHtml(data.label) + ".</p>" +
          "</div>" +
          '<button type="button" class="gc-account-btn gc-account-btn-ghost" data-sub-action="change" data-sub-plan="' +
          escapeHtml(data.plan) +
          '">Keep current plan</button>' +
        "</div>";
    }
    var foot = "";
    if (data.canResume) {
      foot += '<button type="button" class="gc-account-btn" data-sub-action="resume">Resume renewal</button>';
    } else if (data.canCancel) {
      foot += '<button type="button" class="gc-account-btn gc-account-btn-danger" data-sub-action="cancel">Cancel renewal</button>';
    } else {
      foot += '<a class="gc-account-btn gc-account-btn-ghost" href="../index.html#pricing">Choose another plan</a>';
    }
    if (data.canPortal || data.managedByStripe) {
      foot += '<button type="button" class="gc-account-btn gc-account-btn-ghost" data-sub-action="portal">Update payment method</button>';
    }
    dash.innerHTML =
      '<div class="gc-sub-hero">' +
        '<div class="gc-sub-hero-top">' +
          "<div>" +
            '<p class="gc-sub-kicker">Script Engine</p>' +
            "<h3>" + escapeHtml(data.label || data.duration || "Subscription") + "</h3>" +
            '<span class="gc-pill ' + pillClass(data.status) + '">' + escapeHtml(data.statusLabel || "ACTIVE") + "</span>" +
          "</div>" +
          '<div class="gc-sub-hero-price">' +
            (data.discountedPrice
              ? refPriceHtml(data.price, data.discountedPrice)
              : "<strong>" + escapeHtml(data.price || "—") + "</strong>") +
            "<span>" + escapeHtml(data.cadence || "") + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="gc-sub-meter" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, Number(data.periodProgress) || 0)) + '%"></span></div>' +
        '<p class="gc-sub-meter-copy">' + escapeHtml(dayCopy) + "</p>" +
        '<div class="gc-sub-stats">' +
          "<div class=\"gc-sub-stat\"><span>" + renewLabel + "</span><strong>" + escapeHtml(endLabel) + "</strong></div>" +
          "<div class=\"gc-sub-stat\"><span>Started</span><strong>" + escapeHtml(formatDate(data.currentPeriodStart)) + "</strong></div>" +
          "<div class=\"gc-sub-stat\"><span>Payment</span><strong>" + escapeHtml(payment || "—") + "</strong></div>" +
        "</div>" +
      "</div>" +
      nextCard +
      '<div class="gc-sub-plans">' + plans + "</div>" +
      '<div class="gc-sub-foot">' + foot + "</div>";
  }

  async function loadSubscription() {
    try {
      var headers = await authHeaders();
      var res = await fetch("/api/account/subscription", { headers: headers });
      var json = await res.json().catch(function () {
        return {};
      });
      if (res.status === 401) {
        location.replace(loginHref());
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not load subscription.");
      renderSubscription(json);
    } catch (err) {
      renderSubscription({ hasSubscription: false });
    }
  }

  async function runSubscriptionAction(action, plan) {
    var headers = await authHeaders();
    var res = await fetch("/api/account/subscription", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ action: action, plan: plan || "" })
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      location.replace(loginHref());
      return;
    }
    if (!res.ok) throw new Error(json.error || "Could not update subscription.");
    if (json.checkoutUrl) {
      if (json.hasSubscription || (subCache && subCache.hasSubscription)) {
        throw new Error("Switch this plan from your subscriptions page.");
      }
      location.href = json.checkoutUrl;
      return;
    }
    if (json.portalUrl) {
      location.href = json.portalUrl;
      return;
    }
    renderSubscription(json);
  }

  function fillAvatar(el, user, name) {
    if (window.gcAuth && typeof window.gcAuth.paintAvatar === "function") {
      window.gcAuth.paintAvatar(el, user, name);
      return;
    }
    if (!el) return;
    el.textContent = firstLetter(name);
    el.style.background = avatarColor((user && user.id) || name);
    var photo = socialAvatarUrl(user);
    if (!photo) return;
    var img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onload = function () {
      el.textContent = "";
      el.appendChild(img);
    };
    img.src = photo;
  }

  function fillOverview(user) {
    currentUser = user;
    var name = displayNameFromUser(user);
    var email = String((user && user.email) || "").trim();
    $("gcAccountName").textContent = name;
    $("gcAccountEmail").textContent = email || "No email on this account";
    fillAvatar($("gcAccountAvatar"), user, name);
    var nameValue = $("gcDisplayNameValue");
    if (nameValue) nameValue.textContent = name;
    var currentEmail = $("gcCurrentEmail");
    if (currentEmail) currentEmail.textContent = email || "—";
    var emailOnForm = $("gcEmailCurrentOnForm");
    if (emailOnForm) emailOnForm.textContent = email || "—";
    fillOAuth("google", user);
    fillOAuth("discord", user);
  }

  function fillOAuth(provider, user) {
    var identity = identityFor(user, provider);
    var status = $(provider === "google" ? "gcGoogleStatus" : "gcDiscordStatus");
    var connect = $(provider === "google" ? "gcGoogleConnect" : "gcDiscordConnect");
    var disconnect = $(provider === "google" ? "gcGoogleDisconnect" : "gcDiscordDisconnect");
    var identities = (user && user.identities) || [];
    if (identity) {
      status.textContent = identityLabel(identity);
      connect.hidden = true;
      disconnect.hidden = false;
      disconnect.disabled = identities.length < 2;
      disconnect.title = identities.length < 2 ? "Add another sign-in method before disconnecting this one." : "";
    } else {
      status.textContent = "Not connected";
      connect.hidden = false;
      disconnect.hidden = true;
    }
  }

  async function authHeaders() {
    var headers = { "Content-Type": "application/json" };
    try {
      var sessionRes = await window.gcAuth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      if (session && session.access_token) headers.Authorization = "Bearer " + session.access_token;
    } catch (e) {}
    return headers;
  }

  function relativeTime(ms) {
    if (!ms) return "—";
    var diff = Date.now() - ms;
    if (diff < 60 * 1000) return "Just now";
    if (diff < 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 60000)) + " min ago";
    if (diff < 24 * 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 3600000)) + " hr ago";
    return formatDate(ms);
  }

  function deviceIcon(os) {
    var name = String(os || "").toLowerCase();
    if (name.indexOf("win") === 0) return "fa-brands fa-windows";
    if (name.indexOf("mac") === 0 || name === "ios") return "fa-brands fa-apple";
    if (name.indexOf("android") === 0) return "fa-brands fa-android";
    if (name.indexOf("linux") === 0) return "fa-brands fa-linux";
    if (name.indexOf("chrome") === 0) return "fa-brands fa-chrome";
    return "fa-solid fa-desktop";
  }

  function renderDevices(devices) {
    var list = $("gcDeviceList");
    var empty = $("gcDevicesEmpty");
    list.innerHTML = "";
    if (!devices || !devices.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    devices.forEach(function (row) {
      var card = document.createElement("article");
      card.className = "gc-device-card";
      var logoutLabel = "LOG OUT";
      card.innerHTML =
        '<div class="gc-device-top">' +
        '<div class="gc-device-id">' +
        '<span class="gc-device-icon" aria-hidden="true"><i class="' + deviceIcon(row.os) + '"></i></span>' +
        "<div><strong>" + escapeHtml(row.os || "Unknown") + "</strong>" +
        (row.current ? '<em class="gc-device-current">Current Device</em>' : "") +
        "</div></div>" +
        '<button type="button" class="gc-account-btn gc-account-btn-danger" data-logout-device="' +
        escapeHtml(row.id) +
        '">' +
        logoutLabel +
        "</button></div>" +
        '<div class="gc-device-meta">' +
        '<div><span class="k">Browser</span><span class="v">' + escapeHtml(row.browser || "—") + "</span></div>" +
        '<div><span class="k">System</span><span class="v">' + escapeHtml((row.kind ? row.kind + " · " : "") + (row.os || "—")) + "</span></div>" +
        '<div><span class="k">IP Address</span><span class="v">' + escapeHtml(row.ip || "—") + "</span></div>" +
        '<div><span class="k">Location</span><span class="v">' + escapeHtml(row.location || "Unknown") + "</span></div>" +
        '<div><span class="k">Last Login</span><span class="v">' + escapeHtml(relativeTime(row.lastSeenAt)) + "</span></div>" +
        "</div>";
      list.appendChild(card);
    });
  }

  async function afterDeviceAction(json) {
    if (json && json.signedOut) {
      try {
        await window.gcAuth.client.auth.signOut();
      } catch (e) {}
      location.replace(loginHref());
      return true;
    }
    return false;
  }

  async function loadDevices() {
    var msg = $("gcDevicesMsg");
    setMsg(msg, "", true);
    try {
      var headers = await authHeaders();
      try {
        var ipRes = await fetch("https://api.ipify.org?format=json");
        var ipJson = await ipRes.json();
        if (ipJson && ipJson.ip) headers["X-Device-IP"] = ipJson.ip;
      } catch (e) {}
      var res = await fetch("/api/account/devices", { headers: headers });
      var json = await res.json().catch(function () {
        return {};
      });
      if (res.status === 401) {
        location.replace(loginHref());
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not load devices.");
      renderDevices(json.devices || []);
      setMsg(msg, "", true);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
      $("gcDevicesEmpty").hidden = false;
    }
  }

  async function logoutDevice(id) {
    var msg = $("gcDevicesMsg");
    setMsg(msg, "Signing out…", true);
    try {
      var headers = await authHeaders();
      var res = await fetch("/api/account/devices?id=" + encodeURIComponent(id), {
        method: "DELETE",
        headers: headers
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || "Could not sign out that device.");
      if (await afterDeviceAction(json)) return;
      setMsg(msg, "Device signed out.", true);
      await loadDevices();
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
  }

  async function logoutAllDevices() {
    if (!window.confirm("Sign out of every device on this account? You will need to sign in again.")) return;
    var msg = $("gcDevicesMsg");
    setMsg(msg, "Signing out everywhere…", true);
    try {
      var headers = await authHeaders();
      var res = await fetch("/api/account/devices?all=1", {
        method: "DELETE",
        headers: headers
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || "Could not sign out all devices.");
      if (await afterDeviceAction(json)) return;
      try {
        await window.gcAuth.client.auth.signOut();
      } catch (e) {}
      location.replace(loginHref());
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
  }

  function formatDate(ms) {
    if (!ms) return "—";
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function isExpiredRow(row) {
    if (!row || row.paid || row.failed) return false;
    if (row.expired) return true;
    return !!(row.expiresAt && Number(row.expiresAt) <= Date.now());
  }

  function renderTable(tbodyId, emptyId, rows, mode) {
    var tbody = $(tbodyId);
    var empty = $(emptyId);
    var table = tbody && tbody.closest(".gc-account-table-wrap");
    var list = (rows || []).filter(function (row) {
      if (mode === "purchases") return !!(row.paid || row.failed);
      return true;
    });
    tbody.innerHTML = "";
    if (!list.length) {
      empty.hidden = false;
      if (table) table.hidden = true;
      return;
    }
    empty.hidden = true;
    if (table) table.hidden = false;
    list.forEach(function (row) {
      var tr = document.createElement("tr");
      var expired = isExpiredRow(row);
      var status = row.paid
        ? '<span class="gc-pill gc-pill-paid">PAID</span>'
        : row.failed
          ? '<span class="gc-pill gc-pill-error">ERROR</span>'
          : expired
            ? '<span class="gc-pill gc-pill-expired">EXPIRED</span>'
            : '<span class="gc-pill gc-pill-unpaid">UNPAID</span>';
      var action = row.paid || row.failed
        ? '<a href="/invoice/' + encodeURIComponent(row.id) + '">View invoice</a>'
        : expired
          ? '<button type="button" class="gc-order-cancel" data-cancel-order="' + escapeHtml(row.id) + '">Cancel Order</button>'
          : '<a href="/order/' + encodeURIComponent(row.id) + '">Complete payment</a>';
      var dateMs = row.paid ? row.paidAt : row.failed ? row.failedAt || row.createdAt : row.createdAt;
      tr.innerHTML =
        "<td>#" + escapeHtml(row.id) + "</td>" +
        "<td>" + escapeHtml(row.product || "Script Engine") + "</td>" +
        "<td>" + escapeHtml(row.duration || row.plan || "—") + "</td>" +
        "<td>" + formatDate(dateMs) + "</td>" +
        "<td>" +
        escapeHtml(row.price || "—") +
        (row.discountPercent
          ? ' <span class="gc-price-off">-' + escapeHtml(String(row.discountPercent)) + "%</span>"
          : "") +
        "</td>" +
        "<td>" + status + "</td>" +
        "<td>" + action + "</td>";
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadOrders() {
    var headers = await authHeaders();
    var res = await fetch("/api/account/orders", { headers: headers });
    var json = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      location.replace(loginHref());
      return;
    }
    if (!res.ok) throw new Error(json.error || "Could not load orders.");
    ordersCache = json.orders || [];
    renderTable("gcPurchaseRows", "gcPurchaseEmpty", ordersCache, "purchases");
    renderTable("gcOrderRows", "gcOrderEmpty", ordersCache, "orders");
  }

  async function cancelOrder(id) {
    var headers = await authHeaders();
    var res = await fetch("/api/account/orders?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: headers
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      location.replace(loginHref());
      return;
    }
    if (!res.ok) throw new Error(json.error || "Could not cancel that order.");
    await loadOrders();
  }

  async function saveDisplayName(e) {
    e.preventDefault();
    var input = $("gcDisplayName");
    var btn = $("gcDisplayNameSave");
    var msg = $("gcDisplayNameMsg");
    var name = String((input && input.value) || "").trim();
    if (name.length < 2) return setMsg(msg, "Enter a display name.", false);
    if (name.length > 32) return setMsg(msg, "Keep it under 32 characters.", false);
    btn.disabled = true;
    setMsg(msg, "Saving…", true);
    try {
      var check = await fetch("/api/display-name/available", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name: name })
      });
      var checkJson = await check.json().catch(function () {
        return {};
      });
      if (!check.ok) throw new Error(checkJson.error || "Could not check that display name.");
      if (!checkJson.available) throw new Error(checkJson.error || "That display name is already taken.");
      var result = await window.gcAuth.client.auth.updateUser({
        data: {
          display_name: name,
          username: name,
          full_name: name,
          name: name
        }
      });
      if (result.error) throw result.error;
      try {
        await fetch("/api/display-name", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ name: name })
        });
      } catch (claimErr) {}
      fillOverview(result.data.user || currentUser);
      setMsg(msg, "Display name updated.", true);
      showTab("overview");
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    } finally {
      btn.disabled = false;
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    var input = $("gcNewEmail");
    var btn = $("gcEmailSave");
    var msg = $("gcEmailMsg");
    var email = String((input && input.value) || "").trim();
    if (!looksLikeEmail(email)) return setMsg(msg, "Enter a valid email address.", false);
    btn.disabled = true;
    setMsg(msg, "Saving…", true);
    try {
      var result = await window.gcAuth.client.auth.updateUser({
        email: email
      });
      if (result.error) throw result.error;
      setMsg(msg, "Check your inbox to confirm the new email address.", true);
      input.value = "";
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    } finally {
      btn.disabled = false;
    }
  }

  async function connectProvider(provider) {
    var msg = $("gcOAuthMsg");
    setMsg(msg, "Redirecting to " + provider + "…", true);
    try {
      var result = await window.gcAuth.client.auth.linkIdentity({
        provider: provider,
        options: {
          redirectTo: accountRedirect(),
          queryParams: provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined
        }
      });
      if (result.error) throw result.error;
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
  }

  async function disconnectProvider(provider) {
    var msg = $("gcOAuthMsg");
    var identity = identityFor(currentUser, provider);
    if (!identity) return;
    if (((currentUser && currentUser.identities) || []).length < 2) {
      setMsg(msg, "Add another sign-in method before disconnecting this one.", false);
      return;
    }
    setMsg(msg, "Disconnecting…", true);
    try {
      var result = await window.gcAuth.client.auth.unlinkIdentity(identity);
      if (result.error) throw result.error;
      var refreshed = await window.gcAuth.client.auth.getUser();
      fillOverview((refreshed.data && refreshed.data.user) || currentUser);
      setMsg(msg, provider.charAt(0).toUpperCase() + provider.slice(1) + " disconnected.", true);
    } catch (err) {
      setMsg(msg, friendlyError(err), false);
    }
  }

  function bindUi() {
    document.querySelectorAll("[data-account-tab]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var tab = btn.getAttribute("data-account-tab");
        if (tab === "affiliates") return;
        e.preventDefault();
        showTab(tab);
      });
    });
    window.addEventListener("hashchange", function () {
      showTab(tabFromHash());
    });
    document.querySelectorAll("[data-open-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showTab(btn.getAttribute("data-open-tab"));
      });
    });
    $("gcDisplayNameForm").addEventListener("submit", saveDisplayName);
    $("gcEmailForm").addEventListener("submit", saveEmail);
    $("gcGoogleConnect").addEventListener("click", function () {
      connectProvider("google");
    });
    $("gcDiscordConnect").addEventListener("click", function () {
      connectProvider("discord");
    });
    $("gcGoogleDisconnect").addEventListener("click", function () {
      disconnectProvider("google");
    });
    $("gcDiscordDisconnect").addEventListener("click", function () {
      disconnectProvider("discord");
    });
    $("gcLogoutAllDevices").addEventListener("click", logoutAllDevices);
    $("gcDeviceList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-logout-device]");
      if (!btn) return;
      logoutDevice(btn.getAttribute("data-logout-device"));
    });
    $("gcOrderRows").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cancel-order]");
      if (!btn) return;
      cancelOrder(btn.getAttribute("data-cancel-order")).catch(function (err) {
        window.alert(friendlyError(err));
      });
    });
    $("gcSubDash").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-sub-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-sub-action");
      var plan = btn.getAttribute("data-sub-plan") || "";
      if (action === "change") {
        var label = (btn.closest(".gc-sub-plan") && btn.closest(".gc-sub-plan").querySelector(".gc-sub-plan-name"));
        var name = label ? label.textContent : "this plan";
        var until = formatDate(subCache && subCache.currentPeriodEnd);
        if (plan && subCache && plan === subCache.plan) {
          if (!window.confirm("Keep " + (subCache.label || "the current plan") + " and cancel the scheduled switch?")) return;
        } else if (!window.confirm("Keep " + ((subCache && subCache.label) || "your current plan") + " until " + until + ", then switch to " + name + "? The next payment after that date will be for " + name + ".")) return;
      }
      if (action === "cancel" && !window.confirm("Cancel automatic renewal? You will keep access until the current period ends.")) return;
      if (action === "resume" && !window.confirm("Resume automatic renewal on this plan?")) return;
      btn.disabled = true;
      runSubscriptionAction(action, plan).catch(function (err) {
        window.alert(friendlyError(err));
      }).finally(function () {
        btn.disabled = false;
      });
    });
  }

  async function boot() {
    if (!window.gcAuth) {
      setTimeout(boot, 40);
      return;
    }
    bindUi();
    showTab(tabFromHash());
    var sessionRes = await window.gcAuth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) {
      location.replace(loginHref());
      return;
    }
    if (typeof window.gcAuth.finalizeSocialProfile === "function") {
      session.user = (await window.gcAuth.finalizeSocialProfile(session.user, session.access_token)) || session.user;
    }
    fillOverview(session.user);
    var userRes = await window.gcAuth.client.auth.getUser();
    fillOverview((userRes.data && userRes.data.user) || session.user);
    $("gcAccountGate").hidden = true;
    $("gcAccountApp").hidden = false;
    try {
      await loadOrders();
    } catch (err) {
      $("gcPurchaseEmpty").hidden = false;
      $("gcPurchaseEmpty").querySelector("p").textContent = friendlyError(err);
      $("gcOrderEmpty").hidden = false;
      $("gcOrderEmpty").querySelector("p").textContent = friendlyError(err);
    }
    window.gcAuth.client.auth.onAuthStateChange(function (_event, nextSession) {
      if (!nextSession) {
        location.replace(loginHref());
        return;
      }
      fillOverview(nextSession.user);
      window.gcAuth.client.auth.getUser().then(function (res) {
        fillOverview((res.data && res.data.user) || nextSession.user);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
