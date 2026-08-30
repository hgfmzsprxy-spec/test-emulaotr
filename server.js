const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;

function staticRoots() {
  const roots = [ROOT, path.join(ROOT, "public")];
  if (process.env.VERCEL) {
    roots.push(path.join(ROOT, ".."));
    roots.push(path.join(ROOT, "..", "public"));
  }
  const seen = new Set();
  return roots.filter(function (dir) {
    const key = path.resolve(dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findExistingFile(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  if (!rel) return null;

  const roots = staticRoots();
  for (let i = 0; i < roots.length; i++) {
    const candidate = path.normalize(path.join(roots[i], rel));
    if (!candidate.startsWith(path.resolve(roots[i]))) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  const fileName = path.basename(rel);
  const parentRel = path.dirname(rel);
  const alias = aliasName(fileName);
  if (alias !== fileName) {
  for (let i = 0; i < roots.length; i++) {
      const aliasPath = path.normalize(path.join(roots[i], parentRel, alias));
      if (!aliasPath.startsWith(path.resolve(roots[i]))) continue;
      if (fs.existsSync(aliasPath) && fs.statSync(aliasPath).isFile()) return aliasPath;
    }
  }

  for (let i = 0; i < roots.length; i++) {
    const dir = path.normalize(path.join(roots[i], parentRel));
    if (!dir.startsWith(path.resolve(roots[i])) || !fs.existsSync(dir)) continue;
    const prefix = fileName.split(".")[0];
    const matches = fs.readdirSync(dir).filter(function (name) {
      return name === fileName || name.indexOf(prefix + "@v=") === 0;
    });
    if (matches.length) return path.join(dir, matches[0]);
  }

  return null;
}

function aliasName(name) {
  return String(name || "")
    .replace(/\.css@v=[^@]+\.css$/i, ".css")
    .replace(/\.js@v=[^@]+\.js$/i, ".js")
    .replace(/\.css@v=[^@]+$/i, ".css")
    .replace(/\.js@v=[^@]+$/i, ".js");
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const createAffiliateApi = require("./affiliates-api");

const PORT = Number(process.env.PORT || 3000);
const SITE_URL = String(process.env.SITE_URL || "https://scriptengine.gg").replace(/\/+$/, "");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg"
};

const PRICE_BY_PLAN = {
  month: process.env.STRIPE_PRICE_MONTH,
  "3months": process.env.STRIPE_PRICE_3MONTHS,
  year: process.env.STRIPE_PRICE_YEAR
};

const PLAN_CATALOG = {
  month: {
    duration: "Monthly · 30 days",
    price: "€24.99",
    label: "Monthly",
    days: 30,
    cadence: "Billed every month"
  },
  "3months": {
    duration: "3 Months · 90 days",
    price: "€39.99",
    label: "3 Months",
    days: 90,
    cadence: "Billed every 3 months"
  },
  year: {
    duration: "Yearly · 365 days",
    price: "€79.99",
    label: "Yearly",
    days: 365,
    cadence: "Billed once a year"
  }
};

function injectAuthBoot(html) {
  html = html.replace(/<style id="gc-auth-boot-css">[\s\S]*?<\/style>\s*/i, "");
  html = html.replace(/<script id="gc-auth-boot">[\s\S]*?<\/script>\s*/i, "");
  html = html.replace(/<link[^>]+href="\/css\/auth-boot\.css"[^>]*>\s*/i, "");
  html = html.replace(/<script src="\/js\/auth-boot\.js"><\/script>\s*/i, "");
  let css = "";
  let js = "";
  try {
    css = fs.readFileSync(path.join(ROOT, "css", "auth-boot.css"), "utf8");
    js = fs.readFileSync(path.join(ROOT, "js", "auth-boot.js"), "utf8");
  } catch (err) {
    return html;
  }
  const snippet =
    '<style id="gc-auth-boot-css">' +
    css +
    "</style>\n" +
    '<script id="gc-auth-boot">' +
    js +
    "</script>\n";
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, snippet + "</head>");
  }
  return snippet + html;
}

function injectSmartNav(data) {
  const source = Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
  let html = source.replace(/<style id="gc-smart-nav-boot">[\s\S]*?<\/script>\s*/i, "");
  html = html.replace(/<script id="gc-smart-nav-inline">[\s\S]*?<\/script>\s*/i, "");
  html = injectAuthBoot(html);
  if (html.indexOf("/js/ref-track.js") < 0) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, '<script src="/js/ref-track.js"></script>\n</head>');
    } else {
      html = '<script src="/js/ref-track.js"></script>\n' + html;
    }
  }
  if (html.indexOf("/js/smart-nav.js") < 0) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, '<script src="/js/smart-nav.js" defer></script>\n</body>');
    } else {
      html += '<script src="/js/smart-nav.js" defer></script>';
    }
  }
  return Buffer.from(html, "utf8");
}

const ORDER_TTL_MS = (9 * 60 + 59) * 1000;
const ORDERS_FILE = path.join(ROOT, "data", "orders.json");
const orders = new Map();

function loadOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return;
    const rows = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    if (!Array.isArray(rows)) return;
    rows.forEach(function (order) {
      if (!order || !order.id) return;
      if (order.paid) {
        order.expiresAt = null;
      } else if (!order.expiresAt) {
        order.expiresAt = (order.createdAt || Date.now()) + ORDER_TTL_MS;
      }
      orders.set(String(order.id), order);
    });
  } catch (err) {
    console.error("Could not load saved orders:", err.message);
  }
}

function saveOrders() {
  try {
    const dir = path.dirname(ORDERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = [];
    orders.forEach(function (order) {
      rows.push(order);
    });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(rows));
  } catch (err) {
    console.error("Could not save orders:", err.message);
  }
}

function isOrderExpired(order) {
  if (!order || order.paid || order.error) return false;
  return !!(order.expiresAt && order.expiresAt <= Date.now());
}

function pruneOrders() {}

function getOrder(id) {
  const key = String(id || "");
  return orders.get(key) || null;
}

loadOrders();

const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEVICES_FILE = path.join(ROOT, "data", "devices.json");
const devicesByUser = new Map();
const geoCache = new Map();

function loadDevices() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) return;
    const rows = JSON.parse(fs.readFileSync(DEVICES_FILE, "utf8"));
    if (!rows || typeof rows !== "object") return;
    Object.keys(rows).forEach(function (userId) {
      if (Array.isArray(rows[userId])) devicesByUser.set(userId, rows[userId]);
    });
  } catch (err) {
    console.error("Could not load saved devices:", err.message);
  }
}

function saveDevices() {
  try {
    const dir = path.dirname(DEVICES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = {};
    devicesByUser.forEach(function (list, userId) {
      rows[userId] = list;
    });
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(rows));
  } catch (err) {
    console.error("Could not save devices:", err.message);
  }
}

loadDevices();

const BILLING_FILE = path.join(ROOT, "data", "billing.json");
const billingByUser = new Map();

function loadBilling() {
  try {
    if (!fs.existsSync(BILLING_FILE)) return;
    const rows = JSON.parse(fs.readFileSync(BILLING_FILE, "utf8"));
    if (!rows || typeof rows !== "object") return;
    Object.keys(rows).forEach(function (userId) {
      if (rows[userId]) billingByUser.set(userId, rows[userId]);
    });
  } catch (err) {
    console.error("Could not load saved billing:", err.message);
  }
}

function saveBilling() {
  try {
    const dir = path.dirname(BILLING_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = {};
    billingByUser.forEach(function (row, userId) {
      rows[userId] = row;
    });
    fs.writeFileSync(BILLING_FILE, JSON.stringify(rows));
  } catch (err) {
    console.error("Could not save billing:", err.message);
  }
}

function upsertBilling(userId, patch) {
  const id = String(userId || "");
  if (!id) return null;
  const row = billingByUser.get(id) || { userId: id };
  Object.keys(patch || {}).forEach(function (key) {
    if (patch[key] !== undefined) row[key] = patch[key];
  });
  billingByUser.set(id, row);
  saveBilling();
  return row;
}

function planFromPriceId(priceId) {
  const id = String(priceId || "");
  const keys = Object.keys(PRICE_BY_PLAN);
  for (var i = 0; i < keys.length; i++) {
    if (PRICE_BY_PLAN[keys[i]] && PRICE_BY_PLAN[keys[i]] === id) return keys[i];
  }
  return "";
}

function priceIdFromSubscription(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  if (!item) return "";
  if (typeof item.price === "string") return item.price;
  return (item.price && item.price.id) || "";
}

function catalogPlans() {
  return Object.keys(PLAN_CATALOG).map(function (id) {
    const row = PLAN_CATALOG[id];
    return {
      id: id,
      label: row.label,
      duration: row.duration,
      price: row.price,
      days: row.days,
      cadence: row.cadence
    };
  });
}

loadBilling();

function nextOrderId() {
  var id = "";
  for (var i = 0; i < 12; i++) {
    id = String(crypto.randomInt(0, 10000000)).padStart(7, "0");
    if (id !== "0000000" && !orders.has(id)) return id;
  }
  return id;
}

function createOrder(plan) {
  pruneOrders();
  if (!PLAN_CATALOG[plan] || !PRICE_BY_PLAN[plan]) return null;
  var id = nextOrderId();
  const now = Date.now();
  orders.set(id, {
    id: id,
    plan: plan,
    createdAt: now,
    expiresAt: now + ORDER_TTL_MS
  });
  saveOrders();
  return id;
}

function markOrderPaid(id, extra) {
  const key = String(id || "");
  if (!/^\d{7}$/.test(key)) return null;
  var order = orders.get(key);
  if (!order) {
    var plan = extra && extra.plan;
    if (!PLAN_CATALOG[plan]) plan = "month";
    order = {
      id: key,
      plan: plan,
      createdAt: Date.now()
    };
    orders.set(key, order);
  }
  order.paid = true;
  order.paidAt = Date.now();
  order.expiresAt = null;
  if (extra && extra.paymentIntentId) order.paymentIntentId = extra.paymentIntentId;
  if (extra && extra.email) order.email = extra.email;
  if (extra && extra.userId) order.userId = extra.userId;
  if (extra && extra.plan && PLAN_CATALOG[extra.plan]) order.plan = extra.plan;
  if (extra && extra.dueCents != null) order.dueCents = Number(extra.dueCents) || 0;
  if (extra && extra.discountPercent != null) order.discountPercent = Number(extra.discountPercent) || 0;
  if (extra && extra.referralCode) order.referralCode = extra.referralCode;
  saveOrders();
  return order;
}

async function handleGetOrder(req, res, id) {
  const order = getOrder(id);
  if (!order) {
    sendJson(res, 404, { error: "Order not found." });
    return;
  }
  const user = await authUserFromReq(req);
  if (user && user.id && !order.paid) {
    order.userId = user.id;
    if (user.email) order.email = user.email;
    saveOrders();
  }
  const catalog = PLAN_CATALOG[order.plan] || { duration: order.plan || "", price: "" };
  sendJson(res, 200, {
    id: order.id,
    plan: order.plan,
    duration: catalog.duration,
    price: catalog.price,
    expiresAt: order.expiresAt || null,
    expired: isOrderExpired(order),
    paid: !!order.paid,
    paidAt: order.paidAt || null,
    failed: !!order.error,
    referralCleared: !!order.referralCleared
  });
}

function handleGetInvoice(res, id) {
  const order = getOrder(id);
  if (!order || (!order.paid && !order.error)) {
    sendJson(res, 404, { error: "Invoice not found." });
    return;
  }
  const catalog = PLAN_CATALOG[order.plan] || PLAN_CATALOG.month;
  sendJson(res, 200, {
    id: order.id,
    plan: order.plan,
    duration: catalog.duration,
    price: formatEur(orderDueCents(order)),
    listPrice: catalog.price,
    discountPercent: Number(order.discountPercent) || 0,
    paid: !!order.paid,
    failed: !!order.error,
    paidAt: order.paidAt || null,
    failedAt: order.failedAt || null,
    email: order.email || ""
  });
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    const err = new Error("Supabase is not configured.");
    err.status = 500;
    throw err;
  }
  return { url: url, key: key };
}

async function supabaseRest(method, pathWithQuery, body) {
  const cfg = supabaseConfig();
  const headers = {
    apikey: cfg.key,
    Authorization: "Bearer " + cfg.key,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const res = await fetch(cfg.url + "/rest/v1/" + pathWithQuery, {
    method: method,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    const message =
      (json && (json.message || json.hint || json.error)) ||
      text ||
      "Supabase error";
    const err = new Error(message);
    err.status = res.status >= 400 ? res.status : 500;
    err.code = json && json.code;
    throw err;
  }
  return json;
}

async function authUserFromReq(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !anon) return null;
  try {
    const res = await fetch(url + "/auth/v1/user", {
      headers: {
        apikey: anon,
        Authorization: "Bearer " + token
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function publicReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    rating: row.rating,
    body: row.body,
    title: row.title || "",
    author_name: row.author_name || "user",
    product: row.product || "Script Engine",
    game: row.game || "",
    helpful_count: row.helpful_count || 0,
    recommended: row.recommended !== false,
    published: row.published !== false
  };
}

function displayNameFromUser(user, fallbackEmail) {
  const meta = (user && (user.user_metadata || user.raw_user_meta_data)) || {};
  const claims = meta.custom_claims && typeof meta.custom_claims === "object" ? meta.custom_claims : {};
  const keys = [
    "display_name",
    "global_name",
    "username",
    "full_name",
    "name",
    "preferred_username",
    "user_name"
  ];
  const claimed = String(claims.global_name || "").trim();
  if (claimed) return claimed.slice(0, 80);
  for (var i = 0; i < keys.length; i++) {
    const value = String(meta[keys[i]] || "").trim();
    if (value) return value.slice(0, 80);
  }
  const email = String((user && user.email) || fallbackEmail || "").trim();
  if (email.indexOf("@") > 0) return email.slice(0, email.indexOf("@")).slice(0, 80);
  return "user";
}

function parseDisplayName(raw) {
  const name = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (name.length < 2) return { error: "Enter a display name." };
  if (name.length > 32) return { error: "Keep it under 32 characters." };
  const nameKey = name.toLowerCase();
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (slug.length < 2) return { error: "Display name must include letters or numbers." };
  return { name: name, nameKey: nameKey, slug: slug };
}

function isMissingProfilesTable(err) {
  const msg = String((err && err.message) || "");
  return (
    (err && err.code === "42P01") ||
    /could not find the table/i.test(msg) ||
    /relation ["']?profiles["']? does not exist/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

async function findConflictingProfile(parsed, exceptUserId) {
  const byKey = await supabaseRest(
    "GET",
    "profiles?name_key=eq." + encodeURIComponent(parsed.nameKey) + "&select=user_id&limit=1"
  );
  if (byKey && byKey[0] && byKey[0].user_id !== exceptUserId) return byKey[0];
  const bySlug = await supabaseRest(
    "GET",
    "profiles?slug=eq." + encodeURIComponent(parsed.slug) + "&select=user_id&limit=1"
  );
  if (bySlug && bySlug[0] && bySlug[0].user_id !== exceptUserId) return bySlug[0];
  return null;
}

async function upsertProfile(userId, parsed) {
  const existing = await supabaseRest(
    "GET",
    "profiles?user_id=eq." + encodeURIComponent(userId) + "&select=user_id&limit=1"
  );
  const row = {
    display_name: parsed.name,
    name_key: parsed.nameKey,
    slug: parsed.slug,
    updated_at: new Date().toISOString()
  };
  if (existing && existing[0]) {
    await supabaseRest("PATCH", "profiles?user_id=eq." + encodeURIComponent(userId), row);
    return;
  }
  await supabaseRest(
    "POST",
    "profiles",
    Object.assign({ user_id: userId, created_at: new Date().toISOString() }, row)
  );
}

async function handleDisplayNameAvailable(req, res) {
  const body = await readJsonBody(req);
  const parsed = parseDisplayName(body.name || body.display_name || body.username);
  if (parsed.error) {
    sendJson(res, 400, { available: false, error: parsed.error });
    return;
  }
  const user = await authUserFromReq(req);
  try {
    const conflict = await findConflictingProfile(parsed, user && user.id);
    if (conflict) {
      sendJson(res, 200, { available: false, error: "That display name is already taken." });
      return;
    }
    sendJson(res, 200, { available: true, name: parsed.name });
  } catch (err) {
    if (isMissingProfilesTable(err)) {
      sendJson(res, 500, {
        available: false,
        error: "Run sql/profiles.sql in Supabase first."
      });
      return;
    }
    throw err;
  }
}

async function handleSaveDisplayName(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to change your display name." });
    return;
  }
  const body = await readJsonBody(req);
  const parsed = parseDisplayName(body.name || body.display_name || body.username);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  try {
    const conflict = await findConflictingProfile(parsed, user.id);
    if (conflict) {
      sendJson(res, 409, { error: "That display name is already taken." });
      return;
    }
    await upsertProfile(user.id, parsed);
    sendJson(res, 200, { ok: true, name: parsed.name });
  } catch (err) {
    if (isMissingProfilesTable(err)) {
      sendJson(res, 500, { error: "Run sql/profiles.sql in Supabase first." });
      return;
    }
    if (err.code === "23505" || /duplicate|unique|already taken/i.test(String(err.message || ""))) {
      sendJson(res, 409, { error: "That display name is already taken." });
      return;
    }
    throw err;
  }
}

async function handleListReviews(req, res, url) {
  const orderId = String(url.searchParams.get("orderId") || url.searchParams.get("order_id") || "").trim();
  if (orderId) {
    if (!/^\d{7}$/.test(orderId)) {
      sendJson(res, 400, { error: "Invalid order." });
      return;
    }
    const order = getOrder(orderId);
    if (!order || !order.paid) {
      sendJson(res, 404, { error: "Invoice not found." });
      return;
    }
    const rows = await supabaseRest(
      "GET",
      "reviews?order_id=eq." + encodeURIComponent(orderId) + "&select=*&limit=1"
    );
    sendJson(res, 200, { review: publicReview(rows && rows[0]) });
    return;
  }
  const rows = await supabaseRest(
    "GET",
    "reviews?published=eq.true&select=id,created_at,rating,body,title,author_name,product,game,helpful_count,recommended,published&order=created_at.desc"
  );
  sendJson(res, 200, { reviews: (rows || []).map(publicReview) });
}

async function handleCreateReview(req, res) {
  const body = await readJsonBody(req);
  const orderId = String(body.orderId || body.order_id || "").trim();
  const rating = Number(body.rating);
  const text = String(body.body || "").trim();
  const title = String(body.title || "").trim().slice(0, 120);
  if (!/^\d{7}$/.test(orderId)) {
    sendJson(res, 400, { error: "Invalid order." });
    return;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    sendJson(res, 400, { error: "Pick a rating from 1 to 5 stars." });
    return;
  }
  if (text.length < 3) {
    sendJson(res, 400, { error: "Write a short review before confirming." });
    return;
  }
  if (text.length > 5000) {
    sendJson(res, 400, { error: "Review is too long." });
    return;
  }
  const order = getOrder(orderId);
  if (!order || !order.paid) {
    sendJson(res, 403, { error: "Invoice not found." });
    return;
  }
  const user = await authUserFromReq(req);
  const row = {
    order_id: orderId,
    user_id: (user && user.id) || null,
    rating: rating,
    body: text,
    title: title || null,
    product: "Script Engine",
    game: String(body.game || "").trim().slice(0, 80) || null,
    author_name: displayNameFromUser(user, order.email),
    recommended: rating >= 4,
    published: true,
    helpful_count: 0
  };
  try {
    const inserted = await supabaseRest("POST", "reviews", row);
    sendJson(res, 201, { review: publicReview(inserted && inserted[0]) });
  } catch (err) {
    if (err.code === "23505") {
      sendJson(res, 409, { error: "You already reviewed this order." });
      return;
    }
    throw err;
  }
}

async function handleDeleteReview(req, res, url) {
  const orderId = String(url.searchParams.get("orderId") || url.searchParams.get("order_id") || "").trim();
  if (!/^\d{7}$/.test(orderId)) {
    sendJson(res, 400, { error: "Invalid order." });
    return;
  }
  const order = getOrder(orderId);
  if (!order || !order.paid) {
    sendJson(res, 403, { error: "Invoice not found." });
    return;
  }
  await supabaseRest("DELETE", "reviews?order_id=eq." + encodeURIComponent(orderId));
  sendJson(res, 200, { ok: true });
}

async function handleReviewHelpful(res, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    sendJson(res, 400, { error: "Invalid review." });
    return;
  }
  const rows = await supabaseRest(
    "GET",
    "reviews?id=eq." + encodeURIComponent(id) + "&select=id,helpful_count&limit=1"
  );
  const current = rows && rows[0];
  if (!current) {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }
  const next = (Number(current.helpful_count) || 0) + 1;
  const updated = await supabaseRest(
    "PATCH",
    "reviews?id=eq." + encodeURIComponent(id),
    { helpful_count: next }
  );
  sendJson(res, 200, { ok: true, helpful_count: next, review: publicReview(updated && updated[0]) });
}

function planListCents(plan) {
  if (plan === "year") return 7999;
  if (plan === "3months") return 3999;
  return 2499;
}

function formatEur(cents) {
  return "€" + (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
}

function discountCents(cents, percent) {
  const pct = Number(percent) || 0;
  const amount = Math.max(0, Number(cents) || 0);
  if (pct <= 0) return amount;
  return Math.max(50, Math.round(amount * (100 - pct) / 100));
}

function referralFromSubAndOrders(sub, user) {
  var code = String((sub && sub.metadata && sub.metadata.referral_code) || "").trim();
  var pct = 0;
  var coupon = sub && sub.discount && sub.discount.coupon;
  if (!coupon && sub && Array.isArray(sub.discounts) && sub.discounts[0]) {
    var row = sub.discounts[0];
    coupon = row.coupon || (row.discount && row.discount.coupon) || null;
  }
  if (coupon) pct = Number(coupon.percent_off) || 0;
  if (user && user.id) {
    var stored = billingByUser.get(user.id);
    if (!code && stored && stored.referralCode) code = String(stored.referralCode).trim();
  }
  if (user) {
    var list = paidOrdersForUser(user);
    for (var i = 0; i < list.length; i++) {
      var order = list[i];
      if (!order.referralCode && !Number(order.discountPercent)) continue;
      if (sub && order.subscriptionId && String(order.subscriptionId) !== String(sub.id)) continue;
      if (!code) code = String(order.referralCode || "").trim();
      if (!pct) pct = Number(order.discountPercent) || 0;
      if (code || pct) break;
    }
  }
  if (code && !pct) pct = affiliateApi.DISCOUNT_PERCENT;
  return {
    referralCode: code,
    discountPercent: pct || 0
  };
}

function couponIdFromSub(sub) {
  var coupon = sub && sub.discount && sub.discount.coupon;
  if (!coupon && sub && Array.isArray(sub.discounts) && sub.discounts[0]) {
    var row = sub.discounts[0];
    coupon = row.coupon || (row.discount && row.discount.coupon) || null;
  }
  if (!coupon) return "";
  return typeof coupon === "string" ? coupon : String(coupon.id || "");
}

async function couponIdForCode(code) {
  const normalized = affiliateApi.normalizeCode(code);
  if (!normalized) return "";
  try {
    const affiliate = await affiliateApi.getAffiliateByCode(normalized);
    if (affiliate) {
      const ids = await affiliateApi.prepareDiscount(affiliate);
      if (ids && ids.couponId) return ids.couponId;
    }
  } catch (err) {}
  try {
    return await affiliateApi.ensureAffiliateCoupon();
  } catch (err) {
    return "";
  }
}

async function ensureSubscriptionReferral(sub, user, explicitCode) {
  if (!sub || !sub.id) return sub;
  if (scheduleIdFromSub(sub)) return sub;
  var stored = user && user.id ? billingByUser.get(user.id) : null;
  var code = String(explicitCode || "").trim();
  if (!code) code = String((sub.metadata && sub.metadata.referral_code) || "").trim();
  if (!code && stored && stored.referralCode) code = String(stored.referralCode).trim();
  if (!code && user) code = referralFromSubAndOrders(sub, user).referralCode || "";
  code = affiliateApi.normalizeCode(code);
  if (!code) return sub;
  if (user && user.id) upsertBilling(user.id, { referralCode: code });
  var metaCode = affiliateApi.normalizeCode((sub.metadata && sub.metadata.referral_code) || "");
  var needMeta = metaCode !== code;
  var needDiscount = !couponIdFromSub(sub);
  if (!needMeta && !needDiscount) return sub;
  var params = {
    "expand[]": ["items.data.price", "default_payment_method", "schedule", "discount"]
  };
  if (needMeta) params["metadata[referral_code]"] = code;
  if (needDiscount) {
    var couponId = await couponIdForCode(code);
    if (couponId) params["discounts[0][coupon]"] = couponId;
    else needDiscount = false;
  }
  if (!needMeta && !needDiscount) return sub;
  try {
    return await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(sub.id), params);
  } catch (err) {
    if (needDiscount && params["discounts[0][coupon]"]) {
      try {
        var fallback = Object.assign({}, params);
        fallback.coupon = fallback["discounts[0][coupon]"];
        delete fallback["discounts[0][coupon]"];
        return await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(sub.id), fallback);
      } catch (err2) {
        console.error("Could not persist referral discount:", err2.message);
      }
    } else {
      console.error("Could not persist referral on subscription:", err.message);
    }
    return sub;
  }
}

function withReferralPricing(payload, planId, sub, user) {
  const ref = referralFromSubAndOrders(sub, user);
  payload.referralCode = ref.referralCode || "";
  payload.discountPercent = ref.discountPercent || 0;
  payload.discountedPrice = "";
  if (ref.discountPercent) {
    payload.discountedPrice = formatEur(discountCents(planListCents(planId), ref.discountPercent));
    if (payload.pendingPlan && payload.pendingPlan.id) {
      payload.pendingPlan.discountedPrice = formatEur(
        discountCents(planListCents(payload.pendingPlan.id), ref.discountPercent)
      );
    }
    if (Array.isArray(payload.plans)) {
      payload.plans = payload.plans.map(function (plan) {
        if (plan.id !== payload.plan) return plan;
        return Object.assign({}, plan, {
          discountedPrice: formatEur(discountCents(planListCents(plan.id), ref.discountPercent))
        });
      });
    }
  }
  return payload;
}

function orderDueCents(order) {
  if (!order) return 0;
  if (order.dueCents != null && Number(order.dueCents) > 0) return Number(order.dueCents);
  const pct = Number(order.discountPercent) || 0;
  const list = planListCents(order.plan);
  if (pct > 0) return Math.max(50, Math.round(list * (100 - pct) / 100));
  return list;
}

function publicOrder(order) {
  const catalog = PLAN_CATALOG[order.plan] || { duration: order.plan || "", price: "" };
  const expired = isOrderExpired(order);
  const pct = Number(order.discountPercent) || 0;
  return {
    id: order.id,
    plan: order.plan,
    duration: catalog.duration,
    price: formatEur(orderDueCents(order)),
    listPrice: catalog.price,
    discountPercent: pct,
    product: "Script Engine",
    paid: !!order.paid,
    failed: !!order.error,
    expired: expired,
    paidAt: order.paidAt || null,
    failedAt: order.failedAt || null,
    createdAt: order.createdAt || null,
    expiresAt: order.expiresAt || null
  };
}

async function handleAccountOrders(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to view your account." });
    return;
  }
  pruneOrders();
  const email = String(user.email || "").trim().toLowerCase();
  const list = [];
  orders.forEach(function (order) {
    const matchUser = order.userId && order.userId === user.id;
    const matchEmail = email && String(order.email || "").trim().toLowerCase() === email;
    if (matchUser || matchEmail) list.push(publicOrder(order));
  });
  list.sort(function (a, b) {
    return (b.paidAt || b.failedAt || b.createdAt || 0) - (a.paidAt || a.failedAt || a.createdAt || 0);
  });
  sendJson(res, 200, { orders: list });
}

async function handleCancelAccountOrder(req, res, url) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to manage your orders." });
    return;
  }
  const id = String(url.searchParams.get("id") || "").replace(/\D/g, "");
  const order = getOrder(id);
  if (!order) {
    sendJson(res, 404, { error: "Order not found." });
    return;
  }
  if (order.paid || order.error) {
    sendJson(res, 409, { error: "This invoice cannot be cancelled." });
    return;
  }
  const email = String(user.email || "").trim().toLowerCase();
  const matchUser = order.userId && order.userId === user.id;
  const matchEmail = email && String(order.email || "").trim().toLowerCase() === email;
  if (!matchUser && !matchEmail) {
    sendJson(res, 403, { error: "That order does not belong to this account." });
    return;
  }
  orders.delete(String(order.id));
  saveOrders();
  sendJson(res, 200, { ok: true });
}

function bearerToken(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return {};
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (e) {
    return {};
  }
}

function normalizeIp(value) {
  var ip = String(value || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/i, "");
  if (ip.indexOf(",") !== -1) ip = ip.split(",")[0].trim();
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") ip = "127.0.0.1";
  return ip;
}

function looksLikeIp(ip) {
  const n = String(ip || "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(n)) return true;
  if (n.indexOf(":") !== -1 && /^[0-9a-f:]+$/i.test(n)) return true;
  return false;
}

function clientIp(req) {
  const reported = normalizeIp(req.headers["x-device-ip"]);
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-real-ip"],
    String(req.headers["x-forwarded-for"] || "").split(",")[0],
    req.socket && req.socket.remoteAddress
  ];
  var fallback = "";
  for (var i = 0; i < candidates.length; i++) {
    const ip = normalizeIp(candidates[i]);
    if (!looksLikeIp(ip)) continue;
    if (!fallback) fallback = ip;
    if (!isPrivateIp(ip)) return ip;
  }
  if (looksLikeIp(reported) && !isPrivateIp(reported)) return reported;
  return fallback || reported || "";
}

function isPrivateIp(ip) {
  const n = String(ip || "");
  return (
    !n ||
    n === "127.0.0.1" ||
    n === "::1" ||
    n === "localhost" ||
    n.startsWith("10.") ||
    n.startsWith("192.168.") ||
    n.startsWith("172.16.") ||
    n.startsWith("172.17.") ||
    n.startsWith("172.18.") ||
    n.startsWith("172.19.") ||
    n.startsWith("172.2") ||
    n.startsWith("172.30.") ||
    n.startsWith("172.31.")
  );
}

function parseUserAgent(ua) {
  const text = String(ua || "");
  var os = "Unknown";
  if (/Windows NT/i.test(text)) os = "Windows";
  else if (/Android/i.test(text)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(text)) os = "iOS";
  else if (/Mac OS X/i.test(text)) os = "macOS";
  else if (/CrOS/i.test(text)) os = "Chrome OS";
  else if (/Linux/i.test(text)) os = "Linux";

  var browser = "Unknown";
  var match;
  if ((match = text.match(/Edg(?:e|A|iOS)?\/([\d.]+)/i))) browser = "Edge " + match[1];
  else if ((match = text.match(/OPR\/([\d.]+)/i))) browser = "Opera " + match[1];
  else if ((match = text.match(/Firefox\/([\d.]+)/i))) browser = "Firefox " + match[1];
  else if ((match = text.match(/Chrome\/([\d.]+)/i)) && !/Chromium/i.test(text)) browser = "Chrome " + match[1];
  else if ((match = text.match(/Version\/([\d.]+).*Safari/i))) browser = "Safari " + match[1];
  else if (/Safari/i.test(text)) browser = "Safari";

  var kind = "PC";
  if (/iPad|Tablet/i.test(text)) kind = "Tablet";
  else if (/Mobi|Android/i.test(text)) kind = "Mobile";

  return { os: os, browser: browser, kind: kind };
}

function loginProviderFromUser(user, payload) {
  const amr = payload && payload.amr;
  if (Array.isArray(amr)) {
    for (var i = 0; i < amr.length; i++) {
      const method = String((amr[i] && (amr[i].method || amr[i].provider)) || "").toLowerCase();
      if (method === "google" || method === "oauth" && String(amr[i].provider || "").toLowerCase() === "google") {
        return "Google";
      }
      if (method === "discord") return "Discord";
      if (method === "password" || method === "email") return "Email";
    }
  }
  const app = (payload && payload.app_metadata) || (user && user.app_metadata) || {};
  const provider = String(app.provider || "").toLowerCase();
  if (provider === "google") return "Google";
  if (provider === "discord") return "Discord";
  if (provider === "email") return "Email";
  const identities = (user && user.identities) || [];
  if (identities.length === 1) {
    const p = String(identities[0].provider || "").toLowerCase();
    if (p === "google") return "Google";
    if (p === "discord") return "Discord";
    if (p === "email") return "Email";
  }
  return "Email";
}

async function lookupLocation(ip) {
  if (isPrivateIp(ip)) return "Local network";
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.label;
  try {
    const res = await fetch(
      "http://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,country,regionName,city",
      { signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined }
    );
    const json = await res.json();
    if (json && json.status === "success") {
      const parts = [json.city, json.regionName, json.country].filter(Boolean);
      const label = parts.join(", ") || ip;
      geoCache.set(ip, { label: label, at: Date.now() });
      return label;
    }
  } catch (e) {}
  geoCache.set(ip, { label: "", at: Date.now() });
  return "";
}

async function supabaseAuthAdmin(method, authPath) {
  const cfg = supabaseConfig();
  const res = await fetch(cfg.url + "/auth/v1" + authPath, {
    method: method,
    headers: {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key
    }
  });
  const text = await res.text();
  var json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { ok: res.ok, status: res.status, json: json, text: text };
}

function userDevices(userId) {
  var list = devicesByUser.get(userId);
  if (!Array.isArray(list)) {
    list = [];
    devicesByUser.set(userId, list);
  }
  return list;
}

function pruneUserDevices(userId) {
  const cutoff = Date.now() - DEVICE_TTL_MS;
  const next = userDevices(userId).filter(function (row) {
    return (row.lastSeenAt || row.createdAt || 0) >= cutoff;
  });
  devicesByUser.set(userId, next);
  return next;
}

function upsertDevice(userId, patch) {
  const list = pruneUserDevices(userId);
  var row = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === patch.id) {
      row = list[i];
      break;
    }
  }
  if (!row) {
    row = {
      id: patch.id,
      createdAt: Date.now()
    };
    list.unshift(row);
  }
  Object.keys(patch).forEach(function (key) {
    if (key === "touch") return;
    if (patch[key] !== undefined && patch[key] !== "") row[key] = patch[key];
  });
  if (patch.touch !== false) row.lastSeenAt = Date.now();
  else if (patch.lastSeenAt) row.lastSeenAt = patch.lastSeenAt;
  saveDevices();
  return row;
}

function publicDevice(row, currentId) {
  const parsed = parseUserAgent(row.userAgent);
  return {
    id: row.id,
    os: row.os || parsed.os,
    browser: row.browser || parsed.browser,
    kind: row.kind || parsed.kind,
    ip: row.ip || "",
    location: row.location || "",
    provider: row.provider || "Email",
    current: row.id === currentId,
    createdAt: row.createdAt || null,
    lastSeenAt: row.lastSeenAt || row.createdAt || null
  };
}

function collapseDevicesByIp(devices) {
  const seen = {};
  return (devices || []).filter(function (row) {
    const ip = normalizeIp(row.ip || "");
    if (!ip) return true;
    if (seen[ip]) return false;
    seen[ip] = true;
    return true;
  });
}

async function listAuthSessions(userId) {
  try {
    const result = await supabaseAuthAdmin("GET", "/admin/users/" + encodeURIComponent(userId) + "/sessions");
    if (!result.ok) return [];
    if (Array.isArray(result.json)) return result.json;
    if (result.json && Array.isArray(result.json.sessions)) return result.json.sessions;
    return [];
  } catch (e) {
    return [];
  }
}

async function revokeAuthSession(userId, sessionId) {
  try {
    const result = await supabaseAuthAdmin(
      "DELETE",
      "/admin/users/" + encodeURIComponent(userId) + "/sessions/" + encodeURIComponent(sessionId)
    );
    return result.ok || result.status === 404;
  } catch (e) {
    return false;
  }
}

async function revokeAllAuthSessions(userId) {
  try {
    const result = await supabaseAuthAdmin("DELETE", "/admin/users/" + encodeURIComponent(userId) + "/sessions");
    return result.ok || result.status === 404;
  } catch (e) {
    return false;
  }
}

async function handleAccountDevices(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to view your account." });
    return;
  }
  const token = bearerToken(req);
  const payload = decodeJwtPayload(token);
  const currentId = String(payload.session_id || payload.sessionId || "").trim() || crypto.createHash("sha256").update(token.slice(-24)).digest("hex").slice(0, 16);
  const ip = clientIp(req);
  const ua = String(req.headers["user-agent"] || "");
  const parsed = parseUserAgent(ua);
  const location = await lookupLocation(ip);
  upsertDevice(user.id, {
    id: currentId,
    ip: ip,
    userAgent: ua,
    os: parsed.os,
    browser: parsed.browser,
    kind: parsed.kind,
    location: location,
    provider: loginProviderFromUser(user, payload)
  });

  const remote = await listAuthSessions(user.id);
  remote.forEach(function (session) {
    const id = String((session && (session.id || session.session_id)) || "").trim();
    if (!id) return;
    const sessionUa = session.user_agent || session.userAgent || "";
    const sessionIp = normalizeIp(session.ip || session.ip_address || "");
    const parsedRemote = parseUserAgent(sessionUa);
    const existing = userDevices(user.id).filter(function (row) {
      return row.id === id;
    })[0];
    const nextIp = looksLikeIp(sessionIp) && !isPrivateIp(sessionIp) ? sessionIp : (existing && existing.ip) || sessionIp;
    upsertDevice(user.id, {
      id: id,
      ip: nextIp || (existing && existing.ip) || "",
      userAgent: sessionUa || (existing && existing.userAgent) || "",
      os: parsedRemote.os !== "Unknown" ? parsedRemote.os : existing && existing.os,
      browser: parsedRemote.browser !== "Unknown" ? parsedRemote.browser : existing && existing.browser,
      kind: parsedRemote.kind || (existing && existing.kind),
      createdAt: session.created_at ? Date.parse(session.created_at) : undefined,
      lastSeenAt: Date.parse(session.updated_at || session.refreshed_at || session.created_at) || undefined,
      touch: id === currentId
    });
  });

  const devices = collapseDevicesByIp(
    pruneUserDevices(user.id)
      .map(function (row) {
        return publicDevice(row, currentId);
      })
      .sort(function (a, b) {
        if (a.current) return -1;
        if (b.current) return 1;
        return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
      })
  );
  sendJson(res, 200, { devices: devices, currentId: currentId });
}

async function handleDeleteAccountDevice(req, res, url) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to manage devices." });
    return;
  }
  const token = bearerToken(req);
  const payload = decodeJwtPayload(token);
  const currentId = String(payload.session_id || payload.sessionId || "").trim();
  const all = String(url.searchParams.get("all") || "") === "1";
  if (all) {
    await revokeAllAuthSessions(user.id);
    devicesByUser.set(user.id, []);
    saveDevices();
    sendJson(res, 200, { ok: true, signedOut: true });
    return;
  }
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) {
    sendJson(res, 400, { error: "Missing device." });
    return;
  }
  const list = userDevices(user.id);
  const target = list.filter(function (row) {
    return row.id === id;
  })[0];
  const ip = normalizeIp((target && target.ip) || "");
  const ids = list
    .filter(function (row) {
      if (row.id === id) return true;
      return !!(ip && normalizeIp(row.ip || "") === ip);
    })
    .map(function (row) {
      return row.id;
    });
  for (var i = 0; i < ids.length; i++) {
    await revokeAuthSession(user.id, ids[i]);
  }
  const next = userDevices(user.id).filter(function (row) {
    return ids.indexOf(row.id) === -1;
  });
  devicesByUser.set(user.id, next);
  saveDevices();
  sendJson(res, 200, { ok: true, signedOut: ids.indexOf(currentId) !== -1 });
}

async function findOrCreateStripeCustomer(user, email) {
  const userId = user && user.id;
  const stored = userId ? billingByUser.get(userId) : null;
  if (stored && stored.customerId) {
    try {
      const customer = await stripeRequest("GET", "/customers/" + encodeURIComponent(stored.customerId));
      if (customer && !customer.deleted) return customer;
    } catch (e) {}
  }
  if (looksLikeEmail(email)) {
    try {
      const listed = await stripeRequest("GET", "/customers", { email: email, limit: "5" });
      const rows = (listed && listed.data) || [];
      if (rows.length) {
        if (userId) upsertBilling(userId, { customerId: rows[0].id, email: email });
        return rows[0];
      }
    } catch (e) {}
  }
  const params = { "metadata[product]": "script-engine" };
  if (looksLikeEmail(email)) params.email = email;
  if (userId) params["metadata[userId]"] = userId;
  const created = await stripeRequest("POST", "/customers", params);
  if (userId) upsertBilling(userId, { customerId: created.id, email: email || "" });
  return created;
}

function rankSubscription(sub) {
  const order = {
    active: 0,
    trialing: 1,
    past_due: 2,
    unpaid: 3,
    paused: 4,
    incomplete: 5,
    canceled: 6,
    incomplete_expired: 7
  };
  const rank = order[sub && sub.status] != null ? order[sub.status] : 8;
  return rank * 1e13 - Number(sub.created || 0);
}

function isIncompleteSub(sub) {
  return !sub || sub.status === "incomplete" || sub.status === "incomplete_expired";
}

const RENEWAL_FAIL_COMMENT = "renewal_payment_failed";

function failedRenewalComment(sub) {
  if (!sub) return false;
  const details = sub.cancellation_details;
  if (details && (details.comment === RENEWAL_FAIL_COMMENT || details.reason === "payment_failed")) return true;
  return !!(sub.metadata && sub.metadata.ended_for === RENEWAL_FAIL_COMMENT);
}

function isFailedRenewalSub(sub) {
  if (!sub) return false;
  if (sub.status === "past_due" || sub.status === "unpaid") return true;
  return failedRenewalComment(sub);
}

function clearBillingForSubscription(subId) {
  const id = String(subId || "");
  if (!id) return;
  let changed = false;
  billingByUser.forEach(function (row, userId) {
    if (row && row.subscriptionId === id) {
      row.subscriptionId = "";
      billingByUser.set(userId, row);
      changed = true;
    }
  });
  if (changed) saveBilling();
}

async function cancelStripeSubscriptionNow(subId) {
  const id = String(subId || "");
  if (!id) return;
  try {
    await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(id), {
      "metadata[ended_for]": RENEWAL_FAIL_COMMENT
    });
  } catch (e) {}
  try {
    await stripeRequest("DELETE", "/subscriptions/" + encodeURIComponent(id), {
      "cancellation_details[comment]": RENEWAL_FAIL_COMMENT
    });
  } catch (e) {
    try {
      await stripeRequest("DELETE", "/subscriptions/" + encodeURIComponent(id));
    } catch (e2) {}
  }
  clearBillingForSubscription(id);
}

async function dropIfFailedRenewal(sub) {
  if (!sub) return null;
  if (sub.status === "past_due" || sub.status === "unpaid") {
    await cancelStripeSubscriptionNow(sub.id);
    return null;
  }
  if (failedRenewalComment(sub)) return null;
  return sub;
}

function periodUnixFromSub(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return {
    start: Number((sub && sub.current_period_start) || (item && item.current_period_start) || 0),
    end: Number((sub && sub.current_period_end) || (item && item.current_period_end) || (sub && sub.ended_at) || 0)
  };
}

function isLiveSubscription(sub) {
  if (!sub || isIncompleteSub(sub) || isFailedRenewalSub(sub)) return false;
  const status = sub.status;
  if (status === "active" || status === "trialing") return true;
  if (sub.cancel_at_period_end) return true;
  if (status === "canceled") {
    const end = periodUnixFromSub(sub).end * 1000;
    return end > Date.now();
  }
  return false;
}

function canSchedulePlanChange(sub) {
  if (!sub || isIncompleteSub(sub) || isFailedRenewalSub(sub)) return false;
  if (sub.status === "active" || sub.status === "trialing" || sub.cancel_at_period_end) return true;
  return isLiveSubscription(sub) && stripeDisplayStatus(sub) !== "canceled";
}

function stripeDisplayStatus(sub) {
  if (!sub || isIncompleteSub(sub)) return "";
  const item = sub.items && sub.items.data && sub.items.data[0];
  const endMs = Number(sub.current_period_end || (item && item.current_period_end) || sub.ended_at || 0) * 1000;
  if (sub.status === "canceled") return endMs > Date.now() ? "canceling" : "canceled";
  if (sub.cancel_at_period_end) return "canceling";
  if (scheduleIdFromSub(sub)) return sub.status || "active";
  if (sub.cancel_at && Number(sub.cancel_at) * 1000 > Date.now()) return "canceling";
  return sub.status;
}

function pickBestSubscription(rows) {
  const usable = (rows || []).filter(function (sub) {
    return sub && sub.status !== "incomplete_expired" && !isFailedRenewalSub(sub);
  });
  usable.sort(function (a, b) {
    return rankSubscription(a) - rankSubscription(b);
  });
  for (var i = 0; i < usable.length; i++) {
    if (isLiveSubscription(usable[i]) && stripeDisplayStatus(usable[i]) === "active") return usable[i];
  }
  for (var j = 0; j < usable.length; j++) {
    if (stripeDisplayStatus(usable[j]) === "canceling") return usable[j];
  }
  for (var k = 0; k < usable.length; k++) {
    if (stripeDisplayStatus(usable[k]) === "canceled") return usable[k];
  }
  return usable[0] || null;
}

async function stripeCustomersForUser(user) {
  const ids = [];
  function add(id) {
    if (id && ids.indexOf(id) === -1) ids.push(id);
  }
  const stored = user && user.id ? billingByUser.get(user.id) : null;
  if (stored && stored.customerId) add(stored.customerId);
  const email = looksLikeEmail(user && user.email) ? String(user.email).trim().toLowerCase() : "";
  if (email) {
    billingByUser.forEach(function (row) {
      if (row && row.customerId && String(row.email || "").trim().toLowerCase() === email) add(row.customerId);
    });
    try {
      const listed = await stripeRequest("GET", "/customers", { email: String(user.email).trim(), limit: "10" });
      ((listed && listed.data) || []).forEach(function (row) {
        if (row && row.id) add(row.id);
      });
    } catch (e) {}
  }
  try {
    const fromOrders = await billingIdsFromUserOrders(user);
    (fromOrders.customerIds || []).forEach(add);
  } catch (e) {}
  return ids;
}

async function stripeSubscriptionForUser(user) {
  const stored = user && user.id ? billingByUser.get(user.id) : null;
  let all = [];
  const customerIds = await stripeCustomersForUser(user);
  for (var c = 0; c < customerIds.length; c++) {
    let listed = null;
    try {
      listed = await stripeRequest("GET", "/subscriptions", {
        customer: customerIds[c],
        status: "all",
        limit: "20",
        "expand[]": ["data.items.data.price", "data.default_payment_method", "data.schedule"]
      });
    } catch (e) {
      try {
        listed = await stripeRequest("GET", "/subscriptions", {
          customer: customerIds[c],
          status: "all",
          limit: "20",
          "expand[]": ["data.items.data.price"]
        });
      } catch (e2) {
        console.error("Could not list Stripe subscriptions:", e2 && e2.message);
      }
    }
    all = all.concat((listed && listed.data) || []);
  }
  let paidSubIds = {};
  try {
    const fromOrders = await billingIdsFromUserOrders(user);
    paidSubIds = {};
    (fromOrders.paidSubscriptionIds || []).forEach(function (id) {
      paidSubIds[id] = true;
    });
    (fromOrders.subscriptionIds || []).forEach(function (id) {
      const already = all.filter(function (row) {
        return row && row.id === id;
      })[0];
      if (!already) {
        all.push({ id: id });
      }
    });
  } catch (e) {}
  const kept = [];
  for (var i = 0; i < all.length; i++) {
    let row = all[i];
    if (row && row.id && !row.status) {
      row = await getStripeSubscription(row.id);
    }
    row = await dropIfFailedRenewal(row);
    if (!row) continue;
    if (row.status === "incomplete_expired") continue;
    if (row.status === "incomplete" && !paidSubIds[row.id]) continue;
    kept.push(row);
  }
  all = kept;
  if (stored && stored.subscriptionId) {
    let fromStore = all.filter(function (row) {
      return row.id === stored.subscriptionId;
    })[0] || (await getStripeSubscription(stored.subscriptionId));
    fromStore = await dropIfFailedRenewal(fromStore);
    if (fromStore && fromStore.status !== "incomplete_expired" && (fromStore.status !== "incomplete" || paidSubIds[fromStore.id])) {
      const display = stripeDisplayStatus(fromStore);
      if (display === "canceling" || display === "canceled") {
        const full = (await getStripeSubscription(fromStore.id)) || fromStore;
        if (user && user.id) {
          upsertBilling(user.id, {
            subscriptionId: full.id,
            plan: planFromPriceId(priceIdFromSubscription(full)) || undefined
          });
        }
        return full;
      }
    }
  }
  const picked = pickBestSubscription(all);
  if (picked) {
    const full = (await getStripeSubscription(picked.id)) || picked;
    if (user && user.id) {
      upsertBilling(user.id, {
        customerId: (typeof full.customer === "string" ? full.customer : full.customer && full.customer.id) || (stored && stored.customerId),
        subscriptionId: full.id,
        plan: planFromPriceId(priceIdFromSubscription(full)) || undefined,
        email: user.email || ""
      });
    }
    return full;
  }
  if (user && user.id && stored && stored.subscriptionId && !picked) {
    upsertBilling(user.id, { subscriptionId: "" });
  }
  return picked;
}

async function getStripeSubscription(id) {
  if (!id) return null;
  try {
    return await stripeRequest("GET", "/subscriptions/" + encodeURIComponent(id), {
      "expand[]": ["items.data.price", "default_payment_method", "schedule", "discount"]
    });
  } catch (e) {
    try {
      return await stripeRequest("GET", "/subscriptions/" + encodeURIComponent(id), {
        "expand[]": ["items.data.price"]
      });
    } catch (e2) {
      return null;
    }
  }
}

function paidOrdersForUser(user) {
  const email = String((user && user.email) || "").trim().toLowerCase();
  const list = [];
  orders.forEach(function (order) {
    if (!order || !order.paid) return;
    const matchUser = order.userId && user && order.userId === user.id;
    const matchEmail = email && String(order.email || "").trim().toLowerCase() === email;
    if (matchUser || matchEmail) list.push(order);
  });
  list.sort(function (a, b) {
    return (b.paidAt || b.createdAt || 0) - (a.paidAt || a.createdAt || 0);
  });
  return list;
}

function licenseFromOrders(user) {
  const latest = paidOrdersForUser(user)[0];
  if (!latest) return null;
  const catalog = PLAN_CATALOG[latest.plan] || PLAN_CATALOG.month;
  const start = Number(latest.paidAt || latest.createdAt || Date.now());
  const end = start + catalog.days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return {
    plan: latest.plan,
    start: start,
    end: end,
    active: now < end,
    orderId: latest.id
  };
}

function cardSummary(method) {
  if (!method || typeof method !== "object") return "";
  const card = method.card || method;
  const brand = String(card.brand || method.type || "").trim();
  const last4 = String(card.last4 || "").trim();
  if (!last4) return brand || "";
  return (brand ? brand.charAt(0).toUpperCase() + brand.slice(1) + " " : "") + "•••• " + last4;
}

function customerIdFromSub(sub) {
  if (!sub) return "";
  if (typeof sub.customer === "string") return sub.customer;
  return (sub.customer && sub.customer.id) || "";
}

async function cardSummaryForSub(sub) {
  let summary = cardSummary(sub && sub.default_payment_method);
  if (summary) return summary;
  const customerId = customerIdFromSub(sub);
  if (!customerId) return "";
  try {
    const customer = await stripeRequest("GET", "/customers/" + encodeURIComponent(customerId), {
      "expand[]": ["invoice_settings.default_payment_method"]
    });
    summary = cardSummary(customer.invoice_settings && customer.invoice_settings.default_payment_method);
    if (summary) return summary;
  } catch (e) {}
  try {
    const listed = await stripeRequest("GET", "/payment_methods", {
      customer: customerId,
      type: "card",
      limit: "1"
    });
    summary = cardSummary(listed && listed.data && listed.data[0]);
    if (summary) return summary;
  } catch (e2) {}
  return "";
}

function scheduleIdFromSub(sub) {
  if (!sub || !sub.schedule) return "";
  if (typeof sub.schedule === "string") return sub.schedule;
  return sub.schedule.id || "";
}

function phasePriceId(phase) {
  const item = phase && phase.items && phase.items[0];
  if (!item) return "";
  if (typeof item.price === "string") return item.price;
  if (item.price && item.price.id) return item.price.id;
  if (typeof item.plan === "string") return item.plan;
  return (item.plan && item.plan.id) || "";
}

function pendingPlanPayload(plan, startAt) {
  if (!plan || !PLAN_CATALOG[plan]) return null;
  const catalog = PLAN_CATALOG[plan];
  return {
    id: plan,
    label: catalog.label,
    price: catalog.price,
    cadence: catalog.cadence,
    duration: catalog.duration,
    startAt: startAt || null
  };
}

function pendingPlanFromSchedule(schedule, currentPlan) {
  if (!schedule || (schedule.status !== "active" && schedule.status !== "not_started")) return null;
  const phases = schedule.phases || [];
  if (phases.length < 2) return null;
  const next = phases[phases.length - 1];
  const plan = planFromPriceId(phasePriceId(next));
  if (!plan || plan === currentPlan) return null;
  return pendingPlanPayload(plan, Number(next.start_date || 0) * 1000 || null);
}

function pendingPlanFromBilling(stored, currentPlan) {
  if (!stored || !stored.pendingPlan || stored.pendingPlan === currentPlan) return null;
  return pendingPlanPayload(stored.pendingPlan, Number(stored.pendingPlanStart) || null);
}

async function getSubscriptionSchedule(sub) {
  if (!sub) return null;
  const id = scheduleIdFromSub(sub);
  if (id) {
    try {
      return await stripeRequest("GET", "/subscription_schedules/" + encodeURIComponent(id));
    } catch (e) {}
  }
  if (sub.schedule && typeof sub.schedule === "object" && Array.isArray(sub.schedule.phases)) {
    return sub.schedule;
  }
  return null;
}

function planRecurring(plan) {
  if (plan === "year") return { interval: "year", interval_count: 1 };
  if (plan === "3months") return { interval: "month", interval_count: 3 };
  return { interval: "month", interval_count: 1 };
}

function activeSchedulePhase(schedule) {
  const phases = (schedule && schedule.phases) || [];
  const current = schedule && schedule.current_phase;
  if (current && phases.length) {
    for (var i = 0; i < phases.length; i++) {
      if (Number(phases[i].start_date) === Number(current.start_date)) return phases[i];
    }
  }
  const now = Math.floor(Date.now() / 1000);
  for (var j = 0; j < phases.length; j++) {
    const start = Number(phases[j].start_date || 0);
    const end = phases[j].end_date == null ? Infinity : Number(phases[j].end_date);
    if (start <= now && now < end) return phases[j];
  }
  return phases[0] || {};
}

async function releaseSubscriptionSchedule(sub) {
  const id = scheduleIdFromSub(sub);
  if (!id) return sub;
  await stripeRequest("POST", "/subscription_schedules/" + encodeURIComponent(id) + "/release");
  return stripeRequest("GET", "/subscriptions/" + encodeURIComponent(sub.id), {
    "expand[]": ["items.data.price", "default_payment_method", "schedule"]
  });
}

async function schedulePlanAtPeriodEnd(sub, newPlan) {
  const currentPrice = priceIdFromSubscription(sub);
  const nextPrice = PRICE_BY_PLAN[newPlan];
  if (!currentPrice || !nextPrice) {
    const err = new Error("Could not map this plan to a Stripe price.");
    err.status = 500;
    throw err;
  }
  let nextPriceObj = null;
  try {
    nextPriceObj = await stripeRequest("GET", "/prices/" + encodeURIComponent(nextPrice));
  } catch (e) {
    const err = new Error("Could not load the new plan price from Stripe.");
    err.status = 500;
    throw err;
  }
  const rec = (nextPriceObj && nextPriceObj.recurring) || planRecurring(newPlan);
  const item = sub.items && sub.items.data && sub.items.data[0];
  const qty = String((item && item.quantity) || 1);
  const period = periodUnixFromSub(sub);
  const periodStart = period.start;
  const periodEnd = period.end;
  if (!periodStart || !periodEnd || periodEnd <= periodStart) {
    const err = new Error("Could not read the current billing period to switch plans.");
    err.status = 500;
    throw err;
  }
  let schedule = null;
  if (scheduleIdFromSub(sub)) {
    try {
      sub = await releaseSubscriptionSchedule(sub);
    } catch (e) {
      console.error("Could not release previous schedule:", e && e.message);
      schedule = await getSubscriptionSchedule(sub);
    }
  }
  if (!schedule) {
    schedule = await stripeRequest("POST", "/subscription_schedules", {
      from_subscription: sub.id
    });
  }
  const phase0 = activeSchedulePhase(schedule);
  const startDate = phase0.start_date || periodStart;
  var scheduleParams = {
    end_behavior: "release",
    proration_behavior: "none",
    "phases[0][items][0][price]": phasePriceId(phase0) || currentPrice,
    "phases[0][items][0][quantity]": qty,
    "phases[0][start_date]": String(startDate),
    "phases[0][end_date]": String(periodEnd),
    "phases[0][proration_behavior]": "none",
    "phases[1][items][0][price]": nextPrice,
    "phases[1][items][0][quantity]": qty,
    "phases[1][start_date]": String(periodEnd),
    "phases[1][billing_cycle_anchor]": "phase_start",
    "phases[1][proration_behavior]": "none",
    "phases[1][duration][interval]": rec.interval || "month",
    "phases[1][duration][interval_count]": String(rec.interval_count || 1)
  };
  var couponId = couponIdFromSub(sub);
  if (!couponId) {
    var refCode = String((sub.metadata && sub.metadata.referral_code) || "").trim();
    if (refCode) couponId = await couponIdForCode(refCode);
  }
  if (couponId) {
    scheduleParams["phases[0][discounts][0][coupon]"] = couponId;
    scheduleParams["phases[1][discounts][0][coupon]"] = couponId;
  }
  const taxRates = (item && item.tax_rates) || [];
  taxRates.forEach(function (rate, idx) {
    const id = typeof rate === "string" ? rate : rate && rate.id;
    if (!id) return;
    scheduleParams["phases[0][items][0][tax_rates][" + idx + "]"] = id;
    scheduleParams["phases[1][items][0][tax_rates][" + idx + "]"] = id;
  });
  async function postSchedule(params) {
    return stripeRequest("POST", "/subscription_schedules/" + encodeURIComponent(schedule.id), params);
  }
  let updated;
  try {
    updated = await postSchedule(scheduleParams);
  } catch (err) {
    delete scheduleParams.proration_behavior;
    delete scheduleParams["phases[0][proration_behavior]"];
    delete scheduleParams["phases[1][proration_behavior]"];
    try {
      updated = await postSchedule(scheduleParams);
    } catch (err2) {
      delete scheduleParams["phases[1][duration][interval]"];
      delete scheduleParams["phases[1][duration][interval_count]"];
      updated = await postSchedule(scheduleParams);
    }
  }
  const nextPhase = updated && updated.phases && updated.phases[updated.phases.length - 1];
  if (phasePriceId(nextPhase) !== nextPrice) {
    const err = new Error("Stripe did not attach the new plan price to the next billing cycle.");
    err.status = 500;
    throw err;
  }
  return stripeRequest("GET", "/subscriptions/" + encodeURIComponent(sub.id), {
    "expand[]": ["items.data.price", "default_payment_method", "schedule", "discount"]
  });
}

async function subscriptionView(user, sub) {
  if (sub && isFailedRenewalSub(sub)) sub = null;
  if (sub && !scheduleIdFromSub(sub)) sub = await ensureSubscriptionReferral(sub, user);
  const stored = user && user.id ? billingByUser.get(user.id) : null;
  const schedule = await getSubscriptionSchedule(sub);
  const payload = publicSubscriptionPayload(sub, sub ? null : licenseFromOrders(user), user, schedule, stored);
  let portalCustomer = customerIdFromSub(sub) || (stored && stored.customerId) || "";
  if (!portalCustomer) {
    const ids = await stripeCustomersForUser(user);
    portalCustomer = ids[0] || "";
    if (portalCustomer && user && user.id) upsertBilling(user.id, { customerId: portalCustomer, email: user.email || "" });
  }
  if (payload.hasSubscription) {
    if (sub || portalCustomer) {
      payload.managedByStripe = true;
      payload.canPortal = !!portalCustomer;
      payload.paymentMethod = (await cardSummaryForSub(sub || { customer: portalCustomer })) || "Billed via Stripe";
    } else {
      payload.paymentMethod = payload.paymentMethod || "Subscription";
    }
  }
  return payload;
}

function publicSubscriptionPayload(sub, license, user, schedule, stored) {
  const plans = catalogPlans();
  stored = stored || (user && user.id ? billingByUser.get(user.id) : null);
  if (sub && sub.status !== "incomplete_expired" && !isFailedRenewalSub(sub)) {
    const priceId = priceIdFromSubscription(sub);
    const plan = planFromPriceId(priceId) || (stored && stored.plan) || "month";
    const catalog = PLAN_CATALOG[plan] || PLAN_CATALOG.month;
    const item = sub.items && sub.items.data && sub.items.data[0];
    const start = Number(sub.current_period_start || (item && item.current_period_start) || 0) * 1000;
    const end = Number(sub.current_period_end || (item && item.current_period_end) || sub.ended_at || 0) * 1000;
    const now = Date.now();
    const span = Math.max(1, end - start);
    const daysLeft = end > now ? Math.ceil((end - now) / (24 * 60 * 60 * 1000)) : 0;
    const pendingPlan = pendingPlanFromSchedule(schedule, plan) || pendingPlanFromBilling(stored, plan);
    let status = stripeDisplayStatus(sub) || sub.status;
    if (pendingPlan && status === "canceling" && !sub.cancel_at_period_end) {
      status = sub.status === "trialing" ? "trialing" : "active";
    }
    const labels = {
      active: "ACTIVE",
      trialing: "TRIAL",
      past_due: "PAST DUE",
      unpaid: "UNPAID",
      canceling: "CANCELING",
      canceled: "CANCELED",
      incomplete: "INCOMPLETE"
    };
    return withReferralPricing(
      {
        hasSubscription: true,
        managedByStripe: true,
        plan: plan,
        status: status,
        statusLabel: labels[status] || String(status || "ACTIVE").toUpperCase(),
        cancelAtPeriodEnd: !pendingPlan && (status === "canceling" || !!sub.cancel_at_period_end),
        currentPeriodStart: start || null,
        currentPeriodEnd: end || pendingPlan && pendingPlan.startAt || null,
        daysLeft: daysLeft,
        periodProgress: Math.max(0, Math.min(100, Math.round(((now - start) / span) * 100))),
        price: catalog.price,
        label: catalog.label,
        duration: catalog.duration,
        cadence: catalog.cadence,
        paymentMethod: cardSummary(sub.default_payment_method),
        canCancel: status === "active" || status === "trialing",
        canResume: !pendingPlan && status === "canceling",
        canPortal: true,
        pendingPlan: pendingPlan,
        plans: plans
      },
      plan,
      sub,
      user
    );
  }
  if (license && license.active) {
    const catalog = PLAN_CATALOG[license.plan] || PLAN_CATALOG.month;
    const now = Date.now();
    const span = Math.max(1, license.end - license.start);
    const pendingPlan = pendingPlanFromBilling(stored, license.plan);
    return withReferralPricing(
      {
        hasSubscription: true,
        managedByStripe: false,
        plan: license.plan,
        status: "active",
        statusLabel: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodStart: license.start,
        currentPeriodEnd: license.end,
        daysLeft: Math.ceil((license.end - now) / (24 * 60 * 60 * 1000)),
        periodProgress: Math.max(0, Math.min(100, Math.round(((now - license.start) / span) * 100))),
        price: catalog.price,
        label: catalog.label,
        duration: catalog.duration,
        cadence: catalog.cadence,
        paymentMethod: "",
        canCancel: false,
        canResume: false,
        canPortal: false,
        pendingPlan: pendingPlan,
        plans: plans
      },
      license.plan,
      null,
      user
    );
  }
  return {
    hasSubscription: false,
    managedByStripe: false,
    plan: "",
    status: "none",
    statusLabel: "",
    pendingPlan: null,
    plans: plans
  };
}

function payloadGrantsAccess(payload) {
  if (!payload || !payload.hasSubscription) return false;
  const status = String(payload.status || "");
  if (status === "none" || status === "canceled" || status === "incomplete" || status === "incomplete_expired" || status === "unpaid") {
    return false;
  }
  return true;
}

async function subscriptionPayloadForUser(user) {
  let sub = null;
  try {
    await claimBillingFromOrders(user);
    sub = await stripeSubscriptionForUser(user);
  } catch (e) {
    console.error("Could not load Stripe subscription:", e && e.message);
  }
  try {
    return await subscriptionView(user, sub);
  } catch (e) {
    console.error("Could not build subscription view:", e && e.message);
    const license = licenseFromOrders(user);
    return publicSubscriptionPayload(null, license, user, null, user && user.id ? billingByUser.get(user.id) : null);
  }
}

async function handleAccountSubscription(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to manage your subscription." });
    return;
  }
  const payload = await subscriptionPayloadForUser(user);
  sendJson(res, 200, payload);
}

async function handleLoaderAccess(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { active: false, error: "Sign in." });
    return;
  }
  const payload = await subscriptionPayloadForUser(user);
  sendJson(res, 200, {
    active: payloadGrantsAccess(payload),
    hasSubscription: !!(payload && payload.hasSubscription),
    status: (payload && payload.status) || "none",
    daysLeft: Number((payload && payload.daysLeft) || 0)
  });
}

async function handleAccountSubscriptionAction(req, res) {
  const user = await authUserFromReq(req);
  if (!user || !user.id) {
    sendJson(res, 401, { error: "Sign in to manage your subscription." });
    return;
  }
  const body = await readJsonBody(req);
  const action = String(body.action || "").trim();
  let sub = null;
  try {
    await claimBillingFromOrders(user);
    sub = await stripeSubscriptionForUser(user);
  } catch (e) {
    console.error("Could not load Stripe subscription:", e && e.message);
  }

  if (action === "change") {
    const plan = String(body.plan || "");
    if (!PLAN_CATALOG[plan] || !PRICE_BY_PLAN[plan]) {
      sendJson(res, 400, { error: "Unknown plan." });
      return;
    }
    if (canSchedulePlanChange(sub)) {
      const item = sub.items && sub.items.data && sub.items.data[0];
      if (!item || !item.id) {
        sendJson(res, 400, { error: "This subscription cannot be changed." });
        return;
      }
      const currentPlan = planFromPriceId(priceIdFromSubscription(sub));
      if (sub.cancel_at_period_end) {
        sub = await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(sub.id), {
          cancel_at_period_end: "false",
          "expand[]": ["items.data.price", "default_payment_method", "schedule"]
        });
      }
      if (currentPlan === plan) {
        if (scheduleIdFromSub(sub)) {
          sub = await releaseSubscriptionSchedule(sub);
          if (user && user.id) upsertBilling(user.id, { pendingPlan: null, pendingPlanStart: null, scheduleId: null, plan: currentPlan });
          sendJson(res, 200, await subscriptionView(user, sub));
          return;
        }
        sendJson(res, 400, { error: "You are already on that plan." });
        return;
      }
      const periodEndMs = periodUnixFromSub(sub).end * 1000;
      sub = await schedulePlanAtPeriodEnd(sub, plan);
      if (user && user.id) {
        upsertBilling(user.id, {
          subscriptionId: sub.id,
          plan: currentPlan,
          pendingPlan: plan,
          pendingPlanStart: periodUnixFromSub(sub).end * 1000 || periodEndMs,
          scheduleId: scheduleIdFromSub(sub) || undefined,
          customerId: customerIdFromSub(sub) || undefined
        });
      }
      sendJson(res, 200, await subscriptionView(user, sub));
      return;
    }
    const live = isLiveSubscription(sub) || licenseFromOrders(user);
    if (live) {
      sendJson(res, 409, {
        error: "Could not switch this plan on Stripe. Refresh and try again.",
        hasSubscription: true
      });
      return;
    }
    const orderId = createOrder(plan);
    if (!orderId) {
      sendJson(res, 400, { error: "Could not start a new order." });
      return;
    }
    sendJson(res, 200, { checkoutUrl: "/order/" + orderId });
    return;
  }

  if (action === "cancel") {
    if (!sub || sub.status === "canceled") {
      sendJson(res, 400, { error: "No active subscription to cancel." });
      return;
    }
    if (scheduleIdFromSub(sub)) {
      sub = await releaseSubscriptionSchedule(sub);
    }
    const updated = await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(sub.id), {
      cancel_at_period_end: "true",
      "expand[]": ["items.data.price", "default_payment_method", "schedule"]
    });
    if (user && user.id) upsertBilling(user.id, { pendingPlan: null, pendingPlanStart: null, scheduleId: null });
    sendJson(res, 200, await subscriptionView(user, updated));
    return;
  }

  if (action === "resume") {
    if (!sub || !sub.cancel_at_period_end) {
      sendJson(res, 400, { error: "This subscription is not set to cancel." });
      return;
    }
    const updated = await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(sub.id), {
      cancel_at_period_end: "false",
      "expand[]": ["items.data.price", "default_payment_method", "schedule"]
    });
    sendJson(res, 200, await subscriptionView(user, updated));
    return;
  }

  if (action === "portal") {
    const stored = billingByUser.get(user.id);
    const customers = await stripeCustomersForUser(user);
    const customerId = customerIdFromSub(sub) || (stored && stored.customerId) || customers[0];
    if (!customerId) {
      sendJson(res, 400, { error: "No Stripe customer is linked to this account yet." });
      return;
    }
    const session = await stripeRequest("POST", "/billing_portal/sessions", {
      customer: customerId,
      return_url: originFromReq(req) + "/account/#subscriptions"
    });
    sendJson(res, 200, { portalUrl: session.url });
    return;
  }

  sendJson(res, 400, { error: "Unknown subscription action." });
}

async function handleMarkOrderPaid(req, res, id) {
  const body = await readJsonBody(req);
  const pi = String(body.paymentIntentId || "");
  if (/^pi_[a-zA-Z0-9]+/.test(pi)) {
    const intent = await stripeRequest("GET", "/payment_intents/" + encodeURIComponent(pi));
    if (intent.status !== "succeeded" && intent.status !== "processing") {
      sendJson(res, 400, { error: "Payment is not complete." });
      return;
    }
    const user = await authUserFromReq(req);
    const meta = intent.metadata || {};
    const refCode = String(meta.referral_code || (getOrder(id) && getOrder(id).referralCode) || "").trim();
    const order = markOrderPaid(id, {
      paymentIntentId: intent.id,
      email: intent.receipt_email || String(body.email || (user && user.email) || ""),
      userId: (user && user.id) || String(body.userId || "") || undefined,
      plan: meta.plan || undefined,
      dueCents: intent.amount,
      discountPercent: refCode ? affiliateApi.DISCOUNT_PERCENT : (getOrder(id) && getOrder(id).discountPercent) || 0,
      referralCode: refCode
    });
    if (!order) {
      sendJson(res, 404, { error: "Order not found." });
      return;
    }
    var billingIds = { customerId: "", subscriptionId: "" };
    try {
      billingIds = await billingIdsFromPaymentIntent(intent);
      attachStripeIdsToOrder(order, billingIds);
    } catch (e) {}
    if (user && user.id) {
      try {
        await syncUserStripeBilling(user, billingIds, {
          email: order.email || user.email || "",
          plan: order.plan
        });
        if (billingIds.subscriptionId && (refCode || order.referralCode)) {
          var paidSub = await getStripeSubscription(billingIds.subscriptionId);
          await ensureSubscriptionReferral(paidSub, user, refCode || order.referralCode);
        }
      } catch (e) {}
    }
    try {
      await affiliateApi.logFromPaymentIntent(intent, {
        buyerUserId: (user && user.id) || "",
        email: order.email || "",
        orderId: order.id,
        ref: order.referralCode || cookieValue(req, "gc_ref")
      });
    } catch (e) {}
    sendJson(res, 200, { ok: true, id: order.id, paid: true });
    return;
  }
  sendJson(res, 400, { error: "Missing payment." });
}

function serveAccountPage(req, res) {
  const filePath = path.join(ROOT, "account", "index.html");
  fs.readFile(filePath, function (err, data) {
    if (err) {
      send(res, 500, "Server error");
      return;
    }
    const html = injectSmartNav(data);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : html);
  });
}

function serveAdminPage(req, res) {
  const filePath = path.join(ROOT, "admin", "index.html");
  fs.readFile(filePath, function (err, data) {
    if (err) {
      send(res, 500, "Server error");
      return;
    }
    const html = injectSmartNav(data);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : html);
  });
}

function serveCheckoutPage(req, res) {
  const filePath = path.join(ROOT, "checkout", "index.html");
  fs.readFile(filePath, function (err, data) {
    if (err) {
      send(res, 500, "Server error");
      return;
    }
    const html = injectSmartNav(data);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : html);
  });
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  if (!relative) return path.join(ROOT, "index.html");
  const resolved = findExistingFile(relative);
  if (!resolved) return null;
  const roots = staticRoots().map(function (dir) {
    return path.resolve(dir);
  });
  for (let i = 0; i < roots.length; i++) {
    if (resolved.startsWith(roots[i])) return resolved;
  }
  return null;
}

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

function cookieValue(req, name) {
  const raw = String((req && req.headers && req.headers.cookie) || "");
  const parts = raw.split(/;\s*/);
  for (var i = 0; i < parts.length; i++) {
    const part = parts[i];
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch (err) {
      return part.slice(eq + 1).trim();
    }
  }
  return "";
}

function originFromReq(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (host) return proto + "://" + String(host).split(",")[0].trim();
  return SITE_URL;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > 200000) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > 200000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", function () {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function stripeRequest(method, apiPath, params) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    const err = new Error("Missing STRIPE_SECRET_KEY");
    err.status = 500;
    throw err;
  }

  function appendParams(target, params) {
    Object.keys(params).forEach(function (key) {
      const value = params[key];
      if (value == null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (item == null || item === "") return;
          target.append(key, String(item));
        });
        return;
      }
      target.append(key, String(value));
    });
  }

  let url = "https://api.stripe.com/v1" + apiPath;
  const headers = { Authorization: "Bearer " + secret };
  const opts = { method: method, headers: headers };

  if (method === "GET" && params) {
    const query = new URLSearchParams();
    appendParams(query, params);
    const qs = query.toString();
    if (qs) url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
  } else if (method !== "GET" && params) {
    const body = new URLSearchParams();
    appendParams(body, params);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = body;
  }

  const response = await fetch(url, opts);
  const json = await response.json();
  if (!response.ok) {
    const err = new Error((json.error && json.error.message) || "Stripe request failed");
    err.status = response.status;
    err.payload = json;
    throw err;
  }
  return json;
}

const affiliateApi = createAffiliateApi({
  stripeRequest: stripeRequest,
  supabaseRest: supabaseRest,
  supabaseAuthAdmin: supabaseAuthAdmin,
  authUserFromReq: authUserFromReq,
  sendJson: sendJson,
  cookieValue: cookieValue,
  displayNameFromUser: displayNameFromUser,
  readJsonBody: readJsonBody,
  originFromReq: originFromReq
});

function verifyStripeWebhook(payloadBuf, header, secret) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures = [];
  String(header).split(",").forEach(function (part) {
    const eq = part.indexOf("=");
    if (eq < 0) return;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  });
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestamp + "." + payloadBuf.toString("utf8"))
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  for (var i = 0; i < signatures.length; i++) {
    const got = Buffer.from(String(signatures[i]), "utf8");
    if (got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf)) return true;
  }
  return false;
}

function subscriptionIdFromStripeObject(obj) {
  if (!obj || typeof obj !== "object") return "";
  if (obj.object === "subscription" && obj.id) return String(obj.id);
  if (typeof obj.subscription === "string") return obj.subscription;
  if (obj.subscription && obj.subscription.id) return String(obj.subscription.id);
  const parent = obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription;
  if (typeof parent === "string") return parent;
  if (parent && parent.id) return String(parent.id);
  return "";
}

function stripeCustomerId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.id || "");
}

function invoiceIdFromStripeObject(value) {
  if (!value) return "";
  if (typeof value === "string") return /^in_/.test(value) ? value : "";
  return String(value.id || "");
}

async function billingIdsFromPaymentIntent(intent) {
  const out = {
    customerId: stripeCustomerId(intent && intent.customer),
    subscriptionId: subscriptionIdFromStripeObject(intent)
  };
  const invoiceId = invoiceIdFromStripeObject(intent && intent.invoice);
  if (invoiceId) {
    try {
      const invoice = await stripeRequest("GET", "/invoices/" + encodeURIComponent(invoiceId));
      out.customerId = out.customerId || stripeCustomerId(invoice && invoice.customer);
      out.subscriptionId = out.subscriptionId || subscriptionIdFromStripeObject(invoice);
    } catch (e) {}
  }
  return out;
}

function attachStripeIdsToOrder(order, ids) {
  if (!order || !ids) return;
  var changed = false;
  if (ids.customerId && order.stripeCustomerId !== ids.customerId) {
    order.stripeCustomerId = ids.customerId;
    changed = true;
  }
  if (ids.subscriptionId && order.subscriptionId !== ids.subscriptionId) {
    order.subscriptionId = ids.subscriptionId;
    changed = true;
  }
  if (changed) saveOrders();
}

function ordersForUser(user) {
  const email = String((user && user.email) || "").trim().toLowerCase();
  const list = [];
  orders.forEach(function (order) {
    if (!order) return;
    const matchUser = order.userId && user && order.userId === user.id;
    const matchEmail = email && String(order.email || "").trim().toLowerCase() === email;
    if (matchUser || matchEmail) list.push(order);
  });
  return list;
}

async function billingIdsFromUserOrders(user) {
  const customerIds = [];
  const subscriptionIds = [];
  const paidSubscriptionIds = [];
  function addC(id) {
    if (id && customerIds.indexOf(id) === -1) customerIds.push(id);
  }
  function addS(id, paid) {
    if (!id || !/^sub_/.test(String(id))) return;
    if (subscriptionIds.indexOf(id) === -1) subscriptionIds.push(id);
    if (paid && paidSubscriptionIds.indexOf(id) === -1) paidSubscriptionIds.push(id);
  }
  const list = ordersForUser(user);
  for (var i = 0; i < list.length; i++) {
    const order = list[i];
    addC(order.stripeCustomerId);
    addS(order.subscriptionId, !!order.paid);
    if ((!order.stripeCustomerId || !order.subscriptionId) && order.paymentIntentId) {
      try {
        const intent = await stripeRequest("GET", "/payment_intents/" + encodeURIComponent(order.paymentIntentId));
        const ids = await billingIdsFromPaymentIntent(intent);
        attachStripeIdsToOrder(order, ids);
        addC(ids.customerId);
        addS(ids.subscriptionId, !!order.paid);
      } catch (e) {}
    }
  }
  return { customerIds: customerIds, subscriptionIds: subscriptionIds, paidSubscriptionIds: paidSubscriptionIds };
}

async function syncUserStripeBilling(user, ids, extra) {
  if (!user || !user.id || !ids) return;
  extra = extra || {};
  const customerId = ids.customerId || "";
  const subscriptionId = ids.subscriptionId || "";
  const email = extra.email || user.email || "";
  if (customerId) {
    try {
      const params = { "metadata[userId]": user.id };
      if (looksLikeEmail(email)) params.email = email;
      await stripeRequest("POST", "/customers/" + encodeURIComponent(customerId), params);
    } catch (e) {}
  }
  if (subscriptionId) {
    try {
      await stripeRequest("POST", "/subscriptions/" + encodeURIComponent(subscriptionId), {
        "metadata[userId]": user.id
      });
    } catch (e) {}
  }
  upsertBilling(user.id, {
    customerId: customerId || undefined,
    subscriptionId: subscriptionId || undefined,
    email: email || undefined,
    plan: extra.plan || undefined
  });
}

async function claimBillingFromOrders(user) {
  if (!user || !user.id) return;
  const ids = await billingIdsFromUserOrders(user);
  if (!ids.customerIds.length && !ids.subscriptionIds.length) return;
  await syncUserStripeBilling(
    user,
    { customerId: ids.customerIds[0] || "", subscriptionId: ids.subscriptionIds[0] || "" },
    { email: user.email || "", plan: (billingByUser.get(user.id) && billingByUser.get(user.id).plan) || undefined }
  );
}

async function handleClaimOrder(req, res, id) {
  const order = getOrder(id);
  if (!order) {
    sendJson(res, 404, { error: "Order not found." });
    return;
  }
  const user = await authUserFromReq(req);
  const body = await readJsonBody(req).catch(function () {
    return {};
  });
  const email = String((body && body.email) || (user && user.email) || order.email || "").trim();
  if (user && user.id) {
    order.userId = user.id;
    if (looksLikeEmail(email)) order.email = email;
    saveOrders();
  } else if (looksLikeEmail(email) && !order.email) {
    order.email = email;
    saveOrders();
  }
  const ids = {
    customerId: order.stripeCustomerId || "",
    subscriptionId: order.subscriptionId || ""
  };
  if ((!ids.customerId || !ids.subscriptionId) && order.paymentIntentId) {
    try {
      const intent = await stripeRequest("GET", "/payment_intents/" + encodeURIComponent(order.paymentIntentId));
      const fromPi = await billingIdsFromPaymentIntent(intent);
      ids.customerId = ids.customerId || fromPi.customerId;
      ids.subscriptionId = ids.subscriptionId || fromPi.subscriptionId;
      attachStripeIdsToOrder(order, ids);
    } catch (e) {}
  }
  if (looksLikeEmail(email) && ids.customerId) {
    try {
      const params = { email: email };
      if (user && user.id) params["metadata[userId]"] = user.id;
      await stripeRequest("POST", "/customers/" + encodeURIComponent(ids.customerId), params);
    } catch (e) {}
  }
  if (user && user.id) {
    await syncUserStripeBilling(user, ids, { email: email, plan: order.plan });
  }
  sendJson(res, 200, { ok: true });
}

function findOrderByStripeInvoiceId(stripeInvoiceId) {
  const id = String(stripeInvoiceId || "");
  if (!id) return null;
  var found = null;
  orders.forEach(function (order) {
    if (order && order.stripeInvoiceId === id) found = order;
  });
  return found;
}

function userIdFromCustomerId(customerId) {
  const id = stripeCustomerId(customerId);
  if (!id) return "";
  var found = "";
  billingByUser.forEach(function (row, userId) {
    if (row && row.customerId === id) found = String(userId);
  });
  return found;
}

function planFromInvoiceLines(invoice) {
  const meta = (invoice && invoice.metadata) || {};
  if (meta.plan && PLAN_CATALOG[meta.plan]) return meta.plan;
  const lines = invoice && invoice.lines && invoice.lines.data;
  if (lines && lines.length) {
    for (var i = 0; i < lines.length; i++) {
      const line = lines[i];
      const price = line.price || {};
      const priceId = price.id || (line.plan && line.plan.id) || "";
      const fromPrice = planFromPriceId(priceId);
      if (fromPrice) return fromPrice;
      const details = line.pricing && line.pricing.price_details;
      if (details && details.price) {
        const fromDetails = planFromPriceId(details.price);
        if (fromDetails) return fromDetails;
      }
    }
  }
  return "";
}

async function stripeInvoiceFromWebhook(obj) {
  if (!obj || !obj.id) return obj;
  if (obj.billing_reason && obj.lines) return obj;
  try {
    return await stripeRequest("GET", "/invoices/" + encodeURIComponent(obj.id));
  } catch (e) {
    return obj;
  }
}

async function resolveCycleInvoiceContext(invoice) {
  var plan = planFromInvoiceLines(invoice);
  var userId = String((invoice.metadata && invoice.metadata.userId) || "");
  var email = String(invoice.customer_email || "").trim();
  var referralCode = String((invoice.metadata && invoice.metadata.referral_code) || "").trim();
  var customerId = stripeCustomerId(invoice.customer);
  if (!userId && customerId) userId = userIdFromCustomerId(customerId);
  const subId = subscriptionIdFromStripeObject(invoice);
  if (subId && (!userId || !plan || !referralCode || !email)) {
    try {
      const sub = await getStripeSubscription(subId);
      if (sub) {
        if (!userId) {
          userId = String((sub.metadata && sub.metadata.userId) || "") || userIdFromCustomerId(sub.customer);
        }
        if (!plan) {
          plan = (sub.metadata && sub.metadata.plan) || planFromPriceId(priceIdFromSubscription(sub)) || "";
        }
        if (!referralCode) {
          referralCode = String((sub.metadata && sub.metadata.referral_code) || "").trim();
        }
        if (!customerId) customerId = stripeCustomerId(sub.customer);
        if (!userId && customerId) userId = userIdFromCustomerId(customerId);
      }
    } catch (e) {}
  }
  if (!userId && customerId) userId = userIdFromCustomerId(customerId);
  const stored = userId ? billingByUser.get(userId) : null;
  if (stored && stored.referralCode && !referralCode) referralCode = String(stored.referralCode || "").trim();
  if (stored && stored.email && !email) email = String(stored.email || "").trim();
  if (!PLAN_CATALOG[plan]) plan = "month";
  return { plan: plan, userId: userId, email: email, referralCode: referralCode };
}

function applyCycleInvoiceToOrder(order, invoice, failed, ctx) {
  const amount = failed
    ? Number(invoice.amount_due || invoice.amount_remaining || invoice.total || 0)
    : Number(invoice.amount_paid != null ? invoice.amount_paid : invoice.total) || 0;
  order.kind = "renewal";
  order.stripeInvoiceId = invoice.id;
  order.expiresAt = null;
  order.plan = ctx.plan || order.plan;
  if (ctx.userId) order.userId = ctx.userId;
  if (ctx.email) order.email = ctx.email;
  if (amount > 0) order.dueCents = amount;
  if (ctx.referralCode) {
    order.referralCode = ctx.referralCode;
    order.discountPercent = affiliateApi.DISCOUNT_PERCENT;
  }
  if (failed) {
    order.paid = false;
    order.error = true;
    order.failedAt = Date.now();
  } else {
    order.paid = true;
    order.error = false;
    order.paidAt = Date.now();
    order.failedAt = null;
  }
  saveOrders();
  return order;
}

async function recordCycleInvoice(invoice, failed) {
  invoice = await stripeInvoiceFromWebhook(invoice);
  if (!invoice || !invoice.id) return null;
  if (String(invoice.billing_reason || "") !== "subscription_cycle") return null;
  const ctx = await resolveCycleInvoiceContext(invoice);
  var order = findOrderByStripeInvoiceId(invoice.id);
  if (!order) {
    order = {
      id: nextOrderId(),
      plan: ctx.plan,
      createdAt: Date.now(),
      kind: "renewal",
      stripeInvoiceId: invoice.id
    };
    orders.set(order.id, order);
  }
  return applyCycleInvoiceToOrder(order, invoice, failed, ctx);
}

async function handleStripeWebhook(req, res) {
  const raw = await readRawBody(req);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && !verifyStripeWebhook(raw, req.headers["stripe-signature"], secret)) {
    sendJson(res, 400, { error: "Invalid signature." });
    return;
  }
  let event;
  try {
    event = JSON.parse(raw.toString("utf8") || "{}");
  } catch (e) {
    sendJson(res, 400, { error: "Invalid payload." });
    return;
  }
  const type = String(event.type || "");
  const obj = (event.data && event.data.object) || {};
  let subId = "";
  if (type === "invoice.payment_failed") {
    let invoice = obj;
    try {
      invoice = await stripeInvoiceFromWebhook(obj);
    } catch (e) {}
    const reason = String((invoice && invoice.billing_reason) || obj.billing_reason || "");
    if (reason === "subscription_create") {
      sendJson(res, 200, { received: true });
      return;
    }
    if (reason === "subscription_cycle") {
      try {
        await recordCycleInvoice(invoice, true);
      } catch (e) {
        console.error("Could not record failed renewal invoice:", e.message);
      }
      subId = subscriptionIdFromStripeObject(invoice) || subscriptionIdFromStripeObject(obj);
    }
  } else if (type === "customer.subscription.updated") {
    if (obj.status === "past_due" || obj.status === "unpaid") {
      subId = obj.id || "";
    }
  } else if (type === "customer.subscription.deleted") {
    clearBillingForSubscription(obj.id);
    sendJson(res, 200, { received: true });
    return;
  } else if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    try {
      await affiliateApi.logFromInvoice(obj, {});
    } catch (e) {
      console.error("Affiliate invoice log failed:", e.message);
    }
    try {
      const paidSubId = subscriptionIdFromStripeObject(obj);
      if (paidSubId) {
        const paidSub = await getStripeSubscription(paidSubId);
        await ensureSubscriptionReferral(
          paidSub,
          null,
          (obj.metadata && obj.metadata.referral_code) || ""
        );
      }
    } catch (e) {
      console.error("Could not keep referral on renewed subscription:", e.message);
    }
    try {
      await recordCycleInvoice(obj, false);
    } catch (e) {
      console.error("Could not record renewal invoice:", e.message);
    }
  }
  if (subId) await cancelStripeSubscriptionNow(subId);
  sendJson(res, 200, { received: true });
}

function handleStripeConfig(res) {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || "";
  if (!key) {
    sendJson(res, 500, { error: "Missing STRIPE_PUBLISHABLE_KEY" });
    return;
  }
  sendJson(res, 200, { publishableKey: key });
}

async function resolveInvoice(invoice) {
  if (!invoice) return null;
  if (typeof invoice === "string") {
    return stripeRequest("GET", "/invoices/" + encodeURIComponent(invoice), {
      "expand[]": ["payment_intent", "confirmation_secret"]
    });
  }
  if (typeof invoice === "object" && (invoice.payment_intent || invoice.confirmation_secret)) {
    return invoice;
  }
  if (typeof invoice === "object" && invoice.id) {
    return stripeRequest("GET", "/invoices/" + encodeURIComponent(invoice.id), {
      "expand[]": ["payment_intent", "confirmation_secret"]
    });
  }
  return invoice;
}

async function clientSecretFromInvoice(invoice) {
  const full = await resolveInvoice(invoice);
  if (!full) return { clientSecret: "", paymentIntentId: "" };

  const confirmation = full.confirmation_secret;
  if (confirmation && typeof confirmation === "object" && confirmation.client_secret) {
    return {
      clientSecret: confirmation.client_secret,
      paymentIntentId: confirmation.stripe_id || full.payment_intent || ""
    };
  }

  let intent = full.payment_intent;
  if (typeof intent === "string") {
    intent = await stripeRequest("GET", "/payment_intents/" + encodeURIComponent(intent));
  }
  if (intent && typeof intent === "object" && intent.client_secret) {
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id || "" };
  }

  return { clientSecret: "", paymentIntentId: "" };
}

async function createPaymentClientSecret(plan, email, orderId, user, affiliate) {
  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) {
    const err = new Error("Unknown plan.");
    err.status = 400;
    throw err;
  }

  const price = await stripeRequest("GET", "/prices/" + encodeURIComponent(priceId));
  const selfReferral = !!(affiliate && user && user.id && affiliate.user_id === user.id);
  const referral = selfReferral ? null : affiliate;
  const referralCode = referral ? referral.code : "";
  const discountIds = referral ? await affiliateApi.prepareDiscount(referral) : { couponId: "", promoId: "" };

  async function createStripeSubscription(baseParams) {
    const attempts = referralCode ? affiliateApi.discountAttempts(discountIds) : [{}];
    if (!attempts.length) attempts.push({});
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        return await stripeRequest("POST", "/subscriptions", Object.assign({}, baseParams, attempts[i]));
      } catch (err) {
        lastErr = err;
        if (!/unknown parameter|invalid|no such coupon|promotion|discount/i.test(String(err.message || ""))) {
          throw err;
        }
      }
    }
    throw lastErr || new Error("Could not start this subscription.");
  }

  if (price.recurring) {
    const customer = await findOrCreateStripeCustomer(user, email);
    const subscriptionParams = {
      customer: customer.id,
      "items[0][price]": priceId,
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "payment_settings[payment_method_types][0]": "card",
      "expand[]": ["latest_invoice.payment_intent", "latest_invoice.confirmation_secret"],
      "metadata[plan]": plan,
      "metadata[orderId]": orderId || "",
      "metadata[userId]": (user && user.id) || "",
      "metadata[referral_code]": referralCode
    };
    const subscription = await createStripeSubscription(subscriptionParams);
    var liveSub = subscription;
    if (referralCode) {
      liveSub = await ensureSubscriptionReferral(subscription, user, referralCode);
    }
    const secret = await clientSecretFromInvoice((liveSub && liveSub.latest_invoice) || subscription.latest_invoice);
    if (!secret.clientSecret) {
      const err = new Error("Could not start card payment for this subscription.");
      err.status = 500;
      throw err;
    }
    if (user && user.id) {
      const stored = billingByUser.get(user.id);
      const patch = {
        customerId: customer.id,
        email: email || (user.email || "")
      };
      if (!stored || !stored.subscriptionId) {
        patch.plan = plan;
        patch.subscriptionId = subscription.id;
      }
      if (referralCode) patch.referralCode = referralCode;
      upsertBilling(user.id, patch);
    }
    var invoiceAmount = 0;
    var latest = subscription.latest_invoice;
    if (latest && typeof latest === "object") invoiceAmount = Number(latest.amount_due || latest.amount_paid || latest.total || 0);
    return {
      clientSecret: secret.clientSecret,
      paymentIntentId: secret.paymentIntentId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      amount: invoiceAmount || Number(price.unit_amount) || 0,
      currency: String(price.currency || "eur"),
      referralCode: referralCode,
      discountPercent: referralCode ? affiliateApi.DISCOUNT_PERCENT : 0
    };
  }

  var amount = Number(price.unit_amount) || 0;
  if (referralCode) {
    amount = Math.max(50, Math.round(amount * (100 - affiliateApi.DISCOUNT_PERCENT) / 100));
  }
  const intent = await stripeRequest("POST", "/payment_intents", {
    amount: String(amount),
    currency: price.currency || "eur",
    "payment_method_types[0]": "card",
    "metadata[plan]": plan,
    "metadata[orderId]": orderId || "",
    "metadata[referral_code]": referralCode,
    "metadata[original_amount]": String(price.unit_amount || ""),
    receipt_email: looksLikeEmail(email) ? email : undefined
  });
  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: Number(intent.amount || amount) || 0,
    currency: String(intent.currency || price.currency || "eur"),
    referralCode: referralCode,
    discountPercent: referralCode ? affiliateApi.DISCOUNT_PERCENT : 0
  };
}

async function handleCreatePaymentIntent(req, res) {
  const body = await readJsonBody(req);
  const user = await authUserFromReq(req);
  let plan = String(body.plan || "month");
  const orderId = String(body.orderId || "").replace(/\D/g, "");
  if (orderId) {
    const order = getOrder(orderId);
    if (!order) {
      sendJson(res, 404, { error: "Order not found." });
      return;
    }
    plan = order.plan;
    if (order.paid) {
      sendJson(res, 409, { error: "This order is already paid.", invoiceId: order.id });
      return;
    }
    if (isOrderExpired(order)) {
      sendJson(res, 410, { error: "This order has expired." });
      return;
    }
    if (user && user.id) {
      order.userId = user.id;
      if (user.email) order.email = user.email;
      saveOrders();
    }
  }
  if (user && user.id) {
    let existing = null;
    try {
      existing = await stripeSubscriptionForUser(user);
    } catch (e) {}
    if (canSchedulePlanChange(existing)) {
      sendJson(res, 409, {
        error: "You already have an active subscription. Switch plans from your account — you keep access until the current period ends.",
        hasSubscription: true,
        redirect: "/account/#subscriptions"
      });
      return;
    }
  }
  const email = String(body.email || (user && user.email) || "").trim();
  let affiliate = null;
  try {
    affiliate = await affiliateApi.resolveReferral(req, Object.prototype.hasOwnProperty.call(body, "ref") ? body.ref : undefined);
  } catch (e) {}
  const result = await createPaymentClientSecret(plan, email, orderId, user, affiliate);
  if (orderId) {
    const order = getOrder(orderId);
    if (order) {
      const sentRef = Object.prototype.hasOwnProperty.call(body, "ref") ? String(body.ref || "").trim() : "x";
      order.referralCode = result.referralCode || "";
      order.referralCleared = !sentRef;
      order.discountPercent = result.discountPercent || 0;
      order.dueCents = result.amount;
      if (result.customerId) order.stripeCustomerId = result.customerId;
      if (result.subscriptionId) order.subscriptionId = result.subscriptionId;
      if (email) order.email = email;
      saveOrders();
    }
  }
  sendJson(res, 200, result);
}

async function handleGetPaymentIntent(req, res, url) {
  const id = url.searchParams.get("id") || "";
  if (!/^pi_[a-zA-Z0-9]+/.test(id)) {
    sendJson(res, 400, { error: "Missing payment." });
    return;
  }
  const intent = await stripeRequest("GET", "/payment_intents/" + encodeURIComponent(id));
  sendJson(res, 200, {
    paid: intent.status === "succeeded",
    email: intent.receipt_email || "",
    plan: (intent.metadata && intent.metadata.plan) || "",
    orderId: (intent.metadata && intent.metadata.orderId) || ""
  });
}

async function handleCreateCheckout(req, res) {
  const body = await readJsonBody(req);
  const user = await authUserFromReq(req);
  if (user && user.id) {
    let existing = null;
    try {
      existing = await stripeSubscriptionForUser(user);
    } catch (e) {}
    if (canSchedulePlanChange(existing)) {
      sendJson(res, 409, {
        error: "You already have an active subscription. Switch plans from your account — you keep access until the current period ends.",
        hasSubscription: true,
        redirect: "/account/#subscriptions"
      });
      return;
    }
  }
  const plan = String(body.plan || "month");
  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) {
    sendJson(res, 400, { error: "Unknown plan." });
    return;
  }

  const email = String(body.email || "").trim();
  if (!looksLikeEmail(email)) {
    sendJson(res, 400, { error: "A valid email is required to pay." });
    return;
  }

  const price = await stripeRequest("GET", "/prices/" + encodeURIComponent(priceId));
  const mode = price.recurring ? "subscription" : "payment";
  const origin = originFromReq(req);
  const cancelUrl = origin + "/order/" + encodeURIComponent(String(body.orderId || plan));

  const session = await stripeRequest("POST", "/checkout/sessions", {
    mode: mode,
    customer_email: email,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    success_url: origin + "/checkout/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: cancelUrl,
    "metadata[plan]": plan,
    "metadata[username]": String(body.username || "").slice(0, 80),
    client_reference_id: String(body.userId || "").slice(0, 200) || undefined
  });

  sendJson(res, 200, { url: session.url });
}

async function handleGetCheckoutSession(req, res, url) {
  const sessionId = url.searchParams.get("session_id") || "";
  if (!/^cs_[a-zA-Z0-9]+/.test(sessionId)) {
    sendJson(res, 400, { error: "Missing checkout session." });
    return;
  }

  const session = await stripeRequest("GET", "/checkout/sessions/" + encodeURIComponent(sessionId));
  const paid = session.payment_status === "paid" || session.status === "complete";
  sendJson(res, 200, {
    paid: paid,
    email: session.customer_email || (session.customer_details && session.customer_details.email) || "",
    plan: (session.metadata && session.metadata.plan) || ""
  });
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = safeJoin(req.url);
  if (!filePath && (urlPath === "/" || urlPath === "")) {
    filePath = findExistingFile("index.html");
  }
  if (!filePath) {
    send(res, 404, "Not found");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, function (err, data) {
    if (err) {
      send(res, 500, "Server error");
      return;
    }
    const payload = ext === ".html" ? injectSmartNav(data) : data;
    res.writeHead(200, { "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : payload);
  });
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, SITE_URL + "/");
  const pathname = (url.pathname || "/").replace(/\/+$/, "") || "/";

  try {
    if (pathname === "/api/stripe/webhook") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/stripe/webhook." });
        return;
      }
      await handleStripeWebhook(req, res);
      return;
    }
    if (pathname === "/api/stripe-config") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Use GET for /api/stripe-config." });
        return;
      }
      handleStripeConfig(res);
      return;
    }
    if (pathname === "/api/create-payment-intent") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/create-payment-intent." });
        return;
      }
      await handleCreatePaymentIntent(req, res);
      return;
    }
    if (pathname === "/api/payment-intent") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Use GET for /api/payment-intent." });
        return;
      }
      await handleGetPaymentIntent(req, res, url);
      return;
    }
    var apiOrderPaid = pathname.match(/^\/api\/order\/(\d{7})\/paid$/);
    if (apiOrderPaid) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/order/:id/paid." });
        return;
      }
      await handleMarkOrderPaid(req, res, apiOrderPaid[1]);
      return;
    }
    var apiOrderClaim = pathname.match(/^\/api\/order\/(\d{7})\/claim$/);
    if (apiOrderClaim) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/order/:id/claim." });
        return;
      }
      await handleClaimOrder(req, res, apiOrderClaim[1]);
      return;
    }
    if (pathname === "/api/account/orders") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await handleAccountOrders(req, res);
        return;
      }
      if (req.method === "DELETE") {
        await handleCancelAccountOrder(req, res, url);
        return;
      }
      sendJson(res, 405, { error: "Use GET or DELETE for /api/account/orders." });
      return;
    }
    if (pathname === "/api/loader/access") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await handleLoaderAccess(req, res);
        return;
      }
      sendJson(res, 405, { error: "Use GET for /api/loader/access." });
      return;
    }
    if (pathname === "/api/account/subscription") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await handleAccountSubscription(req, res);
        return;
      }
      if (req.method === "POST") {
        await handleAccountSubscriptionAction(req, res);
        return;
      }
      sendJson(res, 405, { error: "Use GET or POST for /api/account/subscription." });
      return;
    }
    if (pathname === "/api/account/devices") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-IP"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await handleAccountDevices(req, res);
        return;
      }
      if (req.method === "DELETE") {
        await handleDeleteAccountDevice(req, res, url);
        return;
      }
      sendJson(res, 405, { error: "Use GET or DELETE for /api/account/devices." });
      return;
    }
    if (pathname === "/api/display-name/available") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/display-name/available." });
        return;
      }
      await handleDisplayNameAvailable(req, res);
      return;
    }
    if (pathname === "/api/display-name") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/display-name." });
        return;
      }
      await handleSaveDisplayName(req, res);
      return;
    }
    if (pathname === "/api/affiliates/me") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await affiliateApi.handleGetMine(req, res);
        return;
      }
      if (req.method === "POST") {
        await affiliateApi.handleSaveMethods(req, res);
        return;
      }
      sendJson(res, 405, { error: "Use GET or POST for /api/affiliates/me." });
      return;
    }
    if (pathname === "/api/coupon") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/coupon." });
        return;
      }
      await affiliateApi.handleValidateCoupon(req, res);
      return;
    }
    if (pathname === "/api/affiliates/payout") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "POST") {
        await affiliateApi.handleRequestPayout(req, res);
        return;
      }
      sendJson(res, 405, { error: "Use POST for /api/affiliates/payout." });
      return;
    }
    if (pathname === "/api/admin/login") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/admin/login." });
        return;
      }
      await affiliateApi.handleAdminLogin(req, res);
      return;
    }
    if (pathname === "/api/admin/logout") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/admin/logout." });
        return;
      }
      await affiliateApi.handleAdminLogout(req, res);
      return;
    }
    if (pathname === "/api/admin/payouts") {
      if (req.method === "GET") {
        await affiliateApi.handleAdminList(req, res);
        return;
      }
      if (req.method === "POST") {
        await affiliateApi.handleAdminUpdate(req, res);
        return;
      }
      sendJson(res, 405, { error: "Use GET or POST for /api/admin/payouts." });
      return;
    }
    var apiInvoice = pathname.match(/^\/api\/invoice\/(\d{7})$/);
    if (apiInvoice) {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Use GET for /api/invoice." });
        return;
      }
      handleGetInvoice(res, apiInvoice[1]);
      return;
    }
    var apiOrder = pathname.match(/^\/api\/order\/(\d{7})$/);
    if (apiOrder) {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Use GET for /api/order." });
        return;
      }
      await handleGetOrder(req, res, apiOrder[1]);
      return;
    }
    if (pathname === "/api/reviews") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        await handleListReviews(req, res, url);
        return;
      }
      if (req.method === "POST") {
        await handleCreateReview(req, res);
        return;
      }
      if (req.method === "DELETE") {
        await handleDeleteReview(req, res, url);
        return;
      }
      sendJson(res, 405, { error: "Use GET, POST or DELETE for /api/reviews." });
      return;
    }
    var apiReviewHelpful = pathname.match(
      /^\/api\/reviews\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/helpful$/i
    );
    if (apiReviewHelpful) {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/reviews/:id/helpful." });
        return;
      }
      await handleReviewHelpful(res, apiReviewHelpful[1]);
      return;
    }
    if (pathname === "/api/create-checkout-session") {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        });
        res.end();
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Use POST for /api/create-checkout-session." });
        return;
      }
      await handleCreateCheckout(req, res);
      return;
    }
    if (pathname === "/api/checkout-session") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Use GET for /api/checkout-session." });
        return;
      }
      await handleGetCheckoutSession(req, res, url);
      return;
    }
    if (pathname.indexOf("/api/") === 0) {
      sendJson(res, 404, { error: "Unknown API route." });
      return;
    }
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || "Payment error." });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (pathname === "/affiliates" || pathname === "/affiliates/index.html") {
      serveAccountPage(req, res);
      return;
    }
    if (pathname === "/admin" || pathname === "/admin/index.html") {
      serveAdminPage(req, res);
      return;
    }
    if (pathname === "/settings" || pathname === "/clients/purchases" || pathname === "/clients/orders" || pathname === "/clients/subscriptions") {
      var dest = "/account/";
      if (pathname === "/clients/purchases") dest = "/account/#purchases";
      if (pathname === "/clients/orders") dest = "/account/#orders";
      if (pathname === "/clients/subscriptions") dest = "/account/#subscriptions";
      res.writeHead(302, { Location: dest });
      res.end();
      return;
    }
    if (pathname === "/order") {
      const plan = url.searchParams.get("plan") || "";
      const id = createOrder(plan);
      if (!id) {
        res.writeHead(302, { Location: "/index.html#pricing" });
        res.end();
        return;
      }
      res.writeHead(302, { Location: "/order/" + id });
      res.end();
      return;
    }
    const orderPath = pathname.match(/^\/order\/(\d{7})$/);
    if (orderPath) {
      const existing = getOrder(orderPath[1]);
      if (existing && (existing.paid || existing.error)) {
        res.writeHead(302, { Location: "/invoice/" + orderPath[1] });
        res.end();
        return;
      }
      serveCheckoutPage(req, res);
      return;
    }
    const invoicePath = pathname.match(/^\/invoice\/(\d{7})$/);
    if (invoicePath) {
      serveCheckoutPage(req, res);
      return;
    }
  }

  serveStatic(req, res);
});

module.exports = server;

if (!process.env.VERCEL) {
  server.on("error", function (err) {
    if (err && err.code === "EADDRINUSE") {
      console.error("Port " + PORT + " is already in use.");
      console.error("The site is already running at " + SITE_URL + " (port " + PORT + ")");
      console.error("Close the other terminal running node/server.js, then start again.");
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, function () {
    console.log("Script Engine server: " + SITE_URL + " (listening on port " + PORT + ")");
    console.log("Open " + SITE_URL + " in the browser. file:// will block login/register.");
  });
}
