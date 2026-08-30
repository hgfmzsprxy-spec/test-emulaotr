"use strict";

const AUTH_BUNDLE =
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n' +
  '<script src="/js/supabase-config.js"></script>\n' +
  '<script src="/js/auth.js?v=discord-2"></script>\n';

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

  // Broken tags from an old patch: <script "/js/foo.js"> or <a class="x" "/path">
  out = out.replace(/<script\s+"(\/[^"]+)"><\/script>/gi, '<script src="$1"></script>');
  out = out.replace(/<a\b([^>]*?)\s+"(\/[^"]+)">/gi, '<a$1 href="$2">');
  out = out.replace(/<img\b([^>]*?)\s+"(\/[^"]+)"/gi, '<img$1 src="$2"');

  // Normalize site scripts to absolute paths.
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

  return out;
}

module.exports = { patchHtmlContent, AUTH_BUNDLE };
