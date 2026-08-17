/**
 * Shared helpers: map tax frequency labels <-> API enums,
 * flooring UI config <-> FlooringPlan payload.
 */
(function (global) {
  var FREQ_UI_TO_API = {
    Monthly: "monthly",
    Quarterly: "quarterly",
    "Semi-Annually": "custom",
    Annually: "annual",
    monthly: "monthly",
    quarterly: "quarterly",
    annual: "annual",
    custom: "custom",
  };
  var FREQ_API_TO_UI = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annually",
    custom: "Semi-Annually",
  };

  function taxFreqToApi(ui) {
    return FREQ_UI_TO_API[ui] || "quarterly";
  }
  function taxFreqToUi(api) {
    return FREQ_API_TO_UI[api] || "Quarterly";
  }

  function ymd(d) {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch (e) {
      return "";
    }
  }

  function mapTaxSettingsToUi(s) {
    if (!s) return { frequency: "Quarterly", nextDue: "", notes: "" };
    return {
      frequency: taxFreqToUi(s.filingFrequency || s.frequency),
      nextDue: ymd(s.nextDueDate || s.nextDue || ""),
      notes: s.notes || "",
    };
  }

  /** Snapshot encoded in TaxFilingPeriod.name when deals aren't linked yet. */
  var FILING_META_RE =
    /^\[AVFILING\|totalTax=([0-9.]+)\|count=(\d+)\|filedOn=([0-9-]+)\]\s*(.*)$/;

  function encodeFilingName(opts) {
    var label = opts.label || ("Filing due " + (opts.dueDate || ""));
    return (
      "[AVFILING|totalTax=" +
      Number(opts.totalTax || 0).toFixed(2) +
      "|count=" +
      (opts.count || 0) +
      "|filedOn=" +
      (opts.filedOn || ymd(new Date())) +
      "] " +
      label
    );
  }

  function parseFilingName(name) {
    var m = FILING_META_RE.exec(String(name || ""));
    if (!m) return null;
    return {
      totalTax: Number(m[1]) || 0,
      count: Number(m[2]) || 0,
      filedOn: m[3],
      label: m[4] || "",
    };
  }

  function mapTaxPeriodToFiling(p) {
    var due = ymd(p.dueDate);
    var meta = parseFilingName(p.name);
    var filedOn =
      (meta && meta.filedOn) || ymd(p.updatedAt || p.endDate || p.dueDate);
    var vins = (p.deals || [])
      .map(function (d) {
        return d.dealJacket && d.dealJacket.id;
      })
      .filter(Boolean);
    var totalTax =
      meta && meta.totalTax != null
        ? meta.totalTax
        : Number(p.totalTax) || 0;
    var count =
      meta && meta.count != null
        ? meta.count
        : p.dealCount != null
          ? p.dealCount
          : vins.length;
    return {
      id: p.id,
      filedOn: filedOn,
      dueDate: due,
      frequency: taxFreqToUi(p.frequency) || "Quarterly",
      periodStart: ymd(p.startDate),
      periodEnd: ymd(p.endDate),
      vins: vins,
      totalTax: totalTax,
      count: count,
      periodLabel: (meta && meta.label) || p.name || due,
      status: p.status,
      _raw: p,
    };
  }

  function flooringUiFromPlan(plan) {
    var cfg =
      plan && plan.configJson && typeof plan.configJson === "object"
        ? plan.configJson
        : null;
    if (cfg && Array.isArray(cfg.tiers) && cfg.tiers.length) {
      return {
        buyFee: Number(cfg.buyFee) || Number(plan.buyFee) || 0,
        tiers: cfg.tiers.map(function (t) {
          return {
            max: t.max === null || t.max === undefined ? Infinity : Number(t.max),
            rate: Number(t.rate) || 0,
          };
        }),
        applied: !!cfg.applied,
        scope: cfg.scope || "all",
        payoffDays: Number(cfg.payoffDays) || 90,
        gracePeriod: Number(cfg.gracePeriod) || 0,
        planId: plan.id,
      };
    }
    return {
      buyFee: Number(plan.buyFee) || 0,
      tiers: [
        { max: 30, rate: 0 },
        { max: 60, rate: 0 },
        { max: 90, rate: 0 },
        { max: Infinity, rate: 0 },
      ],
      applied: false,
      scope: "all",
      payoffDays: Number(plan.gracePeriodDays) || 90,
      gracePeriod: 0,
      planId: plan.id,
    };
  }

  function flooringPlanPayloadFromUi(cfg, effectiveDate) {
    var tiers = (cfg.tiers || []).map(function (t) {
      return {
        max: t.max === Infinity ? null : t.max,
        rate: t.rate,
      };
    });
    var firstRate =
      cfg.tiers && cfg.tiers[0] ? Number(cfg.tiers[0].rate) || 0 : 0;
    return {
      name: "Dealer Floor Plan",
      rateType: "daily",
      baseRate: firstRate,
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
      buyFee: Number(cfg.buyFee) || 0,
      isActive: !!cfg.applied,
      gracePeriodDays: Number(cfg.payoffDays) || 90,
      configJson: {
        buyFee: Number(cfg.buyFee) || 0,
        tiers: tiers,
        applied: !!cfg.applied,
        scope: cfg.scope || "all",
        payoffDays: Number(cfg.payoffDays) || 90,
        gracePeriod: Number(cfg.gracePeriod) || 0,
      },
    };
  }

  global.AVFinancePersist = {
    taxFreqToApi: taxFreqToApi,
    taxFreqToUi: taxFreqToUi,
    mapTaxSettingsToUi: mapTaxSettingsToUi,
    mapTaxPeriodToFiling: mapTaxPeriodToFiling,
    encodeFilingName: encodeFilingName,
    parseFilingName: parseFilingName,
    flooringUiFromPlan: flooringUiFromPlan,
    flooringPlanPayloadFromUi: flooringPlanPayloadFromUi,
    ymd: ymd,
  };
})(typeof window !== "undefined" ? window : globalThis);
