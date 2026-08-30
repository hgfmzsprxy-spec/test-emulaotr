(function () {
  "use strict";

  var root = document.getElementById("reseller-panel");
  if (!root) return;

  var tabs = root.querySelectorAll("[data-tab]");
  var panes = root.querySelectorAll("[data-pane]");

  function show(id) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute("data-tab") === id;
      tab.classList.toggle("is-on", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach(function (pane) {
      pane.hidden = pane.getAttribute("data-pane") !== id;
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      show(tab.getAttribute("data-tab"));
    });
  });

  var form = document.getElementById("gcGenerateForm");
  var out = document.getElementById("gcGeneratedKey");
  var rows = document.getElementById("gcKeyRows");
  if (form && out) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var chunk = function () {
        return Math.random().toString(36).slice(2, 6).toUpperCase();
      };
      var key = "GC-" + chunk() + "-" + chunk() + "-" + chunk();
      var product = (document.getElementById("gcGenProduct") || {}).value || "Script Engine";
      var duration = (document.getElementById("gcGenDuration") || {}).value || "30 days";
      out.textContent = key;
      out.hidden = false;
      if (rows) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          key +
          "</td><td>" +
          product +
          "</td><td>" +
          duration +
          '</td><td><span class="gc-pill gc-pill-ok">Unused</span></td>';
        rows.insertBefore(tr, rows.firstChild);
      }
    });
  }
})();
