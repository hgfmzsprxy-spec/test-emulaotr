"use strict";

const fs = require("fs");
const path = require("path");

const AUTH_BUNDLE =
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n' +
  '<script src="/js/supabase-config.js"></script>\n' +
  '<script src="/js/auth.js?v=discord-2"></script>\n';

const SITE_NAVBAR = fs.readFileSync(path.join(__dirname, "..", "partials", "site-navbar.html"), "utf8");

const STRIPPED_NAV_RE =
  /<nav>\s*<div class=['"]ipsNavBar_primary ipsLayout_container ipsNavBar_noSubBars['"]>[\s\S]*?Community Home[\s\S]*?<\/nav>/i;

const INLINE_GHOST_NAV_RE = /<script>\s*\/\* Desktop navigation hover preview[\s\S]*?<\/script>\s*/gi;

function normalizeNavLinks(html) {
  let out = html;
  out = out.replace(/href=(["'])#features\1/gi, "href=$1/index.html#features$1");
  out = out.replace(/href=(["'])#why-to-use\1/gi, "href=$1/index.html#why-to-use$1");
  out = out.replace(/href=(["'])#how-it-works\1/gi, "href=$1/index.html#how-it-works$1");
  out = out.replace(/href=(["'])#pricing\1/gi, "href=$1/index.html#pricing$1");
  out = out.replace(/href=(["'])(?:\.\.\/|\/)?content-creators\/index\.html\1/gi, "href=$1/content-creators/$1");
  out = out.replace(/href=(["'])(?:\.\.\/|\/)?resellers\/index\.html\1/gi, "href=$1/resellers/$1");
  out = out.replace(/href=(["'])(?:\.\.\/|\/)?reviews\/index\.html\1/gi, "href=$1/reviews/$1");
  out = out.replace(/href=(["'])(?:\.\.\/|\/)?configs\/index\.html\1/gi, "href=$1/configs/$1");
  out = out.replace(/href=(["'])(?:\.\.\/|\/)?affiliates\/index\.html\1/gi, "href=$1/affiliates/$1");
  return out;
}

function patchHtmlContent(html) {
  let out = String(html || "");

  out = out
    .replace(/https:\/\/ghostcheats\.com\//g, "/")
    .replace(/\/\/ghostcheats\.com\//g, "/")
    .replace(
      /<link rel="preload" href="\/applications\/core\/interface\/font\/fontawesome-webfont\.woff2[^"]*"[^>]*>\s*/gi,
      ""
    )
    .replace(/<link rel="manifest" href="\/manifest\.webmanifest\/">\s*/gi, "");

  // Broken tags from an old patch stripped href=/src= leaving quoted paths as fake attributes.
  out = out.replace(/<script\s+(['"])(\/?[^'"]+)\1\s*><\/script>/gi, "<script src=$1$2$1></script>");
  out = out.replace(/<a\b(?![^>]*\bhref=)([^>]*?)\s+(['"])(\/[^'"]+)\2/gi, "<a$1 href=$2$3$2");
  out = out.replace(/<img\b(?![^>]*\bsrc=)([^>]*?)\s+(['"])(\/[^'"]+)\2/gi, "<img$1 src=$2$3$2");

  if (STRIPPED_NAV_RE.test(out) && !/<nav[^>]*class=['"][^'"]*theme-navbar/i.test(out)) {
    out = out.replace(STRIPPED_NAV_RE, SITE_NAVBAR.trim());
  }

  out = normalizeNavLinks(out);
  out = out.replace(INLINE_GHOST_NAV_RE, "");

  out = out.replace(/<script\s+src="js\//gi, '<script src="/js/');
  out = out.replace(/<link\s+rel="stylesheet"\s+href="css\//gi, '<link rel="stylesheet" href="/css/');
  out = out.replace(/<link\s+rel="stylesheet"\s+href="\.\.\/css\//gi, '<link rel="stylesheet" href="/css/');

  if (!/\/js\/auth\.js/i.test(out) && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, AUTH_BUNDLE + "</body>");
  }

  if (out.indexOf("/js/ref-track.js") < 0 && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/js/ref-track.js"></script>\n</body>');
  }

  if (out.indexOf("/js/smart-nav.js") < 0 && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/js/smart-nav.js" defer></script>\n</body>');
  }

  out = out.replace(/<script src="\/js\/nav-fallback\.js"[^>]*><\/script>\s*/gi, "");

  if (out.indexOf("/js/site-nav.js") < 0 && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, '<script src="/js/site-nav.js" defer></script>\n</body>');
  }

  return out;
}

module.exports = { patchHtmlContent, AUTH_BUNDLE };
