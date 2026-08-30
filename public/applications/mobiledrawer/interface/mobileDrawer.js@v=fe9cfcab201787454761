(function () {
    'use strict';

    if (window.__ipsMobileDrawerAppLoaded) {
        return;
    }
    window.__ipsMobileDrawerAppLoaded = true;

    var DRAWER_SELECTOR = '#elMobileDrawer';
    var TRIGGER_SELECTOR = '[data-mobile-drawer-trigger], [data-ipsdrawer-drawerelem="#elMobileDrawer"], [data-ipsDrawer-drawerElem="#elMobileDrawer"]';
    var TITLE_LINK_SELECTOR = '.ipsDrawer_itemParent > .ipsDrawer_title > a';
    var OPEN_CLASS = 'mobileDrawer-open';
    var MANAGED_CLASS = 'mobileDrawer-managed';
    var ITEM_OPEN_CLASS = 'is-open';
    var MOBILE_QUERY = '(max-width: 979px)';
    var drawer = null;
    var menu = null;
    var overlay = null;
    var busy = false;
    var initializedDrawer = null;

    var HEADER_SELECTOR = '.theme-header--p > .ipsLayout_container';
    var BOTTOM_TAB_SELECTOR = '.theme-mobile_navigation';
    var CART_MOUNT_ID = 'mobileCartMount';
    var FALLBACK_CART_ID = 'mobileCartFallback_container';

    var nativeCart = null;
    var nativeCartPlaceholder = null;
    var nativeCartWasHidden = false;
    var syncingCart = false;

    function isMobile() {
        return window.matchMedia(MOBILE_QUERY).matches;
    }

    function directChildByClass(parent, className) {
        if (!parent) {
            return null;
        }

        for (var index = 0; index < parent.children.length; index++) {
            if (parent.children[index].classList.contains(className)) {
                return parent.children[index];
            }
        }

        return null;
    }

    function getBaseUrl() {
        if (window.ips && typeof window.ips.getSetting === 'function') {
            var configuredBaseUrl = window.ips.getSetting('baseURL');

            if (configuredBaseUrl) {
                return String(configuredBaseUrl).replace(/\/?$/, '/');
            }
        }

        return window.location.origin + '/';
    }

    function hideBottomTabBar(root) {
        var scope = root && root.querySelectorAll ? root : document;

        if (scope.matches && scope.matches(BOTTOM_TAB_SELECTOR)) {
            scope.hidden = true;
            scope.setAttribute('aria-hidden', 'true');
        }

        scope.querySelectorAll(BOTTOM_TAB_SELECTOR).forEach(function (tabBar) {
            tabBar.hidden = true;
            tabBar.setAttribute('aria-hidden', 'true');
        });
    }

    function createMobileMenuTrigger() {
        var wrapper = document.createElement('div');
        wrapper.className = 'mobile-menu-trigger';
        wrapper.setAttribute('data-mobile-drawer-header-control', '');

        var list = document.createElement('ul');
        list.className = 'ipsMobileHamburger ipsList_reset ipsResponsive_hideDesktop';

        var item = document.createElement('li');
        item.setAttribute('data-mobile-drawer-trigger', '');
        item.setAttribute('aria-controls', 'elMobileDrawer');
        item.setAttribute('aria-expanded', 'false');

        var link = document.createElement('a');
        link.href = '#';
        link.setAttribute('aria-label', 'Open navigation');

        var icon = document.createElement('i');
        icon.className = 'fa fa-navicon';
        icon.setAttribute('aria-hidden', 'true');

        link.appendChild(icon);
        item.appendChild(link);
        list.appendChild(item);
        wrapper.appendChild(list);

        return wrapper;
    }

    function ensureMobileHeaderControls() {
        var header = document.querySelector(HEADER_SELECTOR);

        if (!header) {
            return false;
        }

        header.querySelectorAll('.mobile-cart-trigger').forEach(function (legacyCart) {
            legacyCart.remove();
        });

        var trigger = directChildByClass(header, 'mobile-menu-trigger');

        if (!trigger) {
            trigger = createMobileMenuTrigger();
            header.insertBefore(trigger, header.firstChild);
        } else if (!trigger.querySelector('[data-mobile-drawer-trigger], [data-ipsdrawer-drawerelem="#elMobileDrawer"], [data-ipsDrawer-drawerElem="#elMobileDrawer"]')) {
            var replacement = createMobileMenuTrigger();
            trigger.replaceWith(replacement);
            trigger = replacement;
        }

        var actions = directChildByClass(header, 'mobile-header-actions');

        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'mobile-header-actions';
            actions.setAttribute('data-mobile-drawer-header-control', '');

            if (trigger.nextSibling) {
                header.insertBefore(actions, trigger.nextSibling);
            } else {
                header.appendChild(actions);
            }
        }

        var cartMount = document.getElementById(CART_MOUNT_ID);

        if (!cartMount || cartMount.parentNode !== actions) {
            if (!cartMount) {
                cartMount = document.createElement('ul');
                cartMount.id = CART_MOUNT_ID;
                cartMount.className = 'mobile-cart-mount ipsList_inline';
                cartMount.setAttribute('aria-label', 'Shopping cart');
            }

            actions.appendChild(cartMount);
        }

        prepareTriggers(trigger);
        return true;
    }

    function removeNativeCartPlaceholder() {
        if (nativeCartPlaceholder && nativeCartPlaceholder.parentNode) {
            nativeCartPlaceholder.parentNode.removeChild(nativeCartPlaceholder);
        }

        nativeCartPlaceholder = null;
    }

    function locateNativeCart() {
        if (nativeCart && document.documentElement.contains(nativeCart)) {
            return true;
        }

        var candidate = document.getElementById('elCart_container');

        if (!candidate) {
            nativeCart = null;
            return false;
        }

        removeNativeCartPlaceholder();

        nativeCart = candidate;
        nativeCartPlaceholder = document.createComment('mobile-drawer-native-cart-position');
        nativeCart.parentNode.insertBefore(nativeCartPlaceholder, nativeCart);
        nativeCartWasHidden = nativeCart.classList.contains('ipsHide');

        return true;
    }

    function cartUrl() {
        return getBaseUrl() + 'index.php?app=nexus&module=store&controller=cart';
    }

    function storeUrl() {
        return getBaseUrl() + 'index.php?app=nexus&module=store&controller=store';
    }

    function notifyIpsContentChange(node) {
        if (window.jQuery) {
            window.jQuery(document).trigger('contentChange', [node]);
        }
    }

    function createFallbackCart() {
        var existing = document.getElementById(FALLBACK_CART_ID);

        if (existing) {
            return existing;
        }

        var container = document.createElement('li');
        container.id = FALLBACK_CART_ID;
        container.className = 'cUserNav_icon mobile-cart-fallback';

        var trigger = document.createElement('a');
        trigger.id = 'mobileCartFallback';
        trigger.href = cartUrl();
        trigger.setAttribute('data-ipsMenu', '');
        trigger.setAttribute('data-ipsMenu-closeOnClick', 'false');
        trigger.setAttribute('aria-label', 'Your cart');

        var icon = document.createElement('i');
        icon.className = 'fa fa-shopping-cart';
        icon.setAttribute('aria-hidden', 'true');

        var count = document.createElement('span');
        count.className = 'ipsNotificationCount';
        count.textContent = '0';

        var label = document.createElement('span');
        label.className = 'mobile-cart-label';
        label.textContent = 'Cart';

        trigger.appendChild(icon);
        trigger.appendChild(count);
        trigger.appendChild(label);

        var menu = document.createElement('div');
        menu.id = 'mobileCartFallback_menu';
        menu.className = 'ipsMenu ipsMenu_wide ipsHide';
        menu.innerHTML =
            '<div class="ipsMenu_headerBar">' +
                '<h4 class="ipsType_sectionHead">Your cart</h4>' +
            '</div>' +
            '<div class="ipsMenu_innerContent ipsPad">' +
                '<div class="ipsType_center ipsType_light">Your cart is empty.</div>' +
            '</div>' +
            '<div class="ipsMenu_footerBar ipsType_center">' +
                '<a class="ipsButton ipsButton_small ipsButton_primary" href="' + storeUrl() + '">Start shopping</a>' +
            '</div>';

        container.appendChild(trigger);
        container.appendChild(menu);
        notifyIpsContentChange(container);

        return container;
    }

    function removeFallbackCart() {
        var fallback = document.getElementById(FALLBACK_CART_ID);

        if (fallback) {
            fallback.remove();
        }
    }

    function restoreNativeCart() {
        if (!nativeCart || !nativeCartPlaceholder || !nativeCartPlaceholder.parentNode) {
            return;
        }

        if (nativeCart.parentNode !== nativeCartPlaceholder.parentNode) {
            nativeCartPlaceholder.parentNode.insertBefore(nativeCart, nativeCartPlaceholder.nextSibling);
        }

        if (nativeCartWasHidden) {
            nativeCart.classList.add('ipsHide');
        }
    }

    function syncNativeCartPosition() {
        if (syncingCart) {
            return;
        }

        syncingCart = true;

        try {
            if (!ensureMobileHeaderControls()) {
                return;
            }

            var mount = document.getElementById(CART_MOUNT_ID);

            if (!mount) {
                return;
            }

            if (!isMobile()) {
                restoreNativeCart();
                removeFallbackCart();
                return;
            }

            if (locateNativeCart()) {
                removeFallbackCart();

                if (nativeCart.parentNode !== mount) {
                    mount.appendChild(nativeCart);
                }

                nativeCart.classList.remove('ipsHide');
            } else {
                var fallback = createFallbackCart();

                if (fallback.parentNode !== mount) {
                    mount.appendChild(fallback);
                }
            }
        } finally {
            syncingCart = false;
        }
    }

    function getDrawer() {
        if (!drawer || !document.documentElement.contains(drawer)) {
            drawer = document.querySelector(DRAWER_SELECTOR);
            menu = drawer ? drawer.querySelector('.ipsDrawer_menu') : null;

            if (initializedDrawer && initializedDrawer !== drawer) {
                initializedDrawer = null;
            }
        }

        return drawer;
    }

    function createOverlay() {
        if (overlay && document.documentElement.contains(overlay)) {
            return overlay;
        }

        overlay = document.createElement('button');
        overlay.type = 'button';
        overlay.className = 'mobileDrawer-overlay';
        overlay.setAttribute('aria-label', 'Close navigation');
        overlay.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeDrawer();
        });

        document.body.appendChild(overlay);
        return overlay;
    }

    function prepareTriggers(root) {
        var scope = root && root.querySelectorAll ? root : document;

        scope.querySelectorAll('[data-ipsdrawer-drawerelem="#elMobileDrawer"], [data-ipsDrawer-drawerElem="#elMobileDrawer"]').forEach(function (trigger) {
            trigger.removeAttribute('data-ipsdrawer');
            trigger.removeAttribute('data-ipsDrawer');
            trigger.setAttribute('data-mobile-drawer-trigger', '');
            trigger.setAttribute('aria-controls', 'elMobileDrawer');
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    function resetSubmenus() {
        if (!drawer) {
            return;
        }

        drawer.querySelectorAll('.ipsDrawer_itemParent').forEach(function (parent) {
            parent.classList.remove(ITEM_OPEN_CLASS);
        });

        drawer.querySelectorAll(TITLE_LINK_SELECTOR).forEach(function (link) {
            link.removeAttribute('href');
            link.setAttribute('role', 'button');
            link.setAttribute('tabindex', '0');
            link.setAttribute('aria-expanded', 'false');

            var title = link.closest('.ipsDrawer_title');
            var submenu = title ? title.nextElementSibling : null;

            if (submenu && submenu.classList.contains('ipsDrawer_list')) {
                /*
                 * IPS adds ipsDrawer_subMenu for its native full-page submenu.
                 * Remove it so this application can render the list inline.
                 */
                submenu.classList.remove('ipsDrawer_subMenu');
                submenu.style.position = 'static';
                submenu.style.left = 'auto';
                submenu.style.right = 'auto';
                submenu.style.top = 'auto';
                submenu.style.transform = 'none';
                submenu.style.marginLeft = '0';
                submenu.style.marginRight = '0';
                submenu.style.display = 'none';
                submenu.style.height = '0px';
                submenu.style.opacity = '0';
                submenu.style.overflow = '';
                submenu.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function mountMobileDrawer() {
        if (!drawer) {
            return;
        }

        /*
         * Keep the drawer mounted and laid out off-screen on mobile.
         * This prevents iOS Safari from doing a full first-open layout/paint,
         * which could make the guest Sign In and Sign Up buttons appear late.
         */
        drawer.classList.remove('ipsHide');
        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', drawer.classList.contains(OPEN_CLASS) ? 'false' : 'true');
    }

    function prepareDrawer() {
        var currentDrawer = getDrawer();
        if (!currentDrawer || !menu) {
            return false;
        }

        if (initializedDrawer === currentDrawer) {
            if (isMobile()) {
                mountMobileDrawer();
            } else {
                forceDesktopClosed();
            }

            return true;
        }

        initializedDrawer = currentDrawer;

        currentDrawer.classList.add(MANAGED_CLASS);
        currentDrawer.setAttribute('aria-hidden', currentDrawer.classList.contains(OPEN_CLASS) ? 'false' : 'true');

        var closeButton = currentDrawer.querySelector('.ipsDrawer_close');
        if (closeButton) {
            closeButton.hidden = true;
        }

        currentDrawer.querySelectorAll('[data-action="back"]').forEach(function (back) {
            back.hidden = true;
        });

        resetSubmenus();
        createOverlay();

        if (isMobile()) {
            mountMobileDrawer();
        } else {
            forceDesktopClosed();
        }

        return true;
    }

    function setTriggerState(open) {
        document.querySelectorAll('[data-mobile-drawer-trigger]').forEach(function (trigger) {
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }


    function openDrawer(event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        if (!isMobile() || !prepareDrawer()) {
            return false;
        }

        mountMobileDrawer();

        window.requestAnimationFrame(function () {
            document.documentElement.classList.add('mobileDrawer-lock');
            document.body.classList.add('mobileDrawer-lock');
            drawer.classList.add(OPEN_CLASS);
            drawer.setAttribute('aria-hidden', 'false');
            overlay.classList.add(OPEN_CLASS);
            setTriggerState(true);
        });

        return false;
    }

    function closeDrawer() {
        if (!drawer) {
            return;
        }


        drawer.classList.remove(OPEN_CLASS);
        drawer.setAttribute('aria-hidden', 'true');

        if (overlay) {
            overlay.classList.remove(OPEN_CLASS);
        }

        document.documentElement.classList.remove('mobileDrawer-lock');
        document.body.classList.remove('mobileDrawer-lock');
        setTriggerState(false);

        /*
         * Do not set display:none on mobile after closing. The off-screen panel
         * remains mounted so all guest/member controls are ready immediately
         * on the next opening.
         */
        if (!isMobile()) {
            forceDesktopClosed();
        }
    }

    function forceDesktopClosed() {

        if (drawer) {
            drawer.classList.remove(OPEN_CLASS);
            drawer.classList.add('ipsHide');
            drawer.style.display = 'none';
            drawer.setAttribute('aria-hidden', 'true');
        }

        if (overlay) {
            overlay.classList.remove(OPEN_CLASS);
        }

        document.documentElement.classList.remove('mobileDrawer-lock');
        document.body.classList.remove('mobileDrawer-lock');
        setTriggerState(false);
    }

    function finishClosed(submenu) {
        submenu.style.display = 'none';
        submenu.style.height = '0px';
        submenu.style.opacity = '0';
        submenu.style.overflow = '';
        submenu.setAttribute('aria-hidden', 'true');
    }

    function closeSubmenu(parent, submenu, callback) {
        parent.classList.remove(ITEM_OPEN_CLASS);

        var link = parent.querySelector('.ipsDrawer_title > a');
        if (link) {
            link.setAttribute('aria-expanded', 'false');
        }

        var startHeight = submenu.getBoundingClientRect().height;
        submenu.style.display = 'block';
        submenu.style.height = startHeight + 'px';
        submenu.style.opacity = '1';
        submenu.style.overflow = 'hidden';

        window.requestAnimationFrame(function () {
            submenu.style.height = '0px';
            submenu.style.opacity = '0';
        });

        var completed = false;
        var done = function (event) {
            if (completed || (event && event.propertyName !== 'height')) {
                return;
            }

            completed = true;
            submenu.removeEventListener('transitionend', done);
            finishClosed(submenu);

            if (callback) {
                callback();
            }
        };

        submenu.addEventListener('transitionend', done);
        window.setTimeout(done, 240);
    }

    function openSubmenu(parent, submenu, callback) {
        submenu.style.display = 'block';
        submenu.style.height = '0px';
        submenu.style.opacity = '0';
        submenu.style.overflow = 'hidden';
        submenu.setAttribute('aria-hidden', 'false');

        var targetHeight = submenu.scrollHeight;

        parent.classList.add(ITEM_OPEN_CLASS);

        var link = parent.querySelector('.ipsDrawer_title > a');
        if (link) {
            link.setAttribute('aria-expanded', 'true');
        }

        window.requestAnimationFrame(function () {
            submenu.style.height = targetHeight + 'px';
            submenu.style.opacity = '1';
        });

        var completed = false;
        var done = function (event) {
            if (completed || (event && event.propertyName !== 'height')) {
                return;
            }

            completed = true;
            submenu.removeEventListener('transitionend', done);
            submenu.style.height = 'auto';
            submenu.style.opacity = '1';
            submenu.style.overflow = '';

            if (callback) {
                callback();
            }
        };

        submenu.addEventListener('transitionend', done);
        window.setTimeout(done, 240);
    }

    function toggleSubmenu(link, event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        if (!isMobile() || busy || !getDrawer()) {
            return false;
        }

        var title = link.closest('.ipsDrawer_title');
        var parent = title ? title.parentElement : null;
        var submenu = title ? title.nextElementSibling : null;

        if (!parent || !submenu || !submenu.classList.contains('ipsDrawer_list')) {
            return false;
        }

        busy = true;

        if (parent.classList.contains(ITEM_OPEN_CLASS)) {
            closeSubmenu(parent, submenu, function () {
                busy = false;
            });
            return false;
        }

        var openParent = drawer.querySelector('.ipsDrawer_itemParent.' + ITEM_OPEN_CLASS);

        if (openParent && openParent !== parent) {
            var openTitle = openParent.querySelector('.ipsDrawer_title');
            var openMenu = openTitle ? openTitle.nextElementSibling : null;

            if (openMenu) {
                closeSubmenu(openParent, openMenu, function () {
                    openSubmenu(parent, submenu, function () {
                        busy = false;
                    });
                });
                return false;
            }
        }

        openSubmenu(parent, submenu, function () {
            busy = false;
        });

        return false;
    }

    function eventElement(event) {
        var target = event ? event.target : null;

        if (!target) {
            return null;
        }

        return target.nodeType === 1 ? target : target.parentElement;
    }

    function onDocumentClick(event) {
        var target = eventElement(event);
        if (!target) {
            return;
        }

        var trigger = target.closest(TRIGGER_SELECTOR);

        if (trigger) {
            openDrawer(event);
            return;
        }

        var titleLink = target.closest(TITLE_LINK_SELECTOR);

        if (titleLink && titleLink.closest(DRAWER_SELECTOR)) {
            toggleSubmenu(titleLink, event);
            return;
        }

        if (drawer && drawer.classList.contains(OPEN_CLASS)) {
            var actualLink = target.closest('.ipsDrawer_list a[href]');

            if (actualLink && !actualLink.closest('.ipsDrawer_title')) {
                closeDrawer();
            }
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            closeDrawer();
            return;
        }

        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches(TITLE_LINK_SELECTOR)) {
            toggleSubmenu(event.target, event);
        }
    }

    function initialize(root) {
        hideBottomTabBar(root);
        ensureMobileHeaderControls();
        prepareTriggers(root);
        prepareDrawer();
        syncNativeCartPosition();
    }

    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    function start() {
        initialize(document);

        window.setTimeout(syncNativeCartPosition, 250);
        window.setTimeout(syncNativeCartPosition, 1000);

        document.addEventListener('contentChange', function () {
            window.setTimeout(function () {
                initialize(document);
            }, 0);
        });

        var observer = new MutationObserver(function (mutations) {
            var drawerReplaced = false;

            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) {
                        return;
                    }

                    if (node.matches && node.matches(DRAWER_SELECTOR)) {
                        drawerReplaced = true;
                    } else if (node.querySelector && node.querySelector(DRAWER_SELECTOR)) {
                        drawerReplaced = true;
                    }

                    hideBottomTabBar(node);
                    prepareTriggers(node);

                    if (
                        (node.matches && (
                            node.matches('#elCart_container') ||
                            node.matches(HEADER_SELECTOR) ||
                            node.matches(BOTTOM_TAB_SELECTOR)
                        )) ||
                        (node.querySelector && (
                            node.querySelector('#elCart_container') ||
                            node.querySelector(HEADER_SELECTOR) ||
                            node.querySelector(BOTTOM_TAB_SELECTOR)
                        ))
                    ) {
                        window.setTimeout(function () {
                            ensureMobileHeaderControls();
                            syncNativeCartPosition();
                        }, 0);
                    }
                });
            });

            if (drawerReplaced) {
                drawer = null;
                menu = null;
                initializedDrawer = null;
                initialize(document);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        var mediaQuery = window.matchMedia(MOBILE_QUERY);
        var mediaHandler = function (event) {
            if (!event.matches) {
                forceDesktopClosed();
                syncNativeCartPosition();
            } else {
                initialize(document);
            }
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', mediaHandler);
        } else {
            mediaQuery.addListener(mediaHandler);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}());
