(function () {
  "use strict";

  var HINT_KEY = "gc_auth_hint";
  var SUB_HREF = "/account/#subscriptions";
  var PALETTE = [
    "#e11d48",
    "#f97316",
    "#ca8a04",
    "#16a34a",
    "#0d9488",
    "#0284c7",
    "#4f46e5",
    "#7c3aed",
    "#c026d3",
    "#db2777"
  ];

  function detectRoot() {
    var path = (location.pathname || "").replace(/\\/g, "/");
    if (
      /\/(login|register|lostpassword|cookies|terms|status|support|supportsys|subscriptions|checkout|order|invoice|reviews|affiliates|admin|configs|resellers|content-creators|account)(\/|$)/i.test(
        path
      )
    ) {
      return "../";
    }
    return "";
  }

  function firstLetter(name) {
    var match = String(name || "").match(/[A-Za-z0-9\u00C0-\u024F]/);
    return match ? match[0].toUpperCase() : "?";
  }

  function avatarColor(seed) {
    var hash = 0;
    var text = String(seed || "user");
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
  }

  function looksLikeUrl(value) {
    var url = String(value || "").trim();
    return /^https?:\/\//i.test(url) || url.indexOf("//") === 0;
  }

  function normalizeAvatarUrl(value) {
    var url = String(value || "").trim();
    if (!url || url === "null" || url === "undefined" || url === "[object Object]") return "";
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (/^http:\/\//i.test(url)) url = "https://" + url.slice(7);
    if (!/^https:\/\//i.test(url)) return "";
    if (/googleusercontent\.com/i.test(url)) {
      if (/=s\d+/i.test(url)) url = url.replace(/=s\d+(-c)?/i, "=s128-c");
      else url += "=s128-c";
    }
    return url;
  }

  function discordUserId(source) {
    var data = source || {};
    var candidates = [data.sub, data.id, data.user_id, data.provider_id];
    for (var i = 0; i < candidates.length; i++) {
      var id = String(candidates[i] || "").trim();
      if (/^\d{5,}$/.test(id)) return id;
    }
    return "";
  }

  function discordAvatarUrl(id, hash) {
    var userId = String(id || "").trim();
    var avatar = String(hash || "").trim();
    if (!userId || !avatar || looksLikeUrl(avatar)) return "";
    var ext = avatar.indexOf("a_") === 0 ? "gif" : "png";
    return (
      "https://cdn.discordapp.com/avatars/" +
      encodeURIComponent(userId) +
      "/" +
      encodeURIComponent(avatar) +
      "." +
      ext +
      "?size=128"
    );
  }

  function pushAvatarUrl(list, value) {
    var url = normalizeAvatarUrl(value);
    if (url && list.indexOf(url) === -1) list.push(url);
  }

  function scanAvatarSource(list, source, identity) {
    if (!source || typeof source !== "object") return;
    pushAvatarUrl(list, source.avatar_url);
    pushAvatarUrl(list, source.picture);
    pushAvatarUrl(list, source.image);
    pushAvatarUrl(list, source.photo);
    var provider = (identity && identity.provider) || "";
    if (/discord/i.test(String(provider)) || discordUserId(source)) {
      pushAvatarUrl(list, discordAvatarUrl(discordUserId(source), source.avatar));
    }
  }

  function avatarUrlsFromUser(user) {
    var urls = [];
    if (!user) return urls;
    scanAvatarSource(urls, user.user_metadata);
    scanAvatarSource(urls, user.raw_user_meta_data);
    var identities = user.identities || [];
    for (var i = 0; i < identities.length; i++) {
      scanAvatarSource(urls, identities[i].identity_data, identities[i]);
    }
    return urls;
  }

  function pickName(source) {
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
      if (globalName && globalName.indexOf("@") === -1) return globalName;
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
      if (value && value.indexOf("@") === -1) return value;
    }
    return "";
  }

  function displayNameFromUser(user) {
    if (!user) return "";
    var name = pickName(user.user_metadata) || pickName(user.raw_user_meta_data);
    if (!name && user.identities && user.identities.length) {
      for (var i = 0; i < user.identities.length; i++) {
        name = pickName(user.identities[i].identity_data);
        if (name) break;
      }
    }
    if (!name && user.email) name = String(user.email).split("@")[0];
    return name || "User";
  }

  function hintFromUser(user) {
    if (!user) return null;
    var name = displayNameFromUser(user);
    var urls = avatarUrlsFromUser(user);
    return {
      v: 1,
      name: name,
      letter: firstLetter(name),
      color: avatarColor(user.id || name),
      avatar: urls[0] || "",
      avatars: urls,
      userId: user.id || ""
    };
  }

  function mergeHint(base, extra) {
    if (!base) return extra;
    if (!extra) return base;
    var next = {};
    var key;
    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) next[key] = extra[key];
    }
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key) && (base[key] || base[key] === "")) {
        next[key] = base[key];
      }
    }
    if ((!next.avatars || !next.avatars.length) && extra.avatars && extra.avatars.length) {
      next.avatars = extra.avatars;
      next.avatar = extra.avatar || next.avatar;
    }
    return next;
  }

  function readStoredHint() {
    try {
      var raw = localStorage.getItem(HINT_KEY);
      if (!raw) return null;
      var hint = JSON.parse(raw);
      if (!hint || !hint.name) return null;
      if (!hint.letter) hint.letter = firstLetter(hint.name);
      if (!hint.color) hint.color = avatarColor(hint.userId || hint.name);
      if (!hint.avatars || !hint.avatars.length) {
        hint.avatars = hint.avatar ? [hint.avatar] : [];
      }
      return hint;
    } catch (err) {
      return null;
    }
  }

  function readSupabaseHint() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf("sb-") !== 0 || key.indexOf("-auth-token") === -1) continue;
        var parsed = JSON.parse(localStorage.getItem(key) || "null");
        var session = parsed && (parsed.user ? parsed : parsed.currentSession);
        var user = session && session.user;
        if (user) return hintFromUser(user);
      }
    } catch (err) {}
    return null;
  }

  function readHint() {
    return mergeHint(readStoredHint(), readSupabaseHint());
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function avatarUrlsFromHint(hint) {
    var urls = [];
    var i;
    if (hint && hint.avatars) {
      for (i = 0; i < hint.avatars.length; i++) {
        pushAvatarUrl(urls, hint.avatars[i]);
      }
    }
    if (hint && hint.avatar) pushAvatarUrl(urls, hint.avatar);
    return urls;
  }

  function paintAvatar(el, hint) {
    if (!el || !hint) return;
    var urls = avatarUrlsFromHint(hint);
    el.style.background = hint.color || "#2a2a32";
    var existing = el.querySelector("img");
    if (existing && urls.length) {
      var current = existing.getAttribute("src") || "";
      for (var i = 0; i < urls.length; i++) {
        if (current === urls[i]) return;
      }
    }
    el.textContent = hint.letter || "?";
    if (!urls.length) return;

    function tryUrl(index) {
      if (index >= urls.length) return;
      var img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onerror = function () {
        if (img.parentNode) img.parentNode.removeChild(img);
        tryUrl(index + 1);
      };
      img.src = urls[index];
      el.appendChild(img);
    }

    tryUrl(0);
  }

  function fillChip(root, hint) {
    if (!root || !hint) return;
    var label = root.querySelector(".gc-user-name");
    if (label) label.textContent = hint.name;
    paintAvatar(root.querySelector(".gc-user-avatar"), hint);
  }

  function avatarSpanHtml(hint) {
    var urls = avatarUrlsFromHint(hint);
    var html =
      '<span class="gc-user-avatar" style="background:' +
      esc(hint.color || "#2a2a32") +
      '" aria-hidden="true">' +
      esc(hint.letter || "?");
    if (urls[0]) {
      html += '<img alt="" referrerpolicy="no-referrer" src="' + esc(urls[0]) + '">';
    }
    html += "</span>";
    return html;
  }

  function paintDesktop(hint) {
    var nav = document.getElementById("elUserNav");
    if (!nav) return false;
    var existing = document.getElementById("gc-user-nav");
    if (existing) {
      fillChip(existing, hint);
      bindUserNav(existing);
      return true;
    }
    var root = detectRoot();
    var account = root + "account/";
    var item = document.createElement("li");
    item.id = "gc-user-nav";
    item.className = "gc-user-nav";
    item.innerHTML =
      '<div class="gc-user-chip">' +
      avatarSpanHtml(hint) +
      '<div class="gc-user-trigger-wrap">' +
      '<button type="button" class="gc-user-trigger" aria-expanded="false" aria-haspopup="true">' +
      '<span class="gc-user-name">' +
      esc(hint.name) +
      "</span>" +
      '<i class="fa-light fa-angle-down" aria-hidden="true"></i>' +
      "</button>" +
      '<ul class="ipsMenu ipsMenu_auto gc-user-menu ghostNavHoverMenu ipsHide" role="menu" aria-hidden="true">' +
      '<li class="ipsMenu_item"><a href="' +
      account +
      '">Account</a></li>' +
      '<li class="ipsMenu_item"><a href="' +
      account +
      '#subscriptions">Subscriptions</a></li>' +
      '<li class="ipsMenu_item"><a href="' +
      root +
      'affiliates/">Affiliates</a></li>' +
      '<li class="ipsMenu_item"><a href="' +
      account +
      '#purchases">Purchases</a></li>' +
      '<li class="ipsMenu_item"><a href="' +
      account +
      '#orders">Orders</a></li>' +
      '<li class="ipsMenu_item"><button type="button" class="gc-logout">Logout</button></li>' +
      "</ul>" +
      "</div>" +
      "</div>";
    nav.appendChild(item);
    bindUserNav(item);
    return true;
  }

  function paintMobile(hint) {
    var list = document.getElementById("elUserNav_mobile");
    if (!list) return false;
    var existing = document.getElementById("gc-mobile-user");
    if (existing) {
      fillChip(existing, hint);
      bindUserNav(existing);
      return true;
    }
    var root = detectRoot();
    var item = document.createElement("li");
    item.id = "gc-mobile-user";
    item.innerHTML =
      '<div class="gc-user-chip">' +
      avatarSpanHtml(hint) +
      '<span class="gc-user-name">' +
      esc(hint.name) +
      "</span>" +
      "</div>" +
      '<ul class="gc-mobile-user-links">' +
      '<li><a href="' +
      root +
      'account/">Account</a></li>' +
      '<li><a href="' +
      root +
      'account/#subscriptions">Subscriptions</a></li>' +
      '<li><a href="' +
      root +
      'affiliates/">Affiliates</a></li>' +
      '<li><a href="' +
      root +
      'account/#purchases">Purchases</a></li>' +
      '<li><a href="' +
      root +
      'account/#orders">Orders</a></li>' +
      '<li><button type="button" class="gc-logout">Logout</button></li>' +
      "</ul>";
    list.insertBefore(item, list.firstChild);
    bindUserNav(item);
    return true;
  }

  function homeHref() {
    return detectRoot() + "index.html";
  }

  function clearAuthHint() {
    try {
      localStorage.removeItem(HINT_KEY);
    } catch (err) {}
    try {
      var i;
      for (i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (!key || key.indexOf("sb-") !== 0 || key.indexOf("-auth-token") === -1) continue;
        localStorage.removeItem(key);
      }
    } catch (err) {}
  }

  function logout() {
    clearAuthHint();
    document.documentElement.classList.remove("gc-signed-in");
    if (document.body) document.body.classList.remove("gc-signed-in");
    var goHome = function () {
      location.href = homeHref();
    };
    if (window.gcAuth && window.gcAuth.client && window.gcAuth.client.auth) {
      window.gcAuth.client.auth.signOut().then(goHome).catch(goHome);
      return;
    }
    goHome();
  }

  function bindUserNav(item) {
    if (!item || item.dataset.gcUserMenuBound === "1") return;
    item.dataset.gcUserMenuBound = "1";

    var OPEN_DELAY = 70;
    var CLOSE_DELAY = 180;
    var hoverOk = function () {
      return window.matchMedia("(min-width: 980px) and (hover: hover)").matches;
    };

    function openMenu() {
      item.classList.add("ghostNavHoverOpen");
      var trigger = item.querySelector(".gc-user-trigger");
      var menu = item.querySelector(".gc-user-menu");
      if (trigger) trigger.setAttribute("aria-expanded", "true");
      if (menu) menu.setAttribute("aria-hidden", "false");
    }

    function closeMenu() {
      item.classList.remove("ghostNavHoverOpen");
      var trigger = item.querySelector(".gc-user-trigger");
      var menu = item.querySelector(".gc-user-menu");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (menu) menu.setAttribute("aria-hidden", "true");
    }

    item.addEventListener("mouseenter", function () {
      if (!hoverOk()) return;
      if (item._gcCloseTimer) {
        window.clearTimeout(item._gcCloseTimer);
        item._gcCloseTimer = null;
      }
      item._gcOpenTimer = window.setTimeout(openMenu, OPEN_DELAY);
    });

    item.addEventListener("mouseleave", function () {
      if (!hoverOk()) return;
      if (item._gcOpenTimer) {
        window.clearTimeout(item._gcOpenTimer);
        item._gcOpenTimer = null;
      }
      item._gcCloseTimer = window.setTimeout(closeMenu, CLOSE_DELAY);
    });

    item.addEventListener("click", function (e) {
      var logoutBtn = e.target.closest(".gc-logout");
      if (logoutBtn) {
        e.preventDefault();
        logout();
        return;
      }
      var trigger = e.target.closest(".gc-user-trigger");
      if (trigger) {
        e.preventDefault();
        if (item.classList.contains("ghostNavHoverOpen")) closeMenu();
        else openMenu();
      }
    });
  }

  function applyPricing(hint) {
    var plan = hint && hint.plan ? String(hint.plan) : "";
    if (!plan) return;
    var cells = document.querySelectorAll(".aim-pricing-cell[data-pricing-plan]");
    if (!cells.length) return;
    var i;
    for (i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var id = cell.getAttribute("data-pricing-plan") || "";
      var card = cell.querySelector(".aim-pricing-card");
      var badge = cell.querySelector(".aim-pricing-best-badge");
      var text = cell.querySelector(".aim-pricing-best-badge-text");
      var cta = cell.querySelector(".aim-pricing-cta");
      var featured = id === plan;
      cell.classList.toggle("best", featured);
      if (card) card.classList.toggle("aim-pricing-card-best", featured);
      if (cta) {
        cta.classList.toggle("accent", featured);
        if (!cta.getAttribute("data-subscribe-href")) {
          cta.setAttribute("data-subscribe-href", cta.getAttribute("href") || "/order?plan=" + encodeURIComponent(id));
        }
        var label = cta.querySelector("span") || cta;
        if (featured) {
          cta.classList.add("is-current");
          cta.classList.remove("is-switch");
          cta.removeAttribute("href");
          cta.setAttribute("aria-disabled", "true");
          cta.setAttribute("tabindex", "-1");
          label.textContent = "CURRENT PLAN";
        } else {
          cta.classList.remove("is-current");
          cta.classList.add("is-switch");
          cta.setAttribute("href", SUB_HREF);
          cta.removeAttribute("aria-disabled");
          cta.removeAttribute("tabindex");
          label.textContent = "SWITCH PLAN";
        }
      }
      if (badge) {
        if (featured) {
          badge.hidden = false;
          badge.removeAttribute("hidden");
          badge.setAttribute("aria-hidden", "true");
          if (text) text.textContent = "ACTUAL PLAN";
        } else {
          badge.hidden = true;
          badge.setAttribute("hidden", "");
        }
      }
    }
  }

  var hint = readHint();
  if (!hint) return;

  document.documentElement.classList.add("gc-signed-in");
  if (document.body) document.body.classList.add("gc-signed-in");
  window.__GC_AUTH_HINT = hint;

  function paint() {
    if (document.body) document.body.classList.add("gc-signed-in");
    paintDesktop(hint);
    paintMobile(hint);
    applyPricing(hint);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }
})();
