/**
 * AutoVault API client for Static frontend.
 * Uses Bearer access token + refresh token rotation.
 */
(function (global) {
  const API_URL =
    global.AUTOVAULT_API_URL ||
    (location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://autovault-backend-cbdp.onrender.com");

  const ACCESS_KEY = "avAuthToken";
  const REFRESH_KEY = "avRefreshToken";
  const OWNER_ACCESS_KEY = "avOwnerToken";
  const OWNER_REFRESH_KEY = "avOwnerRefreshToken";
  const PORTAL_KEY = "avAuthPortal";

  const IMP_ACCESS_KEY = "avImpAccessToken";
  const IMP_META_KEY = "avImpersonation";
  const IMP_HANDOFF_PREFIX = "avImpHandoff:";

  function normalizePortal(value) {
    const portal = String(value || "").trim().toLowerCase();
    if (portal === "sales-rep" || portal === "sales_rep") return "sales_rep";
    if (portal === "wholesale") return "wholesale";
    if (portal === "owner") return "owner";
    if (portal === "cpa") return "cpa";
    return "admin";
  }

  function isOwnerPortal(portal) {
    return normalizePortal(portal) === "owner";
  }

  function isImpersonating() {
    try {
      return !!sessionStorage.getItem(IMP_META_KEY) && !!sessionStorage.getItem(IMP_ACCESS_KEY);
    } catch (_) {
      return false;
    }
  }

  function clearImpersonationSession() {
    try {
      sessionStorage.removeItem(IMP_ACCESS_KEY);
      sessionStorage.removeItem(IMP_META_KEY);
      sessionStorage.removeItem("avAdminSessionBackup");
    } catch (_) {}
  }

  function getAccessToken(portal) {
    try {
      if (isImpersonating()) {
        return sessionStorage.getItem(IMP_ACCESS_KEY) || "";
      }
    } catch (_) {}
    return (
      localStorage.getItem(isOwnerPortal(portal) ? OWNER_ACCESS_KEY : ACCESS_KEY) ||
      ""
    );
  }

  function getRefreshToken(portal) {
    // Impersonation sessions never get a refresh token (by design).
    if (isImpersonating()) return "";
    return (
      localStorage.getItem(
        isOwnerPortal(portal) ? OWNER_REFRESH_KEY : REFRESH_KEY,
      ) || ""
    );
  }

  function setSession({ token, refreshToken, portal }) {
    // Never write impersonation tokens into shared localStorage (admin tab must stay intact).
    if (isImpersonating() && portal === "sales_rep") {
      try {
        if (token) sessionStorage.setItem(IMP_ACCESS_KEY, token);
        if (refreshToken === null) {
          /* no refresh for support sessions */
        }
      } catch (_) {}
      return;
    }
    const p = normalizePortal(portal || localStorage.getItem(PORTAL_KEY) || "admin");
    localStorage.setItem(PORTAL_KEY, p);
    if (isOwnerPortal(p)) {
      if (token) localStorage.setItem(OWNER_ACCESS_KEY, token);
      if (refreshToken) localStorage.setItem(OWNER_REFRESH_KEY, refreshToken);
      else if (refreshToken === null) localStorage.removeItem(OWNER_REFRESH_KEY);
    } else {
      if (token) localStorage.setItem(ACCESS_KEY, token);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
      else if (refreshToken === null) localStorage.removeItem(REFRESH_KEY);
    }
  }

  /** One-time handoff so support sessions can open in a new tab without clobbering admin auth. */
  function stashImpersonationHandoff(payload) {
    var id =
      "imp_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem(
      IMP_HANDOFF_PREFIX + id,
      JSON.stringify({
        token: payload.token,
        impersonation: payload.impersonation || null,
        createdAt: Date.now(),
      }),
    );
    return id;
  }

  function consumeImpersonationHandoff() {
    try {
      var params = new URLSearchParams(location.search || "");
      var id = params.get("impHandoff");
      if (!id) return false;
      var key = IMP_HANDOFF_PREFIX + id;
      var raw = localStorage.getItem(key);
      localStorage.removeItem(key);
      params.delete("impHandoff");
      var qs = params.toString();
      var clean =
        location.pathname + (qs ? "?" + qs : "") + (location.hash || "");
      if (typeof history !== "undefined" && history.replaceState) {
        history.replaceState({}, "", clean);
      }
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.token) return false;
      if (Date.now() - (data.createdAt || 0) > 90 * 1000) return false;
      sessionStorage.setItem(IMP_ACCESS_KEY, data.token);
      sessionStorage.setItem(
        IMP_META_KEY,
        JSON.stringify(data.impersonation || { purpose: "support" }),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreAdminSessionFromBackup() {
    // Legacy same-tab restore — prefer closing the support tab instead.
    clearImpersonationSession();
    return false;
  }

  function clearSession(portal) {
    if (isImpersonating()) {
      clearImpersonationSession();
      return;
    }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(OWNER_ACCESS_KEY);
    localStorage.removeItem(OWNER_REFRESH_KEY);
    localStorage.removeItem(PORTAL_KEY);
  }

  let refreshPromise = null;

  async function refreshAccessToken(portal) {
    const refreshToken = getRefreshToken(portal);
    if (!refreshToken) throw new Error("No refresh token");
    if (refreshPromise) return refreshPromise;

    refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error?.message || data.message || "Refresh failed");
        setSession({
          token: data.token || data.accessToken,
          refreshToken: data.refreshToken || refreshToken,
          portal: data.user?.portal || portal,
        });
        return data.token || data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  async function request(path, options = {}) {
    const portal = normalizePortal(
      options.portal ||
        (isImpersonating() ? "sales_rep" : null) ||
        localStorage.getItem(PORTAL_KEY) ||
        "admin",
    );
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const token = options.skipAuth ? "" : getAccessToken(portal);
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = path.startsWith("http") ? path : `${API_URL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 90000);
    let resp;
    try {
      resp = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`Request timed out: ${path}`);
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (resp.status === 401 && !options.skipAuth && !options._retried) {
      // Impersonation sessions have no refresh token — end this tab cleanly (admin tab is untouched)
      if (isImpersonating()) {
        clearImpersonationSession();
        if (typeof window !== "undefined") {
          try { window.close(); } catch (_) {}
          window.location.href = "about:blank";
        }
        throw new Error("Support session expired");
      }
      try {
        await refreshAccessToken(portal);
        return request(path, { ...options, _retried: true });
      } catch {
        clearSession(portal);
        const loginPaths = { owner: "/owner/login", wholesale: "/wholesale/login", sales_rep: "/sales-rep/login", cpa: "/cpa/login" };
        if (typeof window !== "undefined" && !window.location.pathname.toLowerCase().startsWith("/login")) {
          window.location.href = loginPaths[portal] || "/login";
        }
        throw new Error("Session expired");
      }
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(
        data.error?.message || data.message || `Request failed (${resp.status})`,
      );
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    API_URL,
    setSession,
    clearSession,
    getAccessToken,
    isImpersonating,
    restoreAdminSessionFromBackup,
    stashImpersonationHandoff,
    consumeImpersonationHandoff,
    clearImpersonationSession,
    request,

    // Auth
    login: (body) =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),
    ownerLogin: (body) =>
      request("/api/owner/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
        portal: "owner",
      }),
    me: (portal) =>
      request(portal === "owner" ? "/api/owner/auth/me" : "/api/auth/me", {
        portal,
      }),
    forgotPassword: (email) =>
      request("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuth: true,
      }),
    resetPassword: (body) =>
      request("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),
    changePassword: (body) =>
      request("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    // Dashboard & CRM
    dashboardSummary: () => request("/api/v1/dashboard/summary"),
    listVehicles: (qs = "", opts = {}) => request(`/api/v1/vehicles${qs}`, opts),
    getVehicle: (id) => request(`/api/v1/vehicles/${id}`),
    createVehicle: (body) =>
      request("/api/v1/vehicles", { method: "POST", body: JSON.stringify(body) }),
    updateVehicle: (id, body) =>
      request(`/api/v1/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteVehicle: (id) =>
      request(`/api/v1/vehicles/${id}`, { method: "DELETE" }),
    changeVehicleStatus: (id, body) =>
      request(`/api/v1/vehicles/${id}/status`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listVehicleExpenses: (id) =>
      request(`/api/v1/vehicles/${id}/expenses`),
    createVehicleExpense: (id, body) =>
      request(`/api/v1/vehicles/${id}/expenses`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateVehicleExpense: (id, expenseId, body) =>
      request(`/api/v1/vehicles/${id}/expenses/${expenseId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteVehicleExpense: (id, expenseId) =>
      request(`/api/v1/vehicles/${id}/expenses/${expenseId}`, {
        method: "DELETE",
      }),
    markSold: (id, body) =>
      request(`/api/v1/vehicles/${id}/mark-sold`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    markLoss: (id, body) =>
      request(`/api/v1/vehicles/${id}/mark-loss`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listCustomers: (qs = "") => request(`/api/v1/customers${qs}`),
    listLeads: (qs = "") => request(`/api/v1/leads${qs}`),
    getCustomer: (id) => request(`/api/v1/customers/${id}`),
    createCustomer: (body) =>
      request("/api/v1/customers", { method: "POST", body: JSON.stringify(body) }),
    createLead: (body) =>
      request("/api/v1/leads", { method: "POST", body: JSON.stringify(body) }),
    updateCustomer: (id, body) =>
      request(`/api/v1/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteCustomer: (id) =>
      request(`/api/v1/customers/${id}`, { method: "DELETE" }),
    listCustomerNotes: (id) => request(`/api/v1/customers/${id}/notes`),
    createCustomerNote: (id, body) =>
      request(`/api/v1/customers/${id}/notes`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listDealJackets: (qs = "") => request(`/api/v1/deal-jackets${qs}`),
    updateDealJacket: (id, body) =>
      request(`/api/v1/deal-jackets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    addJacketDocument: (id, body) =>
      request(`/api/v1/deal-jackets/${id}/documents`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listExpenses: (qs = "") => request(`/api/v1/expenses${qs}`),
    getExpense: (id) => request(`/api/v1/expenses/${id}`),
    createExpense: (body) =>
      request("/api/v1/expenses", { method: "POST", body: JSON.stringify(body) }),
    updateExpense: (id, body) =>
      request(`/api/v1/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteExpense: (id) =>
      request(`/api/v1/expenses/${id}`, { method: "DELETE" }),
    profitLoss: (qs = "") => request(`/api/v1/reports/profit-loss${qs}`),
    listNotifications: () => request("/api/v1/notifications"),
    listSalesReps: (qs = "") => request(`/api/v1/sales-reps${qs}`),
    createSalesRep: (body) =>
      request("/api/v1/sales-reps", { method: "POST", body: JSON.stringify(body) }),
    updateSalesRep: (id, body) =>
      request(`/api/v1/sales-reps/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    sendRepInvite: (id) =>
      request(`/api/v1/sales-reps/${id}/send-invite`, { method: "POST" }),
    impersonateSalesRep: (id, body = {}) =>
      request(`/api/v1/sales-reps/${id}/impersonate`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listStaff: (qs = "") => request(`/api/v1/staff${qs}`),
    getStaff: (id) => request(`/api/v1/staff/${id}`),
    createStaff: (body) =>
      request("/api/v1/staff", { method: "POST", body: JSON.stringify(body) }),
    updateStaff: (id, body) =>
      request(`/api/v1/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteStaff: (id) =>
      request(`/api/v1/staff/${id}`, { method: "DELETE" }),
    listCommissions: (qs = "") => request(`/api/v1/commissions${qs}`),
    updateCommission: (id, body) =>
      request(`/api/v1/commissions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    markCommissionPaid: (id) =>
      request(`/api/v1/commissions/${id}/mark-paid`, { method: "POST" }),
    convertLead: (id) =>
      request(`/api/v1/customers/${id}/convert`, { method: "POST" }),
    taxSettings: () => request("/api/v1/tax/settings"),
    taxPeriods: () => request("/api/v1/tax/periods"),
    calendarEvents: (qs = "") => request(`/api/v1/calendar/events${qs}`),
    createCalendarEvent: (body) =>
      request("/api/v1/calendar/events", { method: "POST", body: JSON.stringify(body) }),
    updateCalendarEvent: (id, body) =>
      request(`/api/v1/calendar/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteCalendarEvent: (id) =>
      request(`/api/v1/calendar/events/${id}`, { method: "DELETE" }),
    getCalendarDayNote: (date) =>
      request(`/api/v1/calendar/day-notes/${date}`),
    listDayNotes: (qs = "") =>
      request(`/api/v1/calendar/day-notes${qs}`),
    upsertCalendarDayNote: (date, body) =>
      request(`/api/v1/calendar/day-notes/${date}`, { method: "PUT", body: JSON.stringify(body) }),
    me: () => request("/api/auth/me"),
    dealershipsMe: () => request("/api/v1/dealerships/me"),
    listPayrollRuns: (qs = "") => request(`/api/v1/payroll-runs${qs}`),
    // Messages
    conversations: () => request("/api/v1/messages/conversations"),
    createConversation: (body) => request("/api/v1/messages/conversations", { method: "POST", body: JSON.stringify(body) }),
    getConversation: (id, qs) => request(`/api/v1/messages/conversations/${id}${qs || ""}`),
    updateConversation: (id, body) => request(`/api/v1/messages/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    archiveConversation: (id) => request(`/api/v1/messages/conversations/${id}`, { method: "DELETE" }),
    leaveConversation: (id) => request(`/api/v1/messages/conversations/${id}/leave`, { method: "POST" }),
    addParticipants: (id, body) => request(`/api/v1/messages/conversations/${id}/participants`, { method: "POST", body: JSON.stringify(body) }),
    removeParticipant: (id, userId) => request(`/api/v1/messages/conversations/${id}/participants/${userId}`, { method: "DELETE" }),
    markConversationRead: (id) => request(`/api/v1/messages/conversations/${id}/read`, { method: "POST" }),
    listMessages: (id, qs) => request(`/api/v1/messages/conversations/${id}/messages${qs || ""}`),
    sendMessage: (id, body) => request(`/api/v1/messages/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),
    editMessage: (msgId, body) => request(`/api/v1/messages/messages/${msgId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteMessage: (msgId) => request(`/api/v1/messages/messages/${msgId}`, { method: "DELETE" }),
    toggleReaction: (msgId, body) => request(`/api/v1/messages/messages/${msgId}/reactions`, { method: "POST", body: JSON.stringify(body) }),
    markMessageRead: (msgId) => request(`/api/v1/messages/messages/${msgId}/read`, { method: "POST" }),
    markAllConversationsRead: () => request("/api/v1/messages/read-all", { method: "POST" }),
    searchMessages: (qs) => request(`/api/v1/messages/search${qs}`),
    getPresence: () => request("/api/v1/messages/presence"),
    listMessageContacts: () => request("/api/v1/messages/contacts"),
    getConversationSession: (convId) => request(`/api/v1/messages/conversations/${convId}/session`),
    upsertConversationSession: (convId, body) => request(`/api/v1/messages/conversations/${convId}/session`, { method: "PUT", body: JSON.stringify(body) }),
    cpaOverview: (qs = "") => request(`/api/v1/cpa/overview${qs}`),
    listCpaNotes: (qs = "") => request(`/api/v1/cpa/notes${qs}`),
    getCpaNote: (id) => request(`/api/v1/cpa/notes/${id}`),
    createCpaNote: (body) =>
      request("/api/v1/cpa/notes", { method: "POST", body: JSON.stringify(body) }),
    updateCpaNote: (id, body) =>
      request(`/api/v1/cpa/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addCpaNoteComment: (id, body) =>
      request(`/api/v1/cpa/notes/${id}/comments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listCpaNoteAttachments: (id) =>
      request(`/api/v1/cpa/notes/${id}/attachments`),
    addCpaNoteAttachment: (id, body) =>
      request(`/api/v1/cpa/notes/${id}/attachments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    wholesaleOverview: (qs = "") => request(`/api/v1/wholesale/overview${qs}`),
    wholesaleVehicles: (qs = "") => request(`/api/v1/wholesale/vehicles${qs}`),
    wholesaleVehicle: (id) => request(`/api/v1/wholesale/vehicles/${id}`),
    createWholesaleVehicle: (body) =>
      request("/api/v1/wholesale/vehicles", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateWholesaleVehicle: (id, body) =>
      request(`/api/v1/wholesale/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    updateWholesaleVehicleStatus: (id, body) =>
      request(`/api/v1/wholesale/vehicles/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    recordWholesaleSale: (id, body) =>
      request(`/api/v1/wholesale/vehicles/${id}/sale`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    wholesaleSold: (qs = "") => request(`/api/v1/wholesale/sold${qs}`),
    wholesaleExpenses: (qs = "") => request(`/api/v1/wholesale/expenses${qs}`),
    createWholesaleExpense: (body) =>
      request("/api/v1/wholesale/expenses", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateWholesaleExpense: (id, body) =>
      request(`/api/v1/wholesale/expenses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteWholesaleExpense: (id) =>
      request(`/api/v1/wholesale/expenses/${id}`, { method: "DELETE" }),
    wholesalePnl: (qs = "") => request(`/api/v1/wholesale/pnl${qs}`),
    wholesaleCalendarNotes: (qs = "") =>
      request(`/api/v1/wholesale/calendar-notes${qs}`),
    upsertWholesaleDayNote: (body) =>
      request("/api/v1/wholesale/calendar-notes", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    platformMetrics: () =>
      request("/api/v1/platform/metrics", { portal: "owner" }),
    platformDealerships: (qs = "") =>
      request(`/api/v1/platform/dealerships${qs}`, { portal: "owner" }),
    listAuditLogs: (qs = "") => request(`/api/v1/audit-logs${qs}`),
    listFiles: (qs = "") => request(`/api/v1/files${qs}`),

    // Dashboard sticky notes
    listDashboardNotes: () => request("/api/v1/dashboard/notes"),
    createDashboardNote: (body) =>
      request("/api/v1/dashboard/notes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateDashboardNote: (id, body) =>
      request(`/api/v1/dashboard/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteDashboardNote: (id) =>
      request(`/api/v1/dashboard/notes/${id}`, {
        method: "DELETE",
      }),

    /**
     * Upload a File/Blob to Cloudflare R2 via presigned URL.
     * @param {File|Blob} file
     * @param {{ sourceEntity?: string, sourceEntityId?: string, fileName?: string }} meta
     */
    uploadFile: async (file, meta = {}) => {
      const originalName = meta.fileName || file.name || "upload.bin";
      const mimeType = file.type || "application/octet-stream";
      const fileSize = file.size;
      const signed = await request("/api/v1/files/upload-url", {
        method: "POST",
        body: JSON.stringify({
          originalName,
          mimeType,
          fileSize,
          sourceEntity: meta.sourceEntity,
          sourceEntityId: meta.sourceEntityId,
        }),
      });
      const putHeaders = {
        "Content-Type": mimeType,
        ...(signed.headers || {}),
      };
      const putResp = await fetch(signed.uploadUrl, {
        method: signed.method || "PUT",
        headers: putHeaders,
        body: file,
      });
      if (!putResp.ok) {
        throw new Error(`R2 upload failed (${putResp.status})`);
      }
      return {
        file: signed.file,
        publicUrl: signed.publicUrl,
      };
    },
  };

  global.AVApi = api;
})(window);
