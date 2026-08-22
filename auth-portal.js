(function (global) {
  const API_URL =
    global.AVApiConfig && typeof global.AVApiConfig.resolveApiUrl === "function"
      ? global.AVApiConfig.resolveApiUrl()
      : global.AUTOVAULT_API_URL ||
        (location.hostname === "localhost" || location.hostname === "127.0.0.1"
          ? "http://localhost:3000"
          : "https://api.autovault360.com");

  const DASHBOARD_BY_PORTAL = {
    wholesale: "/dashboard?portal=wholesale",
    sales_rep: "/dashboard?portal=sales_rep",
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

  function clearSessionFlags() {
    try {
      sessionStorage.removeItem("av_session_only");
      sessionStorage.removeItem("av_must_reset_password");
      sessionStorage.removeItem("av_intro_completed");
      sessionStorage.removeItem("av_terms_accepted");
    } catch (_) {}
    try {
      localStorage.removeItem("av_terms_accepted_db");
    } catch (_) {}
  }

  const ROLE_LABELS = {
    owner: "Dealer Admin",
    manager: "Manager",
    sales_rep: "Sales Rep",
    cpa: "CPA",
    wholesale_dealer: "Wholesale Dealer",
    platform_owner: "Platform Owner",
  };

  function roleLabel(role) {
    const key = String(role || "").toLowerCase();
    return ROLE_LABELS[key] || (role ? String(role) : "Signed in");
  }

  function initialsFrom(name, email) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const e = String(email || "").trim();
    if (e.length >= 2) return e.slice(0, 2).toUpperCase();
    return "AV";
  }

  function persistTokens(portal, accessToken, refreshToken) {
    const owner = normalizePortal(portal) === "owner";
    const accessKey = owner ? "avOwnerToken" : "avAuthToken";
    const refreshKey = owner ? "avOwnerRefreshToken" : "avRefreshToken";
    let sessionOnly = false;
    try {
      sessionOnly = sessionStorage.getItem("av_session_only") === "1";
    } catch (_) {}
    const store = sessionOnly ? sessionStorage : localStorage;
    if (accessToken) store.setItem(accessKey, accessToken);
    if (refreshToken) store.setItem(refreshKey, refreshToken);
    const claimed = portalFromClaims(parseJwt(accessToken)) || normalizePortal(portal);
    try {
      store.setItem("avAuthPortal", claimed);
    } catch (_) {}
  }

  function hasStoredAuth(portal) {
    return !!(getToken(portal) || readRefreshToken(portal));
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
    } catch (_) {}
    clearSessionFlags();
    if (global.AVApi) global.AVApi.clearSession(portal);
  }

  function hideAppShell() {
    try {
      document.documentElement.classList.add("av-auth-pending");
      document.documentElement.classList.add("av-logging-out");
    } catch (_) {}
    try {
      if (document.body) document.body.style.visibility = "hidden";
    } catch (_) {}
  }

  function revealDashboard() {
    try {
      document.documentElement.classList.remove("av-auth-pending");
      document.documentElement.classList.remove("av-logging-out");
    } catch (_) {}
    try {
      if (document.body) document.body.style.visibility = "";
    } catch (_) {}
  }

  function readRefreshToken(portal) {
    const owner = normalizePortal(portal) === "owner";
    const key = owner ? "avOwnerRefreshToken" : "avRefreshToken";
    try {
      if (sessionStorage.getItem("av_session_only") === "1") {
        return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
      }
    } catch (_) {}
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  /**
   * Safe logout for every portal:
   * hide UI first → revoke refresh token → wipe storage → replace to login.
   * Never strips portal body classes or renders the admin dashboard.
   */
  function logout(portal, opts) {
    const routePortal = normalizePortal(portal || getRoutePortal());
    hideAppShell();

    let refreshToken = "";
    try {
      refreshToken = readRefreshToken(routePortal);
    } catch (_) {}

    try {
      clearSession(routePortal);
    } catch (_) {}

    // Best-effort server revoke; do not block navigation.
    try {
      if (refreshToken) {
        const body = JSON.stringify({ refreshToken });
        if (typeof fetch === "function") {
          fetch(`${API_URL}/api/v1/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(function () {});
        }
      }
    } catch (_) {}

    const dest =
      opts && Object.prototype.hasOwnProperty.call(opts, "redirect")
        ? opts.redirect
        : LOGIN_BY_PORTAL[routePortal] || "/login";
    if (!dest) {
      revealDashboard();
      return;
    }
    try {
      location.replace(dest);
    } catch (_) {
      location.href = dest;
    }
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
    if (!claims || (claims.exp && claims.exp * 1000 <= Date.now())) {
      if (impersonating) {
        try {
          sessionStorage.removeItem("avImpAccessToken");
          sessionStorage.removeItem("avImpersonation");
        } catch (_) {}
        return null;
      }
      if (!readRefreshToken(normalizedPortal)) clearSession(normalizedPortal);
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
      isMainOwner: !!claims.isMainOwner,
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
    try {
      document.documentElement.setAttribute("data-av-portal", routePortal);
    } catch (_) {}
    const session = readSession(routePortal);
    if (!session) {
      if (readRefreshToken(routePortal)) {
        ensureSession(routePortal).then(function (restored) {
          if (!restored || restored.portal !== routePortal) {
            redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
            return;
          }
          try {
            location.reload();
          } catch (_) {
            redirect(DASHBOARD_BY_PORTAL[routePortal] || "/dashboard");
          }
        });
        return null;
      }
      redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
      return null;
    }
    if (session.portal !== routePortal) {
      // Wrong role for this dashboard — clear and send to the correct login.
      clearSession(routePortal);
      redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
      return null;
    }
    // Keep body hidden until the correct portal shell is applied
    // (see revealDashboard after enter*Mode / bootstrapPortalAccess).
    return session;
  }

  function goToSessionDashboard(session) {
    if (!session) return false;
    if (session.portal === "owner") {
      hideAppShell();
      redirect(DASHBOARD_BY_PORTAL.owner);
      return true;
    }
    hideAppShell();
    redirect(DASHBOARD_BY_PORTAL[session.portal] || "/dashboard");
    return true;
  }

  async function refreshSession(portal) {
    const normalized = normalizePortal(portal);
    const refreshToken = readRefreshToken(normalized);
    if (!refreshToken) return null;
    try {
      const resp = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await resp.json().catch(function () {
        return {};
      });
      if (!resp.ok) {
        clearSession(normalized);
        return null;
      }
      const access = data.token || data.accessToken;
      if (!access) {
        clearSession(normalized);
        return null;
      }
      persistTokens(data.user?.portal || normalized, access, data.refreshToken || refreshToken);
      return readSession(normalized);
    } catch (_) {
      return null;
    }
  }

  async function ensureSession(portal) {
    const normalized = normalizePortal(portal);
    const session = readSession(normalized);
    if (session) return session;
    return refreshSession(normalized);
  }

  async function guardLogin() {
    if (hasStoredAuth("admin") || hasStoredAuth("owner")) hideAppShell();

    const dealer = await ensureSession("admin");
    if (dealer && dealer.portal && dealer.portal !== "owner") {
      goToSessionDashboard(dealer);
      return;
    }

    const owner = await ensureSession("owner");
    if (owner && owner.portal === "owner") {
      goToSessionDashboard(owner);
      return;
    }

    revealDashboard();
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
        if (portal) {
          try {
            if (sessionStorage.getItem("av_session_only") === "1") {
              sessionStorage.setItem("avAuthPortal", portal);
            } else {
              localStorage.setItem("avAuthPortal", portal);
            }
          } catch (_) {
            localStorage.setItem("avAuthPortal", portal);
          }
        }
        if (routePortal !== portal && portal) {
          hideAppShell();
          clearSession(routePortal);
          redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
        }
      })
      .catch((err) => {
        // Network errors: keep the local session; user can keep working offline-ish.
        if (!err || !/Session expired|Unauthorized|Invalid|no longer valid/i.test(String(err.message || ""))) {
          return;
        }
        hideAppShell();
        clearSession(routePortal);
        if (typeof onInvalid === "function") onInvalid();
        else {
          redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
        }
      });
  }

  function isLoginPath() {
    const path = (location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/login" || path === "/owner/login";
  }

  try {
    if (!document.getElementById("av-auth-pending-css")) {
      const style = document.createElement("style");
      style.id = "av-auth-pending-css";
      style.textContent =
        "html.av-auth-pending body,html.av-logging-out body{visibility:hidden!important}";
      document.documentElement.appendChild(style);
    }
  } catch (_) {}

  // Back/forward cache: bounce stale dashboards after logout; re-check login pages.
  try {
    global.addEventListener("pageshow", function (event) {
      if (!event.persisted) return;
      try {
        if (isLoginPath()) {
          guardLogin();
          return;
        }
        if (!document.body || document.body.getAttribute("data-av-dashboard") !== "1") {
          return;
        }
      } catch (_) {
        return;
      }
      const routePortal = getRoutePortal();
      const session = readSession(routePortal);
      if (!session || session.portal !== routePortal) {
        hideAppShell();
        redirect(LOGIN_BY_PORTAL[routePortal] || "/login");
      }
    });
  } catch (_) {}

  global.AVPortal = {
    API_URL,
    normalizePortal,
    getRoutePortal,
    getToken,
    clearSession,
    readSession,
    ensureSession,
    hasStoredAuth,
    roleLabel,
    initialsFrom,
    redirect,
    guardDashboard,
    guardLogin,
    verifySessionInBackground,
    hideAppShell,
    revealDashboard,
    logout,
    dashboardPath: (portal) => DASHBOARD_BY_PORTAL[normalizePortal(portal)],
    loginPath: (portal) => LOGIN_BY_PORTAL[normalizePortal(portal)],
  };
})(window);
