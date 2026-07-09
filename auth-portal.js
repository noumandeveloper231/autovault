(function (global) {
  const API_URL =
    global.AUTOVAULT_API_URL ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://autovault-backend-cbdp.onrender.com");

  const DASHBOARD_BY_PORTAL = {
    wholesale: "/wholesale/dashboard",
    sales_rep: "/sales-rep/dashbaord",
    admin: "/dashboard",
  };

  const LOGIN_BY_PORTAL = {
    wholesale: "/wholesale/login",
    sales_rep: "/sales-rep/login",
    admin: "/login",
  };

  function normalizePortal(value) {
    const portal = String(value || "").trim().toLowerCase();
    if (portal === "sales-rep") return "sales_rep";
    if (portal === "wholesale") return "wholesale";
    if (portal === "sales_rep") return "sales_rep";
    return "admin";
  }

  function getRoutePortal() {
    const params = new URLSearchParams(location.search);
    const queryPortal = normalizePortal(params.get("portal"));
    if (params.has("portal")) return queryPortal;
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/wholesale/")) return "wholesale";
    if (path.startsWith("/sales-rep/")) return "sales_rep";
    return "admin";
  }

  function getToken() {
    return localStorage.getItem("avAuthToken") || "";
  }

  function clearSession() {
    localStorage.removeItem("avAuthToken");
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

  function readSession() {
    const token = getToken();
    if (!token) return null;
    const claims = parseJwt(token);
    if (!claims || !claims.exp || claims.exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
    const portal = normalizePortal(claims.portal || localStorage.getItem("avAuthPortal"));
    localStorage.setItem("avAuthPortal", portal);
    return {
      token,
      portal,
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
    const session = readSession();
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
    const session = readSession();
    if (!session) return;
    if (session.portal === routePortal) {
      redirect(DASHBOARD_BY_PORTAL[session.portal]);
    }
  }

  function verifySessionInBackground(onInvalid) {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/auth/me`, {
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
        clearSession();
        if (typeof onInvalid === "function") onInvalid();
        else {
          const routePortal = getRoutePortal();
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
