/**
 * Payment Settings — live Stripe billing for the CRM dashboard.
 * Layout/text render instantly; only values use skeletons + parallel API loads.
 */
(function (global) {
  var state = {
    billing: null,
    history: [],
    plans: [],
    loading: false,
  };
  var _renderToken = 0;
  var PS_SUMMARY_PANELS = [
    "psPlanCard",
    "psMethodCard",
    "psAutoCard",
    "psNotifyCard",
  ];

  function psFmt(n) {
    return (
      "$" +
      Number(n || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function fmtDateSafe(d) {
    if (!d) return "—";
    try {
      if (typeof global.fmtDate === "function") return global.fmtDate(d);
      return new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
    } catch (_) {
      return String(d).slice(0, 10);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function valSkel(cls, width) {
    return (
      '<span class="ps-val-skel ' +
      (cls || "") +
      ' sk-bar"' +
      (width ? ' style="width:' + width + '"' : "") +
      "></span>"
    );
  }

  function setPanelLoading(id, on) {
    var el = document.getElementById(id);
    if (!el) return;
    if (on) el.classList.add("is-loading");
    else el.classList.remove("is-loading");
  }

  function showValueSkeletons() {
    setText("psSub", "— your plan, billing, and payment method");

    var alert = document.getElementById("psAlert");
    if (alert) {
      alert.className = "ps-alert ok is-loading";
      setHtml("psAlertTitle", valSkel("lg", "180px"));
      setHtml("psAlertSub", valSkel("", "240px"));
      setHtml("psAlertAction", "");
    }

    setHtml("psPlanName", valSkel("lg", "160px"));
    setHtml("psPlanPrice", valSkel("", "72px"));
    setText("psPlanCycle", "");
    setHtml("psPlanBadge", valSkel("badge"));
    setHtml("psPlanCycleVal", valSkel("sm", "64px"));
    setText("psPlanDueLbl", "Next charge");
    setHtml("psPlanDueVal", valSkel("sm", "88px"));
    setHtml("psPlanFeatVal", valSkel("sm", "120px"));
    setPanelLoading("psPlanCard", true);

    setHtml(
      "psMethod",
      '<span class="ps-val-skel brand sk-bar"></span><div><div class="ps-card-num">' +
        valSkel("", "96px") +
        '</div><div class="ps-card-exp">' +
        valSkel("sm", "72px") +
        "</div></div>",
    );
    setHtml("psAmountDueVal", valSkel("sm", "56px"));
    setHtml("psExpenseLogVal", valSkel("sm", "36px"));
    var pb = document.getElementById("psPayBtn");
    if (pb) {
      pb.textContent = "Make a payment";
      pb.className = "ps-btn";
      pb.disabled = true;
      pb.style.opacity = "0.55";
    }
    setPanelLoading("psMethodCard", true);

    setHtml("psAutoStatus", valSkel("", "70%"));
    var tg = document.getElementById("psAutoExpense");
    if (tg) {
      tg.checked = false;
      tg.disabled = true;
    }
    setPanelLoading("psAutoCard", true);

    setHtml("psNotifyStatus", valSkel("", "62%"));
    var nt = document.getElementById("psNotifyBefore");
    if (nt) {
      nt.checked = false;
      nt.disabled = true;
    }
    setPanelLoading("psNotifyCard", true);

    var termsHost = document.getElementById("psTermsRecord");
    if (termsHost) {
      termsHost.innerHTML =
        '<div class="tr-rec">' +
        '<div><div class="tr-cell-l">Signed by</div><div class="tr-cell-v" id="psTermsName">' +
        valSkel("", "70%") +
        "</div></div>" +
        '<div><div class="tr-cell-l">Dealership</div><div class="tr-cell-v" id="psTermsDealer">' +
        valSkel("", "64%") +
        "</div></div>" +
        '<div><div class="tr-cell-l">Version</div><div class="tr-cell-v" id="psTermsVer">' +
        valSkel("sm", "36px") +
        "</div></div>" +
        '<div><div class="tr-cell-l">Accepted</div><div class="tr-cell-v" id="psTermsWhen">' +
        valSkel("", "88px") +
        "</div></div>" +
        "</div>" +
        '<div class="tr-sig"><div class="terms-siglabel">Electronic Signature</div>' +
        '<div class="terms-sigwrap signed" id="psTermsSigWrap">' +
        valSkel("sig") +
        "</div></div>";
    }
    setPanelLoading("psTermsCard", true);

    var histHost = document.getElementById("psHistory");
    if (histHost) {
      histHost.innerHTML =
        '<div class="table-scroll"><table class="dash-sold-table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody id="psHistoryBody">' +
        '<tr class="ps-hist-skel-row"><td><div class="sk-bar" style="width:70%"></div></td><td><div class="sk-bar" style="width:80%"></div></td><td><div class="sk-bar" style="width:55%"></div></td><td><div class="sk-bar" style="width:45%"></div></td></tr>' +
        '<tr class="ps-hist-skel-row"><td><div class="sk-bar" style="width:62%"></div></td><td><div class="sk-bar" style="width:75%"></div></td><td><div class="sk-bar" style="width:50%"></div></td><td><div class="sk-bar" style="width:40%"></div></td></tr>' +
        '<tr class="ps-hist-skel-row"><td><div class="sk-bar" style="width:78%"></div></td><td><div class="sk-bar" style="width:70%"></div></td><td><div class="sk-bar" style="width:58%"></div></td><td><div class="sk-bar" style="width:48%"></div></td></tr>' +
        "</tbody></table></div>";
    }
    setPanelLoading("psHistoryCard", true);
  }

  function paintAlert(b) {
    var alert = document.getElementById("psAlert");
    if (!alert) return;
    if (b.linked === false) {
      alert.className = "ps-alert due";
      setText("psAlertTitle", "Billing not linked");
      setText("psAlertSub", b.message || "Contact support to connect Stripe.");
      setHtml("psAlertAction", "");
      return;
    }
    var due = !!b.pastDue;
    var price = Number(b.amount != null ? b.amount : b.monthlyFee) || 0;
    alert.className = "ps-alert " + (due ? "due" : "ok");
    if (due) {
      setText(
        "psAlertTitle",
        "Payment past due — " + psFmt(b.amountDue || price),
      );
      setText(
        "psAlertSub",
        "Due " +
          fmtDateSafe(b.dueDate) +
          (b.daysLate
            ? " · " +
              b.daysLate +
              " day" +
              (b.daysLate === 1 ? "" : "s") +
              " late"
            : "") +
          ". Pay now to keep your account active.",
      );
      setHtml(
        "psAlertAction",
        '<button class="ps-btn danger" onclick="openMakePayment()">Make payment</button>',
      );
    } else {
      setText("psAlertTitle", "Your account is up to date");
      setText(
        "psAlertSub",
        "Next charge of " + psFmt(price) + " on " + fmtDateSafe(b.dueDate) + ".",
      );
      setHtml("psAlertAction", "");
    }
  }

  function paintPlan(b) {
    if (b.linked === false) {
      setText("psPlanName", b.planLabel || b.plan || "—");
      setText("psPlanPrice", "—");
      setText("psPlanCycle", "");
      var bd0 = document.getElementById("psPlanBadge");
      if (bd0) {
        bd0.textContent = "Unlinked";
        bd0.className = "ps-badge due";
      }
      setText("psPlanCycleVal", "—");
      setText("psPlanDueLbl", "Status");
      setText("psPlanDueVal", "Billing not linked");
      setText("psPlanFeatVal", "—");
      return;
    }
    var due = !!b.pastDue;
    var price = Number(b.amount != null ? b.amount : b.monthlyFee) || 0;
    var cycle = b.cycle || "Monthly";
    var planLabel = b.planLabel || b.plan || "—";
    setText("psPlanName", planLabel);
    setText("psPlanPrice", psFmt(price));
    setText("psPlanCycle", "/ " + String(cycle).toLowerCase());
    var bd = document.getElementById("psPlanBadge");
    if (bd) {
      bd.textContent = due ? "Past due" : "Active";
      bd.className = "ps-badge " + (due ? "due" : "active");
    }
    setText("psPlanCycleVal", cycle);
    setText("psPlanDueLbl", due ? "Past due since" : "Next charge");
    setText("psPlanDueVal", fmtDateSafe(b.dueDate));
    setText("psPlanFeatVal", b.planFeat || "—");
  }

  function cardBrandKey(brand) {
    var b = String(brand || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (b.indexOf("visa") === 0) return "visa";
    if (b.indexOf("master") === 0 || b === "mc") return "mastercard";
    if (b.indexOf("amex") === 0 || b.indexOf("americanexpress") === 0)
      return "amex";
    if (b.indexOf("discover") === 0) return "discover";
    if (b.indexOf("diners") === 0) return "diners";
    if (b.indexOf("jcb") === 0) return "jcb";
    if (b.indexOf("union") === 0) return "unionpay";
    return b || "card";
  }

  function cardBrandLabel(brand) {
    var key = cardBrandKey(brand);
    var labels = {
      visa: "Visa",
      mastercard: "Mastercard",
      amex: "American Express",
      discover: "Discover",
      diners: "Diners Club",
      jcb: "JCB",
      unionpay: "UnionPay",
      card: "Card",
    };
    if (labels[key]) return labels[key];
    var raw = String(brand || "Card").trim();
    if (!raw) return "Card";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  function cardBrandIcon(brand) {
    var key = cardBrandKey(brand);
    if (key === "visa") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#1A1F71"/>' +
        '<path fill="#fff" d="M20.2 21.2l1.7-10.4h2.7l-1.7 10.4h-2.7zm11.4-10.1c-.5-.2-1.4-.4-2.5-.4-2.7 0-4.7 1.4-4.7 3.5 0 1.5 1.4 2.4 2.5 2.9 1.1.5 1.5.9 1.5 1.3 0 .7-.9 1.1-1.7 1.1-1.1 0-1.8-.2-2.7-.6l-.4-.2-.4 2.4c.7.3 2 .6 3.3.6 3 0 4.9-1.4 4.9-3.6 0-1.2-.7-2.1-2.3-2.9-1-.5-1.5-.9-1.5-1.4 0-.5.5-.9 1.7-.9 1 0 1.7.2 2.2.4l.3.1.4-2.3zm7.6-.3h-2.1c-.6 0-1.1.2-1.4.8l-3.9 9.6h2.8l.5-1.5h3.4l.3 1.5h2.4l-2-10.4zm-3.2 6.7l1.4-3.8.8 3.8h-2.2zm-18.2-6.7l-2.6 7.1-.3-1.4c-.5-1.7-2.1-3.5-3.9-4.4l2.5 8.9h2.8l4.2-10.2h-2.7z"/>' +
        '<path fill="#F9A51A" d="M9.6 10.8H6.9l-2.6 10.4h2.6c.4-1.1.9-2.4.9-2.4h3.4l.2 2.4h2.3L11.1 10.8H9.6zm.2 5.7H8.2l.9-3.4.7 3.4z"/>' +
        "</svg>"
      );
    }
    if (key === "mastercard") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#252525"/>' +
        '<circle cx="19.5" cy="16" r="8" fill="#EB001B"/>' +
        '<circle cx="28.5" cy="16" r="8" fill="#F79E1B"/>' +
        '<path fill="#FF5F00" d="M24 10.2a8 8 0 0 1 0 11.6 8 8 0 0 1 0-11.6z"/>' +
        "</svg>"
      );
    }
    if (key === "amex") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#2E77BC"/>' +
        '<path fill="#fff" d="M8.2 20.5l1.4-3.2h3.1l1.4 3.2h2.4l-3.8-8.4H12l-3.8 8.4h2zm2.9-5.2l1.1 2.5h-2.2l1.1-2.5zM22.5 12.1h-4.8v8.4h2.1v-2.9h2.1c1.9 0 3.2-1.1 3.2-2.8s-1.1-2.7-2.6-2.7zm-.1 3.8h-2.1v-2.2h2.1c.8 0 1.3.4 1.3 1.1s-.5 1.1-1.3 1.1zm9.2-3.8l-1.8 8.4h2l.4-1.8h2.3l.3 1.8h2.2l-1.8-8.4h-3.6zm.8 4.9l.7-3.3.7 3.3h-1.4zm7.2-4.9h-2.1v8.4h5.4v-1.7h-3.3v-6.7z"/>' +
        "</svg>"
      );
    }
    if (key === "discover") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#fff"/>' +
        '<path fill="#F47216" d="M0 22c8 6 18 8 28 6 8-1.5 15-5 20-10V28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-6z"/>' +
        '<circle cx="30" cy="15" r="5.5" fill="#F47216"/>' +
        '<text x="7" y="17.5" fill="#1a1a1a" font-size="7" font-family="Arial,sans-serif" font-weight="700">DISCOVER</text>' +
        "</svg>"
      );
    }
    if (key === "diners") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#0079BE"/>' +
        '<circle cx="24" cy="16" r="9" fill="none" stroke="#fff" stroke-width="1.6"/>' +
        '<path fill="#fff" d="M20 9.5v13c2.2 1.1 4.8 1.1 7 0v-13c-2.2-1.1-4.8-1.1-7 0z"/>' +
        "</svg>"
      );
    }
    if (key === "jcb") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#0E4C96"/>' +
        '<rect x="8" y="8" width="10" height="16" rx="2" fill="#fff"/>' +
        '<rect x="19" y="8" width="10" height="16" rx="2" fill="#fff"/>' +
        '<rect x="30" y="8" width="10" height="16" rx="2" fill="#fff"/>' +
        '<text x="10" y="19" fill="#0E4C96" font-size="7" font-family="Arial,sans-serif" font-weight="800">J</text>' +
        '<text x="21.5" y="19" fill="#0E4C96" font-size="7" font-family="Arial,sans-serif" font-weight="800">C</text>' +
        '<text x="32.5" y="19" fill="#0E4C96" font-size="7" font-family="Arial,sans-serif" font-weight="800">B</text>' +
        "</svg>"
      );
    }
    if (key === "unionpay") {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true">' +
        '<rect width="48" height="32" rx="4" fill="#fff"/>' +
        '<rect x="8" y="8" width="11" height="16" rx="1" fill="#D10429"/>' +
        '<rect x="18.5" y="8" width="11" height="16" rx="1" fill="#0C64C5"/>' +
        '<rect x="29" y="8" width="11" height="16" rx="1" fill="#077B49"/>' +
        "</svg>"
      );
    }
    return (
      '<svg viewBox="0 0 48 32" aria-hidden="true">' +
      '<rect width="48" height="32" rx="4" fill="currentColor" opacity=".12"/>' +
      '<rect x="8" y="10" width="32" height="4" rx="1.5" fill="currentColor" opacity=".45"/>' +
      '<rect x="8" y="18" width="14" height="3" rx="1.5" fill="currentColor" opacity=".3"/>' +
      '<rect x="26" y="18" width="14" height="3" rx="1.5" fill="currentColor" opacity=".3"/>' +
      "</svg>"
    );
  }

  function renderCardMethodHtml(method) {
    if (!method) {
      return '<div style="color:var(--muted);font-size:13px;">No card on file. Update your payment method to add one.</div>';
    }
    var key = cardBrandKey(method.brand);
    var label = cardBrandLabel(method.brand);
    return (
      '<div class="ps-card-brand" data-brand="' +
      esc(key) +
      '" title="' +
      esc(label) +
      '">' +
      cardBrandIcon(method.brand) +
      '</div><div class="ps-card-meta"><div class="ps-card-brand-name">' +
      esc(label) +
      '</div><div class="ps-card-num">•••• ' +
      esc(method.last4) +
      '</div><div class="ps-card-exp">Expires ' +
      esc(method.exp || "—") +
      "</div></div>"
    );
  }

  function paintMethod(b) {
    if (b.linked === false) {
      setHtml(
        "psMethod",
        '<div style="color:var(--muted);font-size:13px;">Connect billing to manage your payment method.</div>',
      );
      setText("psAmountDueVal", "—");
      setText("psExpenseLogVal", "—");
      var pb0 = document.getElementById("psPayBtn");
      if (pb0) {
        pb0.disabled = true;
        pb0.style.opacity = "0.55";
        pb0.textContent = "Make a payment";
        pb0.className = "ps-btn";
      }
      return;
    }
    var due = !!b.pastDue;
    var price = Number(b.amountDue != null ? b.amountDue : b.amount) || 0;
    var me = document.getElementById("psMethod");
    if (me) me.innerHTML = renderCardMethodHtml(b.method);
    setText("psAmountDueVal", psFmt(due ? b.amountDue || price : 0));
    setText("psExpenseLogVal", b.autoExpense ? "On" : "Off");
    var pb = document.getElementById("psPayBtn");
    if (pb) {
      pb.textContent = due
        ? "Make payment · " + psFmt(b.amountDue || price)
        : "Make a payment";
      pb.className = "ps-btn" + (due ? " danger" : "");
      pb.disabled = !due;
      pb.style.opacity = due ? "1" : "0.55";
    }
  }

  function paintSettingsToggles(b) {
    var planLabel = (b && (b.planLabel || b.plan)) || "AutoVault";
    var tg = document.getElementById("psAutoExpense");
    if (tg) {
      tg.disabled = false;
      tg.checked = !!(b && b.autoExpense);
    }
    var st = document.getElementById("psAutoStatus");
    if (st) {
      st.innerHTML =
        b && b.autoExpense
          ? "<b>On</b> — payments are added to Expenses as “" +
            esc(planLabel) +
            ' plan subscription” under Software / subscriptions.'
          : "Off — payments are not written to your Expenses section.";
    }
    var nt = document.getElementById("psNotifyBefore");
    if (nt) {
      nt.disabled = false;
      nt.checked = !b || b.notifyBefore !== false;
    }
    var ns = document.getElementById("psNotifyStatus");
    if (ns) {
      ns.innerHTML =
        !b || b.notifyBefore !== false
          ? "<b>On</b> — you'll get an email 3 days before each billing date."
          : "Off — no 3-day reminder emails (billing-day notice still sends).";
    }
  }

  function paintHistory(hist) {
    hist = hist || [];
    var hs = document.getElementById("psHistory");
    if (!hs) return;
    if (!hist.length) {
      hs.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;">No payments yet.</div>';
      return;
    }
    hs.innerHTML =
      '<div class="table-scroll"><table class="dash-sold-table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody id="psHistoryBody">' +
      hist
        .map(function (h) {
          var statusColor =
            h.status === "paid"
              ? "var(--green)"
              : h.status === "failed" || h.status === "uncollectible"
                ? "var(--red)"
                : "var(--muted)";
          return (
            "<tr><td>" +
            fmtDateSafe(h.date) +
            "</td><td>" +
            esc(h.plan || "—") +
            '</td><td style="font-weight:800;">' +
            psFmt(h.amount) +
            '</td><td style="color:' +
            statusColor +
            ';font-weight:700;text-transform:capitalize;">' +
            esc(h.status || "—") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  }

  function paintSummary(b) {
    if (!b) return;
    if (b.linked === false) {
      setText("psSub", "— billing not linked");
    } else {
      var price = Number(b.amount != null ? b.amount : b.monthlyFee) || 0;
      var cycle = b.cycle || "Monthly";
      var planLabel = b.planLabel || b.plan || "—";
      setText(
        "psSub",
        "— " +
          planLabel +
          " plan · " +
          psFmt(price) +
          "/" +
          (cycle === "Yearly" ? "yr" : "mo"),
      );
    }
    paintAlert(b);
    paintPlan(b);
    paintMethod(b);
    paintSettingsToggles(b);
    PS_SUMMARY_PANELS.forEach(function (id) {
      setPanelLoading(id, false);
    });
    var alert = document.getElementById("psAlert");
    if (alert) alert.classList.remove("is-loading");
  }

  async function loadBillingSummary() {
    if (!global.AVApi) throw new Error("API not loaded");
    var billingRes = await AVApi.getBilling();
    state.billing = billingRes.billing || billingRes;
    return state.billing;
  }

  async function loadBillingHistory() {
    if (!global.AVApi || typeof AVApi.getBillingHistory !== "function") {
      return [];
    }
    var res = await AVApi.getBillingHistory();
    state.history = (res && res.history) || [];
    return state.history;
  }

  async function loadBillingPlans() {
    if (!global.AVApi) return [];
    var plansRes = await AVApi.listBillingPlans().catch(function () {
      return { plans: [] };
    });
    state.plans = (plansRes && plansRes.plans) || [];
    return state.plans;
  }

  async function loadBilling(opts) {
    opts = opts || {};
    state.loading = true;
    try {
      var billing = await loadBillingSummary();
      if (opts.withHistory !== false) {
        try {
          await loadBillingHistory();
        } catch (_) {
          state.history = [];
        }
      }
      return billing;
    } finally {
      state.loading = false;
    }
  }

  async function renderTermsRecord() {
    var o = global.crmOwner || {};
    try {
      if (global.AVApi && typeof AVApi.getTermsStatus === "function") {
        var terms = await AVApi.getTermsStatus();
        if (terms) {
          o = Object.assign({}, o, terms);
          if (global.crmOwner) {
            global.crmOwner.termsAccepted = !!terms.termsAccepted;
            global.crmOwner.termsVersion = terms.termsVersion;
            global.crmOwner.termsPrintedName = terms.termsPrintedName;
            global.crmOwner.termsDealership = terms.termsDealership;
            global.crmOwner.termsSignature = terms.termsSignature;
            global.crmOwner.termsAcceptedAt = terms.termsAcceptedAt;
          }
        }
      }
    } catch (_) {}

    var host = document.getElementById("psTermsRecord");
    if (!host) return;

    if (!o.termsAccepted) {
      host.innerHTML =
        '<div style="padding:12px 0;color:var(--muted);font-size:13px;">No signed agreement on file yet.</div>';
      return;
    }

    var when = o.termsAcceptedAt ? fmtDateSafe(o.termsAcceptedAt) : "—";
    host.innerHTML =
      '<div class="tr-rec">' +
      '<div><div class="tr-cell-l">Signed by</div><div class="tr-cell-v">' +
      esc(o.termsPrintedName || o.name || "—") +
      "</div></div>" +
      '<div><div class="tr-cell-l">Dealership</div><div class="tr-cell-v">' +
      esc(o.termsDealership || o.dealershipName || "—") +
      "</div></div>" +
      '<div><div class="tr-cell-l">Version</div><div class="tr-cell-v">' +
      esc(o.termsVersion || "—") +
      "</div></div>" +
      '<div><div class="tr-cell-l">Accepted</div><div class="tr-cell-v">' +
      esc(when) +
      "</div></div>" +
      "</div>" +
      (o.termsSignature
        ? '<div class="tr-sig"><div class="terms-siglabel">Electronic Signature</div><div class="terms-sigwrap signed"><img src="' +
          esc(o.termsSignature) +
          '" alt="Signature"/></div></div>'
        : "");
  }

  function paintSettings() {
    if (state.billing) paintSummary(state.billing);
    paintHistory(state.history);
    setPanelLoading("psHistoryCard", false);
  }

  async function renderPaymentSettings() {
    var token = ++_renderToken;
    showValueSkeletons();

    var summaryP = loadBillingSummary()
      .then(function (b) {
        if (token !== _renderToken) return;
        paintSummary(b);
      })
      .catch(function (err) {
        if (token !== _renderToken) return;
        PS_SUMMARY_PANELS.forEach(function (id) {
          setPanelLoading(id, false);
        });
        var alert = document.getElementById("psAlert");
        if (alert) {
          alert.className = "ps-alert due";
          alert.classList.remove("is-loading");
        }
        setText("psSub", "— unable to load billing");
        setText("psAlertTitle", "Failed to load billing");
        setText("psAlertSub", (err && err.message) || "Please try again.");
      });

    var historyP = loadBillingHistory()
      .then(function (hist) {
        if (token !== _renderToken) return;
        paintHistory(hist);
        setPanelLoading("psHistoryCard", false);
      })
      .catch(function () {
        if (token !== _renderToken) return;
        paintHistory([]);
        setPanelLoading("psHistoryCard", false);
      });

    var termsP = renderTermsRecord()
      .then(function () {
        if (token !== _renderToken) return;
        setPanelLoading("psTermsCard", false);
      })
      .catch(function () {
        if (token !== _renderToken) return;
        setPanelLoading("psTermsCard", false);
      });

    var plansP = loadBillingPlans().catch(function () {
      return [];
    });

    await Promise.all([summaryP, historyP, termsP, plansP]);
  }

  function openUpgradePlan() {
    var list = document.getElementById("planList");
    var plans = state.plans || [];
    var current = plans.find(function (p) {
      return p.isCurrent;
    });
    var ups = plans.filter(function (p) {
      return p.canUpgrade;
    });
    if (list) {
      var curHtml = current
        ? '<div class="plan-opt cur"><div class="plan-opt-info"><div class="plan-opt-name">' +
          esc(current.name) +
          '</div><div class="plan-opt-price"><b>' +
          psFmt(current.amount) +
          "</b> / month</div><div class=\"plan-opt-feat\">" +
          esc(current.feat) +
          '</div></div><span class="ps-badge active">Current plan</span></div>'
        : "";
      var upHtml = ups.length
        ? '<div class="plan-sec-label">Available upgrade' +
          (ups.length > 1 ? "s" : "") +
          "</div>" +
          ups
            .map(function (p) {
              var diff =
                current && p.amount > current.amount
                  ? ' <span class="plan-opt-diff">+' +
                    psFmt(p.amount - current.amount) +
                    "/mo</span>"
                  : "";
              return (
                '<div class="plan-opt"><div class="plan-opt-info"><div class="plan-opt-name">' +
                esc(p.name) +
                '</div><div class="plan-opt-price"><b>' +
                psFmt(p.amount) +
                "</b> / month" +
                diff +
                '</div><div class="plan-opt-feat">' +
                esc(p.feat) +
                '</div></div><button class="ps-btn primary" onclick="selectBillingPlan(\'' +
                esc(p.slug) +
                "')\">Upgrade</button></div>"
              );
            })
            .join("")
        : '<div class="plan-top-note">You\'re on the top plan — there\'s nothing higher to upgrade to.</div>';
      list.innerHTML = curHtml + upHtml;
    }
    var m = document.getElementById("upgradePlanModal");
    if (m) m.classList.add("open");
  }

  function closeUpgradePlan() {
    var m = document.getElementById("upgradePlanModal");
    if (m) m.classList.remove("open");
  }

  async function selectBillingPlan(slug) {
    if (!global.AVApi) return;
    closeUpgradePlan();
    try {
      var p = AVApi.billingCheckout({ action: "upgrade", plan: slug });
      var res =
        typeof AVToast !== "undefined" && AVToast.promise
          ? await AVToast.promise(p, {
              loading: "Starting checkout…",
              loadingMsg: "Redirecting to Stripe",
              success: "Redirecting…",
              error: "Unable to start upgrade",
            })
          : await p;
      if (res && res.url) window.location.href = res.url;
      else throw new Error("No checkout URL returned");
    } catch (err) {
      /* toast already shown */
    }
  }

  function openUpdateMethod() {
    var b = state.billing || {};
    var c = document.getElementById("umCurrent");
    if (c) {
      c.innerHTML = b.method
        ? renderCardMethodHtml(b.method)
        : '<div style="color:var(--muted);font-size:13px;">No card on file yet.</div>';
    }
    var note = document.getElementById("umNote");
    if (note) {
      note.textContent =
        "You'll be redirected to Stripe's secure billing portal to update your card. No card details are stored in AutoVault.";
    }
    var m = document.getElementById("updateMethodModal");
    if (m) m.classList.add("open");
  }

  function closeUpdateMethod() {
    var m = document.getElementById("updateMethodModal");
    if (m) m.classList.remove("open");
  }

  async function confirmUpdateMethod() {
    if (!global.AVApi) return;
    try {
      var p = AVApi.billingPortal();
      var res =
        typeof AVToast !== "undefined" && AVToast.promise
          ? await AVToast.promise(p, {
              loading: "Opening Stripe…",
              loadingMsg: "Secure billing portal",
              success: "Redirecting…",
              error: "Unable to open billing portal",
            })
          : await p;
      if (res && res.url) window.location.href = res.url;
      else throw new Error("No portal URL returned");
    } catch (err) {
      /* toast already shown */
    }
  }

  function openMakePayment() {
    var b = state.billing || {};
    var due = !!b.pastDue;
    var price = Number(b.amountDue != null ? b.amountDue : b.amount) || 0;
    var method = b.method;
    var t = document.getElementById("mpTitle");
    if (t) t.textContent = due ? "Payment Past Due" : "Make a Payment";
    var a = document.getElementById("mpAmount");
    if (a) a.textContent = psFmt(price);
    var l = document.getElementById("mpLines");
    if (l) {
      l.innerHTML =
        '<div class="psl"><span>Plan</span><span>' +
        esc(b.planLabel || b.plan || "—") +
        '</span></div><div class="psl ' +
        (due ? "warn" : "") +
        '"><span>Due date</span><span>' +
        fmtDateSafe(b.dueDate) +
        (due && b.daysLate ? " · " + b.daysLate + "d late" : "") +
        '</span></div><div class="psl"><span>Paying with</span><span>' +
        (method
          ? esc(cardBrandLabel(method.brand)) + " •••• " + esc(method.last4)
          : "Card on file") +
        "</span></div>";
    }
    var note = document.getElementById("mpNote");
    if (note) {
      note.textContent = due
        ? "You'll be redirected to Stripe to pay the open invoice securely."
        : "Your account is current — no payment is due.";
    }
    var btn = document.getElementById("mpPayBtn");
    if (btn) {
      btn.disabled = !due;
      btn.style.opacity = due ? "1" : "0.55";
    }
    var m = document.getElementById("makePaymentModal");
    if (m) m.classList.add("open");
  }

  function closeMakePayment() {
    var m = document.getElementById("makePaymentModal");
    if (m) m.classList.remove("open");
  }

  async function confirmPayment() {
    if (!global.AVApi) return;
    var b = state.billing || {};
    if (!b.pastDue) {
      closeMakePayment();
      return;
    }
    try {
      var p = AVApi.billingCheckout({ action: "pay_due" });
      var res =
        typeof AVToast !== "undefined" && AVToast.promise
          ? await AVToast.promise(p, {
              loading: "Starting payment…",
              loadingMsg: "Redirecting to Stripe",
              success: "Redirecting…",
              error: "Unable to start payment",
            })
          : await p;
      if (res && res.url) window.location.href = res.url;
      else throw new Error("No payment URL returned");
    } catch (err) {
      /* toast already shown */
    }
  }

  async function toggleAutoExpense() {
    var tg = document.getElementById("psAutoExpense");
    var on = !!(tg && tg.checked);
    if (!global.AVApi) return;
    try {
      var p = AVApi.updateBillingSettings({ autoExpense: on });
      if (typeof AVToast !== "undefined" && AVToast.promise) {
        await AVToast.promise(p, {
          loading: on ? "Enabling…" : "Disabling…",
          loadingMsg: "Updating expense preference",
          success: on
            ? "Payments will be logged to Expenses"
            : "Expense logging turned off",
          error: "Failed to update setting",
        });
      } else {
        await p;
      }
      if (state.billing) state.billing.autoExpense = on;
      paintSettingsToggles(state.billing);
      paintMethod(state.billing);
    } catch (err) {
      if (tg) tg.checked = !on;
    }
  }

  async function toggleNotifyBefore() {
    var tg = document.getElementById("psNotifyBefore");
    var on = !!(tg && tg.checked);
    if (!global.AVApi) return;
    try {
      var p = AVApi.updateBillingSettings({ notifyBefore: on });
      if (typeof AVToast !== "undefined" && AVToast.promise) {
        await AVToast.promise(p, {
          loading: on ? "Enabling…" : "Disabling…",
          loadingMsg: "Updating reminder preference",
          success: on
            ? "3-day billing reminders on"
            : "3-day billing reminders off",
          error: "Failed to update setting",
        });
      } else {
        await p;
      }
      if (state.billing) state.billing.notifyBefore = on;
      paintSettingsToggles(state.billing);
    } catch (err) {
      if (tg) tg.checked = !on;
    }
  }

  function handleBillingReturn() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var flag = params.get("billing");
      if (!flag) return;
      if (flag === "success") {
        if (typeof AVToast !== "undefined")
          AVToast.success(
            "Payment processed. Refreshing your billing status…",
            "Billing updated",
          );
      } else if (flag === "cancel") {
        if (typeof AVToast !== "undefined")
          AVToast.info("Checkout canceled — no changes made.");
      } else if (flag === "portal") {
        if (typeof AVToast !== "undefined")
          AVToast.success("Welcome back. Syncing payment method…", "Billing");
      }
      params.delete("billing");
      params.delete("page");
      var qs = params.toString();
      var clean =
        window.location.pathname +
        (qs ? "?" + qs : "") +
        (window.location.hash || "#payment-settings");
      window.history.replaceState({}, "", clean);

      if (typeof global.showPage === "function") {
        var nav = document.querySelector('[data-page="payment-settings"]');
        global.showPage("payment-settings", nav);
      }
      renderPaymentSettings().then(function () {
        setTimeout(function () {
          renderPaymentSettings().catch(function () {});
        }, 1800);
      });
    } catch (e) {
      console.warn("[billing] return handler", e);
    }
  }

  global.AVBilling = {
    loadBilling: loadBilling,
    renderPaymentSettings: renderPaymentSettings,
    handleBillingReturn: handleBillingReturn,
    state: state,
  };

  global.renderPaymentSettings = renderPaymentSettings;
  global.openUpgradePlan = openUpgradePlan;
  global.closeUpgradePlan = closeUpgradePlan;
  global.selectBillingPlan = selectBillingPlan;
  global.openUpdateMethod = openUpdateMethod;
  global.closeUpdateMethod = closeUpdateMethod;
  global.confirmUpdateMethod = confirmUpdateMethod;
  global.openMakePayment = openMakePayment;
  global.closeMakePayment = closeMakePayment;
  global.confirmPayment = confirmPayment;
  global.toggleAutoExpense = toggleAutoExpense;
  global.toggleNotifyBefore = toggleNotifyBefore;
  global.renderTermsRecord = renderTermsRecord;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleBillingReturn);
  } else {
    setTimeout(handleBillingReturn, 0);
  }
})(window);
