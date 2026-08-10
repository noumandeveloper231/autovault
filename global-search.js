/**
 * Global top-bar search — debounced API search with typed result dropdown.
 * Requires window.AVApi. Navigates via existing dashboard helpers.
 */
(function (global) {
  var DEBOUNCE_MS = 500;
  var MIN_CHARS = 2;
  var debounceTimer = null;
  var abortCtrl = null;
  var activeIndex = -1;
  var flatItems = [];
  var lastQuery = "";
  var panelEl = null;
  var inputEl = null;
  var wrapEl = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureDom() {
    wrapEl = document.querySelector(".topbar .search, .search");
    if (!wrapEl) return false;
    inputEl = wrapEl.querySelector("input");
    if (!inputEl) return false;

    if (!inputEl.id) inputEl.id = "globalSearch";
    inputEl.setAttribute("autocomplete", "off");
    inputEl.setAttribute("spellcheck", "false");
    inputEl.setAttribute("role", "combobox");
    inputEl.setAttribute("aria-autocomplete", "list");
    inputEl.setAttribute("aria-expanded", "false");
    inputEl.setAttribute("aria-controls", "globalSearchPanel");
    inputEl.placeholder =
      inputEl.placeholder || "Search vehicles, VIN, customers, jackets…";

    panelEl = document.getElementById("globalSearchPanel");
    if (!panelEl) {
      panelEl = document.createElement("div");
      panelEl.id = "globalSearchPanel";
      panelEl.className = "gs-panel";
      panelEl.setAttribute("role", "listbox");
      panelEl.hidden = true;
      wrapEl.appendChild(panelEl);
    }
    return true;
  }

  function setOpen(open) {
    if (!panelEl || !inputEl) return;
    panelEl.hidden = !open;
    wrapEl.classList.toggle("gs-open", !!open);
    inputEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) {
      activeIndex = -1;
      syncActive();
    }
  }

  function syncActive() {
    if (!panelEl) return;
    var rows = panelEl.querySelectorAll(".gs-item");
    for (var i = 0; i < rows.length; i++) {
      var on = i === activeIndex;
      rows[i].classList.toggle("is-active", on);
      rows[i].setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        try {
          rows[i].scrollIntoView({ block: "nearest" });
        } catch (_) {}
      }
    }
  }

  function sectionHtml(label, icon, items) {
    if (!items || !items.length) return "";
    var rows = items
      .map(function (item, idx) {
        var flatIdx = flatItems.length;
        flatItems.push(item);
        var typeClass = "gs-type-" + (item.type || "other");
        return (
          '<button type="button" class="gs-item ' +
          typeClass +
          '" role="option" data-gs-idx="' +
          flatIdx +
          '" id="gs-opt-' +
          flatIdx +
          '">' +
          '<span class="gs-item-icon" aria-hidden="true">' +
          icon +
          "</span>" +
          '<span class="gs-item-body">' +
          '<span class="gs-item-title">' +
          esc(item.title) +
          "</span>" +
          (item.subtitle
            ? '<span class="gs-item-sub">' + esc(item.subtitle) + "</span>"
            : "") +
          "</span>" +
          (item.meta
            ? '<span class="gs-item-meta">' + esc(item.meta) + "</span>"
            : "") +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="gs-section">' +
      '<div class="gs-section-label">' +
      esc(label) +
      "</div>" +
      rows +
      "</div>"
    );
  }

  function iconSvg(kind) {
    if (kind === "vehicle") {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14v-5l-1.5-4.5A2 2 0 0 0 15.6 6H8.4a2 2 0 0 0-1.9 1.5L5 12v5z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>';
    }
    if (kind === "customer") {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>';
    }
    if (kind === "jacket") {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
    }
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  }

  function renderLoading(q) {
    flatItems = [];
    panelEl.innerHTML =
      '<div class="gs-state">' +
      '<div class="gs-spinner"></div>' +
      "<span>Searching for &ldquo;" +
      esc(q) +
      "&rdquo;&hellip;</span>" +
      "</div>";
    setOpen(true);
  }

  function renderEmpty(q) {
    flatItems = [];
    panelEl.innerHTML =
      '<div class="gs-state gs-empty">' +
      "<strong>No matches</strong>" +
      "<span>Nothing found for &ldquo;" +
      esc(q) +
      "&rdquo;. Try VIN, stock #, customer, or jacket number.</span>" +
      "</div>";
    setOpen(true);
  }

  function renderError(msg) {
    flatItems = [];
    panelEl.innerHTML =
      '<div class="gs-state gs-error">' +
      "<strong>Search failed</strong>" +
      "<span>" +
      esc(msg || "Please try again.") +
      "</span>" +
      "</div>";
    setOpen(true);
  }

  function renderHint() {
    flatItems = [];
    panelEl.innerHTML =
      '<div class="gs-state gs-hint">' +
      "<span>Type at least 2 characters to search vehicles, VINs, customers, deal jackets, and expenses.</span>" +
      "</div>";
    setOpen(true);
  }

  function renderResults(data) {
    flatItems = [];
    var r = (data && data.results) || {};
    var html =
      sectionHtml("Vehicles", iconSvg("vehicle"), r.vehicles) +
      sectionHtml("Customers &amp; Leads", iconSvg("customer"), r.customers) +
      sectionHtml("Deal Jackets", iconSvg("jacket"), r.jackets) +
      sectionHtml("Expenses", iconSvg("expense"), r.expenses);

    if (!html) {
      renderEmpty(data && data.query);
      return;
    }

    var total = data.total || flatItems.length;
    panelEl.innerHTML =
      '<div class="gs-head">Showing ' +
      total +
      " result" +
      (total === 1 ? "" : "s") +
      ' for &ldquo;' +
      esc(data.query) +
      "&rdquo;</div>" +
      html +
      '<div class="gs-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>';
    setOpen(true);
    activeIndex = flatItems.length ? 0 : -1;
    syncActive();
  }

  async function ensureVehicleLocal(item) {
    if (!item || !item.vin) return item && item.vin;
    var vin = item.vin;
    if (
      global.AVVehicles &&
      typeof AVVehicles.findUiVehicle === "function" &&
      AVVehicles.findUiVehicle(vin)
    ) {
      return vin;
    }
    if (!global.AVApi || !item.id) return vin;
    try {
      var res = await AVApi.getVehicle(item.id);
      var apiVeh = res && res.vehicle;
      if (apiVeh && global.AVVehicles && AVVehicles.mapApiToUi) {
        var ui = AVVehicles.mapApiToUi(apiVeh, apiVeh.expenses || []);
        if (!Array.isArray(global.vehicles)) global.vehicles = [];
        var idx = global.vehicles.findIndex(function (v) {
          return v && (v.id === ui.id || v.vin === ui.vin);
        });
        if (idx >= 0) global.vehicles[idx] = ui;
        else global.vehicles.unshift(ui);
      }
    } catch (_) {}
    return vin;
  }

  function navToPage(pageId, navSel) {
    if (typeof global.showPage === "function") {
      var el =
        document.querySelector(navSel || '[data-page="' + pageId + '"]') ||
        null;
      global.showPage(pageId, el);
    }
  }

  async function openResult(item) {
    if (!item) return;
    setOpen(false);
    if (inputEl) inputEl.blur();

    if (item.type === "vehicle") {
      var vin = await ensureVehicleLocal(item);
      if (item.hasDealJacket || item.status === "sold" || item.status === "loss") {
        if (typeof global.openDealJacket === "function") {
          global.openDealJacket(vin, "inventory");
          return;
        }
      }
      if (typeof global.showVehicleDetail === "function") {
        global.showVehicleDetail(vin);
        return;
      }
      if (typeof global.openDealJacket === "function") {
        global.openDealJacket(vin, "inventory");
        return;
      }
      navToPage("vehicles");
      return;
    }

    if (item.type === "jacket") {
      var jVin = item.vin || (await ensureVehicleLocal(item));
      if (jVin && typeof global.openDealJacket === "function") {
        global.openDealJacket(jVin, "sold");
        return;
      }
      navToPage("deal-jackets", '[data-nav="deal-jackets"]');
      return;
    }

    if (item.type === "customer") {
      if (item.status === "lead") {
        navToPage("customer-leads");
        setTimeout(function () {
          if (typeof global.openCustLeadModal === "function") {
            global.openCustLeadModal(item.id);
          }
        }, 60);
        return;
      }
      navToPage("customers");
      return;
    }

    if (item.type === "expense") {
      navToPage("expenses");
      setTimeout(function () {
        if (typeof global.openExpenseModal === "function") {
          global.openExpenseModal(item.id);
        }
      }, 60);
    }
  }

  async function runSearch(q) {
    lastQuery = q;
    if (!global.AVApi || typeof AVApi.globalSearch !== "function") {
      renderError("Search API is unavailable.");
      return;
    }

    if (abortCtrl) {
      try {
        abortCtrl.abort();
      } catch (_) {}
    }
    abortCtrl = typeof AbortController !== "undefined" ? new AbortController() : null;

    renderLoading(q);
    try {
      var params = new URLSearchParams({ q: q, limit: "8" });
      var data = await AVApi.globalSearch("?" + params.toString(), {
        signal: abortCtrl ? abortCtrl.signal : undefined,
        timeout: 20000,
      });
      if (q !== lastQuery) return;
      if (!data || !data.total) renderEmpty(q);
      else renderResults(data);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (q !== lastQuery) return;
      renderError((err && err.message) || "Please try again.");
    }
  }

  function onInput() {
    var q = (inputEl.value || "").trim();
    clearTimeout(debounceTimer);
    if (!q) {
      setOpen(false);
      panelEl.innerHTML = "";
      return;
    }
    if (q.length < MIN_CHARS) {
      renderHint();
      return;
    }
    debounceTimer = setTimeout(function () {
      runSearch(q);
    }, DEBOUNCE_MS);
  }

  function onKeyDown(e) {
    if (!panelEl || panelEl.hidden) {
      if (e.key === "ArrowDown" && (inputEl.value || "").trim().length >= MIN_CHARS) {
        e.preventDefault();
        runSearch((inputEl.value || "").trim());
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!flatItems.length) return;
      activeIndex = (activeIndex + 1) % flatItems.length;
      syncActive();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!flatItems.length) return;
      activeIndex = (activeIndex - 1 + flatItems.length) % flatItems.length;
      syncActive();
      return;
    }
    if (e.key === "Enter") {
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        e.preventDefault();
        openResult(flatItems[activeIndex]);
      }
    }
  }

  function onPanelClick(e) {
    var btn = e.target.closest(".gs-item");
    if (!btn) return;
    var idx = Number(btn.getAttribute("data-gs-idx"));
    if (!Number.isNaN(idx) && flatItems[idx]) openResult(flatItems[idx]);
  }

  function onDocPointer(e) {
    if (!wrapEl || !panelEl || panelEl.hidden) return;
    if (wrapEl.contains(e.target)) return;
    setOpen(false);
  }

  function onGlobalShortcut(e) {
    var key = (e.key || "").toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "k") {
      e.preventDefault();
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }
  }

  function bind() {
    if (!ensureDom()) return false;
    if (wrapEl.dataset.gsBound === "1") return true;
    wrapEl.dataset.gsBound = "1";

    inputEl.addEventListener("input", onInput);
    inputEl.addEventListener("keydown", onKeyDown);
    inputEl.addEventListener("focus", function () {
      var q = (inputEl.value || "").trim();
      if (q.length >= MIN_CHARS && panelEl && panelEl.innerHTML) setOpen(true);
      else if (q.length > 0 && q.length < MIN_CHARS) renderHint();
    });
    panelEl.addEventListener("mousedown", function (e) {
      e.preventDefault();
    });
    panelEl.addEventListener("click", onPanelClick);
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onGlobalShortcut);
    return true;
  }

  function init() {
    if (bind()) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (bind() || tries > 40) clearInterval(t);
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.AVGlobalSearch = {
    init: init,
    open: function () {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    },
    close: function () {
      setOpen(false);
    },
  };
})(window);
