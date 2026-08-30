const fs = require("fs");
const path = require("path");
const { patchHtmlContent } = require("./html-patch");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const STATIC_DIRS = [
  "css",
  "js",
  "images",
  "uploads",
  "applications",
  "loader",
  "audio",
  "cdn-cgi"
];

const REQUIRED_PATHS = [
  "uploads/javascript_global/root_library.js",
  "uploads/css_built_18/90eb5adf50a8c640f633d47fd7eb1778_core.css",
  "applications/mobiledrawer/interface/mobileDrawer.css",
  "css/site-theme.css",
  "js/auth.js"
];

const HTML_DIRS = [
  "account",
  "admin",
  "checkout",
  "configs",
  "content-creators",
  "cookies",
  "loader",
  "login",
  "lostpassword",
  "register",
  "resellers",
  "reviews",
  "status",
  "subscriptions",
  "support",
  "supportsys",
  "terms"
];

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function aliasName(name) {
  return name
    .replace(/\.css@v=[^@]+\.css$/i, ".css")
    .replace(/\.js@v=[^@]+\.js$/i, ".js")
    .replace(/\.css@v=[^@]+$/i, ".css")
    .replace(/\.js@v=[^@]+$/i, ".js");
}

function copyTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, entry);
    const dest = path.join(destDir, entry);
    if (fs.statSync(src).isDirectory()) {
      copyTree(src, dest);
      continue;
    }
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    const alias = aliasName(entry);
    if (alias !== entry) {
      fs.copyFileSync(src, path.join(path.dirname(dest), alias));
    }
  }
}

function writeHtmlMirror(src, dest) {
  ensureDir(path.dirname(dest));
  const html = patchHtmlContent(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(dest, html);
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(full);
    else total += 1;
  }
  return total;
}

function findExistingAsset(root, relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  const direct = path.join(root, rel);
  if (fs.existsSync(direct)) return direct;

  const fileName = path.basename(rel);
  const parentRel = path.dirname(rel);
  const alias = aliasName(fileName);
  if (alias !== fileName) {
    const aliasPath = path.join(root, parentRel, alias);
    if (fs.existsSync(aliasPath)) return aliasPath;
  }

  const dir = path.join(root, parentRel);
  if (!fs.existsSync(dir)) return null;
  const matches = fs.readdirSync(dir).filter(function (name) {
    return name === fileName || name.indexOf(fileName + "@v=") === 0;
  });
  return matches.length ? path.join(dir, matches[0]) : null;
}

rimraf(PUBLIC);
ensureDir(PUBLIC);

STATIC_DIRS.forEach(function (name) {
  copyTree(path.join(ROOT, name), path.join(PUBLIC, name));
});

if (fs.existsSync(path.join(ROOT, "index.html"))) {
  writeHtmlMirror(path.join(ROOT, "index.html"), path.join(PUBLIC, "index.html"));
}

HTML_DIRS.forEach(function (name) {
  const srcDir = path.join(ROOT, name);
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir)) {
    if (!entry.endsWith(".html")) continue;
    writeHtmlMirror(path.join(srcDir, entry), path.join(PUBLIC, name, entry));
  }
});

// /affiliates/ must show the account dashboard with the referral panel, not the old IPS page.
const accountHtml = path.join(ROOT, "account", "index.html");
if (fs.existsSync(accountHtml)) {
  writeHtmlMirror(accountHtml, path.join(PUBLIC, "affiliates", "index.html"));
}

const missing = REQUIRED_PATHS.filter(function (rel) {
  return !findExistingAsset(ROOT, rel) && !findExistingAsset(PUBLIC, rel);
});

if (missing.length) {
  console.error("Vercel build missing required assets:");
  missing.forEach(function (rel) {
    console.error("  -", rel);
  });
  process.exit(1);
}

console.log("Vercel public mirror ready:", countFiles(PUBLIC), "files in public/");
