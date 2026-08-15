/**
 * Shared AutoVault theme: "light" | "dark".
 *
 * CRM (default): follows the OS until the user toggles. Storage key: av-theme
 * Landing pages (html[data-av-surface="landing"]): default light, independent
 * of CRM. Storage key: av-landing-theme
 *
 * Dashboard: light → html.bright  |  dark → :root (no bright)
 * Landing:   light → :root        |  dark → html.dark
 */
(function (global) {
  var CRM_KEY = "av-theme";
  var LANDING_KEY = "av-landing-theme";
  var mq =
    global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)");

  function isLanding() {
    try {
      return (
        document.documentElement.getAttribute("data-av-surface") === "landing"
      );
    } catch (e) {
      return false;
    }
  }

  function storageKey() {
    return isLanding() ? LANDING_KEY : CRM_KEY;
  }

  function systemTheme() {
    return mq && mq.matches ? "dark" : "light";
  }

  function stored() {
    try {
      var v = global.localStorage.getItem(storageKey());
      if (v === "light" || v === "dark") return v;
    } catch (e) {}
    return null;
  }

  function resolved() {
    var s = stored();
    if (s) return s;
    if (isLanding()) return "light";
    return systemTheme();
  }

  function apply(theme) {
    var root = document.documentElement;
    var dark = theme === "dark";
    root.classList.toggle("dark", dark);
    root.classList.toggle("bright", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var light = meta.getAttribute("data-theme-light");
      var darkC = meta.getAttribute("data-theme-dark");
      if (light && darkC) meta.setAttribute("content", dark ? darkC : light);
    }
    if (typeof global.AVThemeOnChange === "function") {
      try {
        global.AVThemeOnChange(theme);
      } catch (e) {}
    }
  }

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return resolved();
    try {
      global.localStorage.setItem(storageKey(), theme);
    } catch (e) {}
    apply(theme);
    return theme;
  }

  function toggle() {
    return setTheme(resolved() === "dark" ? "light" : "dark");
  }

  apply(resolved());

  if (mq) {
    var onChange = function () {
      if (!stored()) apply(resolved());
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(onChange);
    }
  }

  global.AVTheme = {
    resolved: resolved,
    stored: stored,
    toggle: toggle,
    set: setTheme,
    apply: function () {
      apply(resolved());
    },
  };
})(window);
