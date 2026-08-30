const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const HTML_DIRS = [
  "",
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

function patchHtmlContent(html) {
  return html
    .replace(/https:\/\/ghostcheats\.com\//g, "/")
    .replace(/\/\/ghostcheats\.com\//g, "/")
    .replace(/baseURL:\s*"\.\.\/"/g, 'baseURL: "/"')
    .replace(/baseURL:\s*"\.\/"/g, 'baseURL: "/"')
    .replace(/(href|src)=(["'])\.\.\//g, "$1=$2/")
    .replace(
      /(href|src)=(["'])(?!\/|https?:|#|data:|mailto:|tel:|javascript:)(css|js|images)\//g,
      "$1=$2/$3/"
    )
    .replace(/rel=(["'])stylesheet\1\s+["']\/([^"']+)["']/g, 'rel=$1stylesheet$1 href="/$2"')
    .replace(/rel=(["'])shortcut icon\1\s+["']\/([^"']+)["']/g, 'rel=$1shortcut icon$1 href="/$2"')
    .replace(/href=(["'])css\//g, 'href=$1/css/')
    .replace(/href=(["'])images\//g, 'href=$1/images/')
    .replace(/src=(["'])js\//g, 'src=$1/js/')
    .replace(/src=(["'])images\//g, 'src=$1/images/')
    .replace(
      /<link rel="preload" href="\/applications\/core\/interface\/font\/fontawesome-webfont\.woff2[^"]*"[^>]*>\s*/gi,
      ""
    )
    .replace(/<link rel="manifest" href="\/manifest\.webmanifest\/">\s*/gi, "");
}

let changed = 0;

HTML_DIRS.forEach(function (dirName) {
  const folder = dirName ? path.join(ROOT, dirName) : ROOT;
  if (!fs.existsSync(folder)) return;

  const entries = dirName
    ? fs.readdirSync(folder).filter(function (name) {
        return name.endsWith(".html");
      })
    : ["index.html"];

  entries.forEach(function (fileName) {
    const filePath = path.join(folder, fileName);
    if (!fs.existsSync(filePath)) return;
    const before = fs.readFileSync(filePath, "utf8");
    const after = patchHtmlContent(before);
    if (after !== before) {
      fs.writeFileSync(filePath, after);
      changed += 1;
      console.log("patched:", path.relative(ROOT, filePath));
    }
  });
});

console.log("HTML path patch complete:", changed, "file(s) updated");
