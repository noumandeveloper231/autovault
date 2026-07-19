/**
 * Live Sales Reps — maps API ↔ dashboard UI and persists mutations.
 * Requires window.AVApi. Globals: salesReps, REP_LIST.
 */
(function (global) {
  function toast(msg, ok) {
    if (global.AVToast) {
      if (ok === false) AVToast.error(msg);
      else if (ok === true) AVToast.success(msg);
      else AVToast.info(msg);
      return;
    }
    console.log("[sales-reps]", msg);
  }

  /**
   * API rep → UI row.
   * API commissionRate is 0-1, UI commissionPct is 0-100.
   * API fullName → UI name.
   */
  function mapApiToUi(r) {
    if (!r) return null;
    var profile = r.profile || {};
    return {
      id: r.id,
      name: r.fullName || "",
      email: r.email || "",
      phone: r.phone || "",
      username: r.username || "",
      commissionPct: Math.round((profile.commissionRate || 0) * 100),
      base: parseFloat(profile.baseSalary) || 0,
      payFreq: profile.payFrequency || "biweekly",
      payDay: profile.payDay != null ? profile.payDay : 5,
      payAnchor: "",
      birthday: profile.birthDate || "",
      payMethod: profile.paymentMethod || "Direct Deposit",
      payProof: profile.payDocUrl || null,
      payProofName: "",
      isActive: r.isActive !== false,
      _raw: r,
    };
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
    if (!name) throw new Error("Name is required");
    if (!email) throw new Error("Email is required for rep login");

    var body = {
      fullName: name,
      email: email,
      username: (fields.username || "").trim() || undefined,
      phone: (fields.phone || "").trim() || undefined,
      commissionRate: (parseFloat(fields.commissionPct) || 0) / 100,
      baseSalary: parseFloat(fields.base) || 0,
      payFrequency: fields.payFreq || undefined,
      payDay: parseInt(fields.payDay) || undefined,
      birthDate: fields.birthday || undefined,
      paymentMethod: fields.payMethod || undefined,
      payDocUrl: fields.payProof || undefined,
      sendInvite: fields.sendInvite !== false,
    };

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
    if (fields.commissionPct != null) body.commissionRate = parseFloat(fields.commissionPct) / 100;
    if (fields.isActive != null) body.isActive = !!fields.isActive;
    if (fields.base != null) body.baseSalary = parseFloat(fields.base) || 0;
    if (fields.payFreq != null) body.payFrequency = fields.payFreq || undefined;
    if (fields.payDay != null) body.payDay = parseInt(fields.payDay) || undefined;
    if (fields.birthday != null) body.birthDate = fields.birthday || undefined;
    if (fields.payMethod != null) body.paymentMethod = fields.payMethod || undefined;
    if (fields.payProof != null) body.payDocUrl = fields.payProof || null;
    if (Object.keys(body).length === 0) return null;

    var resp = await AVApi.updateSalesRep(id, body);
    var rep = resp.salesRep || resp;
    var ui = mapApiToUi(rep);
    var list = getRepsList();
    var idx = list.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) list[idx] = ui;
    else list.unshift(ui);
    refreshUi();
    return ui;
  }

  async function deleteRep(id) {
    await AVApi.updateSalesRep(id, { isActive: false });
    var list = getRepsList();
    var idx = list.findIndex(function (x) { return x.id === id; });
    if (idx >= 0) list.splice(idx, 1);
    refreshUi();
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

  global.AVReps = {
    mapApiToUi: mapApiToUi,
    loadAll: loadAll,
    createRep: createRep,
    updateRep: updateRep,
    deleteRep: deleteRep,
    sendInvite: sendInvite,
    getRepByName: getRepByName,
    getRepById: getRepById,
    syncRepList: syncRepList,
    toast: toast,
  };
})(window);
