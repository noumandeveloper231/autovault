(function (global) {
  const API_URL =
    global.AUTOVAULT_API_URL ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://autovault-backend-cbdp.onrender.com");

  const DASHBOARD_BY_PORTAL = {
    wholesale: "/wholesale/dashboard",
    sales_rep: "/sales-rep/dashbaord",
    owner: "/owner/dashboard",
    admin: "/dashboard",
  };

  const LOGIN_BY_PORTAL = {
    wholesale: "/wholesale/login",
    sales_rep: "/sales-rep/login",
    owner: "/owner/login",
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
    return "admin";
  }

  function getRoutePortal() {
    const params = new URLSearchParams(location.search);
    const queryPortal = normalizePortal(params.get("portal"));
    if (params.has("portal")) return queryPortal;
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/owner/")) return "owner";
    if (path.startsWith("/wholesale/")) return "wholesale";
    if (path.startsWith("/sales-rep/")) return "sales_rep";
    return "admin";
  }

  function tokenStorageKey(portal) {
    return normalizePortal(portal) === "owner" ? TOKEN_BY_PORTAL.owner : TOKEN_BY_PORTAL.default;
  }

  function getToken(portal) {
    return localStorage.getItem(tokenStorageKey(portal)) || "";
  }

  function clearSession(portal) {
    const key = tokenStorageKey(portal);
    localStorage.removeItem(key);
    localStorage.removeItem("avAuthToken");
    localStorage.removeItem("avOwnerToken");
    localStorage.removeItem("avAuthPortal");
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
    const token = getToken(normalizedPortal);
    if (!token) return null;
    const claims = parseJwt(token);
    if (!claims || !claims.exp || claims.exp * 1000 <= Date.now()) {
      clearSession(normalizedPortal);
      return null;
    }
    const claimedPortal = normalizePortal(claims.portal || localStorage.getItem("avAuthPortal"));
    localStorage.setItem("avAuthPortal", claimedPortal);
    return {
      token,
      portal: claimedPortal,
      name: claims.name || "",
      sub: claims.sub || "",
    };
  }

  function redirect(url) {
    if (location.pathname + location.search !== url) {
      location.replace(url);
    }
  }

  function guardDashboard() {
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
