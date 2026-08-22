(function (global) {
  function isLocalDevHost(hostname) {
    hostname = String(hostname || location.hostname || "").toLowerCase();
    if (!hostname) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
  }

  function resolveApiUrl() {
    if (global.AUTOVAULT_API_URL) {
      return String(global.AUTOVAULT_API_URL).replace(/\/$/, "");
    }
    if (isLocalDevHost(location.hostname)) {
      return `http://${location.hostname}:3000`;
    }
    return "https://api.autovault360.com";
  }

  global.AVApiConfig = {
    isLocalDevHost,
    resolveApiUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
