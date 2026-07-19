/**
 * Wholesale CRM live data layer — Plan 1 (wholesaler) portal.
 * Progressive loads: vehicles / expenses / day-notes hydrate independently.
 */
(function (global) {
  if (global.AVWholesale) return;

  var state = {
    vehicles: [],
    expenses: [],
    dayNotes: {},
    overview: null,
    pnl: null,
    loading: false,
    vehiclesLoading: false,
    expensesLoading: false,
    notesLoading: false,
    vehiclesLive: false,
    expensesLive: false,
    notesLive: false,
  };

  var _vehPromise = null;
  var _expPromise = null;
  var _notesPromise = null;

  function periodQs(mode, year, month) {
    var qs = new URLSearchParams();
    qs.set("mode", mode || "month");
    qs.set("year", String(year || new Date().getFullYear()));
    if ((mode || "month") === "month") {
      qs.set("month", String((month != null ? month : new Date().getMonth()) + 1));
    }
    return "?" + qs.toString();
  }

  function isoDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch (_) {
      return "";
    }
  }

  function statusLabel(apiStatus) {
    var s = String(apiStatus || "").toLowerCase();
    if (s === "sold") return "Sold";
    if (s === "out_of_state_sale") return "Out of State";
    if (s === "needs_attention") return "Arbitration";
    if (s === "loss") return "No Sale";
    if (s === "wholesale") return "Wholesale";
    if (s === "in_stock" || s === "available") return "In Inventory";
    return apiStatus || "In Inventory";
  }

  function mapVehicle(api) {
    if (!api) return null;
    var sold = !!api.sold || api.status === "sold" || api.status === "out_of_state_sale";
    return {
      id: api.id,
      vin: api.vin,
      year: api.year,
      make: api.make,
      model: api.model,
      trim: api.trim || "",
      date: isoDate(api.acquisitionDate) || isoDate(api.createdAt),
      price: api.acquisitionCost || 0,
      fees: api.auctionFees || 0,
      repairs: api.reconditioningCost || 0,
      repairsList: [],
      floored: !!api.floored,
      flooringOverride: api.flooringOverride,
      o2: !!api.isWholesale,
      titlePresent: api.titlePresent !== false,
      sold: sold,
      soldDate: isoDate(api.soldAt),
      soldPrice: api.soldPrice || 0,
      result: api.result || (sold ? "sold" : null),
      auctionDate: isoDate(api.auctionDate) || null,
      auctionHouse: api.auctionHouse || "",
      runs: api.auctionRuns || 0,
      saleChannel: api.saleChannel || "",
      status: statusLabel(api.status),
      notes: api.notes || "",
      apiStatus: api.status || "",
      isWholesale: !!api.isWholesale,
      grossProfit: api.grossProfit || 0,
      netProfit: api.netProfit || 0,
      totalInvestment: api.totalInvested || 0,
    };
  }

  function mapExpense(api) {
    var name = api.name || "";
    var notes = api.notes || "";
    return {
      id: api.id,
      date: api.date || isoDate(api.expenseDate),
      cat: api.category || api.cat || "Other",
      category: api.category || api.cat || "Other",
      name: name,
      desc: name || notes || "",
      amount: api.amount || 0,
      status: api.status || "paid",
      recurring: !!api.recurring,
      vendor: api.vendor || "",
      notes: notes,
      vehicleVin: api.vehicleVin || "",
    };
  }

  function applyToGlobals() {
    /* Mutate shared arrays in place — dashboard uses `var wsVehicles` on window.
       Replacing window.wsVehicles breaks `let` bindings; mutating keeps UI in sync. */
    if (!Array.isArray(global.wsVehicles)) global.wsVehicles = [];
    global.wsVehicles.length = 0;
    state.vehicles.forEach(function (v) {
      global.wsVehicles.push(v);
    });

    if (!Array.isArray(global.wsExpenses)) global.wsExpenses = [];
    global.wsExpenses.length = 0;
    state.expenses.forEach(function (e) {
      global.wsExpenses.push(e);
    });

    if (!global.wsDayNotes || typeof global.wsDayNotes !== "object") global.wsDayNotes = {};
    Object.keys(global.wsDayNotes).forEach(function (k) {
      delete global.wsDayNotes[k];
    });
    Object.keys(state.dayNotes || {}).forEach(function (k) {
      global.wsDayNotes[k] = state.dayNotes[k];
    });

    global.AV_WHOLESALE_LIVE = state.vehiclesLive;
    global.wsVehiclesLoading = state.vehiclesLoading;
    global.wsExpensesLoading = state.expensesLoading;
  }

  function emit(kind) {
    try {
      global.dispatchEvent(
        new CustomEvent("av:wholesale-data", { detail: { kind: kind, state: state } }),
      );
    } catch (_) {}
  }

  async function loadVehicles(force) {
    if (!global.AVApi || typeof AVApi.wholesaleVehicles !== "function") {
      throw new Error("Wholesale API unavailable");
    }
    if (!force && state.vehiclesLive && !state.vehiclesLoading) {
      applyToGlobals();
      return state.vehicles;
    }
    if (_vehPromise && !force) return _vehPromise;

    state.vehiclesLoading = true;
    applyToGlobals();
    emit("vehicles-loading");

    _vehPromise = (async function () {
      try {
        var vehRes = await AVApi.wholesaleVehicles("?limit=100&page=1");
        state.vehicles = ((vehRes && vehRes.vehicles) || []).map(mapVehicle).filter(Boolean);
        state.vehiclesLive = true;
        return state.vehicles;
      } finally {
        state.vehiclesLoading = false;
        _vehPromise = null;
        applyToGlobals();
        emit("vehicles");
      }
    })();

    return _vehPromise;
  }

  async function loadExpenses(opts) {
    opts = opts || {};
    var force = !!opts.force;
    var mode = opts.mode || "month";
    var year = opts.year || new Date().getFullYear();
    var month = opts.month != null ? opts.month : new Date().getMonth();
    var cacheKey = mode + ":" + year + ":" + month;

    if (!force && state.expensesLive && !state.expensesLoading && state._expKey === cacheKey) {
      applyToGlobals();
      return state.expenses;
    }
    if (_expPromise && !force) return _expPromise;

    state.expensesLoading = true;
    applyToGlobals();
    emit("expenses-loading");

    _expPromise = (async function () {
      try {
        var qs = periodQs(mode, year, month) + "&limit=100&page=1";
        var expRes = await AVApi.wholesaleExpenses(qs);
        state.expenses = ((expRes && expRes.expenses) || []).map(mapExpense);
        state.expensesLive = true;
        state._expKey = cacheKey;
        return state.expenses;
      } finally {
        state.expensesLoading = false;
        _expPromise = null;
        applyToGlobals();
        emit("expenses");
      }
    })();

    return _expPromise;
  }

  async function loadDayNotes(opts) {
    opts = opts || {};
    var year = opts.year != null ? opts.year : new Date().getFullYear();
    var month = opts.month != null ? opts.month : new Date().getMonth();
    var force = !!opts.force;

    if (!force && state.notesLive && !state.notesLoading) {
      applyToGlobals();
      return state.dayNotes;
    }
    if (_notesPromise && !force) return _notesPromise;

    state.notesLoading = true;
    emit("notes-loading");

    _notesPromise = (async function () {
      try {
        var noteQs = "?year=" + year + "&month=" + (month + 1);
        var notesRes = await AVApi.wholesaleCalendarNotes(noteQs);
        state.dayNotes = (notesRes && notesRes.notes) || {};
        state.notesLive = true;
        return state.dayNotes;
      } catch (e) {
        console.warn("[wholesale] calendar notes load failed", e);
        state.dayNotes = state.dayNotes || {};
        return state.dayNotes;
      } finally {
        state.notesLoading = false;
        _notesPromise = null;
        applyToGlobals();
        emit("notes");
      }
    })();

    return _notesPromise;
  }

  /** Kick independent fetches in parallel (does not block on all). */
  async function loadAll(opts) {
    opts = opts || {};
    state.loading = true;
    try {
      var mode = opts.mode || "year";
      var year = opts.year || new Date().getFullYear();
      var month = opts.month != null ? opts.month : new Date().getMonth();
      await Promise.all([
        loadVehicles(!!opts.force).catch(function (e) {
          console.warn("[wholesale] vehicles load failed", e);
          return [];
        }),
        loadExpenses({ mode: mode, year: year, month: month, force: !!opts.force }).catch(function (e) {
          console.warn("[wholesale] expenses load failed", e);
          return [];
        }),
        loadDayNotes({ year: year, month: month, force: !!opts.force }),
      ]);
      try {
        var ov = await AVApi.wholesaleOverview(periodQs(mode, year, month));
        state.overview = (ov && ov.overview) || ov;
      } catch (e) {
        state.overview = null;
      }
      applyToGlobals();
      emit("all");
      return state;
    } finally {
      state.loading = false;
    }
  }

  function ensureVehicles(force) {
    if (!force && state.vehiclesLive && !state.vehiclesLoading) return null;
    return loadVehicles(!!force);
  }

  function ensureExpenses(opts) {
    opts = opts || {};
    var mode = opts.mode || "month";
    var year = opts.year || new Date().getFullYear();
    var month = opts.month != null ? opts.month : new Date().getMonth();
    var cacheKey = mode + ":" + year + ":" + month;
    if (!opts.force && state.expensesLive && !state.expensesLoading && state._expKey === cacheKey) {
      return null;
    }
    return loadExpenses(opts);
  }

  async function createVehicle(payload) {
    var res = await AVApi.createWholesaleVehicle(payload);
    var mapped = mapVehicle(res.vehicle || res);
    state.vehicles.unshift(mapped);
    state.vehiclesLive = true;
    applyToGlobals();
    emit("vehicles");
    return mapped;
  }

  async function saveSale(vehicleId, payload) {
    var res = await AVApi.recordWholesaleSale(vehicleId, payload);
    var mapped = mapVehicle(res.vehicle || res);
    var idx = state.vehicles.findIndex(function (v) {
      return v.id === vehicleId || v.vin === mapped.vin;
    });
    if (idx >= 0) state.vehicles[idx] = mapped;
    else state.vehicles.unshift(mapped);
    applyToGlobals();
    emit("vehicles");
    return mapped;
  }

  async function saveStatus(vehicleId, status) {
    var res = await AVApi.updateWholesaleVehicleStatus(vehicleId, { status: status });
    var mapped = mapVehicle(res.vehicle || res);
    var idx = state.vehicles.findIndex(function (v) {
      return v.id === vehicleId || v.vin === mapped.vin;
    });
    if (idx >= 0) state.vehicles[idx] = mapped;
    applyToGlobals();
    emit("vehicles");
    return mapped;
  }

  async function saveDayNote(noteDate, body) {
    var res = await AVApi.upsertWholesaleDayNote({
      noteDate: noteDate,
      body: body || "",
    });
    var d = (res.note && res.note.noteDate) || noteDate;
    if (!body) delete state.dayNotes[d];
    else state.dayNotes[d] = body;
    applyToGlobals();
    emit("notes");
    return res.note;
  }

  async function createExpense(payload) {
    var res = await AVApi.createWholesaleExpense(payload);
    var mapped = mapExpense(res.expense || res);
    state.expenses.unshift(mapped);
    applyToGlobals();
    emit("expenses");
    return mapped;
  }

  async function updateVehicle(vehicleId, payload) {
    var res = await AVApi.updateWholesaleVehicle(vehicleId, payload);
    var mapped = mapVehicle(res.vehicle || res);
    var idx = state.vehicles.findIndex(function (v) {
      return v.id === vehicleId || v.vin === mapped.vin;
    });
    if (idx >= 0) state.vehicles[idx] = Object.assign({}, state.vehicles[idx], mapped);
    applyToGlobals();
    emit("vehicles");
    return mapped;
  }

  function isLive() {
    return !!(state.vehiclesLive || state.expensesLive);
  }

  function vehiclesReady() {
    return state.vehiclesLive && !state.vehiclesLoading;
  }

  function expensesReady() {
    return state.expensesLive && !state.expensesLoading;
  }

  global.AVWholesale = {
    state: state,
    periodQs: periodQs,
    loadAll: loadAll,
    loadVehicles: loadVehicles,
    loadExpenses: loadExpenses,
    loadDayNotes: loadDayNotes,
    ensureVehicles: ensureVehicles,
    ensureExpenses: ensureExpenses,
    createVehicle: createVehicle,
    saveSale: saveSale,
    saveStatus: saveStatus,
    saveDayNote: saveDayNote,
    createExpense: createExpense,
    updateVehicle: updateVehicle,
    mapVehicle: mapVehicle,
    applyToGlobals: applyToGlobals,
    isLive: isLive,
    vehiclesReady: vehiclesReady,
    expensesReady: expensesReady,
  };
})(window);
