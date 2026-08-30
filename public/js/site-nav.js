(function () {
  "use strict";

  var OPEN_DELAY = 70;
  var CLOSE_DELAY = 180;
  var activeItem = null;
  var pinnedItem = null;

  function injectStyles() {
    if (document.getElementById("gc-site-nav-styles")) return;
    var style = document.createElement("style");
    style.id = "gc-site-nav-styles";
    style.textContent =
      ".theme-navbar .ipsNavBar_primary > ul[data-role=\"primaryNavBar\"] > li[data-role=\"navBarItem\"]{position:relative}" +
      ".theme-navbar .ipsNavBar_primary > ul[data-role=\"primaryNavBar\"] > li[data-role=\"navBarItem\"] > ul.ipsMenu.ghostNavHoverMenu.ipsHide," +
      ".theme-navbar .ipsNavBar_primary > ul[data-role=\"primaryNavBar\"] > li[data-role=\"navBarItem\"] > ul.ipsMenu.ipsHide{" +
      "display:block!important;position:absolute!important;top:100%!important;left:0!important;right:auto!important;" +
      "z-index:10000!important;margin-top:0!important;visibility:hidden!important;opacity:0!important;" +
      "pointer-events:none!important;transform:translateY(6px);transition:opacity .12s ease,transform .12s ease,visibility 0s linear .12s}" +
      ".theme-navbar .ipsNavBar_primary > ul[data-role=\"primaryNavBar\"] > li[data-role=\"navBarItem\"].ghostNavHoverOpen > ul.ipsMenu," +
      ".theme-navbar .ipsNavBar_primary > ul[data-role=\"primaryNavBar\"] > li[data-role=\"navBarItem\"].gcNavOpen > ul.ipsMenu{" +
      "display:block!important;position:absolute!important;top:100%!important;left:0!important;right:auto!important;" +
      "z-index:10000!important;margin-top:0!important;visibility:visible!important;opacity:1!important;" +
      "pointer-events:auto!important;transform:translateY(0);transition-delay:0s}";
    document.head.appendChild(style);
  }

  function desktopHoverEnabled() {
    return window.matchMedia("(min-width: 980px) and (hover: hover)").matches;
  }

  function directChild(item, selector) {
    var children = item ? item.children : [];
    var index;
    for (index = 0; index < children.length; index += 1) {
      if (children[index].matches(selector)) return children[index];
    }
    return null;
  }

  function findTrigger(item) {
    return directChild(item, "a[data-ipsMenu]") || item.querySelector("a[data-ipsMenu]");
  }

  function findMenu(item, trigger) {
    var menuTrigger = trigger || findTrigger(item);
    if (!menuTrigger) return null;

    if (menuTrigger.id) {
      var byId = document.getElementById(menuTrigger.id + "_menu");
      if (byId) return byId;
    }

    var appendTo = menuTrigger.getAttribute("data-ipsMenu-appendTo");
    if (appendTo) {
      var container = document.querySelector(appendTo);
      if (container) {
        var inContainer = container.querySelector("ul.ipsMenu");
        if (inContainer) return inContainer;
      }
    }

    return directChild(item, "ul.ipsMenu") || item.querySelector("ul.ipsMenu");
  }

  function clearTimer(item, property) {
    if (item && item[property]) {
      window.clearTimeout(item[property]);
      item[property] = null;
    }
  }

  function closeItem(item, force) {
    if (!item) return;
    if (!force && item === pinnedItem) return;

    clearTimer(item, "_ghostNavOpenTimer");
    clearTimer(item, "_ghostNavCloseTimer");

    item.classList.remove("ghostNavHoverOpen", "ghostNavPinnedOpen", "gcNavOpen");

    var trigger = findTrigger(item);
    var menu = findMenu(item, trigger);

    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.classList.add("ipsHide");
      menu.setAttribute("aria-hidden", "true");
    }

    if (activeItem === item) activeItem = null;
    if (pinnedItem === item) pinnedItem = null;
  }

  function openItem(item, pin) {
    if (!item) return;
    if (desktopHoverEnabled()) {
      if (!pin && pinnedItem && pinnedItem !== item) return;
      if (pin && pinnedItem && pinnedItem !== item) closeItem(pinnedItem, true);
      if (activeItem && activeItem !== item) closeItem(activeItem, true);
    }

    var trigger = findTrigger(item);
    var menu = findMenu(item, trigger);
    if (!trigger || !menu) return;

    menu.classList.add("ghostNavHoverMenu");
    menu.classList.remove("ipsHide");
    menu.setAttribute("aria-hidden", "false");
    item.classList.add("ghostNavHoverOpen", "gcNavOpen");
    trigger.setAttribute("aria-expanded", "true");
    activeItem = item;

    if (pin) {
      item.classList.add("ghostNavPinnedOpen");
      pinnedItem = item;
    }
  }

  function bindItem(item) {
    if (!item || item.dataset.gcSiteNavBound === "1") return;

    var trigger = findTrigger(item);
    var menu = findMenu(item, trigger);
    if (!trigger || !menu) return;

    item.dataset.gcSiteNavBound = "1";
    menu.classList.add("ghostNavHoverMenu");

    item.addEventListener("mouseenter", function () {
      if (!desktopHoverEnabled()) return;
      clearTimer(item, "_ghostNavCloseTimer");
      item._ghostNavOpenTimer = window.setTimeout(function () {
        openItem(item, false);
      }, OPEN_DELAY);
    });

    item.addEventListener("mouseleave", function () {
      if (!desktopHoverEnabled()) return;
      if (item === pinnedItem) return;
      clearTimer(item, "_ghostNavOpenTimer");
      item._ghostNavCloseTimer = window.setTimeout(function () {
        closeItem(item, false);
      }, CLOSE_DELAY);
    });

    trigger.addEventListener(
      "click",
      function (event) {
        if (!menu) return;

        if (desktopHoverEnabled()) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          clearTimer(item, "_ghostNavOpenTimer");
          clearTimer(item, "_ghostNavCloseTimer");
          if (item.classList.contains("ghostNavPinnedOpen")) {
            closeItem(item, true);
          } else {
            openItem(item, true);
          }
          return;
        }

        event.preventDefault();
        var willOpen = menu.classList.contains("ipsHide") || !item.classList.contains("gcNavOpen");
        closeAll(true);
        if (willOpen) openItem(item, true);
      },
      true
    );
  }

  function bindAll() {
    var items = document.querySelectorAll(
      '.theme-navbar .ipsNavBar_primary > ul[data-role="primaryNavBar"] > li[data-role="navBarItem"]'
    );
    Array.prototype.forEach.call(items, bindItem);
  }

  function closeAll(force) {
    document.querySelectorAll(".theme-navbar .ghostNavHoverOpen, .theme-navbar .gcNavOpen").forEach(function (item) {
      closeItem(item, force);
    });
  }

  function init() {
    injectStyles();
    bindAll();

    var navigation = document.querySelector(".theme-navbar .ipsNavBar_primary");
    if (navigation && window.MutationObserver) {
      new MutationObserver(bindAll).observe(navigation, { childList: true, subtree: true });
    }

    window.addEventListener("resize", function () {
      if (!desktopHoverEnabled()) closeAll(true);
    });

    document.addEventListener(
      "pointerdown",
      function (event) {
        if (activeItem && !activeItem.contains(event.target)) closeAll(true);
      },
      true
    );

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAll(true);
    });

    if (document.body) document.body.classList.remove("ipsJS_none");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
