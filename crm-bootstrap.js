/**
 * Loads live CRM data from the API into the dashboard SPA globals when authenticated.
 * Lightweight boot: only summary, notifications, expenses at startup.
 * Heavy data (vehicles, customers, reps) deferred to showPage() data loaders.
 */
(function () {
  if (!window.AVApi || !window.AVPortal) return;

  var _booted = false;

  function mapExpense(e) {
    return {
      id: e.id,
      date: e.expenseDate,
      category: e.category,
      vendor: e.vendor,
      description: e.description,
      amount: Number(e.amount || 0),
      _raw: e,
    };
  }

  async function bootstrapCrmFromApi() {
    if (_booted) return { live: true, summary: window.AV_LIVE_SUMMARY || null };
    _booted = true;

    const session = AVPortal.readSession(AVPortal.getRoutePortal());
    if (!session) return { live: false };

    const portal = AVPortal.getRoutePortal();

    // Wholesale CRM uses /api/v1/wholesale/* only — skip retail modules (403 noise).
    if (portal === "wholesale") {
      try {
        const meResp = await AVApi.me().catch(() => null);
        if (meResp && meResp.user) {
          var u = meResp.user;
        window.crmOwner = {
          id: u.id,
          name: u.fullName || u.name || u.email || "Dealer",
          role: u.role || "Wholesale Dealer",
          birthday: u.birthDate || "",
          email: u.email || "",
          introCompleted: u.introCompleted || false,
          termsAccepted: u.termsAccepted || false,
          termsVersion: u.termsVersion || null,
          termsPrintedName: u.termsPrintedName || null,
          termsDealership: u.termsDealership || null,
          termsSignature: u.termsSignature || null,
          termsAcceptedAt: u.termsAcceptedAt || null,
          dealershipName: u.dealership || null,
        };
        if (typeof updateDashWelcome === "function") updateDashWelcome();
        try {
          sessionStorage.setItem(
            "av_terms_accepted",
            u.termsAccepted ? "1" : "0",
          );
          localStorage.removeItem("av_terms_accepted_db");
        } catch (e) {}
        if (typeof avBootGateOnce === "function") avBootGateOnce();
        }
        const summary = await AVApi.dashboardSummary().catch(() => null);
        window.AV_LIVE_SUMMARY = summary;
        window.AV_LIVE_MODE = true;
        window.dispatchEvent(
          new CustomEvent("av:crm-live", { detail: { live: true, portal: "wholesale" } }),
        );
      } catch (e) {
        console.warn("[crm-bootstrap] wholesale boot failed", e);
      }
      return { live: true, summary: window.AV_LIVE_SUMMARY || null };
    }

    try {
      const [summary, expenseResp, notifResp, meResp, taxSettingsResp, taxPeriodsResp, repsResp, staffResp, convResp, payrollResp] = await Promise.all([
        AVApi.dashboardSummary().catch(() => null),
        AVApi.listExpenses("?limit=100").catch(() => ({ expenses: [] })),
        AVApi.listNotifications().catch(() => ({ notifications: [] })),
        AVApi.me().catch(() => null),
        AVApi.taxSettings().catch(() => null),
        AVApi.taxPeriods().catch(() => ({ periods: [] })),
        AVApi.listSalesReps("?limit=100").catch(() => ({ salesReps: [] })),
        AVApi.listStaff("?limit=100").catch(() => ({ staff: [] })),
        AVApi.conversations().catch(() => ({ conversations: [] })),
        AVApi.listPayrollRuns("?limit=50").catch(() => ({ payrollRuns: [] })),
      ]);

      const expenseList = expenseResp.expenses || expenseResp.data || [];
      if (typeof expenses !== "undefined" && Array.isArray(expenseList)) {
        expenses.length = 0;
        expenseList.forEach((e) => expenses.push(mapExpense(e)));
      }

      if (meResp && meResp.user) {
        var u = meResp.user;
        window.crmOwner = {
          id: u.id,
          name: u.fullName || u.name || u.email || 'Dealer',
          role: u.role || 'Dealer Admin',
          birthday: u.birthDate || '',
          email: u.email || '',
          introCompleted: u.introCompleted || false,
          termsAccepted: u.termsAccepted || false,
          termsVersion: u.termsVersion || null,
          termsPrintedName: u.termsPrintedName || null,
          termsDealership: u.termsDealership || null,
          termsSignature: u.termsSignature || null,
          termsAcceptedAt: u.termsAcceptedAt || null,
          dealershipName: u.dealership || null,
        };
        if (typeof updateDashWelcome === 'function') updateDashWelcome();
        try {
          sessionStorage.setItem(
            'av_terms_accepted',
            u.termsAccepted ? '1' : '0',
          );
          localStorage.removeItem('av_terms_accepted_db');
        } catch (e) {}
        if (typeof avBootGateOnce === 'function') avBootGateOnce();
      }

      if (taxSettingsResp) {
        window.taxConfig = {
          frequency: taxSettingsResp.frequency || taxSettingsResp.filingFrequency || 'Quarterly',
          nextDue: taxSettingsResp.nextDue || taxSettingsResp.nextFilingDate || '',
          notes: taxSettingsResp.notes || ''
        };
      }

      if (taxPeriodsResp) {
        var periods = taxPeriodsResp.periods || taxPeriodsResp.data || [];
        if (typeof taxFilings !== 'undefined') {
          taxFilings.length = 0;
          periods.forEach(function(p) {
            if (p.status === 'filed' || p.status === 'completed') {
              taxFilings.push({ id: p.id, dueDate: p.dueDate || p.periodEnd, count: p.vehicleCount || 0, totalTax: p.totalTax || 0 });
            }
          });
        }
      }

      var repList = repsResp.salesReps || repsResp.data || repsResp.users || [];
      if (typeof salesReps !== 'undefined') {
        salesReps.length = 0;
        repList.forEach(function(r) {
          var profile = r.profile || {};
          salesReps.push({
            id: r.id,
            name: r.fullName || r.name || '',
            email: r.email || '',
            username: r.username || '',
            phone: r.phone || '',
            commissionPct: Math.round((profile.commissionRate || 0) * 100),
            base: parseFloat(profile.baseSalary) || 0,
            payFreq: profile.payFrequency || 'biweekly',
            payDay: profile.payDay != null ? profile.payDay : 5,
            payAnchor: '',
            birthday: profile.birthDate || '',
            payMethod: profile.paymentMethod || 'Direct Deposit',
            payProof: profile.payDocUrl || null,
            isActive: r.isActive !== false,
            _raw: r
          });
        });
        if (typeof REP_LIST !== 'undefined') {
          REP_LIST = salesReps.map(function(r) { return r.name; });
        }
      }

      var staffList = staffResp.staff || staffResp.data || staffResp.users || [];
      if (typeof window.staff !== 'undefined') {
        window.staff.length = 0;
        staffList.forEach(function(s) {
          window.staff.push({
            id: s.id,
            name: s.fullName || s.name || '',
            email: s.email || '',
            phone: s.phone || '',
            role: s.title || '',
            payType: s.payType || 'Salary',
            payRate: s.payRate || s.payRate || 0,
            monthly: s.payType === 'salary' ? (s.payRate || 0) : 0,
            hourly: s.payType === 'hourly' ? (s.payRate || 0) : 0,
            payFreq: s.payFrequency || 'biweekly',
            payDay: s.payDay != null ? s.payDay : 5,
            isActive: s.isActive !== false,
            _raw: s
          });
        });
      }

      var convList = convResp.conversations || convResp.data || [];
      if (typeof msgState !== 'undefined' && msgState) {
        msgState.conversations = convList.map(function(c) {
          var name = '';
          var isSystem = !!c.isSystem;
          if (isSystem || (c.type === 'GROUP' && c.name === 'Group Chat')) {
            name = 'Group Chat';
            isSystem = true;
          } else if (c.type === 'GROUP') {
            name = c.name || 'Unnamed Group';
          } else {
            var others = (c.participants || []).filter(function(p) { return p.id !== (meResp && meResp.user && meResp.user.id); });
            name = others.length > 0 ? others[0].fullName : 'Unknown';
          }
          return {
            id: c.id,
            type: c.type || 'DIRECT',
            name: c.name,
            isSystem: isSystem,
            _name: name,
            participants: c.participants || [],
            lastMessageAt: c.lastMessageAt,
            lastMessageText: c.lastMessageText,
            isArchived: c.isArchived || false,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            _avatar: isSystem
              ? { kind: 'group', color: '#2f7fd6', initials: '' }
              : { kind: 'initials', initials: (name || '?').slice(0, 2).toUpperCase(), color: '#3aa0ff' },
            _preview: c.lastMessageText || 'No messages yet',
            _unread: c.unreadCount || 0,
          };
        });
      }

      var payrollList = payrollResp.payrollRuns || payrollResp.data || [];
      if (typeof payStubs !== 'undefined') {
        payStubs.length = 0;
        payrollList.forEach(function(p) {
          payStubs.push({
            id: p.id,
            kind: p.kind || 'staff',
            name: p.employeeName || p.name || '',
            date: p.payDate || p.periodEnd || '',
            amount: p.netPay || p.amount || 0,
            method: p.paymentMethod || 'Direct Deposit',
            period: p.periodLabel || p.period || ''
          });
        });
      }

      window.AV_LIVE_SUMMARY = summary;
      window.AV_LIVE_MODE = true;
      window.AV_LIVE_NOTIFICATIONS = notifResp;
      window.dispatchEvent(
        new CustomEvent("autovault:data-ready", {
          detail: { summary, live: true },
        }),
      );

      return { live: true, summary };
    } catch (err) {
      console.warn("[crm-bootstrap] falling back to mock data", err);
      window.AV_LIVE_MODE = false;
      return { live: false, error: err };
    }
  }

  window.AVCrmBootstrap = { bootstrapCrmFromApi };
})();
