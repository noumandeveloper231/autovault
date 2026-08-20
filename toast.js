(function () {
  if (window.AVToast) return;

  var style = document.createElement("style");
  style.textContent = [
    ".av-toast-wrap{position:fixed;top:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:12px;pointer-events:none;max-width:min(92vw,460px)}",
    ".av-toast{pointer-events:auto;background:linear-gradient(180deg,#171C22 0%,#12161B 100%);border:1px solid #232A32;color:#EAECEF;border-radius:13px;padding:14px 16px;box-shadow:0 16px 40px rgba(0,0,0,.36);font-family:Inter,system-ui,sans-serif;display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:start;transform:translateY(-12px) scale(.98);opacity:0;transition:opacity .34s cubic-bezier(.16,.84,.44,1),transform .34s cubic-bezier(.16,.84,.44,1),background .2s ease,border-color .2s ease,color .2s ease,box-shadow .2s ease}",
    ".av-toast.show{opacity:1;transform:translateY(0) scale(1)}",
    ".av-toast-icon{width:10px;height:10px;border-radius:50%;margin-top:8px;background:#46B074;box-shadow:0 0 0 4px rgba(70,176,116,.18);border:0;animation:none;transition:background .2s ease,box-shadow .2s ease,width .2s ease,height .2s ease,margin-top .2s ease}",
    ".av-toast-title{font-weight:800;font-size:15px;line-height:1.24;margin:0 0 3px}",
    ".av-toast-msg{font-size:14px;line-height:1.5;color:#AAB3BE}",
    ".av-toast-close{background:none;border:0;color:#7F8A97;font-size:18px;line-height:1;cursor:pointer;padding:0 1px;transition:color .2s ease}",
    ".av-toast-close:hover{color:#EAECEF}",
    ".av-toast.av-warning .av-toast-icon{background:#F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.18)}",
    ".av-toast.av-error .av-toast-icon{background:#F87171;box-shadow:0 0 0 3px rgba(248,113,113,.18)}",
    ".av-toast.av-success .av-toast-icon{background:#46D392;box-shadow:0 0 0 3px rgba(70,211,146,.18)}",
    ".av-toast.av-info .av-toast-icon{background:#3AA0FF;box-shadow:0 0 0 3px rgba(58,160,255,.18)}",
    ".av-toast.av-loading .av-toast-icon{width:14px;height:14px;margin-top:5px;border-radius:50%;background:transparent;border:2px solid rgba(58,160,255,.28);border-top-color:#3AA0FF;box-shadow:none;animation:avToastSpin .65s linear infinite}",
    "html.bright .av-toast{background:linear-gradient(180deg,#FFFFFF 0%,#F5F6FB 100%);border-color:#E5E6F0;color:#0B0B14;box-shadow:0 16px 40px rgba(24,30,74,.14)}",
    "html.bright .av-toast-msg{color:#54566B}",
    "html.bright .av-toast-close{color:#6E7089}",
    "html.bright .av-toast-close:hover{color:#0B0B14}",
    "html.bright .av-toast.av-warning .av-toast-icon{box-shadow:0 0 0 3px rgba(245,158,11,.16)}",
    "html.bright .av-toast.av-error .av-toast-icon{box-shadow:0 0 0 3px rgba(229,72,77,.14)}",
    "html.bright .av-toast.av-success .av-toast-icon{box-shadow:0 0 0 3px rgba(18,164,107,.14)}",
    "html.bright .av-toast.av-info .av-toast-icon{box-shadow:0 0 0 3px rgba(39,67,232,.12)}",
    "html.bright .av-toast.av-loading .av-toast-icon{border-color:rgba(39,67,232,.2);border-top-color:#2743E8}",
    "html.dark .av-toast{background:linear-gradient(180deg,#171C22 0%,#12161B 100%);border-color:#232A32;color:#EAECEF;box-shadow:0 16px 40px rgba(0,0,0,.36)}",
    "html.dark .av-toast-msg{color:#AAB3BE}",
    "html.dark .av-toast-close{color:#7F8A97}",
    "html.dark .av-toast-close:hover{color:#EAECEF}",
    "@keyframes avToastSpin{to{transform:rotate(360deg)}}",
    "@media(max-width:640px){.av-toast-wrap{left:12px;right:12px;top:12px;max-width:none}}",
  ].join("");
  document.head.appendChild(style);

  var wrap;
  function getWrap() {
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "av-toast-wrap";
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function dismissToast(node, delay) {
    function remove() {
      node.classList.remove("show");
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 360);
    }
    if (delay == null) remove();
    else setTimeout(remove, Math.max(1500, delay));
    return remove;
  }

  function tr(s) {
    return typeof window.avT === "function" ? window.avT(s) : s;
  }

  function notify(options) {
    var opts = options || {};
    var type = opts.type || "success";
    var title = tr(opts.title || "Notice");
    var message = tr(opts.message || "");
    var duration = Number(opts.duration || 3800);

    var node = document.createElement("div");
    node.className = "av-toast av-" + type;
    node.innerHTML =
      '<span class="av-toast-icon"></span>' +
      '<div><div class="av-toast-title"></div><div class="av-toast-msg"></div></div>' +
      '<button class="av-toast-close" type="button" aria-label="Close">×</button>';
    node.querySelector(".av-toast-title").textContent = title;
    node.querySelector(".av-toast-msg").textContent = message;

    var remove = dismissToast.bind(null, node);
    node.querySelector(".av-toast-close").addEventListener("click", function () {
      remove();
    });
    getWrap().appendChild(node);
    requestAnimationFrame(function () {
      node.classList.add("show");
    });
    dismissToast(node, duration);
  }

  function settleToast(node, type, title, message, duration) {
    node.className = "av-toast show av-" + type;
    var titleEl = node.querySelector(".av-toast-title");
    var msgEl = node.querySelector(".av-toast-msg");
    title = tr(title || "");
    message = tr(message || "");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (!node.querySelector(".av-toast-close")) {
      var close = document.createElement("button");
      close.className = "av-toast-close";
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.textContent = "×";
      close.addEventListener("click", function () {
        dismissToast(node);
      });
      node.appendChild(close);
    }

    dismissToast(node, duration == null ? 3800 : duration);
  }

  window.AVToast = {
    show: notify,
    success: function (message, title) {
      notify({ type: "success", title: title || "Success", message: message || "" });
    },
    warning: function (message, title) {
      notify({ type: "warning", title: title || "Warning", message: message || "" });
    },
    error: function (message, title) {
      notify({
        type: "error",
        title: title || "Something went wrong",
        message: message || "",
      });
    },
    info: function (message, title) {
      notify({ type: "info", title: title || "Working", message: message || "" });
    },
    promise: function (promise, opts) {
      var o = opts || {};
      var node = document.createElement("div");
      node.className = "av-toast av-loading";
      node.innerHTML =
        '<span class="av-toast-icon" aria-hidden="true"></span>' +
        '<div><div class="av-toast-title"></div><div class="av-toast-msg"></div></div>';
      node.querySelector(".av-toast-title").textContent = tr(
        o.loading || "Saving\u2026",
      );
      node.querySelector(".av-toast-msg").textContent = tr(
        o.loadingMsg || "Please wait",
      );
      getWrap().appendChild(node);
      requestAnimationFrame(function () {
        node.classList.add("show");
      });

      return Promise.resolve(promise)
        .then(function (val) {
          settleToast(
            node,
            "success",
            o.successTitle || "Success",
            o.success || "Saved",
            o.duration
          );
          return val;
        })
        .catch(function (err) {
          settleToast(
            node,
            "error",
            o.errorTitle || "Something went wrong",
            (err && err.message) || o.error || "Something went wrong",
            o.duration
          );
          throw err;
        });
    },
  };
})();
