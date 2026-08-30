(function () {
  "use strict";

  try {
    var q = String(location.search || "");
    var h = String(location.hash || "");
    var marked = /(?:^|[?&#])se_loader=1(?:[&]|$)/.test(q + h);
    var flagged = false;
    try {
      var ts = parseInt(sessionStorage.getItem("se_loader_oauth") || "", 10);
      flagged = !!ts && Date.now() - ts < 10 * 60 * 1000;
    } catch (e) {}
    var hasAuth = /(?:^|[?&#])(?:code|access_token|error)=/.test(q + h);
    if ((marked || flagged) && hasAuth) {
      try { sessionStorage.removeItem("se_loader_oauth"); } catch (e) {}
      var data = q.replace(/^\?/, "");
      var hash = h.replace(/^#/, "");
      if (hash) data = data ? data + "&" + hash : hash;
      location.replace("http://127.0.0.1:17864/callback" + (data ? "?" + data : ""));
      return;
    }
  } catch (e) {}

  var cfg = window.GC_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) {
    console.error("Script Engine auth: missing Supabase client or public config.");
    return;
  }

  var root = detectRoot();
  var client = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });

  window.gcAuth = {
    client: client,
    root: root,
    getSession: function () {
      return client.auth.getSession();
    },
    paintAvatar: function (el, user, name) {
      paintAvatar(el, user, name);
    },
    createAccount: async function (details) {
      var username = String((details && details.username) || "").trim();
      var email = String((details && details.email) || "").trim();
      var password = String((details && details.password) || "");
      try {
        await assertDisplayNameAvailable(username);
      } catch (err) {
        return { data: { user: null, session: null }, error: err };
      }
      var result = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username,
            display_name: username,
            full_name: username,
            name: username
          },
          emailRedirectTo: new URL(root + "login/index.html", location.href).href
        }
      });
      if (!result.error && result.data && result.data.session && result.data.session.access_token) {
        try {
          await claimDisplayName(username, result.data.session.access_token);
        } catch (err) {}
      }
      return result;
    }
  };

  injectStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

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

  function homeHref() {
    return root + "index.html";
  }

  function isCheckoutPage() {
    return /\/(checkout|order|invoice)(\/|$)/i.test((location.pathname || "").replace(/\\/g, "/"));
  }

  function isAccountPage() {
    return /\/(account|affiliates)(\/|$)/i.test((location.pathname || "").replace(/\\/g, "/"));
  }

  function nextPathFromQuery() {
    try {
      var next = new URLSearchParams(location.search).get("next") || "";
      if (!next || next.charAt(0) !== "/" || next.indexOf("//") !== -1) return "";
      if (!/^\/(account|affiliates)(\/|$|#|\?)/i.test(next)) return "";
      return next;
    } catch (err) {
      return "";
    }
  }

  function isLoginPage() {
    return /\/login(\/|$)/i.test((location.pathname || "").replace(/\\/g, "/"));
  }

  function isRegisterPage() {
    return /\/register(\/|$)/i.test((location.pathname || "").replace(/\\/g, "/"));
  }

  function authRedirectHref() {
    if (isCheckoutPage()) return location.href.split("#")[0];
    var next = nextPathFromQuery();
    if (next) return new URL(next, location.origin).href;
    if (isAccountPage()) return new URL(root + "account/", location.href).href;
    if (isLoginPage() || isRegisterPage()) return location.href.split("#")[0].split("?")[0];
    return new URL(root + "index.html", location.href).href;
  }

  function afterAuthSuccess() {
    if (isCheckoutPage()) {
      location.reload();
      return;
    }
    var next = nextPathFromQuery();
    if (next) {
      location.href = next;
      return;
    }
    if (isAccountPage()) {
      location.reload();
      return;
    }
    location.href = homeHref();
  }

  function injectStyles() {
    if (document.getElementById("gc-auth-styles")) return;
    var style = document.createElement("style");
    style.id = "gc-auth-styles";
    style.textContent =
      ".gc-auth-msg{margin:10px 0 0;padding:0;border:0;background:none;color:#e11d48;font-size:13px;line-height:1.45;font-weight:500;min-height:calc(13px * 1.45 * 2);visibility:hidden}" +
      ".gc-auth-msg.is-shown{visibility:visible}" +
      ".gc-auth-msg.error,.gc-auth-msg.success,.gc-auth-msg.info{background:none;border:0;color:#e11d48;padding:0}" +
      ".gc-user-nav{display:inline-flex!important;align-items:center;position:relative;list-style:none;margin:0;padding:0 0 0 4px}" +
      "#elUserNav,#elUserNav>li,#gc-user-nav{overflow:visible!important}" +
      ".gc-user-trigger-wrap{position:relative;display:inline-flex;align-items:center}" +
      ".gc-user-chip{display:inline-flex;align-items:center;gap:10px;min-width:0}" +
      ".gc-user-avatar{position:relative;width:36px;height:36px;min-width:36px;min-height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none;overflow:hidden;color:#fff;font-size:15px;font-weight:700;line-height:1;text-transform:uppercase;user-select:none;background:#2a2a32}" +
      ".gc-user-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}" +
      ".gc-user-trigger{-webkit-appearance:none;appearance:none;display:inline-flex;align-items:center;gap:6px;margin:0;padding:0;border:0;background:none;color:#fff;cursor:pointer;font:inherit;line-height:1}" +
      ".gc-user-name{color:#fff;font-weight:600;font-size:14px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".gc-user-trigger i{font-size:12px;line-height:1;color:#fff;transition:color .12s ease}" +
      ".gc-user-nav.ghostNavHoverOpen .gc-user-trigger i{color:rgb(var(--theme-brand_primary))}" +
      ".gc-user-nav .gc-user-menu.ghostNavHoverMenu.ipsHide{display:block!important;position:absolute!important;top:calc(100% + 8px)!important;left:50%!important;right:auto!important;z-index:10000!important;margin:0!important;min-width:180px;visibility:hidden!important;opacity:0!important;pointer-events:none!important;transform:translateX(-50%) translateY(6px);transition:opacity .12s ease,transform .12s ease,visibility 0s linear .12s}" +
      ".gc-user-nav.ghostNavHoverOpen .gc-user-menu.ghostNavHoverMenu{visibility:visible!important;opacity:1!important;pointer-events:auto!important;transform:translateX(-50%) translateY(0);transition-delay:0s}" +
      ".gc-user-nav .gc-user-menu::before{content:'';position:absolute;left:0;right:0;bottom:100%;height:12px}" +
      ".gc-user-nav .gc-user-menu.ipsMenu,.gc-user-nav .gc-user-menu .ipsMenu_item{font-size:13px;font-weight:400;line-height:1.4;letter-spacing:normal}" +
      ".gc-user-nav .gc-user-menu .ipsMenu_item>a,.gc-user-nav .gc-user-menu .ipsMenu_item>button{font-family:inherit!important;font-size:13px!important;font-weight:400!important;font-style:normal!important;line-height:1.4!important;letter-spacing:normal!important;text-transform:none!important}" +
      ".gc-user-nav .ipsMenu_item>button{width:100%;text-align:inherit;color:inherit;cursor:pointer;-webkit-appearance:none;appearance:none}" +
      "#gc-mobile-user{padding:12px 16px}" +
      "#gc-mobile-user .gc-mobile-user-links{list-style:none;margin:12px 0 0;padding:0}" +
      "#gc-mobile-user .gc-mobile-user-links a,#gc-mobile-user .gc-mobile-user-links button{display:block;width:100%;padding:10px 0;background:none;border:0;color:#fff;text-align:left;font:inherit;cursor:pointer}" +
      "html.gc-signed-in #elSignInLink,html.gc-signed-in #elUserNav>li:has(#elRegisterButton),html.gc-signed-in #elRegisterButton,html.gc-signed-in #elSigninButton_mobile,html.gc-signed-in #elRegisterButton_mobile,html.gc-signed-in #elMobileDrawer .ipsPadding.ipsBorder_bottom:has(#elSigninButton_mobile),body.gc-signed-in #elSignInLink,body.gc-signed-in #elUserNav>li:has(#elRegisterButton),body.gc-signed-in #elSigninButton_mobile,body.gc-signed-in #elRegisterButton_mobile{display:none!important}";
    document.head.appendChild(style);
  }

  function showMessage(box, type, text) {
    if (!box) return;
    box.removeAttribute("hidden");
    box.className = "gc-auth-msg is-shown " + type;
    box.textContent = text;
  }

  function clearMessage(box) {
    if (!box) return;
    box.removeAttribute("hidden");
    box.textContent = "";
    box.className = "gc-auth-msg";
  }

  function friendlyError(error) {
    var msg = (error && (error.message || error.error_description)) || "Something went wrong.";
    if (/invalid login credentials/i.test(msg)) return "Invalid email or password.";
    if (/user already registered/i.test(msg)) return "An account with this email already exists. Sign in instead.";
    if (/already taken/i.test(msg)) return "That display name is already taken.";
    if (/database error saving new user/i.test(msg)) {
      return "Could not create that account. If you used Discord, run sql/profiles.sql in Supabase and try again.";
    }
    if (/unable to exchange external code/i.test(msg)) {
      return "Discord could not finish sign-in. In the Discord Developer Portal set Redirects to https://kpymaenegelofayjsats.supabase.co/auth/v1/callback, then paste the OAuth2 Client ID and Client Secret (not the bot token) into Supabase → Authentication → Discord.";
    }
    if (/password/i.test(msg) && /least|characters|weak/i.test(msg)) {
      return "Password is too short. Use at least 6 characters.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Confirm your email before signing in. Check your inbox.";
    }
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return "Cannot reach Supabase. Open the site via https://scriptengine.gg (not as a local file).";
    }
    return msg;
  }

  window.gcAuth.friendlyError = friendlyError;

  async function assertDisplayNameAvailable(name) {
    var res = await fetch("/api/display-name/available", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name })
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(json.error || "Could not check that display name.");
    if (!json.available) throw new Error(json.error || "That display name is already taken.");
  }

  async function claimDisplayName(name, accessToken) {
    var headers = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    var res = await fetch("/api/display-name", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ name: name })
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok && res.status !== 409) {
      throw new Error(json.error || "Could not save that display name.");
    }
  }

  function looksLikeEmail(value) {
    return /@/.test(String(value || ""));
  }

  function pickFromClaims(source) {
    var claims = source && source.custom_claims;
    if (!claims) return "";
    if (typeof claims === "string") {
      try {
        claims = JSON.parse(claims);
      } catch (err) {
        return "";
      }
    }
    if (!claims || typeof claims !== "object") return "";
    var value = String(claims.global_name || claims.display_name || "").trim();
    if (value && !looksLikeEmail(value)) return value;
    return "";
  }

  function pickDisplayName(source) {
    if (!source || typeof source !== "object") return "";
    var fromClaims = pickFromClaims(source);
    if (fromClaims) return fromClaims;
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
    return name;
  }

  var AUTH_HINT_KEY = "gc_auth_hint";

  function readStoredHintObject() {
    try {
      var parsed = JSON.parse(localStorage.getItem(AUTH_HINT_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeAuthHint(patch) {
    var next = readStoredHintObject();
    var key;
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    try {
      localStorage.setItem(AUTH_HINT_KEY, JSON.stringify(next));
    } catch (err) {}
    window.__GC_AUTH_HINT = next;
    return next;
  }

  function clearAuthHint() {
    try {
      localStorage.removeItem(AUTH_HINT_KEY);
    } catch (err) {}
    window.__GC_AUTH_HINT = null;
    document.documentElement.classList.remove("gc-signed-in");
    if (document.body) document.body.classList.remove("gc-signed-in");
  }

  function saveAuthHint(user) {
    if (!user) {
      clearAuthHint();
      return;
    }
    var name = displayNameFromUser(user);
    if (!name && user.email) name = String(user.email).split("@")[0];
    if (!name) name = "User";
    var urls = avatarUrlsFromUser(user);
    writeAuthHint({
      v: 1,
      name: name,
      letter: firstLetter(name),
      color: avatarColor(user.id || name),
      avatar: urls[0] || "",
      avatars: urls,
      userId: user.id || ""
    });
    document.documentElement.classList.add("gc-signed-in");
    if (document.body) document.body.classList.add("gc-signed-in");
  }

  function savePlanHint(plan) {
    var prev = readStoredHintObject();
    if (!prev.name && !prev.userId) return;
    writeAuthHint({ plan: plan ? String(plan) : "" });
  }

  window.gcAuth.savePlanHint = savePlanHint;

  async function resolveUser(sessionUser) {
    var user = sessionUser || null;
    try {
      var result = await client.auth.getUser();
      if (result.data && result.data.user) user = result.data.user;
    } catch (err) {
      /* keep session user */
    }
    return user;
  }

  function ensureMessageBox(form) {
    var box = (form && form.querySelector("#gc-auth-message")) || document.getElementById("gc-auth-message");
    if (box) return box;
    box = document.createElement("p");
    box.id = "gc-auth-message";
    box.className = "gc-auth-msg";
    box.setAttribute("aria-live", "polite");
    box.setAttribute("role", "status");
    if (form) form.appendChild(box);
    return box;
  }

  function setBusy(button, busy, idleLabel, busyLabel) {
    if (!button) return;
    button.disabled = !!busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  function disableUpcomingSocial(scope) {
    if (!scope) return;
    scope.querySelectorAll("button[name='_processLogin']").forEach(function (btn) {
      if (btn.value === "usernamepassword") return;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var box = document.getElementById("gc-auth-message");
        if (!box) box = ensureMessageBox(scope, btn);
        showMessage(box, "info", "Google and Discord sign-in will be added next. Use email and password for now.");
      });
    });
  }

  function readOAuthError() {
    try {
      var fromHash = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
      var fromQuery = new URLSearchParams(location.search || "");
      var desc =
        fromHash.get("error_description") ||
        fromQuery.get("error_description") ||
        fromHash.get("error") ||
        fromQuery.get("error") ||
        "";
      return String(desc).replace(/\+/g, " ").trim();
    } catch (err) {
      return "";
    }
  }

  function isSocialUser(user) {
    var identities = (user && user.identities) || [];
    var i;
    for (i = 0; i < identities.length; i++) {
      var provider = String(identities[i].provider || "").toLowerCase();
      if (provider === "discord" || provider === "google") return true;
    }
    return false;
  }

  async function finalizeSocialProfile(user, accessToken) {
    if (!user || !isSocialUser(user)) return user;
    var name = displayNameFromUser(user);
    if (name) name = name.slice(0, 32);
    if (!name && user.email) name = String(user.email).split("@")[0].slice(0, 32);
    var avatar = socialAvatarUrl(user);
    var meta = user.user_metadata || {};
    var patch = {};
    if (name && String(meta.display_name || "").trim() !== name) {
      patch.display_name = name;
      patch.username = name;
      patch.full_name = name;
    }
    if (avatar && !String(meta.avatar_url || "").trim()) patch.avatar_url = avatar;
    if (Object.keys(patch).length) {
      try {
        var updated = await client.auth.updateUser({ data: patch });
        if (updated.data && updated.data.user) user = updated.data.user;
      } catch (err) {}
    }
    if (name && accessToken) {
      try {
        var availRes = await fetch("/api/display-name/available", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name })
        });
        var availJson = await availRes.json().catch(function () {
          return {};
        });
        if (availRes.ok && availJson.available) {
          await claimDisplayName(name, accessToken);
        }
      } catch (err) {}
    }
    saveAuthHint(user);
    return user;
  }

  window.gcAuth.finalizeSocialProfile = finalizeSocialProfile;
  window.gcAuth.displayNameFromUser = displayNameFromUser;

  async function boot() {
    if (document.documentElement.classList.contains("gc-signed-in") && document.body) {
      document.body.classList.add("gc-signed-in");
    }
    var oauthErr = readOAuthError();
    if (oauthErr) {
      var onAuthForm = document.getElementById("gc-register-form") || document.getElementById("gc-login-form");
      if (!onAuthForm && (isLoginPage() === false) && (isRegisterPage() === false) && (isCheckoutPage() === false)) {
        location.replace(root + "login/?error_description=" + encodeURIComponent(oauthErr));
        return;
      }
      showMessage(authMessageBox(), "error", friendlyError({ message: oauthErr }));
      try {
        var clean = new URL(location.href);
        clean.searchParams.delete("error");
        clean.searchParams.delete("error_code");
        clean.searchParams.delete("error_description");
        clean.hash = "";
        history.replaceState(null, "", clean.pathname + (clean.search || ""));
      } catch (err) {}
    }
    var sessionRes = await client.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (session && session.user) {
      renderHeader(session.user);
      var user = await finalizeSocialProfile(session.user, session.access_token);
      user = await resolveUser(user || session.user);
      if (user) renderHeader(user);
    } else {
      renderHeader(null);
    }

    var registerForm = document.getElementById("gc-register-form");
    var loginForm = document.getElementById("gc-login-form");

    if (registerForm) initRegister(registerForm, session);
    if (loginForm) initLogin(loginForm, session);
    bindGoogleButtons();
    bindDiscordButtons();

    client.auth.onAuthStateChange(function (event, nextSession) {
      if (nextSession && nextSession.user) {
        finalizeSocialProfile(nextSession.user, nextSession.access_token).then(function (user) {
          renderHeader(user || nextSession.user);
        });
        return;
      }
      if (event === "SIGNED_OUT") renderHeader(null);
    });
  }

  function authMessageBox() {
    var form = document.getElementById("gc-register-form") || document.getElementById("gc-login-form");
    return ensureMessageBox(form);
  }

  function bindGoogleButtons() {
    document.querySelectorAll(".acc-social-google").forEach(function (btn) {
      if (btn.dataset.gcGoogleBound === "1") return;
      btn.dataset.gcGoogleBound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        startGoogleSignIn(btn);
      });
    });
  }

  async function startGoogleSignIn(btn) {
    var box = authMessageBox();
    var label = btn.querySelector(".acc-social-label");
    var orig = label ? label.textContent : "";
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Waiting for Google…";
    try {
      var result = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authRedirectHref(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account"
          }
        }
      });
      if (result.error) {
        showMessage(box, "error", friendlyError(result.error));
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-busy");
        if (label) label.textContent = orig;
      }
    } catch (err) {
      showMessage(box, "error", friendlyError(err));
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      if (label) label.textContent = orig;
    }
  }

  function isManualAuth(user) {
    var identities = (user && user.identities) || [];
    if (!identities.length) return true;
    return identities.every(function (identity) {
      return identity.provider === "email";
    });
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
    return "https://cdn.discordapp.com/avatars/" + encodeURIComponent(userId) + "/" + encodeURIComponent(avatar) + "." + ext + "?size=128";
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

  function socialAvatarUrl(user) {
    return avatarUrlsFromUser(user)[0] || "";
  }

  function avatarColor(seed) {
    var palette = [
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
    var hash = 0;
    var text = String(seed || "user");
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return palette[Math.abs(hash) % palette.length];
  }

  function firstLetter(name) {
    var match = String(name || "").match(/[A-Za-z0-9\u00C0-\u024F]/);
    return match ? match[0].toUpperCase() : "?";
  }

  function paintAvatar(el, user, name) {
    if (!el) return;
    var token = (el._gcAvatarGen || 0) + 1;
    el._gcAvatarGen = token;
    var letter = firstLetter(name);
    var color = avatarColor((user && user.id) || name);
    var urls = avatarUrlsFromUser(user);
    el.style.background = color;

    var existing = el.querySelector("img");
    if (existing && urls.length) {
      var current = existing.getAttribute("src") || "";
      for (var i = 0; i < urls.length; i++) {
        if (current === urls[i]) return;
      }
    }

    if (!urls.length) {
      el.textContent = letter;
      return;
    }

    if (!existing) el.textContent = letter;

    function tryUrl(index) {
      if (el._gcAvatarGen !== token) return;
      if (index >= urls.length) {
        if (!el.querySelector("img")) el.textContent = letter;
        return;
      }
      var img = new Image();
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = function () {
        if (el._gcAvatarGen !== token) return;
        el.textContent = "";
        el.style.background = color;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        el.appendChild(img);
      };
      img.onerror = function () {
        tryUrl(index + 1);
      };
      img.src = urls[index];
    }

    tryUrl(0);
  }

  function hideNode(el) {
    if (!el) return;
    el.hidden = true;
    var li = el.closest ? el.closest("li") : null;
    if (li) li.hidden = true;
  }

  function showNode(el) {
    if (!el) return;
    el.hidden = false;
    var li = el.closest ? el.closest("li") : null;
    if (li) li.hidden = false;
  }

  function fillUserChip(root, user, name) {
    if (!root) return;
    var avatar = root.querySelector(".gc-user-avatar");
    var label = root.querySelector(".gc-user-name");
    if (label) label.textContent = name;
    if (!avatar) return;
    paintAvatar(avatar, user, name);
  }

  function userMenuLinksHtml() {
    var account = root + "account/";
    return (
      '<li class="ipsMenu_item"><a href="' + account + '">Account</a></li>' +
      '<li class="ipsMenu_item"><a href="' + account + '#subscriptions">Subscriptions</a></li>' +
      '<li class="ipsMenu_item"><a href="' + root + 'affiliates/">Affiliates</a></li>' +
      '<li class="ipsMenu_item"><a href="' + account + '#purchases">Purchases</a></li>' +
      '<li class="ipsMenu_item"><a href="' + account + '#orders">Orders</a></li>' +
      '<li class="ipsMenu_item"><button type="button" class="gc-logout">Logout</button></li>'
    );
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
      if (trigger && hoverOk()) {
        e.preventDefault();
        if (item.classList.contains("ghostNavHoverOpen")) closeMenu();
        else openMenu();
      }
    });
  }

  function renderHeader(user) {
    var loginBtn = document.querySelector(".buttonLogin") || document.getElementById("elSignInLink");
    var registerBtn = document.getElementById("elRegisterButton");
    var mobileLogin = document.getElementById("elSigninButton_mobile");
    var mobileRegister = document.getElementById("elRegisterButton_mobile");
    var nav = document.getElementById("elUserNav");
    var existing = document.getElementById("gc-user-nav");
    var mobileUser = document.getElementById("gc-mobile-user");

    if (!user) {
      clearAuthHint();
      if (isCheckoutPage()) document.body.classList.add("gc-checkout-guest");
      if (existing) existing.remove();
      if (mobileUser) mobileUser.remove();
      showNode(loginBtn);
      showNode(registerBtn);
      showNode(mobileLogin);
      showNode(mobileRegister);
      var loggedOutWrap =
        (mobileLogin && mobileLogin.closest(".ipsPadding")) ||
        (mobileRegister && mobileRegister.closest(".ipsPadding"));
      if (loggedOutWrap) loggedOutWrap.hidden = false;
      return;
    }

    saveAuthHint(user);
    if (isCheckoutPage()) document.body.classList.remove("gc-checkout-guest");
    hideNode(loginBtn);
    hideNode(registerBtn);
    hideNode(mobileLogin);
    hideNode(mobileRegister);
    var signedInWrap =
      (mobileLogin && mobileLogin.closest(".ipsPadding")) ||
      (mobileRegister && mobileRegister.closest(".ipsPadding"));
    if (signedInWrap) signedInWrap.hidden = true;

    var name = displayNameFromUser(user);
    if (!name && user.email) name = String(user.email).split("@")[0];
    if (!name) name = "User";

    if (nav) {
      if (existing && !existing.querySelector(".gc-user-trigger-wrap")) {
        existing.remove();
        existing = null;
      }
      if (!existing) {
        existing = document.createElement("li");
        existing.id = "gc-user-nav";
        existing.className = "gc-user-nav";
        existing.innerHTML =
          '<div class="gc-user-chip">' +
          '<span class="gc-user-avatar" aria-hidden="true"></span>' +
          '<div class="gc-user-trigger-wrap">' +
          '<button type="button" class="gc-user-trigger" aria-expanded="false" aria-haspopup="true">' +
          '<span class="gc-user-name"></span>' +
          '<i class="fa-light fa-angle-down" aria-hidden="true"></i>' +
          "</button>" +
          '<ul class="ipsMenu ipsMenu_auto gc-user-menu ghostNavHoverMenu ipsHide" role="menu" aria-hidden="true">' +
          userMenuLinksHtml() +
          "</ul>" +
          "</div>" +
          "</div>";
        nav.appendChild(existing);
      }
      bindUserNav(existing);
      fillUserChip(existing, user, name);
    }

    var mobileList = document.getElementById("elUserNav_mobile") || (mobileLogin && mobileLogin.closest("ul"));
    if (mobileList) {
      if (mobileUser && !mobileUser.querySelector(".gc-mobile-user-links")) {
        mobileUser.remove();
        mobileUser = null;
      }
      if (!mobileUser) {
        mobileUser = document.createElement("li");
        mobileUser.id = "gc-mobile-user";
        mobileUser.innerHTML =
          '<div class="gc-user-chip">' +
          '<span class="gc-user-avatar" aria-hidden="true"></span>' +
          '<span class="gc-user-name"></span>' +
          "</div>" +
          '<ul class="gc-mobile-user-links">' +
          '<li><a href="' + root + 'account/">Account</a></li>' +
          '<li><a href="' + root + 'account/#subscriptions">Subscriptions</a></li>' +
          '<li><a href="' + root + 'affiliates/">Affiliates</a></li>' +
          '<li><a href="' + root + 'account/#purchases">Purchases</a></li>' +
          '<li><a href="' + root + 'account/#orders">Orders</a></li>' +
          '<li><button type="button" class="gc-logout">Logout</button></li>' +
          "</ul>";
        mobileList.insertBefore(mobileUser, mobileList.firstChild);
      }
      bindUserNav(mobileUser);
      fillUserChip(mobileUser, user, name);
    }
  }

  async function logout() {
    clearAuthHint();
    try {
      await client.auth.signOut();
    } catch (err) {}
    location.href = homeHref();
  }

  function bindDiscordButtons() {
    document.querySelectorAll(".acc-social-discord").forEach(function (btn) {
      if (btn.dataset.gcDiscordBound === "1") return;
      btn.dataset.gcDiscordBound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        startDiscordSignIn(btn);
      });
    });
  }

  async function startDiscordSignIn(btn) {
    var box = authMessageBox();
    var label = btn.querySelector(".acc-social-label");
    var orig = label ? label.textContent : "";
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Waiting for Discord…";
    try {
      var result = await client.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: authRedirectHref()
        }
      });
      if (result.error) {
        showMessage(box, "error", friendlyError(result.error));
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-busy");
        if (label) label.textContent = orig;
      }
    } catch (err) {
      showMessage(box, "error", friendlyError(err));
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      if (label) label.textContent = orig;
    }
  }

  function initRegister(form, session) {
    if (session) {
      if (!isCheckoutPage()) location.replace(homeHref());
      return;
    }

    form.setAttribute("novalidate", "novalidate");
    var submit = form.querySelector('button[type="submit"]');
    var box = ensureMessageBox(form);
    disableUpcomingSocial(form.closest(".ipsColumns") || document.getElementById("elRegisterSocial") || form);

    var socialForm = document.querySelector("#elRegisterSocial form");
    disableUpcomingSocial(socialForm);

    form.addEventListener(
      "submit",
      async function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        clearMessage(box);

        var username = (
          (document.getElementById("name") || document.getElementById("elInput_username") || {}).value || ""
        );
        var email = (
          (document.getElementById("email") || document.getElementById("elInput_email_address") || {}).value || ""
        );
        var password = (document.getElementById("password") || document.getElementById("elInput_password") || {}).value || "";
        var confirm =
          (document.getElementById("password_confirmation") ||
            document.getElementById("elInput_password_confirm") ||
            {}).value || "";

        username = username.trim();
        email = email.trim();

        if (!username) return showMessage(box, "error", "Enter a display name.");
        if (username.length < 2) return showMessage(box, "error", "Enter a display name.");
        if (username.length > 32) return showMessage(box, "error", "Keep it under 32 characters.");
        if (!email) return showMessage(box, "error", "Enter your email address.");
        if (!password) return showMessage(box, "error", "Enter a password.");
        if (password.length < 8) return showMessage(box, "error", "Password must be at least 8 characters.");
        if (password !== confirm) return showMessage(box, "error", "Passwords do not match.");

        setBusy(submit, true, "Create account", "Creating account…");
        try {
          var result = await window.gcAuth.createAccount({
            username: username,
            email: email,
            password: password
          });
          if (result.error) {
            showMessage(box, "error", friendlyError(result.error));
            return;
          }
          if (result.data && result.data.session) {
            showMessage(box, "success", "Account created. Redirecting…");
            afterAuthSuccess();
            return;
          }
          showMessage(
            box,
            "success",
            "Account created. Check your email to confirm, then sign in."
          );
          form.reset();
        } catch (err) {
          showMessage(box, "error", friendlyError(err));
        } finally {
          setBusy(submit, false, "Create account", "Creating account…");
        }
      },
      true
    );
  }

  function initLogin(form, session) {
    if (session) {
      location.replace(homeHref());
      return;
    }

    form.setAttribute("novalidate", "novalidate");
    var submit = form.querySelector('button[type="submit"]') || document.getElementById("elSignIn_submit");
    var box = ensureMessageBox(form);
    disableUpcomingSocial(form);

    form.addEventListener(
      "submit",
      async function (e) {
        var submitter = e.submitter;
        if (submitter && submitter.name === "_processLogin" && submitter.value !== "usernamepassword") {
          e.preventDefault();
          e.stopImmediatePropagation();
          showMessage(box, "info", "Google and Discord sign-in will be added next. Use email and password for now.");
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        clearMessage(box);

        var email = (
          (document.getElementById("email") || document.getElementById("auth") || {}).value || ""
        ).trim();
        var passwordEl = form.querySelector('input[name="password"]') || document.getElementById("password");
        var password = (passwordEl || {}).value || "";

        if (!email) return showMessage(box, "error", "Enter your email address.");
        if (!password) return showMessage(box, "error", "Enter your password.");

        setBusy(submit, true, "Sign in", "Signing in…");
        try {
          var result = await client.auth.signInWithPassword({
            email: email,
            password: password
          });
          if (result.error) {
            showMessage(box, "error", friendlyError(result.error));
            return;
          }
          await resolveUser(result.data && result.data.user);
          showMessage(box, "success", "Signed in. Redirecting…");
          afterAuthSuccess();
        } catch (err) {
          showMessage(box, "error", friendlyError(err));
        } finally {
          setBusy(submit, false, "Sign in", "Signing in…");
        }
      },
      true
    );
  }
})();
