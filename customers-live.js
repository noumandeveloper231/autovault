/**
 * Live Customers + Leads � maps API ? dashboard UI and persists mutations.
 * Requires window.AVApi. Globals: customers, customerLeads.
 */
(function (global) {
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
    console.log("[customers]", msg);
  }

  function formatAddress(c) {
    return [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
  }

  function cleanEmail(email) {
    const v = (email || "").trim();
    return v || null;
  }

  function cleanPhone(phone) {
    const v = (phone || "").trim();
    return v || null;
  }

  /** API customer ? UI row */
  function mapApiToUi(c) {
    if (!c) return null;
    return {
      id: c.id,
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      address: formatAddress(c),
      addressRaw: c.address || "",
      city: c.city || "",
      state: c.state || "",
      zip: c.zip || "",
      status: c.status || "lead",
      type: c.type || "individual",
      source: c.source || null,
      salesRepId: c.salesRepId || null,
      notes: c.notes || "",
      date: isoDate(c.createdAt) || isoDate(new Date()),
      dateOfBirth: c.dateOfBirth ? isoDate(c.dateOfBirth) : null,
      _raw: c,
    };
  }

  function getCustomersList() {
    if (!Array.isArray(global.customers)) global.customers = [];
    return global.customers;
  }

  function getLeadsList() {
    if (!Array.isArray(global.customerLeads)) global.customerLeads = [];
    return global.customerLeads;
  }

  function setLoading(flag) {
    global.customersLoading = !!flag;
    const page = global.document && document.getElementById("page-customers");
    if (page) page.classList.toggle("cust-loading", !!flag);
    const leadsPage =
      global.document && document.getElementById("page-customer-leads");
    if (leadsPage) leadsPage.classList.toggle("cust-loading", !!flag);
  }

  function refreshUi() {
    try {
      if (typeof global.renderCustomersPage === "function") {
        global.renderCustomersPage();
      }
    } catch (_) {}
    try {
      if (typeof global.renderCustomerLeads === "function") {
        global.renderCustomerLeads();
      }
    } catch (_) {}
  }

  async function loadPaidCustomers() {
    if (!global.AVApi) throw new Error("AVApi not loaded");
    setLoading(true);
    try {
      const data = await AVApi.listCustomers("?status=customer&limit=100");
      const rows = (data.customers || []).map(mapApiToUi);
      const list = getCustomersList();
      list.length = 0;
      rows.forEach((r) => list.push(r));
      global.AV_CUSTOMERS_LIVE = true;
      refreshUi();
      return rows;
    } finally {
      setLoading(false);
    }
  }

  async function loadLeads() {
    if (!global.AVApi) throw new Error("AVApi not loaded");
    setLoading(true);
    try {
      const data = await AVApi.listLeads("?limit=100");
      const rows = (data.customers || data.leads || []).map(mapApiToUi);
      const list = getLeadsList();
      list.length = 0;
      rows.forEach((r) => list.push(r));
      global.AV_LEADS_LIVE = true;
      refreshUi();
      return rows;
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    if (!global.AVApi) throw new Error("AVApi not loaded");
    setLoading(true);
    try {
      const [paid, leads] = await Promise.all([
        AVApi.listCustomers("?status=customer&limit=100"),
        AVApi.listLeads("?limit=100"),
      ]);
      const paidRows = (paid.customers || []).map(mapApiToUi);
      const leadRows = (leads.customers || leads.leads || []).map(mapApiToUi);
      const cl = getCustomersList();
      cl.length = 0;
      paidRows.forEach((r) => cl.push(r));
      const ll = getLeadsList();
      ll.length = 0;
      leadRows.forEach((r) => ll.push(r));
      global.AV_CUSTOMERS_LIVE = true;
      global.AV_LEADS_LIVE = true;
      refreshUi();
      return { customers: paidRows, leads: leadRows };
    } finally {
      setLoading(false);
    }
  }

  async function createLeadFromForm(fields) {
    const name = String(fields.name || "").trim();
    if (!name) throw new Error("Name is required");
    const body = {
      name,
      phone: cleanPhone(fields.phone),
      email: cleanEmail(fields.email),
      notes: (fields.notes || "").trim() || null,
      source: fields.source || "other",
      salesRepId: fields.salesRepId || undefined,
    };
    const { customer } = await AVApi.createLead(body);
    const ui = mapApiToUi(customer);
    getLeadsList().unshift(ui);
    refreshUi();
    return ui;
  }

  async function updateLead(id, fields) {
    const body = {};
    if (fields.name != null) body.name = String(fields.name).trim();
    if (fields.phone != null) body.phone = cleanPhone(fields.phone);
    if (fields.email != null) body.email = cleanEmail(fields.email);
    if (fields.notes != null) body.notes = String(fields.notes).trim() || null;
    if (!body.name) throw new Error("Name is required");
    const { customer } = await AVApi.updateCustomer(id, body);
    const ui = mapApiToUi(customer);
    const list = getLeadsList();
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) list[idx] = ui;
    else list.unshift(ui);
    refreshUi();
    return ui;
  }

  async function removeLead(id) {
    await AVApi.deleteCustomer(id);
    const list = getLeadsList();
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    refreshUi();
  }

  async function createPaidCustomer(fields) {
    const name = String(fields.name || "").trim();
    if (!name) throw new Error("Name is required");
    const body = {
      name,
      phone: cleanPhone(fields.phone),
      email: cleanEmail(fields.email),
      address: (fields.address || "").trim() || null,
      city: (fields.city || "").trim() || null,
      state: (fields.state || "").trim() || null,
      zip: (fields.zip || "").trim() || null,
      notes: (fields.notes || "").trim() || null,
      status: "customer",
      type: "individual",
    };
    const { customer } = await AVApi.createCustomer(body);
    const ui = mapApiToUi(customer);
    getCustomersList().unshift(ui);
    refreshUi();
    return ui;
  }

  async function convertLead(id) {
    const { customer } = await AVApi.convertLead(id);
    const ui = mapApiToUi(customer);
    const leads = getLeadsList();
    const li = leads.findIndex((x) => x.id === id);
    if (li >= 0) leads.splice(li, 1);
    getCustomersList().unshift(ui);
    refreshUi();
    return ui;
  }

  /**
   * Paid Customers table: sold-vehicle buyers (deal jacket) plus CRM
   * customers that do not yet appear on a sold vehicle row.
   */
  function soldBuyerRows() {
    const vehicles = Array.isArray(global.vehicles) ? global.vehicles : [];
    const fromSold = vehicles
      .filter((v) => v && v.sold && v.customer && String(v.customer).trim())
      .map((v) => {
        const r =
          typeof global.computeRow === "function" ? global.computeRow(v) : v;
        return {
          ...r,
          customerId: v.customerId || null,
          customer: v.customer,
          customerPhone: v.customerPhone || "",
          customerEmail: v.customerEmail || "",
          customerAddress: v.customerAddress || "",
          source: "deal",
        };
      })
      .sort(
        (a, b) => new Date(b.soldDate || 0) - new Date(a.soldDate || 0),
      );

    const seen = new Set(
      fromSold
        .map((r) => r.customerId || String(r.customer || "").toLowerCase())
        .filter(Boolean),
    );

    const fromDirectory = getCustomersList()
      .filter((c) => {
        if (!c || !c.name) return false;
        if (c.id && seen.has(c.id)) return false;
        if (seen.has(String(c.name).toLowerCase())) return false;
        return true;
      })
      .map((c) => ({
        customerId: c.id,
        customer: c.name,
        customerPhone: c.phone,
        customerEmail: c.email,
        customerAddress: c.address,
        year: "",
        make: "",
        model: "\u2014",
        vin: "",
        soldDate: c.date,
        soldPrice: 0,
        source: "directory",
      }));

    return fromSold.concat(fromDirectory);
  }

  global.AVCustomers = {
    mapApiToUi,
    loadAll,
    loadPaidCustomers,
    loadLeads,
    createLeadFromForm,
    updateLead,
    removeLead,
    createPaidCustomer,
    convertLead,
    soldBuyerRows,
    toast,
  };
})(window);
