"use strict";

module.exports = function createAffiliateApi(ctx) {
  const stripeRequest = ctx.stripeRequest;
  const supabaseRest = ctx.supabaseRest;
  const authUserFromReq = ctx.authUserFromReq;
  const sendJson = ctx.sendJson;
  const cookieValue = ctx.cookieValue;
  const displayNameFromUser = ctx.displayNameFromUser;
  const originFromReq = ctx.originFromReq;

  const DISCOUNT_PERCENT = clampInt(process.env.AFFILIATE_DISCOUNT_PERCENT, 10, 1, 90);
  const COMMISSION_PERCENT = clampInt(process.env.AFFILIATE_COMMISSION_PERCENT, 30, 0, 90);
  const MIN_PAYOUT_CENTS = clampInt(process.env.AFFILIATE_MIN_PAYOUT_CENTS, 1000, 100, 100000000);

  function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  const ADMIN_DISCORD_ID = String(process.env.ADMIN_DISCORD_ID || "497089417010479106").trim();

  function bearerToken(req) {
    return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  }

  function jwtPayloadRaw(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return "";
      const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(padded, "base64").toString("utf8");
    } catch (err) {
      return "";
    }
  }

  function decodeJwtPayload(token) {
    try {
      const raw = jwtPayloadRaw(token);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function containsAdminDiscordId(value) {
    if (!value || !ADMIN_DISCORD_ID) return false;
    if (typeof value === "string") return value.indexOf(ADMIN_DISCORD_ID) !== -1;
    try {
      return JSON.stringify(value).indexOf(ADMIN_DISCORD_ID) !== -1;
    } catch (err) {
      return false;
    }
  }

  async function fetchAuthUserText(token) {
    const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
    const anon = process.env.SUPABASE_ANON_KEY || "";
    if (!url || !anon || !token) return "";
    try {
      const res = await fetch(url + "/auth/v1/user", {
        headers: {
          apikey: anon,
          Authorization: "Bearer " + token
        }
      });
      return await res.text();
    } catch (err) {
      return "";
    }
  }

  async function isAdmin(req) {
    const token = bearerToken(req);
    if (!token) return false;
    const rawJwt = jwtPayloadRaw(token);
    if (containsAdminDiscordId(rawJwt)) return true;
    const payload = decodeJwtPayload(token);
    if (containsAdminDiscordId(payload)) return true;
    const userText = await fetchAuthUserText(token);
    if (containsAdminDiscordId(userText)) return true;
    const user = await authUserFromReq(req);
    if (containsAdminDiscordId(user)) return true;
    const userId = (payload && payload.sub) || (user && user.id) || "";
    if (userId && ctx.supabaseAuthAdmin) {
      try {
        const result = await ctx.supabaseAuthAdmin("GET", "/admin/users/" + encodeURIComponent(userId));
        if (containsAdminDiscordId(result && result.text)) return true;
        const full = (result && result.json && (result.json.user || result.json)) || null;
        if (containsAdminDiscordId(full)) return true;
      } catch (err) {}
    }
    return false;
  }

  function normalizeCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 40);
  }

  function validCode(value) {
    return /^[A-Z0-9]{3,40}$/.test(normalizeCode(value));
  }

  function looksLikeIban(value) {
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(String(value || "").replace(/\s+/g, "").toUpperCase());
  }

  function looksLikeSolana(value) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "").trim());
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function parseRequestedCents(body) {
    if (!body || typeof body !== "object") return null;
    if (body.amountCents != null && String(body.amountCents).trim() !== "") {
      const n = Math.round(Number(body.amountCents));
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    }
    if (body.amount != null && String(body.amount).trim() !== "") {
      const raw = String(body.amount).trim().replace(",", ".");
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
      const n = Math.round(Number(raw) * 100);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    }
    return null;
  }

  function money(cents, currency) {
    const amount = (Number(cents) || 0) / 100;
    const cur = String(currency || "eur").toUpperCase();
    try {
      return new Intl.NumberFormat("en-IE", { style: "currency", currency: cur }).format(amount);
    } catch (e) {
      return cur + " " + amount.toFixed(2);
    }
  }

  async function restOne(method, path, body) {
    const rows = await supabaseRest(method, path, body);
    if (Array.isArray(rows)) return rows[0] || null;
    return rows || null;
  }

  async function getAffiliateByUser(userId) {
    const rows = await supabaseRest(
      "GET",
      "affiliates?user_id=eq." + encodeURIComponent(userId) + "&select=*&limit=1"
    );
    return (rows && rows[0]) || null;
  }

  async function getAffiliateByCode(code) {
    const normalized = normalizeCode(code);
    if (!validCode(normalized)) return null;
    const rows = await supabaseRest(
      "GET",
      "affiliates?code=eq." + encodeURIComponent(normalized) + "&select=*&limit=1"
    );
    return (rows && rows[0]) || null;
  }

  function codeFromName(user) {
    const name = displayNameFromUser(user, user && user.email);
    const base =
      String(name || "USER")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 32) || "USER";
    return normalizeCode(base + String(DISCOUNT_PERCENT));
  }

  async function ensureAffiliateCoupon() {
    const existing = String(process.env.AFFILIATE_STRIPE_COUPON_ID || "").trim();
    if (existing) return existing;
    const listed = await stripeRequest("GET", "/coupons", { limit: "100" });
    const data = (listed && listed.data) || [];
    for (var i = 0; i < data.length; i++) {
      const coupon = data[i];
      const meta = coupon.metadata || {};
      if (meta.gc_affiliate === "1" && coupon.valid !== false) return coupon.id;
    }
    const created = await stripeRequest("POST", "/coupons", {
      percent_off: String(DISCOUNT_PERCENT),
      duration: "forever",
      name: "Affiliate referral " + DISCOUNT_PERCENT + "%",
      "metadata[gc_affiliate]": "1"
    });
    return created.id;
  }

  async function createPromotionCode(couponId, affiliate) {
    const shared = {
      code: affiliate.code,
      "metadata[affiliate_id]": affiliate.id,
      "metadata[user_id]": affiliate.user_id
    };
    try {
      return await stripeRequest(
        "POST",
        "/promotion_codes",
        Object.assign(
          {
            "promotion[type]": "coupon",
            "promotion[coupon]": couponId
          },
          shared
        )
      );
    } catch (err) {
      if (!/unknown parameter: promotion/i.test(String(err.message || ""))) throw err;
      return stripeRequest("POST", "/promotion_codes", Object.assign({ coupon: couponId }, shared));
    }
  }

  async function findPromotionCode(code) {
    const listed = await stripeRequest("GET", "/promotion_codes", {
      code: code,
      limit: "1"
    });
    return listed && listed.data && listed.data[0];
  }

  async function ensurePromotionCode(affiliate) {
    if (affiliate.stripe_promotion_code_id) return affiliate;
    const couponId = await ensureAffiliateCoupon();
    let promo = null;
    try {
      promo = await createPromotionCode(couponId, affiliate);
    } catch (err) {
      promo = await findPromotionCode(affiliate.code);
      if (!promo) throw err;
    }
    const updated = await restOne(
      "PATCH",
      "affiliates?id=eq." + encodeURIComponent(affiliate.id),
      {
        stripe_coupon_id: couponId,
        stripe_promotion_code_id: promo.id
      }
    );
    return updated || Object.assign({}, affiliate, {
      stripe_coupon_id: couponId,
      stripe_promotion_code_id: promo.id
    });
  }

  async function syncAffiliateCode(user, affiliate) {
    const desired = codeFromName(user);
    if (!affiliate || !validCode(desired) || affiliate.code === desired) return affiliate;
    const taken = await getAffiliateByCode(desired);
    if (taken && taken.id !== affiliate.id) return affiliate;
    try {
      const patched = await restOne("PATCH", "affiliates?id=eq." + encodeURIComponent(affiliate.id), {
        code: desired,
        stripe_coupon_id: null,
        stripe_promotion_code_id: null
      });
      return patched || Object.assign({}, affiliate, {
        code: desired,
        stripe_coupon_id: null,
        stripe_promotion_code_id: null
      });
    } catch (err) {
      return affiliate;
    }
  }

  async function createAffiliateForUser(user) {
    const code = codeFromName(user);
    if (!validCode(code)) {
      throw new Error("Could not create a referral code from your display name.");
    }
    try {
      const row = await restOne("POST", "affiliates", {
        user_id: user.id,
        code: code
      });
      return ensurePromotionCode(row);
    } catch (err) {
      const existing = await getAffiliateByUser(user.id);
      if (existing) return ensurePromotionCode(existing);
      throw err;
    }
  }

  async function resolveReferral(req, bodyRef) {
    const raw = bodyRef !== undefined && bodyRef !== null ? bodyRef : cookieValue(req, "gc_ref");
    const code = normalizeCode(raw);
    if (!validCode(code)) return null;
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) return null;
    return ensurePromotionCode(affiliate);
  }

  async function prepareDiscount(affiliate) {
    if (!affiliate) return { couponId: "", promoId: "" };
    var row = affiliate;
    try {
      row = await ensurePromotionCode(affiliate);
    } catch (err) {
      const couponId = await ensureAffiliateCoupon();
      row = Object.assign({}, affiliate, { stripe_coupon_id: couponId });
    }
    if (!row.stripe_coupon_id) {
      row.stripe_coupon_id = await ensureAffiliateCoupon();
    }
    return {
      couponId: row.stripe_coupon_id || "",
      promoId: row.stripe_promotion_code_id || ""
    };
  }

  async function stripeDiscountParams(affiliate) {
    const ids = await prepareDiscount(affiliate);
    if (ids.couponId) {
      return { "discounts[0][coupon]": ids.couponId };
    }
    if (ids.promoId) {
      return { "discounts[0][promotion_code]": ids.promoId };
    }
    return {};
  }

  function discountAttempts(ids) {
    const list = [];
    if (ids.couponId) {
      list.push({ "discounts[0][coupon]": ids.couponId });
      list.push({ coupon: ids.couponId });
    }
    if (ids.promoId) {
      list.push({ "discounts[0][promotion_code]": ids.promoId });
    }
    return list;
  }

  async function totalsForAffiliate(affiliateId) {
    const conversions = (await supabaseRest(
      "GET",
      "affiliate_conversions?affiliate_id=eq." +
        encodeURIComponent(affiliateId) +
        "&select=amount_cents,discount_cents,commission_cents,currency,created_at,customer_user_id,order_id"
    )) || [];
    const payouts = (await supabaseRest(
      "GET",
      "affiliate_payouts?affiliate_id=eq." +
        encodeURIComponent(affiliateId) +
        "&select=*&order=created_at.desc"
    )) || [];
    var earned = 0;
    var discounted = 0;
    var referred = 0;
    var currency = "eur";
    conversions.forEach(function (row) {
      earned += Number(row.commission_cents) || 0;
      discounted += Number(row.discount_cents) || 0;
      referred += Number(row.amount_cents) || 0;
      if (row.currency) currency = row.currency;
    });
    var pending = 0;
    var paid = 0;
    payouts.forEach(function (row) {
      const cents = Number(row.amount_cents) || 0;
      if (row.status === "completed") paid += cents;
      else pending += cents;
    });
    return {
      conversions: conversions,
      payouts: payouts,
      earned: earned,
      discounted: discounted,
      referred: referred,
      pending: pending,
      paid: paid,
      available: Math.max(0, earned - pending - paid),
      currency: currency
    };
  }

  async function displayNamesByUserIds(ids) {
    const unique = [];
    const seen = {};
    (ids || []).forEach(function (id) {
      const key = String(id || "").trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      unique.push(key);
    });
    const map = {};
    if (!unique.length) return map;
    try {
      const rows =
        (await supabaseRest(
          "GET",
          "profiles?user_id=in.(" + unique.join(",") + ")&select=user_id,display_name"
        )) || [];
      rows.forEach(function (row) {
        if (row && row.user_id && row.display_name) map[String(row.user_id)] = String(row.display_name);
      });
    } catch (e) {}
    return map;
  }

  async function publicDashboard(user, origin) {
    var affiliate = await getAffiliateByUser(user.id);
    if (!affiliate) affiliate = await createAffiliateForUser(user);
    else {
      affiliate = await syncAffiliateCode(user, affiliate);
      affiliate = await ensurePromotionCode(affiliate);
    }
    const stats = await totalsForAffiliate(affiliate.id);
    const names = await displayNamesByUserIds(
      stats.conversions.map(function (row) {
        return row.customer_user_id;
      })
    );
    const base = String(origin || process.env.SITE_URL || "").replace(/\/+$/, "");
    return {
      code: affiliate.code,
      link: (base || "") + "/?ref=" + encodeURIComponent(affiliate.code),
      discountPercent: DISCOUNT_PERCENT,
      commissionPercent: COMMISSION_PERCENT,
      minPayout: money(MIN_PAYOUT_CENTS, stats.currency),
      minPayoutCents: MIN_PAYOUT_CENTS,
      earned: stats.earned,
      earnedLabel: money(stats.earned, stats.currency),
      available: stats.available,
      availableLabel: money(stats.available, stats.currency),
      pending: stats.pending,
      pendingLabel: money(stats.pending, stats.currency),
      paid: stats.paid,
      paidLabel: money(stats.paid, stats.currency),
      referred: stats.referred,
      referredLabel: money(stats.referred, stats.currency),
      discounted: stats.discounted,
      discountedLabel: money(stats.discounted, stats.currency),
      conversions: stats.conversions.slice(0, 20).map(function (row) {
        return {
          name: names[String(row.customer_user_id || "")] || "Customer",
          orderId: row.order_id || "",
          amount: money(row.amount_cents, row.currency || stats.currency),
          discount: money(row.discount_cents, row.currency || stats.currency),
          commission: money(row.commission_cents, row.currency || stats.currency),
          at: row.created_at
        };
      }),
      payouts: stats.payouts.map(function (row) {
        return {
          id: row.id,
          amount: money(row.amount_cents, row.currency || stats.currency),
          method: row.method,
          destination: row.destination,
          status: row.status,
          at: row.created_at,
          completedAt: row.completed_at
        };
      }),
      methods: {
        iban: affiliate.payout_iban || "",
        usdc: affiliate.payout_usdc || "",
        paypal: affiliate.payout_paypal || ""
      }
    };
  }

  async function handleGetMine(req, res) {
    const user = await authUserFromReq(req);
    if (!user || !user.id) {
      sendJson(res, 401, { error: "Sign in to open Affiliates." });
      return;
    }
    try {
      sendJson(res, 200, await publicDashboard(user, originFromReq && originFromReq(req)));
    } catch (err) {
      sendJson(res, err.status || 500, {
        error: err.message || "Could not load affiliates. Run sql/affiliates.sql in Supabase first."
      });
    }
  }

  async function handleSaveMethods(req, res) {
    const user = await authUserFromReq(req);
    if (!user || !user.id) {
      sendJson(res, 401, { error: "Sign in to save payout details." });
      return;
    }
    const body = await ctx.readJsonBody(req);
    const iban = String(body.iban || "").replace(/\s+/g, "").toUpperCase();
    const usdc = String(body.usdc || "").trim();
    const paypal = String(body.paypal || "").trim();
    if (iban && !looksLikeIban(iban)) {
      sendJson(res, 400, { error: "Enter a valid IBAN." });
      return;
    }
    if (usdc && !looksLikeSolana(usdc)) {
      sendJson(res, 400, { error: "Enter a valid USDC Solana address." });
      return;
    }
    if (paypal && !looksLikeEmail(paypal)) {
      sendJson(res, 400, { error: "Enter a valid PayPal email." });
      return;
    }
    var affiliate = await getAffiliateByUser(user.id);
    if (!affiliate) affiliate = await createAffiliateForUser(user);
    await restOne("PATCH", "affiliates?id=eq." + encodeURIComponent(affiliate.id), {
      payout_iban: iban || null,
      payout_usdc: usdc || null,
      payout_paypal: paypal || null
    });
    sendJson(res, 200, await publicDashboard(user, originFromReq && originFromReq(req)));
  }

  async function handleRequestPayout(req, res) {
    const user = await authUserFromReq(req);
    if (!user || !user.id) {
      sendJson(res, 401, { error: "Sign in to request a payout." });
      return;
    }
    const body = await ctx.readJsonBody(req);
    const method = String(body.method || "").trim().toLowerCase();
    if (method !== "bank" && method !== "crypto" && method !== "paypal") {
      sendJson(res, 400, { error: "Choose bank, crypto, or PayPal." });
      return;
    }
    var affiliate = await getAffiliateByUser(user.id);
    if (!affiliate) affiliate = await createAffiliateForUser(user);
    const stats = await totalsForAffiliate(affiliate.id);
    const amount = parseRequestedCents(body);
    if (amount == null) {
      sendJson(res, 400, { error: "Enter a payout amount in EUR." });
      return;
    }
    if (amount < MIN_PAYOUT_CENTS) {
      sendJson(res, 400, {
        error: "Minimum payout is " + money(MIN_PAYOUT_CENTS, stats.currency) + "."
      });
      return;
    }
    if (amount > stats.available) {
      sendJson(res, 400, {
        error: "You can request up to " + money(stats.available, stats.currency) + "."
      });
      return;
    }
    var destination = "";
    if (method === "bank") {
      destination = String(body.iban || affiliate.payout_iban || "").replace(/\s+/g, "").toUpperCase();
      if (!looksLikeIban(destination)) {
        sendJson(res, 400, { error: "Add a valid IBAN before requesting a bank payout." });
        return;
      }
      await restOne("PATCH", "affiliates?id=eq." + encodeURIComponent(affiliate.id), { payout_iban: destination });
    } else if (method === "crypto") {
      destination = String(body.usdc || affiliate.payout_usdc || "").trim();
      if (!looksLikeSolana(destination)) {
        sendJson(res, 400, { error: "Add a USDC Solana address before requesting a crypto payout." });
        return;
      }
      await restOne("PATCH", "affiliates?id=eq." + encodeURIComponent(affiliate.id), { payout_usdc: destination });
    } else {
      destination = String(body.paypal || affiliate.payout_paypal || "").trim();
      if (!looksLikeEmail(destination)) {
        sendJson(res, 400, { error: "Add a PayPal email before requesting a PayPal payout." });
        return;
      }
      await restOne("PATCH", "affiliates?id=eq." + encodeURIComponent(affiliate.id), { payout_paypal: destination });
    }
    await restOne("POST", "affiliate_payouts", {
      affiliate_id: affiliate.id,
      amount_cents: amount,
      currency: stats.currency,
      method: method,
      destination: destination,
      status: "pending"
    });
    sendJson(res, 200, await publicDashboard(user, originFromReq && originFromReq(req)));
  }

  async function logConversion(details) {
    if (!details || !details.affiliateId) return;
    const invoiceId = details.stripeInvoiceId || null;
    const piId = details.stripePaymentIntentId || null;
    if (invoiceId) {
      const existing = await supabaseRest(
        "GET",
        "affiliate_conversions?stripe_invoice_id=eq." + encodeURIComponent(invoiceId) + "&select=id&limit=1"
      );
      if (existing && existing.length) return;
    } else if (piId) {
      const existingPi = await supabaseRest(
        "GET",
        "affiliate_conversions?stripe_payment_intent_id=eq." +
          encodeURIComponent(piId) +
          "&select=id&limit=1"
      );
      if (existingPi && existingPi.length) return;
    }
    const paid = Math.max(0, Number(details.amountCents) || 0);
    const discount = Math.max(0, Number(details.discountCents) || 0);
    const commission = Math.round(paid * (COMMISSION_PERCENT / 100));
    try {
      await restOne("POST", "affiliate_conversions", {
        affiliate_id: details.affiliateId,
        customer_user_id: details.customerUserId || null,
        customer_email: details.customerEmail || "",
        order_id: details.orderId || "",
        subscription_id: details.subscriptionId || "",
        stripe_invoice_id: invoiceId,
        stripe_payment_intent_id: piId,
        amount_cents: paid,
        discount_cents: discount,
        commission_cents: commission,
        currency: String(details.currency || "eur").toLowerCase()
      });
    } catch (err) {
      if (!/duplicate|unique|23505/i.test(String(err.message || "") + String(err.code || ""))) {
        console.error("Affiliate conversion log failed:", err.message);
      }
    }
  }

  async function logFromInvoice(invoice, extra) {
    if (!invoice || invoice.status === "draft" || invoice.status === "open") return;
    if (invoice.paid === false && invoice.status !== "paid") return;
    let code = "";
    const meta = invoice.metadata || {};
    if (meta.referral_code) code = meta.referral_code;
    let subscriptionId = "";
    if (typeof invoice.subscription === "string") subscriptionId = invoice.subscription;
    else if (invoice.subscription && invoice.subscription.id) subscriptionId = invoice.subscription.id;
    let subMeta = {};
    if (subscriptionId && (!code || !meta.userId)) {
      try {
        const sub = await stripeRequest("GET", "/subscriptions/" + encodeURIComponent(subscriptionId));
        subMeta = (sub && sub.metadata) || {};
        if (!code) code = subMeta.referral_code || "";
      } catch (e) {}
    }
    if (!code && invoice.discounts && invoice.discounts.length) {
      try {
        const discountId = invoice.discounts[0];
        const discount =
          typeof discountId === "string"
            ? await stripeRequest("GET", "/discounts/" + encodeURIComponent(discountId))
            : discountId;
        const promo = discount && (discount.promotion_code || (discount.source && discount.source.coupon));
        const promoId = typeof promo === "string" ? promo : promo && promo.id;
        if (promoId && String(promoId).indexOf("promo_") === 0) {
          const promoObj = await stripeRequest("GET", "/promotion_codes/" + encodeURIComponent(promoId));
          code = promoObj.code || (promoObj.metadata && promoObj.metadata.affiliate_code) || "";
        }
      } catch (e) {}
    }
    const affiliate = code ? await getAffiliateByCode(code) : null;
    if (!affiliate) return;
    const extraSafe = extra || {};
    const customerUserId = String(
      extraSafe.buyerUserId || meta.userId || subMeta.userId || ""
    ).trim();
    if (customerUserId && customerUserId === affiliate.user_id) return;
    const amount = Number(invoice.amount_paid != null ? invoice.amount_paid : invoice.total) || 0;
    const discountCents =
      Number(invoice.total_discount_amounts && invoice.total_discount_amounts[0] && invoice.total_discount_amounts[0].amount) ||
      Math.max(0, (Number(invoice.subtotal) || 0) - amount);
    await logConversion({
      affiliateId: affiliate.id,
      customerUserId: customerUserId,
      customerEmail: invoice.customer_email || extraSafe.email || "",
      orderId: (invoice.metadata && invoice.metadata.orderId) || extraSafe.orderId || "",
      subscriptionId: subscriptionId,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId:
        typeof invoice.payment_intent === "string"
          ? invoice.payment_intent
          : invoice.payment_intent && invoice.payment_intent.id,
      amountCents: amount,
      discountCents: discountCents,
      currency: invoice.currency || "eur"
    });
  }

  async function logFromPaymentIntent(intent, extra) {
    if (!intent || (intent.status !== "succeeded" && intent.status !== "processing")) return;
    const extraSafe = extra || {};
    const customerUserId = String(
      extraSafe.buyerUserId || (intent.metadata && intent.metadata.userId) || ""
    ).trim();
    const code = normalizeCode((intent.metadata && intent.metadata.referral_code) || extraSafe.ref || "");
    const affiliate = code ? await getAffiliateByCode(code) : null;
    if (!affiliate) return;
    if (customerUserId && customerUserId === affiliate.user_id) return;
    if (intent.invoice) {
      try {
        const invoice = await stripeRequest("GET", "/invoices/" + encodeURIComponent(intent.invoice));
        await logFromInvoice(invoice, Object.assign({}, extraSafe, { buyerUserId: customerUserId }));
        return;
      } catch (e) {}
    }
    const original = Number((intent.metadata && intent.metadata.original_amount) || intent.amount) || 0;
    const paid = Number(intent.amount) || 0;
    await logConversion({
      affiliateId: affiliate.id,
      customerUserId: customerUserId,
      customerEmail: intent.receipt_email || extraSafe.email || "",
      orderId: (intent.metadata && intent.metadata.orderId) || extraSafe.orderId || "",
      stripePaymentIntentId: intent.id,
      amountCents: paid,
      discountCents: Math.max(0, original - paid),
      currency: intent.currency || "eur"
    });
  }

  async function handleAdminLogin(req, res) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { error: "Sign in with the allowed Discord account." });
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  async function handleAdminLogout(req, res) {
    sendJson(res, 200, { ok: true });
  }

  async function handleAdminList(req, res) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { error: "Admin Discord sign-in required." });
      return;
    }
    const payouts = (await supabaseRest(
      "GET",
      "affiliate_payouts?select=*,affiliates(code,user_id,payout_iban,payout_usdc,payout_paypal)&order=created_at.desc"
    )) || [];
    const names = await displayNamesByUserIds(
      payouts.map(function (row) {
        return row.affiliates && row.affiliates.user_id;
      })
    );
    sendJson(res, 200, {
      payouts: payouts.map(function (row) {
        const aff = row.affiliates || {};
        const userId = aff.user_id || "";
        return {
          id: row.id,
          amount: money(row.amount_cents, row.currency),
          amountCents: row.amount_cents,
          currency: row.currency,
          method: row.method,
          destination: row.destination,
          status: row.status,
          at: row.created_at,
          completedAt: row.completed_at,
          code: aff.code || "",
          userId: userId,
          name: names[String(userId)] || "—"
        };
      })
    });
  }

  async function handleAdminUpdate(req, res) {
    if (!(await isAdmin(req))) {
      sendJson(res, 401, { error: "Admin Discord sign-in required." });
      return;
    }
    const body = await ctx.readJsonBody(req);
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim().toLowerCase();
    if (!id) {
      sendJson(res, 400, { error: "Missing payout." });
      return;
    }
    if (status !== "pending" && status !== "completed") {
      sendJson(res, 400, { error: "Status must be pending or completed." });
      return;
    }
    const patch = {
      status: status,
      completed_at: status === "completed" ? new Date().toISOString() : null
    };
    await restOne("PATCH", "affiliate_payouts?id=eq." + encodeURIComponent(id), patch);
    await handleAdminList(req, res);
  }

  async function handleValidateCoupon(req, res) {
    const body = await ctx.readJsonBody(req);
    const code = normalizeCode(body.code || body.ref);
    if (!validCode(code)) {
      sendJson(res, 400, { ok: false, error: "Enter a valid coupon code." });
      return;
    }
    try {
      const affiliate = await getAffiliateByCode(code);
      if (!affiliate) {
        sendJson(res, 404, { ok: false, error: "That coupon code is not valid." });
        return;
      }
      const user = await authUserFromReq(req);
      if (user && user.id && affiliate.user_id === user.id) {
        sendJson(res, 400, { ok: false, error: "You cannot use your own referral code." });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        code: affiliate.code,
        discountPercent: DISCOUNT_PERCENT
      });
    } catch (err) {
      sendJson(res, err.status || 500, {
        ok: false,
        error: err.message || "Could not check that coupon code."
      });
    }
  }

  return {
    DISCOUNT_PERCENT: DISCOUNT_PERCENT,
    validCode: validCode,
    normalizeCode: normalizeCode,
    resolveReferral: resolveReferral,
    prepareDiscount: prepareDiscount,
    discountAttempts: discountAttempts,
    stripeDiscountParams: stripeDiscountParams,
    logFromInvoice: logFromInvoice,
    logFromPaymentIntent: logFromPaymentIntent,
    handleGetMine: handleGetMine,
    handleSaveMethods: handleSaveMethods,
    handleRequestPayout: handleRequestPayout,
    handleAdminLogin: handleAdminLogin,
    handleAdminLogout: handleAdminLogout,
    handleAdminList: handleAdminList,
    handleAdminUpdate: handleAdminUpdate,
    handleValidateCoupon: handleValidateCoupon,
    isAdmin: isAdmin,
    getAffiliateByCode: getAffiliateByCode,
    ensureAffiliateCoupon: ensureAffiliateCoupon
  };
};
