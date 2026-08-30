const fs = require("fs");
const path = require("path");

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

const HTML_DIRS = [
  "account",
  "admin",
  "affiliates",
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

const SKIP_DIRS = new Set([
  "api",
  "scripts",
  "data",
  "node_modules",
  "public",
  "snippets",
  "sql",
  ".git",
  ".vercel"
]);

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

function patchHtmlContent(html) {
  return html
    .replace(/https:\/\/ghostcheats\.com\//g, "/")
    .replace(/\/\/ghostcheats\.com\//g, "/")
    .replace(
      /<link rel="preload" href="\/applications\/core\/interface\/font\/fontawesome-webfont\.woff2[^"]*"[^>]*>\s*/gi,
      ""
    )
    .replace(/<link rel="manifest" href="\/manifest\.webmanifest\/">\s*/gi, "");
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
    writeHtmlMirror(
      path.join(srcDir, entry),
      path.join(PUBLIC, name, entry)
    );
  }
});

console.log("Vercel public mirror ready:", countFiles(PUBLIC), "files in public/");
