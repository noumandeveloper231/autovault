(function (global) {
  var SUN =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function paintTheme() {
    var dark = document.documentElement.classList.contains("dark");
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.innerHTML = dark ? SUN : MOON;
      btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  global.AVThemeOnChange = paintTheme;
  global.toggleTheme = function () {
    if (global.AVTheme) global.AVTheme.toggle();
    else {
      var dark = !document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.classList.toggle("bright", !dark);
    }
    paintTheme();
  };
  paintTheme();

  var DICT = Object.assign(
    {},
    global.AV_LANDING_EXTRA || {},
    global.AV_AUTH_FLOW_EXTRA || {},
    global.AV_CONTACT_EXTRA || {},
    global.AV_LOGIN_EXTRA || {},
  );
  global.AV_AUTH_FLOW_DICT = DICT;

  var langBtns = document.querySelectorAll(".lang-btn");
  if (!langBtns.length) return;

  var es = false;

  function applyAttrs(toEs, attr, store) {
    document.querySelectorAll("[" + attr + "]").forEach(function (el) {
      if (el.classList && el.classList.contains("lang-btn")) return;
      var t = (el.getAttribute(attr) || "").trim();
      if (!t) return;
      if (toEs) {
        if (DICT[t] !== undefined) {
          if (el[store] === undefined) el[store] = el.getAttribute(attr);
          el.setAttribute(attr, DICT[t]);
        }
      } else if (el[store] !== undefined) {
        el.setAttribute(attr, el[store]);
      }
    });
  }

  function apply(toEs) {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (
          !p ||
          p.classList.contains("lang-btn") ||
          ["SCRIPT", "STYLE"].includes(p.tagName)
        )
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) {
      var raw = n.nodeValue;
      var t = raw.trim();
      if (!t) return;
      if (toEs) {
        if (DICT[t] !== undefined) {
          if (n.__en === undefined) n.__en = raw;
          n.nodeValue = raw.replace(t, DICT[t]);
        }
      } else if (n.__en !== undefined) {
        n.nodeValue = n.__en;
      }
    });
    document.querySelectorAll("[placeholder]").forEach(function (el) {
      var t = (el.getAttribute("placeholder") || "").trim();
      if (toEs) {
        if (DICT[t] !== undefined) {
          if (el.__ph === undefined) el.__ph = el.getAttribute("placeholder");
          el.setAttribute("placeholder", DICT[t]);
        }
      } else if (el.__ph !== undefined) {
        el.setAttribute("placeholder", el.__ph);
      }
    });
    applyAttrs(toEs, "title", "__title");
    applyAttrs(toEs, "aria-label", "__aria");
  }

  function paintLang() {
    langBtns.forEach(function (btn) {
      btn.textContent = es ? "EN" : "ES";
      btn.title = es ? "English" : "Español";
      btn.setAttribute(
        "aria-label",
        es ? "Switch to English" : "Switch to Spanish",
      );
    });
  }

  function toggleLang(e) {
    e.preventDefault();
    es = !es;
    document.documentElement.lang = es ? "es" : "en";
    apply(es);
    paintLang();
    try {
      localStorage.setItem("av_lang", es ? "es" : "en");
      localStorage.setItem("av_landing_lang", es ? "es" : "en");
    } catch (_) {}
  }

  langBtns.forEach(function (btn) {
    btn.addEventListener("click", toggleLang);
  });

  try {
    var saved =
      localStorage.getItem("av_landing_lang") || localStorage.getItem("av_lang");
    if (saved === "es") {
      es = true;
      document.documentElement.lang = "es";
      apply(true);
      paintLang();
    }
  } catch (_) {}

  function formatRemaining(ms, lang) {
    lang = lang || document.documentElement.lang || "en";
    var isEs = lang === "es";
    if (ms <= 0) {
      return isEs ? "Este enlace venció" : "This link expired";
    }
    var s = Math.floor(ms / 1000);
    var days = Math.floor(s / 86400);
    s %= 86400;
    var hours = Math.floor(s / 3600);
    s %= 3600;
    var mins = Math.floor(s / 60);
    s %= 60;
    if (days >= 1) {
      return isEs
        ? days === 1
          ? "Queda 1 día"
          : "Quedan " + days + " días"
        : days === 1
          ? "1 day left"
          : days + " days left";
    }
    if (hours >= 1) {
      return isEs
        ? hours === 1
          ? "Queda 1 hora"
          : "Quedan " + hours + " horas"
        : hours === 1
          ? "1 hour left"
          : hours + " hours left";
    }
    if (mins >= 1 && s > 0) {
      return isEs
        ? mins +
            " minuto" +
            (mins === 1 ? "" : "s") +
            " " +
            s +
            " segundo" +
            (s === 1 ? "" : "s") +
            " restantes"
        : mins +
            " minute" +
            (mins === 1 ? "" : "s") +
            " " +
            s +
            " second" +
            (s === 1 ? "" : "s") +
            " left";
    }
    if (mins >= 1) {
      return isEs
        ? mins === 1
          ? "Queda 1 minuto"
          : "Quedan " + mins + " minutos"
        : mins === 1
          ? "1 minute left"
          : mins + " minutes left";
    }
    return isEs
      ? s === 1
        ? "Queda 1 segundo"
        : "Quedan " + s + " segundos"
      : s === 1
        ? "1 second left"
        : s + " seconds left";
  }

  global.AVAuthFlow = global.AVAuthFlow || {};
  global.AVAuthFlow.formatRemaining = formatRemaining;

  var PW_EYE_OPEN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var PW_EYE_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

  global.AVAuthFlow.initPasswordToggles = function (root) {
    var scope = root || document;
    scope.querySelectorAll("[data-af-pw-toggle]").forEach(function (btn) {
      if (btn.__afPwBound) return;
      btn.__afPwBound = true;
      var wrap = btn.closest(".af-pw-wrap");
      var input = wrap && wrap.querySelector("input");
      if (!input) return;
      btn.innerHTML = PW_EYE_OPEN;
      btn.setAttribute("aria-label", "Show password");
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", function () {
        var hidden = input.type === "password";
        input.type = hidden ? "text" : "password";
        btn.innerHTML = hidden ? PW_EYE_OFF : PW_EYE_OPEN;
        btn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
        btn.setAttribute("aria-pressed", hidden ? "true" : "false");
      });
    });
  };

  global.AVAuthFlow.initPasswordToggles(document);

  global.AVAuthFlow.startCountdown = function (el, expiresAt, opts) {
    if (!el || !expiresAt) return null;
    opts = opts || {};
    var end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end)) return null;

    function paint() {
      var ms = end - Date.now();
      var text = formatRemaining(ms);
      el.textContent = text;
      el.classList.toggle("is-expired", ms <= 0);
      if (ms <= 0) {
        if (typeof opts.onExpired === "function") opts.onExpired();
        return false;
      }
      return true;
    }

    paint();
    var timer = setInterval(function () {
      if (!paint()) clearInterval(timer);
    }, 1000);
    return timer;
  };
})(window);
