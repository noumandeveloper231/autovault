/**
 * Live Vehicles module � maps API ? dashboard UI shape and persists mutations.
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
      btn.innerHTML = '<span class="av-btn-spinner"></span> ' + (originalText || 'Saving�');
    } else {
      btn.disabled = false;
      btn.classList.remove('av-btn-loading');
      btn.textContent = btn.dataset.origText || originalText || btn.textContent;
    }
  }

  function guard() {
    if (isBusy()) {
      if (global.AVToast) AVToast.warning('Please wait � a save is already in progress.');
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
    in_stock: "",
    needs_attention: "Arbitration",
    pending_deal: "Pending Deal",
    sold: "Sold",
    loss: "Sold Loss",
    wholesale: "Wholesale",
    out_of_state_sale: "Out of State Sale",
  };

  const STATUS_UI_TO_API = {
    "": "in_stock",
    Active: "in_stock",
    Sold: "sold",
    "Sold Loss": "loss",
    Arbitration: "needs_attention",
    Wholesale: "wholesale",
    "Out of State Sale": "out_of_state_sale",
    "Pending Deal": "pending_deal",
    "Mark as Sold": "sold",
  };

  function isoDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
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
    const statusUi = STATUS_API_TO_UI[api.status] || "";
    const sold = api.status === "sold";
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
    const deal = api.deal || null;
    const cust = deal && deal.customer ? deal.customer : null;
    const jacket = api.dealJackets && api.dealJackets[0] ? api.dealJackets[0] : null;
    const customerSalesTax = deal ? num(deal.salesTaxAmount, 0) : 0;
    const customerRegFees = deal ? num(deal.licenseFees, 0) : 0;
    const flooringFees = api.flooringFees != null ? num(api.flooringFees, 0) : null;
    const customerAddress = cust
      ? [cust.address, cust.city, cust.state, cust.zip].filter(Boolean).join(", ")
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
      customer: cust ? cust.name : null,
      customerPhone: cust ? cust.phone : null,
      customerEmail: cust ? cust.email : null,
      customerAddress,
      extraRepPay: 0,
      askingPrice: asking,
      rep: (deal && deal.salesRep) ? deal.salesRep.fullName : (api._uiRep || ""),
      sold,
      soldDate: sold ? isoDate(api.soldAt) : null,
      soldPrice: api.soldPrice != null ? num(api.soldPrice, null) : null,
      ros: deal ? (deal.rosNumber || jacket?.rosNumber || "") : "",
      notes: deal ? (deal.notes || jacket?.notes || api.notes || "") : (api.notes || ""),
      addOns: jacket ? num(jacket.additionalExpenses, 0) : 0,
      addOnItems: (jacket && jacket.fees && Array.isArray(jacket.fees.addOnItems))
        ? jacket.fees.addOnItems
        : (api.fees && Array.isArray(api.fees.addOnItems) ? api.fees.addOnItems : []),
      commissionOverride: deal ? num(deal.commissionAmount, null) : null,
      commissionPct: deal && deal.commissionRate ? Math.round(deal.commissionRate * 1000) / 10 : null,
      commMode: deal && deal.commissionType ? (deal.commissionType === 'manual' ? 'amt' : 'pct') : null,
      floored: !!(api.flooringPlanId || api.flooringStartDate || (flooringFees != null && flooringFees > 0)),
      titlePresent: api.titleReceived !== false,
      status: statusUi,
      statusDate: null,
      repairsList,
      flooringOverride:
        flooringFees != null && (flooringFees > 0 || api.flooringStartDate)
          ? flooringFees
          : null,
      isWholesale: !!api.isWholesale,
      documents: (jacket && Array.isArray(jacket.documents))
        ? jacket.documents.map(d => ({ id: d.id, name: d.documentName, img: d.fileUrl, ts: d.uploadedAt }))
        : [],
      vehicleDocs: [],
      dealSaved: !!jacket,
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
    if (idx >= 0) list[idx] = ui;
    else list.unshift(ui);
  }

  function refreshUi() {
    try {
      if (typeof global.render === "function") global.render();
    } catch (_) {}
    try {
      if (typeof global.renderPnlPage === "function") global.renderPnlPage();
    } catch (_) {}
    try {
      if (typeof global.renderCalendarPage === "function") global.renderCalendarPage();
    } catch (_) {}
    try {
      if (typeof global.syncWsVehicles === "function") global.syncWsVehicles();
    } catch (_) {}
    try {
      if (
        global.currentVdpVin &&
        typeof global.renderVehicleDetailPage === "function"
      ) {
        global.renderVehicleDetailPage(global.currentVdpVin);
      }
    } catch (_) {}
    try {
      var cur =
        typeof global.getCurrentPage === "function"
          ? global.getCurrentPage()
          : "";
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
      let data;
      try {
        data = await AVApi.listVehicles("?limit=100");
      } catch (e) {
        if (e.message && e.message.includes("timed out")) {
          console.warn("[vehicles] first fetch timed out, retrying with 120s timeout…");
          data = await AVApi.listVehicles("?limit=100", { timeout: 120000 });
        } else {
          throw e;
        }
      }
      const rows = data.vehicles || data.data || [];
      // Expenses + deal come from listVehicles in one round-trip (no N+1).
      const mapped = rows.map((row) => mapApiToUi(row, row.expenses || []));
      const list = getVehiclesList();
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

  async function persistPatch(vinOrId, patch) {
    const v = findUiVehicle(vinOrId);
    if (!v || !v.id) throw new Error("Vehicle has no API id � reload inventory");
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
    ui.rep = v.rep || ui.rep;
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
    ui.addOns = v.addOns != null ? v.addOns : ui.addOns;
    ui.addOnItems = v.addOnItems != null ? v.addOnItems : ui.addOnItems;
    ui.commMode = v.commMode || ui.commMode;
    ui.documents = v.documents || ui.documents;
    ui.dealSaved = v.dealSaved != null ? v.dealSaved : ui.dealSaved;
    ui.flooringDetail = v.flooringDetail;
    replaceVehicleInPlace(ui);
    refreshUi();
    return ui;
  }

  async function createFromForm(fields) {
    const body = {
      vin: fields.vin,
      year: Number(fields.year) || new Date().getFullYear(),
      make: fields.make || "Unknown",
      model: fields.model || "Unknown",
      acquisitionCost: Number(fields.price) || 0,
      auctionFees: Number(fields.fees) || 0,
      acquisitionDate: new Date().toISOString(),
      titleReceived: !!fields.titlePresent,
      status: "in_stock",
      flooringStartDate: fields.floored ? new Date().toISOString() : null,
      notes: fields.notes || null,
    };
    const { vehicle } = await AVApi.createVehicle(body);
    const ui = mapApiToUi(vehicle, []);
    ui.floored = !!fields.floored;
    ui.titlePresent = !!fields.titlePresent;
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
    else if (field === "flooring") {
      patch.flooringFees = value;
      if (value > 0) {
        patch.flooringStartDate = new Date().toISOString();
      } else {
        patch.flooringStartDate = null;
      }
    } else if (field === "soldPrice") patch.soldPrice = value;
    else if (field === "commission") {
      const v = findUiVehicle(vin);
      if (v) v.commissionOverride = value;
      refreshUi();
      return v;
    } else if (field === "addOns") {
      const v = findUiVehicle(vin);
      if (v) v.addOns = value;
      refreshUi();
      return v;
    } else {
      return null;
    }
    return persistPatch(vin, patch);
  }

  async function persistAddOnItems(vin) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) return;
    const items = v.addOnItems || [];
    const total = items.reduce(function(s, it) { return s + (parseFloat(it.price) || 0); }, 0);
    var jacket = v._raw && v._raw.dealJackets && v._raw.dealJackets[0];
    if (jacket && jacket.id) {
      await AVApi.updateDealJacket(jacket.id, {
        fees: { addOnItems: items },
        additionalExpenses: total,
      });
      jacket.fees = { addOnItems: items };
      jacket.additionalExpenses = total;
    } else {
      await AVApi.updateVehicle(v.id, {
        fees: { addOnItems: items },
        additionalExpenses: total,
      });
    }
    v.additionalExpenses = total;
    v.addOns = total;
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
    const apiStatus = STATUS_UI_TO_API[uiStatus] || "needs_attention";
    const patch = { status: apiStatus };
    if (uiStatus === "Wholesale") {
      patch.isWholesale = true;
    } else {
      patch.isWholesale = false;
    }
    await AVApi.changeVehicleStatus(v.id, {
      status: apiStatus,
      note: uiStatus || null,
    });
    await AVApi.updateVehicle(v.id, patch);
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
    if (sale.fees) body.fees = sale.fees;
    const resp = await AVApi.markSold(v.id, body);
    // Clear vehicle-level fees after they've been moved to the deal jacket
    if (v.addOnItems && v.addOnItems.length > 0) {
      v.addOnItems = [];
      v.additionalExpenses = 0;
      v.addOns = 0;
      try { await AVApi.updateVehicle(v.id, { fees: { addOnItems: [] }, additionalExpenses: 0 }); } catch (_) {}
    }
    await loadAllVehicles();
    return resp;
  }

  async function addRepair(vin, entry) {
    const v = findUiVehicle(vin);
    if (!v || !v.id) throw new Error("Vehicle not found � reload inventory");
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
    createFromForm,
    persistPatch,
    persistMoneyField,
    persistAddOnItems,
    persistStatus,
    markSoldViaForm,
    removeVehicle,
    addRepair,
    deleteRepair,
    persistNotesDebounced,
    findUiVehicle,
    STATUS_UI_TO_API,
  };
})(window);
