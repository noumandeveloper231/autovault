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

  const LOGIN_BY_PORTAL = {
    wholesale: "/wholesale/login",
    sales_rep: "/sales-rep/login",
    owner: "/owner/login",
    cpa: "/cpa/login",
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
    return localStorage.getItem(tokenStorageKey(portal)) || "";
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
      : normalizePortal(claims.portal || localStorage.getItem("avAuthPortal"));
    // Never overwrite the admin portal cookie/key while a support tab is open
    if (!impersonating) {
      localStorage.setItem("avAuthPortal", claimedPortal);
    }
    return {
      token,
      portal: claimedPortal,
      name: claims.name || "",
      sub: claims.sub || "",
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
      redirect(LOGIN_BY_PORTAL[routePortal]);
      return;
    }
    if (session.portal !== routePortal) {
      redirect(DASHBOARD_BY_PORTAL[session.portal]);
      return;
    }
    document.documentElement.classList.remove("av-auth-pending");
  }

  function guardLogin() {
    const routePortal = getRoutePortal();
    const session = readSession(routePortal);
    if (!session) return;
    if (session.portal === routePortal) {
      redirect(DASHBOARD_BY_PORTAL[session.portal]);
    }
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
        if (!resp.ok) throw new Error(data.message || "Session expired");
        const portal = normalizePortal(data.user?.portal);
        localStorage.setItem("avAuthPortal", portal);
        const routePortal = getRoutePortal();
        if (routePortal !== portal) {
          redirect(data.redirectDashboardPath || DASHBOARD_BY_PORTAL[portal]);
        }
      })
      .catch(() => {
        clearSession(routePortal);
        if (typeof onInvalid === "function") onInvalid();
        else {
          redirect(LOGIN_BY_PORTAL[routePortal]);
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
