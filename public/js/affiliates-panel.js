(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function moneyPath() {
    return /\/affiliates(\/|$)/i.test(location.pathname || "");
  }

  async function authHeaders() {
    var headers = { "Content-Type": "application/json" };
    try {
      var sessionRes = await window.gcAuth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      if (session && session.access_token) headers.Authorization = "Bearer " + session.access_token;
    } catch (err) {}
    return headers;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function methodLabel(method) {
    if (method === "bank") return "Bank";
    if (method === "crypto") return "USDC";
    if (method === "paypal") return "PayPal";
    return method || "—";
  }

  function statusPill(status) {
    var cls = status === "completed" ? "gc-pill-active" : "gc-pill-canceling";
    var label = status === "completed" ? "Completed" : "Pending";
    return '<span class="gc-pill ' + cls + '">' + label + "</span>";
  }

  var affSubTab = "main";
  var dashData = null;
  var lastSaved = { iban: "", usdc: "", paypal: "" };

  function methodNorm(name, value) {
    var text = String(value || "");
    if (name === "iban") return text.replace(/\s+/g, "").toUpperCase();
    return text.trim();
  }

  function methodField(id, name, type, placeholder, value) {
    return (
      '<div class="gc-aff-method-row" data-method="' +
      name +
      '">' +
      '<div class="gc-aff-method-field">' +
      '<input id="' +
      id +
      '" name="' +
      name +
      '" type="' +
      type +
      '" class="gc-aff-method-input" autocomplete="off" spellcheck="false" placeholder="' +
      placeholder +
      '" value="' +
      escapeHtml(value || "") +
      '">' +
      '<span class="gc-aff-method-saved" hidden><span class="gc-aff-method-saved-rule" aria-hidden="true"></span>SAVED</span>' +
      "</div>" +
      '<button type="button" class="gc-aff-method-save" data-aff-save="' +
      name +
      '" aria-label="Save"><i class="fa-solid fa-floppy-disk"></i></button>' +
      "</div>"
    );
  }

  function setMethodSaved(name, on) {
    var row = document.querySelector('.gc-aff-method-row[data-method="' + name + '"]');
    if (!row) return;
    row.classList.toggle("is-saved", !!on);
    var badge = row.querySelector(".gc-aff-method-saved");
    if (badge) badge.hidden = !on;
  }

  function syncMethodSaved(name) {
    setMethodSaved(name, false);
  }

  function showAffTab(name) {
    if (name !== "main" && name !== "payments" && name !== "payouts") name = "main";
    affSubTab = name;
    document.querySelectorAll("[data-aff-tab]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-aff-tab") === name);
    });
    document.querySelectorAll("[data-aff-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-aff-panel") !== name;
    });
  }

  function render(data) {
    var root = $("gcAffDash");
    if (!root || !data) return;
    var conversions = data.conversions || [];
    var payouts = data.payouts || [];
    dashData = data;
    var methods = data.methods || {};
    lastSaved = {
      iban: methods.iban || "",
      usdc: methods.usdc || "",
      paypal: methods.paypal || ""
    };
    var link = data.link || location.origin + "/?ref=" + encodeURIComponent(data.code || "");
    var convRows = conversions.length
      ? conversions
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.name || "Customer") +
              "</td>" +
              "<td>" +
              escapeHtml(row.amount) +
              "</td>" +
              "<td>" +
              escapeHtml(row.discount) +
              "</td>" +
              "<td>" +
              escapeHtml(row.commission) +
              "</td>" +
              "<td>" +
              escapeHtml(formatWhen(row.at)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5">No referred payments yet. Share your link to start tracking.</td></tr>';
    var payRows = payouts.length
      ? payouts
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.amount) +
              "</td>" +
              "<td>" +
              escapeHtml(methodLabel(row.method)) +
              "</td>" +
              "<td>" +
              escapeHtml(row.destination) +
              "</td>" +
              "<td>" +
              statusPill(row.status) +
              "</td>" +
              "<td>" +
              escapeHtml(formatWhen(row.at)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5">No payout requests yet.</td></tr>';

    root.innerHTML =
      '<div class="gc-aff-tabs" role="tablist" aria-label="Affiliate sections">' +
      '<button type="button" class="is-on" data-aff-tab="main" role="tab">Main</button>' +
      '<button type="button" data-aff-tab="payments" role="tab">Payments</button>' +
      '<button type="button" data-aff-tab="payouts" role="tab">Payouts</button>' +
      "</div>" +
      '<div data-aff-panel="main">' +
      '<div class="gc-sub-hero gc-aff-hero">' +
      '<p class="gc-sub-kicker">Your referral code</p>' +
      "<h3>" +
      escapeHtml(data.code) +
      "</h3>" +
      '<p class="gc-aff-copy">Anyone who visits our website with <strong>?ref=' +
      escapeHtml(data.code) +
      "</strong> link, gets <strong>" +
      escapeHtml(String(data.discountPercent)) +
      "% OFF</strong> at checkout(s). The discount stays on subscriptions renewal. You earn <strong>" +
      escapeHtml(String(data.commissionPercent)) +
      "%</strong> of what clients pay.</p>" +
      '<div class="gc-aff-method-row gc-aff-link-row">' +
      '<div class="gc-aff-method-field">' +
      '<input id="gcAffLink" class="gc-aff-method-input gc-aff-link-input" type="text" readonly value="' +
      escapeHtml(link) +
      '">' +
      "</div>" +
      '<button type="button" class="gc-aff-method-save gc-aff-link-copy" id="gcAffCopy" aria-label="Copy link">' +
      '<i class="fa-solid fa-share-nodes"></i>' +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div class="gc-sub-stats gc-aff-stats">' +
      '<div class="gc-sub-stat"><span>Available</span><strong>' +
      escapeHtml(data.availableLabel) +
      "</strong></div>" +
      '<div class="gc-sub-stat"><span>Pending payout</span><strong>' +
      escapeHtml(data.pendingLabel) +
      "</strong></div>" +
      '<div class="gc-sub-stat"><span>Paid out</span><strong>' +
      escapeHtml(data.paidLabel) +
      "</strong></div>" +
      '<div class="gc-sub-stat"><span>Referred volume</span><strong>' +
      escapeHtml(data.referredLabel) +
      "</strong></div>" +
      "</div>" +
      '<div class="gc-account-card gc-aff-card">' +
      "<h3>Payout methods</h3>" +
      '<p class="gc-account-hint">Save at least one destination, then request a payout when you reach ' +
      escapeHtml(data.minPayout) +
      ".</p>" +
      '<form id="gcAffMethodsForm" class="gc-aff-form">' +
      "<label>Bank IBAN" +
      methodField("gcAffIban", "iban", "text", "DE89 3704 0044 0532 0130 00", methods.iban) +
      "</label>" +
      "<label>USDC on Solana" +
      methodField("gcAffUsdc", "usdc", "text", "Solana wallet address", methods.usdc) +
      "</label>" +
      "<label>PayPal email" +
      methodField("gcAffPaypal", "paypal", "email", "you@email.com", methods.paypal) +
      "</label>" +
      "</form>" +
      '<div class="gc-aff-request">' +
      '<div class="gc-aff-payouts">' +
      '<button type="button" class="gc-aff-payout" data-aff-payout="bank" aria-label="Bank payout">' +
      '<img src="/images/payout/bank-transfer.png" alt="Bank Transfer">' +
      '<span class="gc-aff-payout-veil"><i class="fa-solid fa-wallet"></i><span>Bank payout</span></span>' +
      "</button>" +
      '<button type="button" class="gc-aff-payout" data-aff-payout="crypto" aria-label="USDC payout">' +
      '<img src="/images/payout/usdc.png" alt="USD Coin">' +
      '<span class="gc-aff-payout-veil"><i class="fa-solid fa-wallet"></i><span>USDC payout</span></span>' +
      "</button>" +
      '<button type="button" class="gc-aff-payout" data-aff-payout="paypal" aria-label="PayPal payout">' +
      '<img src="/images/payout/paypal.png" alt="PayPal">' +
      '<span class="gc-aff-payout-veil"><i class="fa-solid fa-wallet"></i><span>PayPal payout</span></span>' +
      "</button>" +
      "</div>" +
      '<div class="gc-aff-amount-row">' +
      '<div class="gc-aff-method-field gc-aff-amount-field">' +
      '<input id="gcAffAmount" class="gc-aff-method-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" aria-label="Payout amount in EUR">' +
      '<span class="gc-aff-method-saved"><span class="gc-aff-method-saved-rule" aria-hidden="true"></span>EUR</span>' +
      "</div>" +
      '<p class="gc-aff-amount-avail">Available <strong>' +
      escapeHtml(data.availableLabel) +
      "</strong></p>" +
      "</div>" +
      "</div>" +
      '<p class="gc-account-msg" id="gcAffMsg" role="status"></p>' +
      "</div>" +
      "</div>" +
      '<div data-aff-panel="payments" hidden>' +
      '<div class="gc-account-card gc-aff-card">' +
      "<h3>Referred payments</h3>" +
      '<p class="gc-account-hint">Every successful checkout and renewal tracked to your code.</p>' +
      '<div class="gc-account-table-wrap">' +
      '<table class="gc-account-table"><thead><tr><th>Name</th><th>Paid</th><th>Discount</th><th>Your cut</th><th>Date</th></tr></thead><tbody>' +
      convRows +
      "</tbody></table>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div data-aff-panel="payouts" hidden>' +
      '<div class="gc-account-card gc-aff-card">' +
      "<h3>Payout history</h3>" +
      '<p class="gc-account-hint">Every payout request sent from your available balance, with method, destination, and status.</p>' +
      '<div class="gc-account-table-wrap">' +
      '<table class="gc-account-table"><thead><tr><th>Amount</th><th>Method</th><th>Destination</th><th>Status</th><th>Requested</th></tr></thead><tbody>' +
      payRows +
      "</tbody></table>" +
      "</div>" +
      "</div>" +
      "</div>";

    bind(data);
    showAffTab(affSubTab);
  }

  function setMsg(text, ok) {
    var el = $("gcAffMsg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-ok", !!ok && !!text);
    el.classList.toggle("is-err", !ok && !!text);
  }

  function bind(data) {
    var copy = $("gcAffCopy");
    var input = $("gcAffLink");
    if (copy && input) {
      copy.addEventListener("click", function () {
        function markCopied() {
          copy.innerHTML = '<i class="fa-solid fa-check"></i>';
          copy.setAttribute("aria-label", "Copied");
          window.setTimeout(function () {
            copy.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
            copy.setAttribute("aria-label", "Copy link");
          }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(input.value).then(markCopied);
        } else {
          input.select();
          document.execCommand("copy");
          markCopied();
        }
      });
    }
    var form = $("gcAffMethodsForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var active = document.activeElement;
        var row = active && active.closest ? active.closest("[data-method]") : null;
        saveMethod((row && row.getAttribute("data-method")) || "iban");
      });
    }
    document.querySelectorAll(".gc-aff-method-row[data-method]").forEach(function (row) {
      var name = row.getAttribute("data-method");
      var input = row.querySelector("input");
      if (input) {
        input.addEventListener("input", function () {
          syncMethodSaved(name);
        });
      }
    });
    document.querySelectorAll("[data-aff-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        saveMethod(btn.getAttribute("data-aff-save"));
      });
    });
    document.querySelectorAll("[data-aff-payout]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        requestPayout(btn.getAttribute("data-aff-payout"), dashData || data);
      });
    });
    document.querySelectorAll("[data-aff-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showAffTab(btn.getAttribute("data-aff-tab"));
      });
    });
  }

  async function saveMethod(name) {
    if (name !== "iban" && name !== "usdc" && name !== "paypal") return;
    var input = document.querySelector('.gc-aff-method-row[data-method="' + name + '"] input');
    var btn = document.querySelector('[data-aff-save="' + name + '"]');
    var payload = {
      iban: lastSaved.iban || "",
      usdc: lastSaved.usdc || "",
      paypal: lastSaved.paypal || ""
    };
    payload[name] = (input && input.value) || "";
    if (btn) btn.disabled = true;
    setMsg("", true);
    try {
      var res = await fetch("/api/affiliates/me", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload)
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || "Could not save payout details.");
      var methods = json.methods || {};
      lastSaved[name] = methods[name] || "";
      if (dashData) {
        dashData.methods = dashData.methods || {};
        dashData.methods[name] = lastSaved[name];
      }
      if (input) input.value = lastSaved[name];
      setMethodSaved(name, true);
    } catch (err) {
      setMsg((err && err.message) || "Could not save payout details.", false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function parsePayoutCents(value) {
    var text = String(value || "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    if (!text) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    var cents = Math.round(Number(text) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    return cents;
  }

  function formatPayoutEuros(cents) {
    return "€" + (Number(cents) / 100).toFixed(2);
  }

  async function requestPayout(method, data) {
    var methods = (data && data.methods) || {};
    var amountCents = parsePayoutCents($("gcAffAmount") && $("gcAffAmount").value);
    if (amountCents == null) {
      setMsg("Enter a payout amount in EUR.", false);
      return;
    }
    var available = Number(data && data.available) || 0;
    var minCents = Number(data && data.minPayoutCents) || 0;
    if (minCents && amountCents < minCents) {
      setMsg("Minimum payout is " + ((data && data.minPayout) || formatPayoutEuros(minCents)) + ".", false);
      return;
    }
    if (amountCents > available) {
      setMsg("You can request up to " + ((data && data.availableLabel) || formatPayoutEuros(available)) + ".", false);
      return;
    }
    var payload = { method: method, amountCents: amountCents };
    if (method === "bank") payload.iban = ($("gcAffIban") && $("gcAffIban").value) || methods.iban || "";
    if (method === "crypto") payload.usdc = ($("gcAffUsdc") && $("gcAffUsdc").value) || methods.usdc || "";
    if (method === "paypal") payload.paypal = ($("gcAffPaypal") && $("gcAffPaypal").value) || methods.paypal || "";
    if (!window.confirm("Request a payout of " + formatPayoutEuros(amountCents) + " via " + methodLabel(method) + "?")) {
      return;
    }
    setMsg("Sending request…", true);
    try {
      var res = await fetch("/api/affiliates/payout", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload)
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || "Could not request payout.");
      affSubTab = "payouts";
      render(json);
      setMsg("Payout requested. Status: Pending.", true);
    } catch (err) {
      setMsg((err && err.message) || "Could not request payout.", false);
    }
  }

  async function load() {
    var root = $("gcAffDash");
    if (!root) return;
    root.innerHTML = '<p class="gc-account-hint">Loading your affiliate panel…</p>';
    try {
      var res = await fetch("/api/affiliates/me", { headers: await authHeaders() });
      var json = await res.json().catch(function () {
        return {};
      });
      if (res.status === 401) {
        location.replace("../login/?next=" + encodeURIComponent("/affiliates/"));
        return;
      }
      if (!res.ok) throw new Error(json.error || "Could not load affiliates.");
      render(json);
    } catch (err) {
      root.innerHTML =
        '<div class="gc-account-card"><strong>Could not load affiliates</strong><p class="gc-account-hint">' +
        String((err && err.message) || "Unknown error") +
        "</p></div>";
    }
  }

  window.gcLoadAffiliates = load;

  if (moneyPath() && document.readyState !== "loading") {
    /* account.js boot will call load via tab */
  }
})();
