/**
 * Loads live CRM data from the API into the dashboard SPA globals when authenticated.
 * Lightweight boot: only summary, notifications, expenses at startup.
 * Heavy data (vehicles, customers, reps) deferred to showPage() data loaders.
 */
(function () {
  if (!window.AVApi || !window.AVPortal) return;

  var _booted = false;
  window._crmApiLoaded = false;

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
          if (typeof applyMeUserToProfile === "function") {
            applyMeUserToProfile(u);
          } else if (typeof applyCrmOwnerData === "function") {
            applyCrmOwnerData({
              id: u.id,
              name: u.fullName || u.name || u.email || "Dealer",
              fullName: u.fullName || u.name,
              role: u.role || "wholesale_dealer",
              birthday: u.birthDate || "",
              email: u.email || "",
              imageUrl: u.imageUrl || null,
              introCompleted: u.introCompleted || false,
              termsAccepted: u.termsAccepted || false,
              termsVersion: u.termsVersion || null,
              termsPrintedName: u.termsPrintedName || null,
              termsDealership: u.termsDealership || null,
              termsSignature: u.termsSignature || null,
              termsAcceptedAt: u.termsAcceptedAt || null,
              dealershipName: u.dealership || null,
            });
          } else {
            window.crmOwner = {
              id: u.id,
              name: u.fullName || u.name || u.email || "Dealer",
              role: u.role || "wholesale_dealer",
              birthday: u.birthDate || "",
              email: u.email || "",
              imageUrl: u.imageUrl || null,
              introCompleted: u.introCompleted || false,
              termsAccepted: u.termsAccepted || false,
              termsVersion: u.termsVersion || null,
              termsPrintedName: u.termsPrintedName || null,
              termsDealership: u.termsDealership || null,
              termsSignature: u.termsSignature || null,
              termsAcceptedAt: u.termsAcceptedAt || null,
              dealershipName: u.dealership || null,
            };
            if (typeof updateProfileChip === "function") updateProfileChip();
          }
          if (typeof updateDashWelcome === "function") updateDashWelcome();
          try {
            sessionStorage.setItem(
              "av_terms_accepted",
              u.termsAccepted ? "1" : "0",
            );
            localStorage.removeItem("av_terms_accepted_db");
          } catch (e) {}
          if (typeof avBootGateOnce === "function") avBootGateOnce();
          if (u.termsAccepted) {
            var _tOv = document.getElementById("termsOverlay");
            if (_tOv && _tOv.classList.contains("open")) {
              _tOv.classList.remove("open");
              document.body.style.overflow = "";
              if (typeof maybeShowWelcome === "function") maybeShowWelcome();
            }
          }
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
      window._crmApiLoaded = true;
      return { live: true, summary: window.AV_LIVE_SUMMARY || null };
    }

    try {
      const [summary, expenseResp, notifResp, meResp, taxSettingsResp, taxPeriodsResp, repsResp, staffResp, convResp, payrollResp] = await Promise.all([
        AVApi.dashboardSummary().catch(() => null),
        AVApi.listExpenses("?limit=500").catch(() => ({ expenses: [] })),
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
      if (typeof applyExpensesList === "function") {
        applyExpensesList(expenseList);
      } else if (typeof loadExpensesFromApi === "function") {
        loadExpensesFromApi().catch(function () {});
      }

      if (meResp && meResp.user) {
        var u = meResp.user;
        if (typeof applyMeUserToProfile === "function") {
          applyMeUserToProfile(u);
        } else if (typeof applyCrmOwnerData === "function") {
          applyCrmOwnerData({
            id: u.id,
            name: u.fullName || u.name || u.email || "Dealer",
            fullName: u.fullName || u.name,
            role: u.role || "owner",
            imageUrl: u.imageUrl || null,
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
          });
        } else {
          window.crmOwner = {
            id: u.id,
            name: u.fullName || u.name || u.email || "Dealer",
            role: u.role || "owner",
            imageUrl: u.imageUrl || null,
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
          if (typeof updateProfileChip === "function") updateProfileChip();
        }
        if (typeof updateDashWelcome === "function") updateDashWelcome();
        try {
          sessionStorage.setItem(
            "av_terms_accepted",
            u.termsAccepted ? "1" : "0",
          );
          localStorage.removeItem("av_terms_accepted_db");
        } catch (e) {}
        if (typeof avBootGateOnce === "function") avBootGateOnce();
        if (u.termsAccepted) {
          var _tOv2 = document.getElementById("termsOverlay");
          if (_tOv2 && _tOv2.classList.contains("open")) {
            _tOv2.classList.remove("open");
            document.body.style.overflow = "";
            if (typeof maybeShowWelcome === "function") maybeShowWelcome();
          }
        }
      }

      if (taxSettingsResp) {
        var mapped = window.AVFinancePersist
          ? AVFinancePersist.mapTaxSettingsToUi(taxSettingsResp)
          : {
              frequency:
                taxSettingsResp.frequency ||
                taxSettingsResp.filingFrequency ||
                "Quarterly",
              nextDue:
                taxSettingsResp.nextDue ||
                taxSettingsResp.nextDueDate ||
                taxSettingsResp.nextFilingDate ||
                "",
              notes: taxSettingsResp.notes || "",
            };
        window.taxConfig = mapped;
        if (typeof taxConfig !== "undefined") {
          taxConfig.frequency = mapped.frequency;
          taxConfig.nextDue = mapped.nextDue;
          taxConfig.notes = mapped.notes;
        }
      }

      if (taxPeriodsResp) {
        var periods = taxPeriodsResp.periods || taxPeriodsResp.data || [];
        if (typeof taxFilings !== "undefined") {
          taxFilings.length = 0;
          periods.forEach(function (p) {
            if (p.status === "filed" || p.status === "paid" || p.status === "closed") {
              var filing = window.AVFinancePersist
                ? AVFinancePersist.mapTaxPeriodToFiling(p)
                : {
                    id: p.id,
                    dueDate: p.dueDate || p.periodEnd,
                    filedOn: p.updatedAt || p.endDate,
                    count: p.dealCount || p.vehicleCount || 0,
                    totalTax: p.totalTax || 0,
                  };
              taxFilings.push(filing);
            }
          });
        }
      }

      // Flooring plan (active)
      try {
        var floorResp = await AVApi.listFlooringPlans().catch(function () {
          return null;
        });
        var plans =
          (floorResp && (floorResp.plans || floorResp.data || floorResp)) || [];
        if (!Array.isArray(plans)) plans = [];
        var active = plans.find(function (p) {
          return p.isActive && !p.deletedAt;
        });
        if (active && window.AVFinancePersist) {
          var fcfg = AVFinancePersist.flooringUiFromPlan(active);
          window.__flooringPlanId = active.id;
          if (typeof flooringConfig !== "undefined") {
            Object.assign(flooringConfig, fcfg);
          } else {
            window.flooringConfig = fcfg;
          }
          if (typeof syncAddVehicleFlooringToggle === "function") {
            syncAddVehicleFlooringToggle();
          }
        }
      } catch (eFloor) {}

      // Payroll proofs from runs
      try {
        var payRuns =
          (payrollResp &&
            (payrollResp.payrollRuns ||
              payrollResp.runs ||
              payrollResp.data)) ||
          [];
        window.__payrollRuns = Array.isArray(payRuns) ? payRuns : [];
        if (typeof payProofs !== "undefined") {
          payRuns.forEach(function (run) {
            (run.items || []).forEach(function (it) {
              if (!it.proofPath) return;
              var key =
                it.description ||
                (it.salesRepId ? "rep" : "staff") +
                  ":" +
                  (it.staffMemberId || it.salesRepId || "") +
                  ":" +
                  String(run.periodStart || "").slice(0, 7);
              // Prefer explicit meta in description: "payproof|kind:name:ym"
              if (String(it.description || "").indexOf("payproof|") === 0) {
                key = String(it.description).slice("payproof|".length);
              }
              payProofs[key] = {
                proof: it.proofPath,
                proofName: "proof",
                runId: run.id,
                itemId: it.id,
              };
            });
          });
        }
        if (typeof payStubs !== "undefined") {
          payStubs.length = 0;
          payRuns.forEach(function (run) {
            payStubs.push(run);
          });
        }
      } catch (ePay) {}

      var repList = repsResp.salesReps || repsResp.data || repsResp.users || [];
      if (typeof salesReps !== 'undefined') {
        salesReps.length = 0;
        if (window.AVReps && typeof AVReps.mapApiToUi === 'function') {
          repList.forEach(function (r) {
            var ui = AVReps.mapApiToUi(r);
            if (ui) salesReps.push(ui);
          });
        } else {
          repList.forEach(function(r) {
            var profile = r.profile || {};
            var bday = profile.birthDate ? String(profile.birthDate).slice(0, 10) : '';
            if (bday && !/^\d{4}-\d{2}-\d{2}$/.test(bday)) bday = '';
            salesReps.push({
              id: r.id,
              name: r.fullName || r.name || '',
              email: r.email || '',
              username: r.username || '',
              phone: r.phone || '',
              commissionType: profile.commissionType === 'flat' ? 'flat' : 'percentage',
              commissionPct: profile.commissionType === 'flat' ? 0 : Math.round((profile.commissionRate || 0) * 1000) / 10,
              commissionFlat: profile.commissionType === 'flat' ? (parseFloat(profile.commissionRate) || 0) : 0,
              base: parseFloat(profile.baseSalary) || 0,
              payFreq: profile.payFrequency || 'biweekly',
              payDay: profile.payDay != null ? profile.payDay : 5,
              payAnchor: '',
              birthday: bday,
              payMethod: profile.paymentMethod || 'Direct Deposit',
              payProof: profile.payDocUrl || null,
              isActive: r.isActive !== false,
              _raw: r
            });
          });
        }
        if (typeof REP_LIST !== 'undefined') {
          REP_LIST = salesReps.map(function(r) { return r.name; });
        }
        window.AV_REPS_LIVE = true;
        try {
          if (typeof window.fillDjRepSelect === "function") window.fillDjRepSelect();
        } catch (_) {}
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

      // payStubs / payProofs already hydrated from payroll runs above.

      window.AV_LIVE_SUMMARY = summary;
      window.AV_LIVE_MODE = true;
      window.AV_LIVE_NOTIFICATIONS = notifResp;
      window.dispatchEvent(
        new CustomEvent("autovault:data-ready", {
          detail: { summary, live: true },
        }),
      );

      window._crmApiLoaded = true;
      return { live: true, summary };
    } catch (err) {
      console.warn("[crm-bootstrap] falling back to mock data", err);
      window._crmApiLoaded = true;
      window.AV_LIVE_MODE = false;
      return { live: false, error: err };
    }
  }

  window.AVCrmBootstrap = { bootstrapCrmFromApi };
})();
