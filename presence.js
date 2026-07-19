(function (global) {
  var INACTIVITY_TIMEOUT = 300000;
  var HEARTBEAT_MIN_MS = 60000;
  var ACTIVITY_THROTTLE_MS = 2000;

  function PresenceManager() {
    var self = this;
    self.presence = {};
    self.inactivityTimer = null;
    self.initialized = false;
    self.currentStatus = 'OFFLINE';
    self.lastEmitAt = 0;
    self.lastActivityAt = 0;

    self.init = async function () {
      if (self.initialized) return;
      self.initialized = true;

      try {
        var resp = await global.AVApi.request('/api/v1/messages/presence');
        if (resp && resp.users) {
          resp.users.forEach(function (u) {
            self.presence[u.userId] = {
              status: u.status,
              isOnline: u.isOnline,
              lastSeenAt: u.lastSeenAt,
              fullName: u.fullName,
              role: u.role,
            };
          });
        }
      } catch (e) {
        // Silently fail - presence not critical
      }

      self.trackInactivity();
    };

    self.handleConnected = function () {
      self.updateStatus('ONLINE', true);
      self.resetInactivity(true);
    };

    self.handlePresenceUpdate = function (data) {
      self.presence[data.userId] = {
        status: data.status,
        isOnline: data.isOnline,
        lastSeenAt: data.lastSeenAt,
      };
      if (global.renderMsgConvos) global.renderMsgConvos();
      if (global.renderMsgThread) global.renderMsgThread();
    };

    self.getStatus = function (userId) {
      return self.presence[userId] || { status: 'OFFLINE', isOnline: false, lastSeenAt: null };
    };

    self.getStatusLabel = function (userId) {
      var p = self.getStatus(userId);
      if (p.status === 'ONLINE') return 'Active now';
      if (p.status === 'AWAY') return 'Away';
      if (p.status === 'BUSY') return 'Busy';
      if (p.lastSeenAt) {
        var d = new Date(p.lastSeenAt);
        var now = new Date();
        var diffMs = now - d;
        var diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return diffMin + 'm ago';
        var diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return diffHr + 'h ago';
        return d.toLocaleDateString();
      }
      return 'Offline';
    };

    self.isOnline = function (userId) {
      var p = self.getStatus(userId);
      return p.isOnline === true;
    };

    /**
     * Emit presence only when status changes, or when forced (connect),
     * or as a rare heartbeat while staying ONLINE.
     */
    self.updateStatus = function (status, force) {
      var now = Date.now();
      var same = status === self.currentStatus;
      if (!force && same) {
        if (status !== 'ONLINE') return;
        if (now - self.lastEmitAt < HEARTBEAT_MIN_MS) return;
      }
      self.currentStatus = status;
      self.lastEmitAt = now;
      if (global.AVChatSocket && global.AVChatSocket.connected) {
        global.AVChatSocket.updatePresence(status);
      }
    };

    self.trackInactivity = function () {
      // Avoid mousemove/scroll — they flood the server and exhaust the DB pool.
      var events = ['mousedown', 'keydown', 'touchstart', 'pointerdown'];
      function onActivity() {
        var now = Date.now();
        if (now - self.lastActivityAt < ACTIVITY_THROTTLE_MS) return;
        self.lastActivityAt = now;
        self.resetInactivity(false);
      }
      events.forEach(function (evt) {
        document.addEventListener(evt, onActivity, { passive: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          self.updateStatus('AWAY', true);
        } else {
          self.updateStatus('ONLINE', true);
          self.resetInactivity(true);
        }
      });
      self.resetInactivity(true);
    };

    self.resetInactivity = function (forceOnline) {
      clearTimeout(self.inactivityTimer);
      if (forceOnline || self.currentStatus === 'AWAY' || self.currentStatus === 'OFFLINE') {
        self.updateStatus('ONLINE', !!forceOnline);
      }
      self.inactivityTimer = setTimeout(function () {
        self.updateStatus('AWAY', true);
      }, INACTIVITY_TIMEOUT);
    };
  }

  global.AVPresence = new PresenceManager();
})(window);
