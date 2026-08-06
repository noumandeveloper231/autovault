(function (global) {
  const API_URL =
    global.AUTOVAULT_API_URL ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://autovault-backend-cbdp.onrender.com");

  const DASHBOARD_BY_PORTAL = {
    wholesale: "/wholesale/dashboard",
    sales_rep: "/sales-rep/dashboard",
    owner: "/owner/dashboard",
    cpa: "/cpa/dashboard",
    admin: "/dashboard",
  };

  // One shared login for all dealership portals; owner stays separate.
  const LOGIN_BY_PORTAL = {
    wholesale: "/login",
    sales_rep: "/login",
    owner: "/owner/login",
    cpa: "/login",
    admin: "/login",
  };

  const TOKEN_BY_PORTAL = {
    owner: "avOwnerToken",
    default: "avAuthToken",
  };

  function normalizePortal(value) {
    const portal = String(value || "").trim().toLowerCase();
    if (portal === "sales-rep") return "sales_rep";
    if (portal === "wholesale") return "wholesale";
    if (portal === "sales_rep") return "sales_rep";
    if (portal === "owner") return "owner";
    if (portal === "cpa") return "cpa";
    return "admin";
  }

  function getRoutePortal() {
    const params = new URLSearchParams(location.search);
    if (params.has("portal")) return normalizePortal(params.get("portal"));
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/owner/")) return "owner";
    if (path.startsWith("/wholesale/")) return "wholesale";
    if (path.startsWith("/sales-rep/")) return "sales_rep";
    if (path.startsWith("/cpa/")) return "cpa";
    return "admin";
  }

  function tokenStorageKey(portal) {
    return normalizePortal(portal) === "owner" ? TOKEN_BY_PORTAL.owner : TOKEN_BY_PORTAL.default;
  }

  function getToken(portal) {
    try {
      if (sessionStorage.getItem("avImpersonation") && sessionStorage.getItem("avImpAccessToken")) {
        return sessionStorage.getItem("avImpAccessToken") || "";
      }
    } catch (_) {}
    const key = tokenStorageKey(portal);
    try {
      if (sessionStorage.getItem("av_session_only") === "1") {
        return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
      }
    } catch (_) {}
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function clearSession(portal) {
    try {
      if (sessionStorage.getItem("avImpersonation")) {
        sessionStorage.removeItem("avImpAccessToken");
        sessionStorage.removeItem("avImpersonation");
        sessionStorage.removeItem("avAdminSessionBackup");
        if (global.AVApi && typeof global.AVApi.clearImpersonationSession === "function") {
          global.AVApi.clearImpersonationSession();
        }
        return;
      }
    } catch (_) {}
    const key = tokenStorageKey(portal);
    localStorage.removeItem(key);
    localStorage.removeItem("avAuthToken");
    localStorage.removeItem("avOwnerToken");
    localStorage.removeItem("avRefreshToken");
    localStorage.removeItem("avOwnerRefreshToken");
    localStorage.removeItem("avAuthPortal");
    try {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem("avAuthToken");
      sessionStorage.removeItem("avOwnerToken");
      sessionStorage.removeItem("avRefreshToken");
      sessionStorage.removeItem("avOwnerRefreshToken");
      sessionStorage.removeItem("avAuthPortal");
      sessionStorage.removeItem("av_session_only");
    } catch (_) {}
    if (global.AVApi) global.AVApi.clearSession(portal);
  }

  function parseJwt(token) {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function portalFromClaims(claims) {
    if (!claims) return null;
    if (claims.portal) return normalizePortal(claims.portal);
    const role = String(claims.role || "").toLowerCase();
    if (role === "platform_owner") return "owner";
    if (role === "wholesale_dealer") return "wholesale";
    if (role === "sales_rep") return "sales_rep";
    if (role === "cpa") return "cpa";
    if (role === "owner" || role === "manager") return "admin";
    return null;
  }

  function readSession(portal) {
    const normalizedPortal = normalizePortal(portal || getRoutePortal());
    const impersonating = (function () {
      try {
        return !!(sessionStorage.getItem("avImpersonation") && sessionStorage.getItem("avImpAccessToken"));
      } catch (_) {
        return false;
      }
    })();
    const token = getToken(normalizedPortal);
    if (!token) return null;
    const claims = parseJwt(token);
    if (!claims || !claims.exp || claims.exp * 1000 <= Date.now()) {
      if (impersonating) {
        try {
          sessionStorage.removeItem("avImpAccessToken");
          sessionStorage.removeItem("avImpersonation");
        } catch (_) {}
        return null;
      }
      clearSession(normalizedPortal);
      return null;
    }
    const claimedPortal = impersonating
      ? "sales_rep"
      : portalFromClaims(claims) ||
        normalizePortal(
          localStorage.getItem("avAuthPortal") ||
            sessionStorage.getItem("avAuthPortal") ||
            "admin",
        );
    // Never overwrite the admin portal cookie/key while a support tab is open
    if (!impersonating) {
      try {
        if (sessionStorage.getItem("av_session_only") === "1") {
          sessionStorage.setItem("avAuthPortal", claimedPortal);
        } else {
          localStorage.setItem("avAuthPortal", claimedPortal);
        }
      } catch (_) {
        localStorage.setItem("avAuthPortal", claimedPortal);
      }
    }
    return {
      token,
      portal: claimedPortal,
      name: claims.name || "",
      email: claims.email || "",
      sub: claims.sub || "",
      role: claims.role || "",
      dealershipId: claims.dealershipId || null,
      mustResetPassword: !!claims.mustResetPassword,
      impersonation: !!claims.impersonation,
    };
  }

  function redirect(url) {
    if (location.pathname + location.search !== url) {
      location.replace(url);
    }
  }

  function guardDashboard() {
    // Pick up one-time support-login handoff before session checks (new tab)
    try {
      if (global.AVApi && typeof global.AVApi.consumeImpersonationHandoff === "function") {
        global.AVApi.consumeImpersonationHandoff();
      }
    } catch (_) {}
    document.documentElement.classList.add("av-auth-pending");
    const routePortal = getRoutePortal();
    const session = readSession(routePortal);
    if (!session) {
      redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
      return;
    }
    if (session.portal !== routePortal) {
      // Wrong role for this dashboard — clear and send to the correct login.
      clearSession(routePortal);
      redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
      return;
    }
    document.documentElement.classList.remove("av-auth-pending");
  }

  function guardLogin() {
    const routePortal = getRoutePortal();

    // Owner login stays isolated.
    if (routePortal === "owner") {
      const ownerSession = readSession("owner");
      if (ownerSession && ownerSession.portal === "owner") {
        redirect(DASHBOARD_BY_PORTAL.owner);
      }
      return;
    }

    // Unified /login — any valid non-owner session goes to its role dashboard.
    const session = readSession("admin");
    if (!session) return;
    if (session.portal === "owner") {
      clearSession("admin");
      return;
    }
    redirect(DASHBOARD_BY_PORTAL[session.portal] || "/dashboard");
  }

  function verifySessionInBackground(onInvalid) {
    const routePortal = getRoutePortal();
    const token = getToken(routePortal);
    if (!token) return;
    const meUrl = routePortal === "owner" ? `${API_URL}/api/owner/auth/me` : `${API_URL}/api/auth/me`;
    fetch(meUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resp) => resp.json().then((data) => ({ resp, data })))
      .then(({ resp, data }) => {
        // Only force logout on auth failures — not network/cold-start blips.
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(data.error?.message || data.message || "Session expired");
        }
        if (!resp.ok) return;
        const portal = normalizePortal(data.user?.portal);
        if (portal) localStorage.setItem("avAuthPortal", portal);
        if (routePortal !== portal && portal) {
          clearSession(routePortal);
          redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
        }
      })
      .catch((err) => {
        // Network errors: keep the local session; user can keep working offline-ish.
        if (!err || !/Session expired|Unauthorized|Invalid|no longer valid/i.test(String(err.message || ""))) {
          return;
        }
        clearSession(routePortal);
        if (typeof onInvalid === "function") onInvalid();
        else {
          redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
        }
      });
  }

  global.AVPortal = {
    API_URL,
    normalizePortal,
    getRoutePortal,
    getToken,
    clearSession,
    readSession,
    redirect,
    guardDashboard,
    guardLogin,
    verifySessionInBackground,
    dashboardPath: (portal) => DASHBOARD_BY_PORTAL[normalizePortal(portal)],
    loginPath: (portal) => LOGIN_BY_PORTAL[normalizePortal(portal)],
  };
})(window);
