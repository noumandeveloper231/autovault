(function (global) {
  var SOCKET_URL = (global.AUTOVAULT_API_URL || (
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:3000'
      : 'https://autovault-backend-cbdp.onrender.com'
  ));

  var ACCESS_KEY = 'avAuthToken';
  var OWNER_ACCESS_KEY = 'avOwnerToken';
  var PORTAL_KEY = 'avAuthPortal';

  function getToken() {
    try {
      if (sessionStorage.getItem('avImpersonation') && sessionStorage.getItem('avImpAccessToken')) {
        return sessionStorage.getItem('avImpAccessToken') || '';
      }
    } catch (_) {}
    if (global.AVApi && typeof global.AVApi.getAccessToken === 'function') {
      try { return global.AVApi.getAccessToken() || ''; } catch (_) {}
    }
    var portal = (localStorage.getItem(PORTAL_KEY) || '').toLowerCase();
    if (portal === 'owner') return localStorage.getItem(OWNER_ACCESS_KEY) || '';
    return localStorage.getItem(ACCESS_KEY) || '';
  }

  function ChatSocket() {
    var self = this;
    self.socket = null;
    self.connected = false;
    self.reconnecting = false;
    self.handlers = {};
    self.pendingMessages = [];

    self.connect = function () {
      if (self.socket && self.socket.connected) return;
      var token = getToken();
      if (!token) return;

      self.socket = io(SOCKET_URL, {
        auth: { token: token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
      });

      self.socket.on('connect', function () {
        self.connected = true;
        self.reconnecting = false;
        if (global.AVPresence) global.AVPresence.handleConnected();
        var banner = document.getElementById('imsgReconnectBanner');
        if (banner) banner.style.display = 'none';
        flushPending();
      });

      self.socket.on('disconnect', function () {
        self.connected = false;
        self.reconnecting = true;
        var banner = document.getElementById('imsgReconnectBanner');
        if (banner) banner.style.display = 'flex';
      });

      self.socket.on('connect_error', function () {
        self.connected = false;
        self.reconnecting = true;
      });

      self.socket.on('message:new', function (msg) {
        if (self.handlers['message:new']) self.handlers['message:new'](msg);
      });

      self.socket.on('message:updated', function (msg) {
        if (self.handlers['message:updated']) self.handlers['message:updated'](msg);
      });

      self.socket.on('message:marked-read', function (data) {
        if (self.handlers['message:read']) self.handlers['message:read'](data);
      });

      self.socket.on('message:reaction', function (data) {
        if (self.handlers['message:reaction']) self.handlers['message:reaction'](data);
      });

      self.socket.on('typing:indicator', function (data) {
        if (self.handlers['typing:indicator']) self.handlers['typing:indicator'](data);
      });

      self.socket.on('presence:update', function (data) {
        if (self.handlers['presence:update']) self.handlers['presence:update'](data);
      });

      self.socket.on('conversation:read', function (data) {
        if (self.handlers['conversation:read']) self.handlers['conversation:read'](data);
      });

      self.socket.on('conversation:updated', function (data) {
        if (self.handlers['conversation:updated']) self.handlers['conversation:updated'](data);
      });
    };

    self.on = function (event, fn) {
      self.handlers[event] = fn;
    };

    self.off = function (event) {
      delete self.handlers[event];
    };

    self.sendMessage = function (conversationId, messageText, metadata, replyToId) {
      return new Promise(function (resolve, reject) {
        if (!self.socket || !self.connected) {
          self.pendingMessages.push({ conversationId, messageText, metadata, replyToId, resolve, reject });
          return;
        }
        self.socket.emit('message:send', {
          conversationId: conversationId,
          messageText: messageText,
          metadata: metadata || null,
          replyToId: replyToId || null,
        }, function (ack) {
          if (ack && ack.error) reject(new Error(ack.error));
          else if (ack && ack.message) resolve(ack.message);
          else reject(new Error('No ack from server'));
        });
      });
    };

    self.markRead = function (conversationId, messageId) {
      if (!self.socket || !self.connected) return;
      self.socket.emit('message:read', {
        conversationId: conversationId,
        messageId: messageId || null,
      });
    };

    self.sendTyping = function (conversationId, isTyping) {
      if (!self.socket || !self.connected) return;
      self.socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: conversationId });
    };

    self.updatePresence = function (status) {
      if (!self.socket || !self.connected) return;
      self.socket.emit('presence:update', { status: status });
    };

    self.sendReaction = function (messageId, emoji) {
      if (!self.socket || !self.connected) return;
      self.socket.emit('message:react', { messageId: messageId, emoji: emoji });
    };

    self.disconnect = function () {
      if (self.socket) self.socket.disconnect();
      self.connected = false;
    };

    function flushPending() {
      var list = self.pendingMessages.slice();
      self.pendingMessages = [];
      list.forEach(function (p) {
        self.socket.emit('message:send', {
          conversationId: p.conversationId,
          messageText: p.messageText,
          metadata: p.metadata || null,
          replyToId: p.replyToId || null,
        }, function (ack) {
          if (ack && ack.error) p.reject(new Error(ack.error));
          else if (ack && ack.message) p.resolve(ack.message);
          else p.reject(new Error('No ack'));
        });
      });
    }
  }

  global.AVChatSocket = new ChatSocket();
})(window);
