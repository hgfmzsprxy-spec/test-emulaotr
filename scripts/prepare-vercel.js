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

function copyEntry(src, destDir) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyTree(src, path.join(destDir, path.basename(src)));
    return;
  }

  ensureDir(destDir);
  const dest = path.join(destDir, path.basename(src));
  fs.copyFileSync(src, dest);

  const alias = aliasName(path.basename(src));
  if (alias !== path.basename(src)) {
    fs.copyFileSync(src, path.join(destDir, alias));
  }
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

function patchHtml(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  const next = html
    .replace(/https:\/\/ghostcheats\.com\//g, "/")
    .replace(/\/\/ghostcheats\.com\//g, "/")
    .replace(
      /<link rel="preload" href="\/applications\/core\/interface\/font\/fontawesome-webfont\.woff2[^"]*"[^>]*>\s*/i,
      ""
    )
    .replace(
      /<link rel="manifest" href="\/manifest\.webmanifest\/">\s*/i,
      ""
    );
  if (next !== html) fs.writeFileSync(filePath, next);
}

function patchHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchHtmlFiles(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".html")) {
      patchHtml(full);
    }
  }
}

rimraf(PUBLIC);
ensureDir(PUBLIC);

STATIC_DIRS.forEach(function (name) {
  copyTree(path.join(ROOT, name), path.join(PUBLIC, name));
});

patchHtmlFiles(ROOT);

console.log("Vercel public assets prepared in public/");
