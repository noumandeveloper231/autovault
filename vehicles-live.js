/**
 * Live Vehicles module - maps API ? dashboard UI shape and persists mutations.
 * Requires window.AVApi and global `vehicles` array.
 */
(function (global) {
  /* ?? Mutation lock ??????????????????????????????????????????????????????? */
  let _activeMutations = 0;
  const _pendingCallbacks = [];

  function _incMutations() {
    _activeMutations++;
    if (_activeMutations === 1) {
      global.dispatchEvent(new Event('av:busy'));
    }
  }
  function _decMutations() {
    _activeMutations = Math.max(0, _activeMutations - 1);
    if (_activeMutations === 0) {
      global.dispatchEvent(new Event('av:idle'));
    }
  }
  function isBusy() { return _activeMutations > 0; }

  function setBtnLoading(btn, loading, originalText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.disabled = true;
      btn.classList.add('av-btn-loading');
      btn.innerHTML = '<span class="av-btn-spinner"></span> ' + (originalText || 'Saving...');
    } else {
      btn.disabled = false;
      btn.classList.remove('av-btn-loading');
      btn.textContent = btn.dataset.origText || originalText || btn.textContent;
    }
  }

  function guard() {
    if (isBusy()) {
      if (global.AVToast) AVToast.warning('Please wait - a save is already in progress.');
      return false;
    }
    return true;
  }

  global.AVBusy = { isBusy, setBtnLoading, guard, withLock, inc: _incMutations, dec: _decMutations };

  /* ?? beforeunload guard ???????????????????????????????????????????????? */
  if (global.addEventListener) {
    global.addEventListener('beforeunload', function (e) {
      if (!isBusy()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /* ?? Status mapping ??????????????????????????????????????????????????? */
  const STATUS_API_TO_UI = {
    in_stock: "In Stock",
    needs_attention: "Arbitration",
    arbitration: "Arbitration",
    pending_deal: "Pending Deal",
    sold: "Sold",
    loss: "Sold Loss",
    wholesale: "Wholesale",
    out_of_state_sale: "Out of State Sale",
  };

  const STATUS_UI_TO_API = {
    "": "in_stock",
    Active: "in_stock",
    "In Stock": "in_stock",
    Available: "in_stock",
    "In Inventory": "in_stock",
    Sold: "sold",
    "Sold Loss": "loss",
    Arbitration: "arbitration",
    Wholesale: "wholesale",
    "Out of State Sale": "out_of_state_sale",
    "Pending Deal": "pending_deal",
    "Mark as Sold": "sold",
  };

  function isoDate(value) {
    if (!value) return null;
    // Prefer YYYY-MM-DD prefix when present to avoid UTC day-shift.
    if (typeof value === "string") {
      const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }

  const EXIT_STATUSES = new Set([
    "sold",
    "loss",
    "wholesale",
    "out_of_state_sale",
  ]);

  function isExitStatus(status) {
    return EXIT_STATUSES.has(status);
  }

  function toast(msg, ok) {
    if (global.AVToast) {
      if (ok === false) AVToast.error(msg);
      else if (ok === true) AVToast.success(msg);
      else AVToast.info(msg);
      return;
    }
    console.log("[vehicles]", msg);
  }

  function num(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function mapExpenseToRepair(e) {
    return {
      id: e.id,
      desc: e.description || e.expenseName || "Repair",
      type: e.repairType || e.category || "General",
      cost: num(e.totalCost, 0),
      receipt: e.receiptStoragePath || null,
      date: isoDate(e.repairDate),
    };
  }

  /** API vehicle (+ optional expenses) ? UI row used by computeRow/render */
  function mapApiToUi(api, expenses) {
    const statusUi = STATUS_API_TO_UI[api.status] || "In Stock";
    // Any inventory-exit status counts as sold for Vehicles / Sold Vehicles pages.
    const sold = isExitStatus(api.status) || !!api.soldAt;
    const expenseSrc =
      Array.isArray(expenses) && expenses.length
        ? expenses
        : Array.isArray(api.expenses)
          ? api.expenses
          : [];
    const repairsList = expenseSrc.map(mapExpenseToRepair);
    const acquisition = num(api.acquisitionCost, 0);
    const fees = num(api.auctionFees, 0);
    const dealerRegFees = num(api.registrationFees, 0);
    const asking = num(api.askingPrice, 0);
    const reconCost = num(api.reconditioningCost, 0);
    // Previous-sold / historical imports store recon+other+add-ons on the vehicle
    // without VehicleExpense rows — seed a synthetic repair so computeRow totals match.
    const effectiveRepairs =
      repairsList.length > 0
        ? repairsList
        : reconCost > 0
          ? [
              {
                id: null,
                desc: "Reconditioning / other (imported)",
                type: "General",
                cost: reconCost,
                receipt: null,
                date: isoDate(api.acquisitionDate),
                _synthetic: true,
              },
            ]
          : [];
    const deal = api.deal || null;
    const cust = deal && deal.customer ? deal.customer : null;
    const jacket = api.dealJackets && api.dealJackets[0] ? api.dealJackets[0] : null;
    const customerSalesTax = deal ? num(deal.salesTaxAmount, 0) : 0;
    const customerRegFees = deal ? num(deal.licenseFees, 0) : 0;
    const flooringFees = api.flooringFees != null ? num(api.flooringFees, 0) : null;
    const customerAddress = cust
      ? [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ")
      : null;
    // Always resolve a sold date for exited inventory so Sold Vehicles month filters work.
    const soldDate = sold
      ? isoDate(api.soldAt) ||
        (deal && isoDate(deal.dateSold)) ||
        (jacket && isoDate(jacket.dateSold)) ||
        isoDate(api.updatedAt) ||
        isoDate(new Date())
      : null;

    return {
      id: api.id,
      vin: api.vin,
      stock: api.stockNumber || "",
      date:
        isoDate(api.acquisitionDate) ||
        isoDate(api.createdAt) ||
        isoDate(new Date()),
      year: api.year,
      make: api.make,
      model: api.model,
      trim: api.trim || "",
      category: api.bodyStyle || "",
      color: api.exteriorColor || "",
      mileage: api.mileage ?? null,
      price: acquisition,
      fees,
      /* Table "Sales Tax" / "Reg. Fees" columns show pass-through amounts from the deal */
      salesTax: sold ? customerSalesTax : 0,
      regFees: sold ? customerRegFees : dealerRegFees,
      customerSalesTax,
      customerRegFees,
      customerId: cust ? cust.id : null,
      customer: cust ? cust.name : (api.customerName || null),
      customerPhone: cust ? cust.phone : (api.customerPhone || null),
      customerEmail: cust ? cust.email : (api.customerEmail || null),
      customerAddress: cust ? customerAddress : (api.customerAddress || null),
      extraRepPay: 0,
      askingPrice: asking,
      targetPrice: asking,
      salesRepId: (deal && deal.salesRepId) || (deal && deal.salesRep && deal.salesRep.id) || (jacket && jacket.salesRepId) || null,
      rep: (function () {
        if (deal && deal.salesRep && deal.salesRep.fullName) return deal.salesRep.fullName;
        if (api._uiRep) return api._uiRep;
        const sid =
          (deal && deal.salesRepId) ||
          (deal && deal.salesRep && deal.salesRep.id) ||
          (jacket && jacket.salesRepId) ||
          null;
        if (sid && global.AVReps && typeof AVReps.getRepById === "function") {
          const row = AVReps.getRepById(sid);
          if (row && row.name) return row.name;
        }
        if (sid && Array.isArray(global.salesReps)) {
          const row = global.salesReps.find(function (r) { return r && r.id === sid; });
          if (row && row.name) return row.name;
        }
        return "";
      })(),
      sold,
      soldDate,
      soldPrice: api.soldPrice != null ? num(api.soldPrice, null) : null,
      ros: deal ? (deal.rosNumber || jacket?.rosNumber || "") : "",
      jacketNumber: jacket ? (jacket.jacketNumber || "") : "",
      notes: deal ? (deal.notes || jacket?.notes || api.notes || "") : (api.notes || ""),
      addOns: jacket ? num(jacket.additionalExpenses, 0) : 0,
      addOnItems: (jacket && jacket.fees && Array.isArray(jacket.fees.addOnItems))
        ? jacket.fees.addOnItems
        : (api.fees && Array.isArray(api.fees.addOnItems) ? api.fees.addOnItems : []),
      /* Actual finance-company remittance; drives profit when set (incl. $0). */
      netCheck: (function () {
        const fromJacket =
          jacket && jacket.fees && jacket.fees.netCheck != null
            ? jacket.fees.netCheck
            : null;
        const fromVehicle =
          api.fees && api.fees.netCheck != null ? api.fees.netCheck : null;
        const raw = fromJacket != null ? fromJacket : fromVehicle;
        if (raw === null || raw === undefined || raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      })(),
      netCheckReason: (function () {
        if (jacket && jacket.fees && jacket.fees.netCheckReason != null)
          return String(jacket.fees.netCheckReason);
        if (api.fees && api.fees.netCheckReason != null)
          return String(api.fees.netCheckReason);
        return "";
      })(),
      netCheckNotes: (function () {
        if (jacket && jacket.fees && jacket.fees.netCheckNotes != null)
          return String(jacket.fees.netCheckNotes);
        if (api.fees && api.fees.netCheckNotes != null)
          return String(api.fees.netCheckNotes);
        return "";
      })(),
      statusInfo: (function () {
        const fromJacket =
          jacket && jacket.fees && jacket.fees.statusInfo && typeof jacket.fees.statusInfo === "object"
            ? jacket.fees.statusInfo
            : null;
        const fromVehicle =
          api.fees && api.fees.statusInfo && typeof api.fees.statusInfo === "object"
            ? api.fees.statusInfo
            : null;
        const raw = fromJacket || fromVehicle;
        return raw ? { ...raw } : {};
      })(),
      commissionOverride: deal ? num(deal.commissionAmount, null) : null,
      commissionPct: deal && deal.commissionRate ? Math.round(deal.commissionRate * 1000) / 10 : null,
      commMode: deal && deal.commissionType
        ? (deal.commissionType === "manual" || deal.commissionType === "flat" ? "amt" : "pct")
        : null,
      floored: !!(api.flooringPlanId || api.flooringStartDate || (flooringFees != null && flooringFees > 0) || !!(api.fees && api.fees.flooringManual)),
      flooringPaidOff: !!(api.fees && api.fees.flooringPaidOff),
      flooringPaidDate: (api.fees && api.fees.flooringPaidDate) || null,
      flooringPaidAmount:
        api.fees && api.fees.flooringPaidAmount != null
          ? num(api.fees.flooringPaidAmount, null)
          : null,
      titlePresent: api.titlePresent !== false && api.titleReceived !== false,
      titleIn:
        api.titlePresent !== false && api.titleReceived !== false
          ? true
          : api.titlePresent === false || api.titleReceived === false
            ? false
            : undefined,
      purchaseLocation: api.sellerAuction || "",
      status: statusUi,
      statusDate: null,
      repairsList: effectiveRepairs,
      reconditioningCost: reconCost,
      /* Explicit override (including $0) only when the dealer set flooring
         on this vehicle. Stored fees alone do not invent a flooring cost. */
      flooringOverride: (function () {
        const vehicleManual = !!(api.fees && api.fees.flooringManual);
        const jacketManual = !!(jacket && jacket.fees && jacket.fees.flooringManual);
        if (vehicleManual || jacketManual) {
          return flooringFees != null ? Number(flooringFees) || 0 : 0;
        }
        return null;
      })(),
      flooringDetail:
        (api.fees && api.fees.flooringDetail) ||
        (jacket && jacket.fees && jacket.fees.flooringDetail) ||
        undefined,
      isWholesale: !!api.isWholesale,
      documents: (jacket && Array.isArray(jacket.documents))
        ? jacket.documents.map(d => ({ id: d.id, name: d.documentName, img: d.fileUrl, ts: d.uploadedAt }))
        : [],
      vehicleDocs: [],
      dealSaved: !!(api.hasDealJacket || jacket),
      hasDealJacket: !!(api.hasDealJacket || jacket),
      dealJacket: !!(api.hasDealJacket || jacket),
      _raw: api,
    };
  }

  function getVehiclesList() {
    if (!Array.isArray(global.vehicles)) global.vehicles = [];
    return global.vehicles;
  }

  function findUiVehicle(vinOrId) {
    return (
      getVehiclesList().find((v) => v && (v.vin === vinOrId || v.id === vinOrId)) ||
      null
    );
  }

  function replaceVehicleInPlace(ui) {
    const list = getVehiclesList();
    const idx = list.findIndex((v) => v.id === ui.id || v.vin === ui.vin);
    if (idx >= 0) {
      const prev = list[idx];
      if (prev && prev._undo) ui._undo = prev._undo;
      if (prev && prev.flooringDetail) ui.flooringDetail = prev.flooringDetail;
      if (prev && prev.djDocs) ui.djDocs = prev.djDocs;
      if (prev && prev.djDocsRemoved) ui.djDocsRemoved = prev.djDocsRemoved;
      if (prev && prev.statusInfo && typeof prev.statusInfo === "object") {
        ui.statusInfo = Object.assign({}, ui.statusInfo || {}, prev.statusInfo);
      }
      list[idx] = ui;
    } else list.unshift(ui);
  }

  function refreshUi() {
    var cur =
      typeof global.getCurrentPage === "function" ? global.getCurrentPage() : "";
    try {
      if (typeof global.render === "function") global.render();
    } catch (_) {}
    try {
      if (cur === "pnl" && typeof global.renderPnlPage === "function") {
        global.renderPnlPage();
      }
    } catch (_) {}
    try {
      if (cur === "calendar" && typeof global.renderCalendarPage === "function") {
        global.renderCalendarPage();
      }
    } catch (_) {}
    try {
      if (typeof global.syncWsVehicles === "function") global.syncWsVehicles();
    } catch (_) {}
    try {
      if (typeof global.refreshOpenVehicleViews === "function") {
        global.refreshOpenVehicleViews();
      } else if (
        global.currentVdpVin &&
        typeof global.renderVehicleDetailPage === "function"
      ) {
        global.renderVehicleDetailPage(global.currentVdpVin);
      }
    } catch (_) {}
    try {
      if (cur === "sold-vehicles" && typeof global.renderSoldVehicles === "function") {
        global.renderSoldVehicles();
      } else if (cur === "deal-jackets" && typeof global.renderDealJacketsList === "function") {
        global.renderDealJacketsList();
      } else if (cur === "tax" && typeof global.renderTaxPage === "function") {
        global.renderTaxPage();
      } else if (cur === "dashboard" && typeof global.renderDashboard === "function") {
        global.renderDashboard();
      } else if (cur === "flooring" && typeof global.renderFlooringPage === "function") {
        global.renderFlooringPage();
      } else if (cur === "payroll" && typeof global.renderPayrollPage === "function") {
        global.renderPayrollPage();
      } else if (cur === "reps" && typeof global.renderRepsPage === "function") {
        global.renderRepsPage();
      } else if (cur === "rep-detail" && typeof global.renderRepDetail === "function") {
        global.renderRepDetail();
      }
    } catch (_) {}
    try {
      if (typeof global.updateNotifBadge === "function") global.updateNotifBadge();
    } catch (_) {}
  }

  async function loadAllVehicles() {
    if (typeof global.setVehiclesLoading === "function") {
      global.setVehiclesLoading(true);
    } else {
      global.vehiclesLoading = true;
    }
    try {
      if (!global.AVApi) throw new Error("AVApi not loaded");

      const pageSize = 100;
      const fetchPage = async (page, timeout) => {
        const qs = `?limit=${pageSize}&page=${page}&scope=all`;
        const opts = timeout ? { timeout } : {};
        return AVApi.listVehicles(qs, opts);
      };

      // Parallel: authoritative inventory stats + first page of vehicles.
      let firstPage;
      let statsPayload = null;
      try {
        const [pageResult, statsResult] = await Promise.all([
          fetchPage(1),
          AVApi.vehicleInventoryStats().catch((err) => {
            console.warn("[vehicles] inventory stats unavailable:", err.message || err);
            return null;
          }),
        ]);
        firstPage = pageResult;
        statsPayload = statsResult;
      } catch (e) {
        if (e.message && e.message.includes("timed out")) {
          console.warn("[vehicles] first fetch timed out, retrying with 120s timeout…");
          firstPage = await fetchPage(1, 120000);
          statsPayload = await AVApi.vehicleInventoryStats({
            timeout: 120000,
          }).catch(() => null);
        } else {
          throw e;
        }
      }

      const stats = statsPayload && (statsPayload.stats || statsPayload);
      if (stats && typeof stats.currentInventoryCount === "number") {
        global.__vehicleInventoryStats = stats;
      }

      const allRows = [];
      const pushRows = (data) => {
        const rows = data.vehicles || data.data || [];
        allRows.push.apply(allRows, rows);
        return rows;
      };

      const firstRows = pushRows(firstPage);
      const total =
        (firstPage.meta && firstPage.meta.total) != null
          ? Number(firstPage.meta.total)
          : firstRows.length;

      // Paginate remaining pages so KPI / inventory counts aren't capped at 100.
      let page = 2;
      while (allRows.length < total) {
        const data = await fetchPage(page);
        const rows = pushRows(data);
        if (!rows.length || rows.length < pageSize) break;
        page += 1;
        // Safety cap: 50 pages × 100 = 5,000 vehicles.
        if (page > 50) break;
      }

      // Expenses + deal come from listVehicles in one round-trip (no N+1).
      const list = getVehiclesList();
      const prevById = {};
      list.forEach((v) => {
        if (v && v.id) prevById[v.id] = v;
      });
      const mapped = allRows.map((row) => mapApiToUi(row, row.expenses || []));
      mapped.forEach((ui) => {
        const prev = prevById[ui.id];
        if (!prev) return;
        if (prev.statusInfo && typeof prev.statusInfo === "object") {
          ui.statusInfo = Object.assign({}, ui.statusInfo || {}, prev.statusInfo);
        }
        if (prev.djDocs) ui.djDocs = prev.djDocs;
        if (prev.djDocsRemoved) ui.djDocsRemoved = prev.djDocsRemoved;
      });
      list.length = 0;
      mapped.forEach((v) => list.push(v));
      global.AV_VEHICLES_LIVE = true;
      return mapped;
    } catch (err) {
      throw err;
    } finally {
      // Always clear loading so P&L / profit / loss never stick on skeletons.
      if (typeof global.setVehiclesLoading === "function") {
        global.setVehiclesLoading(false);
      } else {
        global.vehiclesLoading = false;
      }
      refreshUi();
    }
  }

  /** Refresh inventory / period KPI stats without reloading the full vehicle table. */
  async function refreshInventoryStats(period) {
    try {
      if (!global.AVApi || !AVApi.vehicleInventoryStats) return null;
      let qs = "";
      if (period && (period.mode === "year" || period.mode === "month")) {
        const params = new URLSearchParams();
        params.set("mode", period.mode);
        if (period.year != null) params.set("year", String(period.year));
        if (period.mode === "month" && period.month != null) {
          // vehPeriod.month is 0–11; API expects 1–12.
          params.set("month", String(Number(period.month) + 1));
        }
        qs = `?${params.toString()}`;
      }
      const data = await AVApi.vehicleInventoryStats(qs);
      const stats = data && (data.stats || data);
      if (stats && typeof stats.currentInventoryCount === "number") {
        global.__vehicleInventoryStats = stats;
      }
      return stats;
    } catch (err) {
      console.warn("[vehicles] refreshInventoryStats failed:", err.message || err);
      return null;
    }
  }

  /** Wrap an async mutation with the busy-lock + optional button spinner. */
  async function withLock(fn, btn, btnLabel) {
    if (!guard()) throw new Error("A save is already in progress.");
    _incMutations();
    if (btn) setBtnLoading(btn, true, btnLabel);
    try {
      const result = await fn();
      return result;
    } finally {
      if (btn) setBtnLoading(btn, false, btnLabel);
      _decMutations();
    }
  }

  async function refreshOneVehicle(vinOrId) {
    const v = findUiVehicle(vinOrId);
    if (!v || !v.id) throw new Error("Vehicle not found");
    if (!global.AVApi || typeof AVApi.getVehicle !== "function") {
      throw new Error("Vehicles API not loaded");
    }
    const got = await AVApi.getVehicle(v.id);
    const vehicle = got.vehicle || got;
    const expenses = vehicle.expenses || [];
    const ui = mapApiToUi(
      vehicle,
      Array.isArray(expenses) && expenses[0] && expenses[0].id
        ? expenses
        : (v.repairsList || []).map((r) => ({
            id: r.id,
            description: r.desc,
            repairType: r.type,
            totalCost: r.cost,
            repairDate: r.date,
          })),
    );
    if (v.rep && !ui.rep) ui.rep = v.rep;
    if (v.salesRepId && !ui.salesRepId) ui.salesRepId = v.salesRepId;
    replaceVehicleInPlace(ui);
    refreshUi();
    return ui;
  }

  async function persistPatch(vinOrId, patch) {
    const v = findUiVehicle(vinOrId);
    if (!v || !v.id) throw new Error("Vehicle has no API id - reload inventory");
    const jacket =
      v._raw && Array.isArray(v._raw.dealJackets) && v._raw.dealJackets[0];
    const flooringOnVehicle = !!(
      patch &&
      (Object.prototype.hasOwnProperty.call(patch, "flooringFees") ||
        Object.prototype.hasOwnProperty.call(patch, "flooringStartDate") ||
        Object.prototype.hasOwnProperty.call(patch, "flooringPlanId") ||
        (patch.fees &&
          (patch.fees.flooringManual !== undefined ||
            patch.fees.flooringDetail !== undefined)))
    );
    // Jacket-owned fees (Net Check / add-ons) must update the deal jacket, not only the vehicle.
    // Flooring cost lives on the vehicle — never divert that patch to the jacket alone.
    if (patch && patch.fees && jacket && jacket.id && !flooringOnVehicle) {
      const fees = mergeFees(v, patch.fees);
      const jacketPatch = { fees };
      if (patch.additionalExpenses != null)
        jacketPatch.additionalExpenses = patch.additionalExpenses;
      await AVApi.updateDealJacket(jacket.id, jacketPatch);
      jacket.fees = fees;
      if (jacketPatch.additionalExpenses != null)
        jacket.additionalExpenses = jacketPatch.additionalExpenses;
      const rest = { ...patch };
      delete rest.fees;
      delete rest.additionalExpenses;
      if (Object.keys(rest).length === 0) {
        refreshUi();
        return v;
      }
      patch = rest;
    }
    const { vehicle } = await AVApi.updateVehicle(v.id, patch);
    const expenses = vehicle.expenses || v.repairsList;
    const ui = mapApiToUi(
      { ...vehicle, deal: vehicle.deal || (v._raw && v._raw.deal) },
      Array.isArray(expenses) && expenses[0] && expenses[0].id
        ? expenses
        : (v.repairsList || []).map((r) => ({
            id: r.id,
            description: r.desc,
            repairType: r.type,
            totalCost: r.cost,
            repairDate: r.date,
          })),
    );
    ui.rep = v.rep || ui.rep || "";
    if (v.salesRepId && !ui.salesRepId) ui.salesRepId = v.salesRepId;
    ui.customer = v.customer || ui.customer;
    ui.customerPhone = v.customerPhone || ui.customerPhone;
    ui.customerEmail = v.customerEmail || ui.customerEmail;
    ui.customerAddress = v.customerAddress || ui.customerAddress;
    ui.customerSalesTax =
      v.customerSalesTax != null ? v.customerSalesTax : ui.customerSalesTax;
    ui.customerRegFees =
      v.customerRegFees != null ? v.customerRegFees : ui.customerRegFees;
    ui.commissionOverride = v.commissionOverride != null ? v.commissionOverride : ui.commissionOverride;
    ui.commissionPct = v.commissionPct != null ? v.commissionPct : ui.commissionPct;
    ui.ros = v.ros || ui.ros;
    ui.soldPrice = v.soldPrice != null ? v.soldPrice : ui.soldPrice;
    if (v.askingPrice != null && v.askingPrice !== "") {
      ui.askingPrice = Number(v.askingPrice);
      ui.targetPrice = Number(v.askingPrice);
    } else if (v.targetPrice != null && v.targetPrice !== "") {
      ui.askingPrice = Number(v.targetPrice);
      ui.targetPrice = Number(v.targetPrice);
    }
    ui.soldDate = v.soldDate || ui.soldDate;
    ui.notes = v.notes != null ? v.notes : ui.notes;
    ui.addOns = v.addOns != null ? v.addOns : ui.addOns;
    ui.addOnItems = v.addOnItems != null ? v.addOnItems : ui.addOnItems;
    if (v.netCheck !== null && v.netCheck !== undefined) {
      ui.netCheck = Number(v.netCheck);
    }
    if (v.netCheckReason != null) ui.netCheckReason = v.netCheckReason;
    if (v.netCheckNotes != null) ui.netCheckNotes = v.netCheckNotes;
    if (v.statusInfo && typeof v.statusInfo === "object") {
      ui.statusInfo = Object.assign({}, ui.statusInfo || {}, v.statusInfo);
    }
    ui.commMode = v.commMode || ui.commMode;
    ui.documents = v.documents || ui.documents;
    ui.djDocs = v.djDocs || [];
    ui.djDocsRemoved = v.djDocsRemoved || [];
    ui.dealSaved = v.dealSaved != null ? v.dealSaved : ui.dealSaved;
    ui.flooringDetail = v.flooringDetail;
    // Keep an in-flight explicit $0 override if the API remap somehow drops it
    if (
      v.flooringOverride !== null &&
      v.flooringOverride !== undefined &&
      (ui.flooringOverride === null || ui.flooringOverride === undefined)
    ) {
      ui.flooringOverride = Number(v.flooringOverride) || 0;
    }
    replaceVehicleInPlace(ui);
    refreshUi();
    return ui;
  }

  async function createFromForm(fields) {
    const dateStr =
      fields.date && /^\d{4}-\d{2}-\d{2}$/.test(fields.date)
        ? fields.date
        : new Date().toISOString().slice(0, 10);
    const acqIso = new Date(dateStr + "T12:00:00").toISOString();
    const body = {
      vin: fields.vin,
      year: Number(fields.year) || new Date().getFullYear(),
      make: fields.make || "Unknown",
      model: fields.model || "Unknown",
      acquisitionCost: Number(fields.price) || 0,
      auctionFees: Number(fields.fees) || 0,
      acquisitionDate: acqIso,
      titleReceived: !!fields.titlePresent,
      titlePresent: !!fields.titlePresent,
      status: "in_stock",
      flooringStartDate: fields.floored ? acqIso : null,
      notes: fields.notes || null,
      sellerAuction: fields.purchaseLocation || null,
    };
    const { vehicle } = await AVApi.createVehicle(body);
    const ui = mapApiToUi(vehicle, []);
    ui.floored = !!fields.floored;
    ui.titlePresent = !!fields.titlePresent;
    ui.date = dateStr;
    getVehiclesList().unshift(ui);
    refreshUi();
    return ui;
  }

  async function removeVehicle(vinOrId) {
    const v = findUiVehicle(vinOrId);
    if (!v || !v.id) throw new Error("Vehicle not found");
    await AVApi.deleteVehicle(v.id);
    const list = getVehiclesList();
    const idx = list.findIndex((x) => x.id === v.id || x.vin === v.vin);
    if (idx >= 0) list.splice(idx, 1);
    refreshUi();
  }

  async function persistMoneyField(vin, field, value) {
    const patch = {};
    if (field === "price") patch.acquisitionCost = value;
    else if (field === "fees") patch.auctionFees = value;
    else if (field === "flooring" || field === "flooringOverride") {
      const v = findUiVehicle(vin);
      const prevFees = mergeFees(v, {});
      if (value === null || value === undefined) {
        patch.flooringFees = 0;
        patch.fees = {
          ...prevFees,
          flooringManual: false,
          flooringDetail: null,
        };
        patch.flooringStartDate = null;
        patch.flooringPlanId = null;
      } else {
        const amount = Number(value);
        patch.flooringFees = Number.isFinite(amount) ? amount : 0;
        patch.fees = {
          ...prevFees,
          flooringManual: true,
          flooringDetail: (v && v.flooringDetail) || prevFees.flooringDetail || null,
        };
        if (patch.flooringFees > 0) {
          const dateStr = v && v.date ? String(v.date).slice(0, 10) : "";
          const startIso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
            ? new Date(dateStr + "T12:00:00").toISOString()
            : new Date().toISOString();
          if (v && !v._raw?.flooringStartDate) {
            patch.flooringStartDate = startIso;
          }
        }
      }
    } else if (field === "soldPrice") patch.soldPrice = value;
    else if (field === "regFees") patch.registrationFees = value;
    else if (field === "date") {
      const dateStr = String(value || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
      patch.acquisitionDate = new Date(dateStr + "T12:00:00").toISOString();
      const v = findUiVehicle(vin);
      if (v) v.date = dateStr;
    } else if (field === "commission" || field === "commissionOverride") {
      const v = findUiVehicle(vin);
      if (v) v.commissionOverride = value;
      refreshUi();
      return v;
    } else if (field === "salesTax") {
      const v = findUiVehicle(vin);
      if (v) {
        v.salesTax = value;
        v.customerSalesTax = value;
      }
      refreshUi();
      return v;
    } else if (field === "addOns") {
      const v = findUiVehicle(vin);
      if (v) v.addOns = value;
      refreshUi();
      return v;
    } else if (field === "askingPrice" || field === "targetPrice") {
      patch.askingPrice = value;
      const v = findUiVehicle(vin);
      if (v) {
        v.askingPrice = value;
        v.targetPrice = value;
      }
    } else {
      return null;
    }
    return persistPatch(vin, patch);
  }

  async function attachFlooringPlan(vin, opts) {
    opts = opts || {};
    const v = findUiVehicle(vin);
    if (!v || !v.id) throw new Error("Vehicle has no API id - reload inventory");
    const prevFees = mergeFees(v, {});
    const dateStr = v.date ? String(v.date).slice(0, 10) : "";
    const startIso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + "T12:00:00").toISOString()
      : new Date().toISOString();
    const amount = Number(opts.cost);
    const patch = {
      flooringPlanId: opts.planId || null,
      flooringFees: Number.isFinite(amount) ? amount : 0,
      fees: {
        ...prevFees,
        flooringManual: false,
        flooringDetail: prevFees.flooringDetail || null,
      },
    };
    if (!(v._raw && v._raw.flooringStartDate)) {
      patch.flooringStartDate = startIso;
    }
    v.floored = true;
    v.flooringOverride = null;
    return persistPatch(vin, patch);
  }

  function mergeFees(v, extra) {
    const vehicleFees =
      v && v._raw && v._raw.fees && typeof v._raw.fees === "object"
        ? { ...v._raw.fees }
        : {};
    const jacket =
      v && v._raw && Array.isArray(v._raw.dealJackets) && v._raw.dealJackets[0];
    const jacketFees =
      jacket && jacket.fees && typeof jacket.fees === "object"
        ? { ...jacket.fees }
        : {};
    const merged = { ...vehicleFees, ...jacketFees, ...(extra || {}) };
    if (Array.isArray(v && v.addOnItems)) merged.addOnItems = v.addOnItems;
    else if (!Array.isArray(merged.addOnItems)) merged.addOnItems = [];
    if (v && v.netCheck !== null && v.netCheck !== undefined && merged.netCheck == null) {
      merged.netCheck = Number(v.netCheck);
    }
    if (v && v.netCheckReason) merged.netCheckReason = v.netCheckReason;
    if (v && v.netCheckNotes) merged.netCheckNotes = v.netCheckNotes;
    if (v && v.statusInfo && typeof v.statusInfo === "object") {
      merged.statusInfo = Object.assign({}, merged.statusInfo || {}, v.statusInfo);
    }
    return merged;
  }

  async function persistNetCheck(vin, value, meta) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) throw new Error("Vehicle not found");
    const hasValue = value !== null && value !== undefined && value !== "";
    const amount = hasValue ? Number(value) : null;
    if (hasValue && !Number.isFinite(amount)) {
      throw new Error("Invalid net check amount");
    }
    if (hasValue && amount < 0) {
      throw new Error("Net check must be 0 or greater");
    }
    const MAX_NET = 99999999.99;
    const stored = hasValue ? Math.min(MAX_NET, Math.round(amount * 100) / 100) : null;
    v.netCheck = stored;
    if (meta && typeof meta === "object") {
      if (meta.reason !== undefined) v.netCheckReason = String(meta.reason || "");
      if (meta.notes !== undefined) v.netCheckNotes = String(meta.notes || "");
    }
    const fees = mergeFees(v, {
      netCheck: stored,
      netCheckReason: v.netCheckReason || null,
      netCheckNotes: v.netCheckNotes || null,
    });
    if (!hasValue) delete fees.netCheck;
    if (!fees.netCheckReason) delete fees.netCheckReason;
    if (!fees.netCheckNotes) delete fees.netCheckNotes;

    const jacket =
      v._raw && Array.isArray(v._raw.dealJackets) && v._raw.dealJackets[0];
    if (jacket && jacket.id) {
      await AVApi.updateDealJacket(jacket.id, { fees });
      jacket.fees = fees;
    } else {
      await AVApi.updateVehicle(v.id, { fees });
      if (v._raw) v._raw.fees = fees;
    }
    refreshUi();
    return v;
  }

  async function persistAddOnItems(vin) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) return;
    const live = Array.isArray(v.addOnItems) ? v.addOnItems : [];
    // Keep the in-memory rows intact (including in-progress empty rows).
    // Only the API payload drops blank lines.
    const payload = live
      .map(function (it) {
        return {
          desc: String((it && it.desc) || "").trim(),
          type: String((it && it.type) || "").trim(),
          price: Number(it && it.price) || 0,
          cost: Number(it && it.cost) || 0,
        };
      })
      .filter(function (it) {
        return it.cost > 0 || it.price > 0 || it.desc || it.type;
      })
      .map(function (it) {
        return {
          desc: it.desc,
          type: it.type || "Add-On",
          price: it.price,
          cost: it.cost,
        };
      });
    const costTotal = payload.reduce(function (s, it) {
      return s + (Number(it.cost) || 0);
    }, 0);
    const fees = mergeFees(v, { addOnItems: payload });
    var jacket = v._raw && v._raw.dealJackets && v._raw.dealJackets[0];
    if (jacket && jacket.id) {
      await AVApi.updateDealJacket(jacket.id, {
        fees,
        additionalExpenses: costTotal,
      });
      jacket.fees = fees;
      jacket.additionalExpenses = costTotal;
    } else {
      await AVApi.updateVehicle(v.id, {
        fees,
        additionalExpenses: costTotal,
      });
    }
    v.additionalExpenses = costTotal;
    v.addOns = costTotal;
  }

  async function persistStatus(vin, uiStatus) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) return;
    if (uiStatus === "Sold Loss" || uiStatus === "loss") {
      await AVApi.markLoss(v.id, { note: uiStatus });
      await loadAllVehicles();
      return;
    }
    if (uiStatus === "Sold" || uiStatus === "Mark as Sold") {
      throw new Error("Use Mark Sold with customer and price");
    }
    const apiStatus = STATUS_UI_TO_API[uiStatus];
    if (!apiStatus) throw new Error("Unknown vehicle status");
    const returningToStock =
      apiStatus === "in_stock" ||
      apiStatus === "needs_attention" ||
      apiStatus === "pending_deal" ||
      apiStatus === "arbitration";
    const patch = { status: apiStatus };
    if (uiStatus === "Wholesale") {
      patch.isWholesale = true;
    } else if (returningToStock) {
      patch.isWholesale = false;
    } else {
      patch.isWholesale = false;
    }
    await AVApi.changeVehicleStatus(v.id, {
      status: apiStatus,
      note:
        apiStatus === "in_stock"
          ? "Returned to in stock"
          : uiStatus || null,
    });
    await AVApi.updateVehicle(v.id, patch);
    if (returningToStock && apiStatus === "in_stock") {
      v.status = "In Stock";
      v.sold = false;
      v.soldDate = null;
      v.soldPrice = null;
      if (v._raw) {
        v._raw.status = "in_stock";
        v._raw.soldAt = null;
        v._raw.soldPrice = null;
      }
      replaceVehicleInPlace(v);
    }
    await loadAllVehicles();
  }

  async function markSoldViaForm(vin, sale) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) throw new Error("Vehicle not found");
    if (!sale.soldPrice || sale.soldPrice <= 0) {
      throw new Error("Sold price is required");
    }
    if (!sale.customerName) throw new Error("Customer name is required");
    const email = (sale.email || "").trim();
    const phone = (sale.phone || "").trim();
    const body = {
      customerName: sale.customerName,
      customerPhone: phone || undefined,
      customerEmail: email || undefined,
      customerAddress: sale.customerAddress || undefined,
      saleDate: sale.soldDate || new Date().toISOString(),
      soldPrice: sale.soldPrice,
      salesTaxAmount: sale.customerSalesTax || 0,
      licenseFees: sale.customerRegFees || 0,
      notes: sale.notes || undefined,
      rosNumber: sale.dealNumber || undefined,
      workflowStatus: "pending_review",
    };
    if (sale.salesRepId) body.salesRepId = sale.salesRepId;
    if (sale.additionalExpenses != null) body.additionalExpenses = sale.additionalExpenses;
    if (sale.commissionAmount != null) body.commissionAmount = sale.commissionAmount;
    if (sale.commissionRate != null) body.commissionRate = sale.commissionRate;
    if (sale.commissionType) body.commissionType = sale.commissionType;
    if (sale.fees) {
      body.fees = sale.fees;
      if (sale.fees.netCheck != null && sale.fees.netCheck !== "") {
        body.netCheck = Number(sale.fees.netCheck);
      }
    }
    if (sale.netCheck != null && sale.netCheck !== "") body.netCheck = Number(sale.netCheck);
    if (sale.titleReceived != null) body.titleReceived = !!sale.titleReceived;
    if (sale.titlePresent != null) body.titlePresent = !!sale.titlePresent;
    const resp = await AVApi.markSold(v.id, body);
    // Clear vehicle-level fees after they've been moved to the deal jacket
    if (v.addOnItems && v.addOnItems.length > 0) {
      v.addOnItems = [];
      v.additionalExpenses = 0;
      v.addOns = 0;
      try { await AVApi.updateVehicle(v.id, { fees: { addOnItems: [] }, additionalExpenses: 0 }); } catch (_) {}
    }
    try {
      await refreshOneVehicle(v.id);
    } catch (_) {
      await loadAllVehicles();
    }
    return resp;
  }

  async function importPreviousSold(fields) {
    const buy = fields.buyDate;
    const sell = fields.sellDate;
    const body = {
      vin: String(fields.vin || "").toUpperCase().trim(),
      withoutVin: !!fields.withoutVin || /^NO-VIN-\d+$/i.test(String(fields.vin || "")),
      year: Number(fields.year) || undefined,
      make: fields.make || undefined,
      model: fields.model || undefined,
      acquisitionDate: buy
        ? new Date(buy + "T12:00:00").toISOString()
        : undefined,
      saleDate: sell
        ? new Date(sell + "T12:00:00").toISOString()
        : undefined,
      acquisitionCost: Number(fields.price) || 0,
      auctionFees: Number(fields.fees) || 0,
      reconditioningCost: Number(fields.repairs) || 0,
      otherExpenses: Number(fields.otherExpenses) || 0,
      flooringFees: Number(fields.flooring) || 0,
      addOnsCost: Number(fields.addOns) || 0,
      soldPrice: Number(fields.salePrice) || 0,
      salesTaxAmount: Number(fields.salesTax) || 0,
      licenseFees: Number(fields.regFees) || 0,
      titleReceived: fields.titlePresent !== false,
      titlePresent: fields.titlePresent !== false,
      customerName: fields.customer || "Previous customer",
      notes: "Imported as a previously sold vehicle.",
    };
    if (Array.isArray(fields.addOnItems) && fields.addOnItems.length) {
      body.addOnItems = fields.addOnItems;
      body.addOnsCost = fields.addOnItems.reduce(function (s, a) {
        return s + (Number(a.cost) || 0);
      }, 0);
    }
    if (fields.netCheck !== null && fields.netCheck !== undefined && fields.netCheck !== "") {
      body.netCheck = Number(fields.netCheck);
    }
    if (fields.netCheckReason) body.netCheckReason = String(fields.netCheckReason);
    if (fields.netCheckNotes) body.netCheckNotes = String(fields.netCheckNotes);
    if (fields.salesRepId) body.salesRepId = fields.salesRepId;
    if (fields.commissionAmount != null && fields.commissionAmount !== "") {
      body.commissionAmount = Number(fields.commissionAmount);
    }
    if (!body.vin) {
      delete body.vin;
      body.withoutVin = true;
    }
    const resp = await AVApi.importPreviousSold(body);
    await loadAllVehicles();
    if (typeof window.loadExpensesFromApi === "function") {
      try {
        await window.loadExpensesFromApi();
      } catch (_) {}
    }
    return resp;
  }

  async function addRepair(vin, entry) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) throw new Error("Vehicle not found - reload inventory");
    if (!entry || !String(entry.desc || "").trim()) {
      throw new Error("Description is required");
    }
    const cost = Number(entry.cost);
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error("Enter a repair cost greater than 0");
    }

    const body = {
      repairDate: entry.date || new Date().toISOString(),
      description: String(entry.desc).trim(),
      repairType: entry.type || "General",
      category: "repair",
      totalCost: cost,
      laborCost: cost,
      paymentStatus: "unpaid",
      ...(entry.receipt
        ? { receiptStoragePath: String(entry.receipt) }
        : entry.receipt === null
          ? { receiptStoragePath: null }
          : {}),
    };

    if (entry.id) {
      await AVApi.updateVehicleExpense(v.id, entry.id, body);
    } else {
      await AVApi.createVehicleExpense(v.id, body);
    }

    const expResp = await AVApi.listVehicleExpenses(v.id);
    const expenses = expResp.expenses || [];
    v.repairsList = expenses.map(mapExpenseToRepair);
    if (!v._raw) v._raw = {};
    v._raw.expenses = expenses;
    replaceVehicleInPlace(v);
    refreshUi();
    return v;
  }

  async function deleteRepair(vin, expenseId) {
    const v = findUiVehicle(vin);
    if (!v || !v.id || !expenseId) throw new Error("Repair not found");
    await AVApi.deleteVehicleExpense(v.id, expenseId);
    const expResp = await AVApi.listVehicleExpenses(v.id);
    const expenses = expResp.expenses || [];
    v.repairsList = expenses.map(mapExpenseToRepair);
    if (v._raw) v._raw.expenses = expenses;
    replaceVehicleInPlace(v);
    refreshUi();
  }

  let notesTimer = null;
  function setNotesStatus(text, saving) {
    const el = global.document && document.getElementById("vdpNotesStatus");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.saving = saving ? "1" : "0";
  }

  function persistNotesDebounced(vin, notes) {
    clearTimeout(notesTimer);
    setNotesStatus("Unsaved changes\u2026", false);
    notesTimer = setTimeout(async () => {
      setNotesStatus("Saving\u2026", true);
      try {
        await persistPatch(vin, { notes: notes || null });
        setNotesStatus("Saved", false);
        setTimeout(() => setNotesStatus("", false), 1600);
      } catch (err) {
        setNotesStatus("Save failed", false);
        toast(err.message || "Failed to save notes", false);
      }
    }, 600);
  }

  global.AVVehicles = {
    mapApiToUi,
    loadAllVehicles,
    refreshInventoryStats,
    createFromForm,
    persistPatch,
    refreshOneVehicle,
    persistMoneyField,
    attachFlooringPlan,
    persistNetCheck,
    persistAddOnItems,
    persistStatus,
    markSoldViaForm,
    importPreviousSold,
    removeVehicle,
    addRepair,
    deleteRepair,
    persistNotesDebounced,
    findUiVehicle,
    STATUS_UI_TO_API,
  };
})(window);
