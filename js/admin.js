(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-ok", !!ok && !!text);
  }

  function formatWhen(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB");
  }

  function methodLabel(method) {
    if (method === "bank") return "Bank";
    if (method === "crypto") return "USDC";
    if (method === "paypal") return "PayPal";
    return method || "—";
  }

  function copyIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l5 5L20 7"/></svg>';
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPayouts(payouts) {
    var body = $("gcAdminRows");
    if (!body) return;
    if (!payouts || !payouts.length) {
      body.innerHTML = '<tr><td colspan="7">No payout requests yet.</td></tr>';
      return;
    }
    body.innerHTML = payouts
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(row.name || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(row.code || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(row.amount) +
          "</td>" +
          "<td>" +
          escapeHtml(methodLabel(row.method)) +
          "</td>" +
          "<td>" +
          '<div class="gc-dest">' +
          '<span class="gc-dest-text" title="' +
          escapeHtml(row.destination || "") +
          '">' +
          escapeHtml(row.destination || "—") +
          "</span>" +
          (row.destination
            ? '<button type="button" class="gc-dest-copy" data-copy="' +
              escapeHtml(row.destination) +
              '" aria-label="Copy address">' +
              copyIcon() +
              "</button>"
            : "") +
          "</div>" +
          "</td>" +
          "<td>" +
          escapeHtml(formatWhen(row.at)) +
          "</td>" +
          "<td>" +
          '<div class="gc-status" data-payout-id="' +
          escapeHtml(row.id) +
          '">' +
          '<button type="button" class="gc-status-opt' +
          (row.status === "pending" ? " is-on" : "") +
          '" data-status="pending">Pending</button>' +
          '<button type="button" class="gc-status-opt' +
          (row.status === "completed" ? " is-on" : "") +
          '" data-status="completed">Completed</button>' +
          "</div>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    body.querySelectorAll(".gc-dest-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy") || "";
        function done() {
          btn.classList.add("is-copied");
          btn.innerHTML = checkIcon();
          btn.setAttribute("aria-label", "Copied");
          window.setTimeout(function () {
            btn.classList.remove("is-copied");
            btn.innerHTML = copyIcon();
            btn.setAttribute("aria-label", "Copy address");
          }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch (err) {}
          document.body.removeChild(ta);
          done();
        }
      });
    });
    body.querySelectorAll(".gc-status").forEach(function (group) {
      group.querySelectorAll(".gc-status-opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var status = btn.getAttribute("data-status");
          if (btn.classList.contains("is-on")) return;
          group.querySelectorAll(".gc-status-opt").forEach(function (other) {
            other.classList.toggle("is-on", other === btn);
          });
          playStatusSound();
          updateStatus(group.getAttribute("data-payout-id"), status);
        });
      });
    });
  }

  var ADMIN_DISCORD_ID = "497089417010479106";
  var accessToken = "";
  var client = null;
  var applySeq = 0;
  var statusSound = null;

  function playStatusSound() {
    try {
      if (!statusSound) statusSound = new Audio("/audio/status.mp3");
      statusSound.currentTime = 0;
      var playing = statusSound.play();
      if (playing && playing.catch) playing.catch(function () {});
    } catch (err) {}
  }

  function jwtPayloadRaw(token) {
    try {
      var parts = String(token || "").split(".");
      if (parts.length < 2) return "";
      var padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return atob(padded);
    } catch (err) {
      return "";
    }
  }

  function isAllowedAdmin(user, token) {
    if (!ADMIN_DISCORD_ID) return false;
    if (token && jwtPayloadRaw(token).indexOf(ADMIN_DISCORD_ID) !== -1) return true;
    if (!user) return false;
    try {
      return JSON.stringify(user).indexOf(ADMIN_DISCORD_ID) !== -1;
    } catch (err) {
      return false;
    }
  }

  function showLogin() {
    $("gcAdminLogin").hidden = false;
    $("gcAdminDash").hidden = true;
  }

  function showDash() {
    $("gcAdminLogin").hidden = true;
    $("gcAdminDash").hidden = false;
  }

  function authHeaders(extra) {
    var headers = extra || {};
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    return headers;
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

  async function loadPayouts() {
    var res = await fetch("/api/admin/payouts", { headers: authHeaders() });
    var json = await res.json().catch(function () {
      return {};
    });
    if (res.status === 401) {
      showLogin();
      setMsg($("gcAdminLoginMsg"), json.error || "This Discord account is not allowed to use admin.", false);
      return false;
    }
    if (!res.ok) throw new Error(json.error || "Could not load payouts.");
    showDash();
    renderPayouts(json.payouts || []);
    return true;
  }

  async function updateStatus(id, status) {
    setMsg($("gcAdminDashMsg"), "Saving…", true);
    try {
      var res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: id, status: status })
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || "Could not update payout.");
      renderPayouts(json.payouts || []);
      setMsg($("gcAdminDashMsg"), "Status saved.", true);
    } catch (err) {
      setMsg($("gcAdminDashMsg"), (err && err.message) || "Could not update payout.", false);
      loadPayouts();
    }
  }

  async function applySession(session) {
    var seq = ++applySeq;
    var user = session && session.user;
    accessToken = (session && session.access_token) || "";
    if (accessToken) {
      try {
        var userRes = await client.auth.getUser();
        if (seq !== applySeq) return false;
        if (userRes.data && userRes.data.user) user = userRes.data.user;
      } catch (err) {}
    }
    if (!accessToken) {
      if (seq === applySeq) showLogin();
      return false;
    }
    try {
      var ok = await loadPayouts();
      if (seq !== applySeq) return false;
      if (ok) return true;
      showLogin();
      if (!isAllowedAdmin(user, accessToken)) {
        setMsg($("gcAdminLoginMsg"), "This Discord account is not allowed to use admin.", false);
      }
      return false;
    } catch (err) {
      if (seq !== applySeq) return false;
      showLogin();
      setMsg($("gcAdminLoginMsg"), (err && err.message) || "Could not load payouts.", false);
      return false;
    }
  }

  async function consumeOAuthCallback() {
    var params = new URLSearchParams(location.search || "");
    var hashParams = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    var code = params.get("code") || hashParams.get("code");
    if (!code) return null;
    var result = await client.auth.exchangeCodeForSession(code);
    try {
      var clean = new URL(location.href);
      clean.searchParams.delete("code");
      clean.searchParams.delete("state");
      clean.hash = "";
      history.replaceState(null, "", clean.pathname + (clean.search || ""));
    } catch (err) {}
    return result;
  }

  async function startDiscord() {
    var btn = $("gcAdminDiscord");
    var orig = btn ? btn.innerHTML : "";
    setMsg($("gcAdminLoginMsg"), "", true);
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-loading");
    }
    try {
      var result = await client.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: new URL("/admin", location.origin).href,
          skipBrowserRedirect: false
        }
      });
      if (result.error) throw result.error;
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-loading");
        btn.innerHTML = orig;
      }
      setMsg($("gcAdminLoginMsg"), (err && err.message) || "Could not start Discord sign-in.", false);
    }
  }

  async function boot() {
    var cfg = window.GC_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) {
      setMsg($("gcAdminLoginMsg"), "Auth is not configured.", false);
      return;
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        storage: window.localStorage
      }
    });

    var oauthErr = readOAuthError();
    if (oauthErr) {
      setMsg($("gcAdminLoginMsg"), oauthErr, false);
      try {
        var clean = new URL(location.href);
        clean.searchParams.delete("error");
        clean.searchParams.delete("error_code");
        clean.searchParams.delete("error_description");
        clean.hash = "";
        history.replaceState(null, "", clean.pathname + (clean.search || ""));
      } catch (err) {}
    }

    client.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        accessToken = "";
        showLogin();
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session) applySession(session);
        else if (event === "INITIAL_SESSION") showLogin();
      }
    });

    if (!oauthErr) {
      try {
        var exchanged = await consumeOAuthCallback();
        if (exchanged && exchanged.error) {
          setMsg($("gcAdminLoginMsg"), exchanged.error.message || "Discord sign-in failed.", false);
        }
      } catch (err) {
        setMsg($("gcAdminLoginMsg"), (err && err.message) || "Discord sign-in failed.", false);
      }
    }

    $("gcAdminDiscord").addEventListener("click", startDiscord);
    $("gcAdminLogout").addEventListener("click", async function () {
      accessToken = "";
      try {
        await client.auth.signOut();
      } catch (err) {}
      showLogin();
      setMsg($("gcAdminLoginMsg"), "", true);
    });
  }

  boot();
})();
