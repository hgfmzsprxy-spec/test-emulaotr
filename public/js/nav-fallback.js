(function () {
  "use strict";

  function findMenu(trigger) {
    if (!trigger || !trigger.id) return null;
    var menu = document.getElementById(trigger.id + "_menu");
    if (menu) return menu;
    var appendTo = trigger.getAttribute("data-ipsMenu-appendTo");
    if (!appendTo) return null;
    var container = document.querySelector(appendTo);
    return container ? container.querySelector(".ipsMenu") : null;
  }

  function closeMenus(except) {
    document.querySelectorAll(".ipsMenu").forEach(function (menu) {
      if (menu !== except) menu.classList.add("ipsHide");
    });
  }

  function bindDropdowns() {
    document.querySelectorAll("a[data-ipsMenu]").forEach(function (trigger) {
      if (trigger.dataset.gcNavBound) return;
      trigger.dataset.gcNavBound = "1";
      trigger.addEventListener("click", function (event) {
        var menu = findMenu(trigger);
        if (!menu) return;
        event.preventDefault();
        var willOpen = menu.classList.contains("ipsHide");
        closeMenus();
        if (willOpen) menu.classList.remove("ipsHide");
      });
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest("a[data-ipsMenu]") || event.target.closest(".ipsMenu")) return;
      closeMenus();
    });

    document.body.classList.remove("ipsJS_none");
  }

  function init() {
    if (typeof window.ips !== "undefined" && !document.body.classList.contains("ipsJS_none")) return;
    bindDropdowns();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 1200);
    });
  } else {
    setTimeout(init, 1200);
  }
})();
