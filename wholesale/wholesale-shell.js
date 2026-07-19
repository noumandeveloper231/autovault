/**
 * Wholesale CRM shell — Plan 1 dedicated portal entry helpers.
 * Enforces wholesaler-only navigation when served under /wholesale/*.
 * Shared libs: auth-portal.js, api.js, toast.js, wholesale-live.js.
 * UI pages remain in the dashboard SPA (Vercel rewrite) with ws-mode chrome only.
 */
(function (global) {
  if (global.AVWholesaleShell) return;

  var WS_PAGES = {
    "ws-dashboard": true,
    "ws-vehicles": true,
    "ws-vehicle-detail": true,
    "ws-sold": true,
    "ws-pnl": true,
    "ws-expenses": true,
  };

  function isWholesalePortal() {
    try {
      if (global.AVPortal && typeof AVPortal.getRoutePortal === "function") {
        return AVPortal.getRoutePortal() === "wholesale";
      }
    } catch (_) {}
    var path = (location.pathname || "").toLowerCase();
    if (path.startsWith("/wholesale/")) return true;
    try {
      return new URLSearchParams(location.search).get("portal") === "wholesale";
    } catch (_) {
      return false;
    }
  }

  function allowPage(pageId) {
    if (!isWholesalePortal()) return true;
    return !!WS_PAGES[pageId];
  }

  function boot() {
    if (!isWholesalePortal()) return;
    document.documentElement.classList.add("ws-portal");
    if (document.body) document.body.classList.add("ws-mode");
    else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.classList.add("ws-mode");
      });
    }
  }

  boot();

  global.AVWholesaleShell = {
    isWholesalePortal: isWholesalePortal,
    allowPage: allowPage,
    WS_PAGES: WS_PAGES,
  };
})(window);
