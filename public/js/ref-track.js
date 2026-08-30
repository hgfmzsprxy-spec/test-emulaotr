(function () {
  "use strict";

  var COOKIE = "gc_ref";
  var DAYS = 30;

  function validCode(value) {
    return /^[A-Z0-9]{3,40}$/.test(String(value || "").toUpperCase());
  }

  function readCookie(name) {
    var parts = String(document.cookie || "").split(/;\s*/);
    for (var i = 0; i < parts.length; i++) {
      var row = parts[i];
      var eq = row.indexOf("=");
      if (eq < 0) continue;
      if (row.slice(0, eq) === name) {
        try {
          return decodeURIComponent(row.slice(eq + 1));
        } catch (err) {
          return row.slice(eq + 1);
        }
      }
    }
    return "";
  }

  function writeCookie(code) {
    var maxAge = DAYS * 24 * 60 * 60;
    document.cookie =
      COOKIE +
      "=" +
      encodeURIComponent(code) +
      "; Max-Age=" +
      maxAge +
      "; Path=/; SameSite=Lax";
  }

  try {
    var params = new URLSearchParams(location.search);
    var ref = String(params.get("ref") || "").trim().toUpperCase();
    if (validCode(ref)) writeCookie(ref);
  } catch (err) {}

  window.gcReferralCode = function () {
    var code = String(readCookie(COOKIE) || "").trim().toUpperCase();
    return validCode(code) ? code : "";
  };

  window.gcSetReferralCode = function (value) {
    var code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!validCode(code)) return "";
    writeCookie(code);
    return code;
  };
})();
