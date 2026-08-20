/**
 * Shared AutoVault i18n — same pattern as landing page:
 * - document.documentElement.lang = "es" | "en"
 * - avT("English string") for JS-built copy
 * - applyLang() walks DOM (+ placeholders/title/aria-label)
 * - localStorage "av_lang" persists preference across pages
 */
(function (g) {
  var STORAGE_KEY = "av_lang";
  var observer = null;
  var applying = false;
  var _dictCache = null;
  var _revDictCache = null;
  var _monthRulesEs = null;
  var _monthRulesEn = null;
  var _obsPending = null;
  var _obsRoots = [];

  function buildDict() {
    if (_dictCache) return _dictCache;
    var d = {};
    if (g.AV_LANDING_EXTRA) Object.assign(d, g.AV_LANDING_EXTRA);
    if (g.AV_LANDING_DICT) Object.assign(d, g.AV_LANDING_DICT);
    if (g.AV_DASH_ES) Object.assign(d, g.AV_DASH_ES);
    _dictCache = d;
    return d;
  }

  function buildRevDict() {
    if (_revDictCache) return _revDictCache;
    var d = buildDict();
    var rev = {};
    for (var k in d) {
      if (rev[d[k]] === undefined) rev[d[k]] = k;
    }
    _revDictCache = rev;
    g.AV_ES2EN = rev;
    return rev;
  }

  function buildMonthRules() {
    if (_monthRulesEs) return;
    _monthRulesEs = [];
    _monthRulesEn = [];
    var en2es = g.AV_MONTH_EN2ES;
    var es2en = g.AV_MONTH_ES2EN;
    if (en2es) {
      for (var k in en2es) {
        if (en2es[k] === k) continue;
        _monthRulesEs.push({ re: new RegExp("\\b" + k + "\\b", "g"), rep: en2es[k] });
      }
    }
    if (es2en) {
      for (var ek in es2en) {
        if (es2en[ek] === ek) continue;
        _monthRulesEn.push({ re: new RegExp("\\b" + ek + "\\b", "g"), rep: es2en[ek] });
      }
    }
  }

  function txMonths(val, toEs) {
    if (!val || !/\d/.test(val)) return val;
    buildMonthRules();
    var rules = toEs ? _monthRulesEs : _monthRulesEn;
    if (!rules || !rules.length) return val;
    var out = val;
    var hit = false;
    for (var i = 0; i < rules.length; i++) {
      rules[i].re.lastIndex = 0;
      if (rules[i].re.test(out)) {
        rules[i].re.lastIndex = 0;
        out = out.replace(rules[i].re, rules[i].rep);
        hit = true;
      }
    }
    return hit ? out : val;
  }

  function translateToken(raw, toEs) {
    var t = (raw || "").trim();
    if (!t) return raw;
    if (toEs) {
      var d = buildDict();
      if (d[t] != null && d[t] !== t) return raw.replace(t, d[t]);
      return txMonths(raw, true);
    }
    var rev = buildRevDict();
    if (rev[t] != null && rev[t] !== t) return raw.replace(t, rev[t]);
    return txMonths(raw, false);
  }

  /** Translate a string for JS UI (toasts, dynamic labels, etc.). */
  g.avT = function (en) {
    if (en == null) return en;
    var s = String(en);
    if (document.documentElement.lang !== "es") return s;
    var d = buildDict();
    if (d[s] != null) return d[s];
    return txMonths(s, true);
  };

  function applyAttrs(root, toEs, attr, store, d) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll("[" + attr + "]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.id === "langToggle" || (el.classList && el.classList.contains("lang-btn")))
        continue;
      var t = (el.getAttribute(attr) || "").trim();
      if (!t) continue;
      if (toEs) {
        var next = d[t] != null ? d[t] : txMonths(t, true);
        if (next !== t) {
          if (el[store] === undefined) el[store] = el.getAttribute(attr);
          el.setAttribute(attr, next);
        }
      } else if (el[store] !== undefined) {
        el.setAttribute(attr, el[store]);
      }
    }
  }

  function walk(root, toEs) {
    if (!root) return;
    var d = buildDict();
    var skipTags = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1 };
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (skipTags[p.tagName]) return NodeFilter.FILTER_REJECT;
        if (p.id === "langToggle" || (p.classList && p.classList.contains("lang-btn")))
          return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
        return n.nodeValue && n.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var raw = n.nodeValue;
      if (toEs) {
        if (n.__en === undefined) n.__en = raw;
        var src = n.__en;
        var t = src.trim();
        if (d[t] != null && d[t] !== t) n.nodeValue = src.replace(t, d[t]);
        else {
          var m = txMonths(src, true);
          n.nodeValue = m !== src ? m : src;
        }
      } else if (n.__en !== undefined) {
        n.nodeValue = n.__en;
      } else {
        n.nodeValue = translateToken(raw, false);
      }
    }

    var scope = root.nodeType === 1 ? root : document.body;
    if (scope && scope.querySelectorAll) {
      scope.querySelectorAll("input[placeholder],textarea[placeholder]").forEach(function (el) {
        var t = (el.getAttribute("placeholder") || "").trim();
        if (toEs) {
          var next = d[t] != null ? d[t] : txMonths(t, true);
          if (next !== t) {
            if (el.__ph === undefined) el.__ph = el.getAttribute("placeholder");
            el.setAttribute("placeholder", next);
          }
        } else if (el.__ph !== undefined) {
          el.setAttribute("placeholder", el.__ph);
        }
      });
      applyAttrs(scope, toEs, "title", "__title", d);
      applyAttrs(scope, toEs, "aria-label", "__aria", d);
    }
  }

  function flushObservedWalks() {
    _obsPending = null;
    if (applying || document.documentElement.lang !== "es" || !_obsRoots.length) {
      _obsRoots = [];
      return;
    }
    applying = true;
    var roots = _obsRoots.slice();
    _obsRoots = [];
    for (var i = 0; i < roots.length; i++) {
      try {
        walk(roots[i], true);
      } catch (_) {}
    }
    applying = false;
  }

  function scheduleObservedWalk(node) {
    if (!node || applying || document.documentElement.lang !== "es") return;
    _obsRoots.push(node);
    if (_obsPending) return;
    _obsPending =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(flushObservedWalks)
        : setTimeout(flushObservedWalks, 16);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (muts) {
      if (applying || document.documentElement.lang !== "es") return;
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType === 1 || node.nodeType === 3) scheduleObservedWalk(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (_obsPending) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(_obsPending);
      else clearTimeout(_obsPending);
      _obsPending = null;
    }
    _obsRoots = [];
  }

  /**
   * opts.deferWalk — skip DOM walk (caller will walk after bulk updates)
   * opts.root — limit walk scope (default document.body)
   * opts.noObserver — do not start/stop observer (batch mode)
   */
  g.applyLang = function (lang, opts) {
    opts = opts || {};
    var toEs = lang === "es";
    applying = true;
    if (!opts.noObserver) stopObserver();
    document.documentElement.lang = toEs ? "es" : "en";
    try {
      localStorage.setItem(STORAGE_KEY, toEs ? "es" : "en");
    } catch (_) {}
    if (!opts.deferWalk) {
      walk(opts.root || document.body, toEs);
    }
    if (!opts.noObserver) {
      if (toEs) startObserver();
      else stopObserver();
    }
    applying = false;
    document.dispatchEvent(
      new CustomEvent("av-lang", { detail: { lang: toEs ? "es" : "en", es: toEs } }),
    );
  };

  /** Run heavy DOM updates without MutationObserver feedback loops. */
  g.avI18nBatch = function (fn) {
    var wasEs = document.documentElement.lang === "es";
    applying = true;
    stopObserver();
    try {
      if (typeof fn === "function") fn();
    } finally {
      applying = false;
      if (wasEs) startObserver();
    }
  };

  g.avI18nWalk = function (root, toEs) {
    walk(root || document.body, toEs != null ? !!toEs : document.documentElement.lang === "es");
  };

  g.avI18nStartObserver = startObserver;
  g.avI18nStopObserver = stopObserver;

  g.toggleLang = function () {
    var next = document.documentElement.lang === "es" ? "en" : "es";
    g.applyLang(next);
    var btn = document.getElementById("langToggle");
    if (btn) btn.classList.toggle("on", next === "es");
    var landingBtn = document.getElementById("langBtn");
    if (landingBtn) landingBtn.textContent = next === "es" ? "English" : "Español";
    return next;
  };

  g.avLangIsEs = function () {
    return document.documentElement.lang === "es";
  };

  g.avI18nReady = function () {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "es") {
        g.applyLang("es");
        var btn = document.getElementById("langToggle");
        if (btn) btn.classList.add("on");
      }
    } catch (_) {}
  };

  buildMonthRules();
})(typeof window !== "undefined" ? window : globalThis);
