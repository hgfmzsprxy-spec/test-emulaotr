(function () {
  try {
    var q = String(location.search || "");
    var h = String(location.hash || "");
    var marked = /(?:^|[?&#])se_loader=1(?:[&]|$)/.test(q + h);
    var flagged = false;
    try {
      var ts = parseInt(sessionStorage.getItem("se_loader_oauth") || "", 10);
      flagged = !!ts && Date.now() - ts < 10 * 60 * 1000;
    } catch (e) {}
    var hasAuth = /(?:^|[?&#])(?:code|access_token|error)=/.test(q + h);
    if (!(marked || flagged) || !hasAuth) return;
    try {
      sessionStorage.removeItem("se_loader_oauth");
    } catch (e) {}
    var data = q.replace(/^\?/, "");
    var hash = h.replace(/^#/, "");
    if (hash) data = data ? data + "&" + hash : hash;
    location.replace("http://127.0.0.1:17864/callback" + (data ? "?" + data : ""));
  } catch (e) {}
})();
