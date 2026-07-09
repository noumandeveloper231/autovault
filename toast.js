(function () {
  if (window.AVToast) return;

  var style = document.createElement("style");
  style.textContent = [
    ".av-toast-wrap{position:fixed;right:18px;bottom:18px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:min(92vw,420px)}",
    ".av-toast{pointer-events:auto;background:linear-gradient(180deg,#171C22 0%,#12161B 100%);border:1px solid #232A32;color:#EAECEF;border-radius:12px;padding:12px 14px;box-shadow:0 16px 40px rgba(0,0,0,.36);font-family:Inter,system-ui,sans-serif;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;transform:translateY(10px);opacity:0;transition:opacity .2s ease,transform .2s ease}",
    ".av-toast.show{opacity:1;transform:translateY(0)}",
    ".av-toast-icon{width:8px;height:8px;border-radius:50%;margin-top:7px;background:#46B074;box-shadow:0 0 0 3px rgba(70,176,116,.18)}",
    ".av-toast-title{font-weight:700;font-size:13px;line-height:1.2;margin:0 0 2px}",
    ".av-toast-msg{font-size:12.5px;line-height:1.45;color:#AAB3BE}",
    ".av-toast-close{background:none;border:0;color:#7F8A97;font-size:16px;line-height:1;cursor:pointer;padding:0 1px}",
    ".av-toast.av-warning .av-toast-icon{background:#F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.18)}",
    ".av-toast.av-error .av-toast-icon{background:#F87171;box-shadow:0 0 0 3px rgba(248,113,113,.18)}",
    ".av-toast.av-success .av-toast-icon{background:#46D392;box-shadow:0 0 0 3px rgba(70,211,146,.18)}",
    "@media(max-width:640px){.av-toast-wrap{left:12px;right:12px;bottom:12px;max-width:none}}",
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

  function notify(options) {
    var opts = options || {};
    var type = opts.type || "success";
    var title = opts.title || "Notice";
    var message = opts.message || "";
    var duration = Number(opts.duration || 3800);

    var node = document.createElement("div");
    node.className = "av-toast av-" + type;
    node.innerHTML =
      '<span class="av-toast-icon"></span>' +
      '<div><div class="av-toast-title"></div><div class="av-toast-msg"></div></div>' +
      '<button class="av-toast-close" type="button" aria-label="Close">×</button>';
    node.querySelector(".av-toast-title").textContent = title;
    node.querySelector(".av-toast-msg").textContent = message;

    function remove() {
      node.classList.remove("show");
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 200);
    }

    node.querySelector(".av-toast-close").addEventListener("click", remove);
    getWrap().appendChild(node);
    requestAnimationFrame(function () {
      node.classList.add("show");
    });
    setTimeout(remove, Math.max(1500, duration));
  }

  window.AVToast = {
    show: notify,
    success: function (message, title) {
      notify({ type: "success", title: title || "Success", message: message });
    },
    warning: function (message, title) {
      notify({ type: "warning", title: title || "Warning", message: message });
    },
    error: function (message, title) {
      notify({ type: "error", title: title || "Something went wrong", message: message });
    },
  };
})();
