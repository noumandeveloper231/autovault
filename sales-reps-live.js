/**
 * Live Sales Reps — maps API ↔ dashboard UI and persists mutations.
 * Requires window.AVApi. Globals: salesReps, REP_LIST.
 */
(function (global) {
  function toast(msg, ok) {
    if (global.AVToast) {
      if (ok === false) AVToast.error(msg);
      else if (ok === true) AVToast.success(msg);
    } else {
      console.log("[sales-reps]", msg);
    }
  }

  /**
   * API rep → UI row.
   * API commissionRate: percentage = 0–1 fraction; flat = dollar amount.
   * UI commissionPct is 0–100; commissionFlat is dollars.
   */
  function toYmd(value) {
    if (value == null || value === "") return "";
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  }

  function mapApiToUi(r) {
    if (!r) return null;
    var profile = r.profile || {};
    var type = profile.commissionType === "flat" ? "flat" : "percentage";
    var rate = parseFloat(profile.commissionRate);
    if (!isFinite(rate) || rate < 0) rate = 0;
    return {
      id: r.id,
      name: r.fullName || "",
      email: r.email || "",
      phone: r.phone || "",
      username: r.username || "",
      commissionType: type,
      commissionPct: type === "percentage" ? Math.round(rate * 1000) / 10 : 0,
      commissionFlat: type === "flat" ? rate : 0,
      base: parseFloat(profile.baseSalary) || 0,
      payFreq: profile.payFrequency || "biweekly",
      payDay: profile.payDay != null ? profile.payDay : 5,
      payAnchor: "",
      birthday: toYmd(profile.birthDate),
      payMethod: profile.paymentMethod || "Direct Deposit",
      payProof: profile.payDocUrl || null,
      payProofName: "",
      isActive: r.isActive !== false,
      _raw: r,
    };
  }

  function commissionBody(fields) {
    var type = fields.commissionType === "flat" ? "flat" : "percentage";
    var body = { commissionType: type };
    if (type === "flat") {
      body.commissionRate = parseFloat(fields.commissionFlat);
      if (!isFinite(body.commissionRate) || body.commissionRate < 0) {
        body.commissionRate = 0;
      }
    } else if (fields.commissionPct != null) {
      body.commissionRate = (parseFloat(fields.commissionPct) || 0) / 100;
    }
    return body;
  }

  function getRepsList() {
    if (!Array.isArray(global.salesReps)) global.salesReps = [];
    return global.salesReps;
  }

  function syncRepList() {
    global.REP_LIST = getRepsList().map(function (r) { return r.name; });
  }

  function setLoading(flag) {
    global.repsLoading = !!flag;
  }

  function refreshUi() {
    syncRepList();
    try { if (typeof global.renderRepsPage === "function") global.renderRepsPage(); } catch (_) {}
    try { if (typeof global.renderRepDetail === "function") global.renderRepDetail(); } catch (_) {}
    try {
      if (typeof global.getCurrentPage === "function" && global.getCurrentPage() === "payroll" && typeof global.renderPayrollPage === "function") {
        global.renderPayrollPage();
      }
    } catch (_) {}
    try { if (typeof global.populateRepFilter === "function") {
      var rows = typeof global.computeRow === "function" ? global.vehicles.map(global.computeRow) : global.vehicles;
      global.populateRepFilter(rows, true);
    } } catch (_) {}
  }

  async function loadAll() {
    if (!global.AVApi) throw new Error("AVApi not loaded");
    setLoading(true);
    try {
      var data = await AVApi.listSalesReps("?limit=100");
      var rows = (data.salesReps || data.data || []).map(mapApiToUi);
      var list = getRepsList();
      list.length = 0;
      rows.forEach(function (r) { list.push(r); });
      global.AV_REPS_LIVE = true;
      refreshUi();
      return rows;
    } finally {
      setLoading(false);
    }
  }

  async function createRep(fields) {
    var name = String(fields.name || "").trim();
    var email = String(fields.email || "").trim();
    var username = String(fields.username || "").trim();
    if (!name) throw new Error("Name is required");
    if (!username) throw new Error("Username is required for rep login");
    if (!email) throw new Error("Email is required for rep login");

    var body = Object.assign(
      {
        fullName: name,
        email: email,
        username: username,
        phone: (fields.phone || "").trim() || undefined,
        baseSalary: parseFloat(fields.base) || 0,
        payFrequency: fields.payFreq || undefined,
        payDay: parseInt(fields.payDay) || undefined,
        birthDate: fields.birthday ? toYmd(fields.birthday) || undefined : undefined,
        paymentMethod: fields.payMethod || undefined,
        payDocUrl: fields.payProof || undefined,
        sendInvite: fields.sendInvite !== false,
      },
      commissionBody(fields),
    );

    var resp = await AVApi.createSalesRep(body);
    var rep = resp.salesRep || resp;
    var ui = mapApiToUi(rep);
    if (ui) {
      ui.base = parseFloat(fields.base) || 0;
      ui.payFreq = fields.payFreq || "biweekly";
      ui.payDay = parseInt(fields.payDay) || 5;
      ui.birthday = fields.birthday || "";
      ui.username = (fields.username || "").trim() || "";
      getRepsList().push(ui);
    }
    refreshUi();
    return { ui: ui, inviteSent: resp.inviteSent, temporaryPassword: resp.temporaryPassword };
  }

  async function updateRep(id, fields) {
    var body = {};
    if (fields.username != null) body.username = String(fields.username).trim() || undefined;
    if (fields.name != null) body.fullName = String(fields.name).trim();
    if (fields.phone != null) body.phone = String(fields.phone).trim() || undefined;
    if (fields.commissionType != null || fields.commissionPct != null || fields.commissionFlat != null) {
      Object.assign(body, commissionBody(fields));
    }
    if (fields.isActive != null) body.isActive = !!fields.isActive;
    if (fields.base != null) body.baseSalary = parseFloat(fields.base) || 0;
    if (fields.payFreq != null) body.payFrequency = fields.payFreq || undefined;
    if (fields.payDay != null) body.payDay = parseInt(fields.payDay) || undefined;
    // Only send birthDate when the form has a real date. An empty field must not
    // null-out the DB value (the picker often looks blank after a bad hydrate).
    if (fields.birthday !== undefined) {
      var bday = toYmd(fields.birthday);
      if (bday) body.birthDate = bday;
    }
    if (fields.payMethod != null) body.paymentMethod = fields.payMethod || undefined;
    if (fields.payProof != null) body.payDocUrl = fields.payProof || null;
    if (Object.keys(body).length === 0) return null;

    var resp = await AVApi.updateSalesRep(id, body);
    var rep = resp.salesRep || resp;
    var ui = mapApiToUi(rep);
    if (ui && fields.birthday !== undefined) {
      var kept = toYmd(fields.birthday);
      if (kept) ui.birthday = kept;
      else if (!ui.birthday) {
        var prev = listFindById(id);
        if (prev && prev.birthday) ui.birthday = prev.birthday;
      }
    }
    var list = getRepsList();
    var idx = list.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) list[idx] = ui;
    else list.unshift(ui);
    refreshUi();
    return ui;
  }

  function listFindById(id) {
    return getRepsList().find(function (x) { return x.id === id; }) || null;
  }

  async function deleteRep(id) {
    if (!global.AVApi || typeof AVApi.archiveSalesRep !== "function") {
      throw new Error("Archive API unavailable");
    }
    var resp = await AVApi.archiveSalesRep(id);
    var list = getRepsList();
    var idx = list.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) list.splice(idx, 1);
    refreshUi();
    return resp;
  }

  async function getArchivePreview(id) {
    if (!global.AVApi || typeof AVApi.getSalesRepArchivePreview !== "function") {
      throw new Error("Archive preview API unavailable");
    }
    return AVApi.getSalesRepArchivePreview(id);
  }

  function getRepByName(name) {
    return getRepsList().find(function (r) { return r.name === name; }) || null;
  }

  function getRepById(id) {
    return getRepsList().find(function (r) { return r.id === id; }) || null;
  }

  async function sendInvite(id) {
    if (!global.AVApi) throw new Error("AVApi not loaded");
    var resp = await AVApi.sendRepInvite(id);
    return resp;
  }

  /** Commission dollars for a rep given front-end gross profit. */
  function calcCommission(rep, grossProfit) {
    if (!rep) return 0;
    if (rep.commissionType === "flat") {
      return Math.max(0, Math.round(Number(rep.commissionFlat) || 0));
    }
    var pct = Number(rep.commissionPct) || 0;
    return Math.max(0, Math.round(((Number(grossProfit) || 0) * pct) / 100));
  }

  function formatRateLabel(rep) {
    if (!rep) return "";
    if (rep.commissionType === "flat") {
      var flat = Number(rep.commissionFlat) || 0;
      return "$" + flat.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " flat";
    }
    return (Number(rep.commissionPct) || 0) + "% of gross";
  }

  global.AVReps = {
    mapApiToUi: mapApiToUi,
    loadAll: loadAll,
    createRep: createRep,
    updateRep: updateRep,
    deleteRep: deleteRep,
    getArchivePreview: getArchivePreview,
    sendInvite: sendInvite,
    getRepByName: getRepByName,
    getRepById: getRepById,
    syncRepList: syncRepList,
    calcCommission: calcCommission,
    formatRateLabel: formatRateLabel,
    toast: toast,
  };
})(window);
