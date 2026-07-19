(function (global) {
  var MSG_PALETTE = ['#3aa0ff', '#23d18b', '#ff9f43', '#7c5cff', '#ff5470', '#2dd4bf', '#f472b6', '#a78bfa'];

  global.msgState = {
    conversations: [],
    activeId: null,
    users: {},
    cursors: {},
    hasMore: {},
    loadingMsgs: {},
    attachedVehicle: null,
    unreadTotal: 0,
    initDone: false,
    loadingConversations: false,
    loadingMessages: false,
  };

  var state = global.msgState;

  function currentUserId() {
    if (global.crmOwner && global.crmOwner.id) return global.crmOwner.id;
    try {
      var token = '';
      if (sessionStorage.getItem('avImpersonation') && sessionStorage.getItem('avImpAccessToken')) {
        token = sessionStorage.getItem('avImpAccessToken') || '';
      } else if (global.AVApi && typeof global.AVApi.getAccessToken === 'function') {
        token = global.AVApi.getAccessToken() || '';
      } else {
        var portal = (localStorage.getItem('avAuthPortal') || '').toLowerCase();
        var key = portal === 'owner' ? 'avOwnerToken' : 'avAuthToken';
        token = localStorage.getItem(key) || '';
      }
      if (!token) return null;
      var part = token.split('.')[1];
      if (!part) return null;
      var claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      return claims.sub || null;
    } catch (e) {
      return null;
    }
  }

  function currentUserName() {
    if (global.crmOwner && global.crmOwner.name) return global.crmOwner.name;
    try {
      var token = '';
      if (sessionStorage.getItem('avImpersonation') && sessionStorage.getItem('avImpAccessToken')) {
        token = sessionStorage.getItem('avImpAccessToken') || '';
      } else if (global.AVApi && typeof global.AVApi.getAccessToken === 'function') {
        token = global.AVApi.getAccessToken() || '';
      } else {
        var portal = (localStorage.getItem('avAuthPortal') || '').toLowerCase();
        var key = portal === 'owner' ? 'avOwnerToken' : 'avAuthToken';
        token = localStorage.getItem(key) || '';
      }
      if (!token) return '';
      var part = token.split('.')[1];
      if (!part) return '';
      var claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      return claims.name || '';
    } catch (e) {
      return '';
    }
  }

  function msgColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return MSG_PALETTE[h % MSG_PALETTE.length];
  }

  function msgInitials(name) {
    return name.replace(/[^A-Za-z. ]/g, '').split(/[ .]+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  function msgEsc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return 'now';
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatDateSeparator(dateStr) {
    var d = new Date(dateStr);
    var now = new Date();
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  function getConvName(conv) {
    if (conv.type === 'GROUP') return conv.name || 'Unnamed Group';
    var me = currentUserId();
    var other = (conv.participants || []).filter(function (p) { return p.id !== me; });
    if (other.length === 0 && conv.participants) other = [conv.participants[0]];
    if (other.length > 0) return other[0].fullName;
    return 'Unknown';
  }

  function getConvAvatar(conv) {
    if (conv.type === 'GROUP') {
      return { initials: (conv.name || 'UG').slice(0, 2).toUpperCase(), color: '#7c5cff' };
    }
    var me = currentUserId();
    var other = (conv.participants || []).filter(function (p) { return p.id !== me; });
    if (other.length === 0 && conv.participants) other = [conv.participants[0]];
    var name = other.length > 0 ? other[0].fullName : '?';
    return { initials: msgInitials(name), color: msgColor(name) };
  }

  function getConvPreview(conv) {
    var last = conv.lastMessageText;
    if (!last) return 'No messages yet';
    var prefix = '';
    if (conv.lastMessageSender && conv.lastMessageSender !== currentUserName()) {
      prefix = conv.lastMessageSender.split(' ')[0] + ': ';
    }
    return prefix + (last.length > 80 ? last.slice(0, 80) + '\u2026' : last);
  }

  // ── Initialization ──────────────────────────────────────────────────

  global.initMessaging = async function () {
    if (state.initDone) {
      if (state.loadingConversations) {
        renderConvoSkeleton();
      } else {
        renderMsgConvos();
      }
      if (state.loadingMessages) {
        renderMessageSkeleton();
      } else if (state.activeId) {
        renderMsgThread();
      } else {
        renderEmptyChat();
      }
      updateMsgBadge();
      return;
    }

    state.initDone = true;
    state.conversations = [];
    state.activeId = null;

    renderConvoSkeleton();
    renderEmptyChat();
    setComposeLoading(true, 'Loading conversations\u2026');

    await loadConversations();

    if (global.AVChatSocket) global.AVChatSocket.connect();
    if (global.AVPresence) global.AVPresence.init();

    setupSocketHandlers();
  };

  async function loadConversations() {
    state.loadingConversations = true;
    renderConvoSkeleton();
    try {
      var resp = await global.AVApi.request('/api/v1/messages/conversations');
      state.conversations = (resp.conversations || []).map(function (c) { return normalizeConv(c); });
    } catch (e) {
      state.conversations = [];
    }
    state.loadingConversations = false;
    updateUnreadTotal();
    renderMsgConvos();
    updateMsgBadge();
    if (!state.activeId) {
      setComposeEnabled(false, 'Select a conversation to start messaging');
    }
  }

  // ── Loading skeletons ───────────────────────────────────────────────

  function renderConvoSkeleton(count) {
    var host = document.getElementById('imsgConvos');
    if (!host) return;
    var n = count || 7;
    var html = '';
    for (var i = 0; i < n; i++) {
      var nameW = i % 3 === 0 ? 'w55' : (i % 3 === 1 ? 'w70' : 'w40');
      var prevW = i % 2 === 0 ? 'w90' : 'w70';
      html += '<div class="imsg-skel-convo" aria-hidden="true">' +
        '<div class="imsg-skel imsg-skel-avatar"></div>' +
        '<div class="imsg-skel-lines">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<div class="imsg-skel imsg-skel-line ' + nameW + '"></div>' +
        '<div class="imsg-skel imsg-skel-time"></div>' +
        '</div>' +
        '<div class="imsg-skel imsg-skel-line ' + prevW + '"></div>' +
        '</div></div>';
    }
    host.innerHTML = html;
  }

  function renderMessageSkeleton() {
    var body = document.getElementById('imsgChatBody');
    if (!body) return;
    body.classList.add('is-loading');
    body.innerHTML =
      '<div class="imsg-skel-thread" aria-hidden="true">' +
      '<div class="imsg-skel-bubble-row them"><div class="imsg-skel imsg-skel-bubble md"></div></div>' +
      '<div class="imsg-skel-bubble-row them"><div class="imsg-skel imsg-skel-bubble sm"></div></div>' +
      '<div class="imsg-skel-bubble-row me"><div class="imsg-skel imsg-skel-bubble lg"></div></div>' +
      '<div class="imsg-skel-bubble-row me"><div class="imsg-skel imsg-skel-bubble md"></div></div>' +
      '<div class="imsg-skel-bubble-row them"><div class="imsg-skel imsg-skel-bubble lg"></div></div>' +
      '<div class="imsg-skel-bubble-row me"><div class="imsg-skel imsg-skel-bubble sm"></div></div>' +
      '<div class="imsg-skel-bubble-row them"><div class="imsg-skel imsg-skel-bubble md"></div></div>' +
      '<div class="imsg-skel-bubble-row me"><div class="imsg-skel imsg-skel-bubble lg"></div></div>' +
      '</div>';
  }

  function renderHeadSkeleton() {
    var head = document.getElementById('imsgChatHead');
    if (!head) return;
    head.innerHTML =
      '<div class="imsg-skel-head" aria-hidden="true">' +
      '<div class="imsg-skel imsg-skel-avatar"></div>' +
      '<div class="imsg-skel-lines" style="gap:7px;">' +
      '<div class="imsg-skel imsg-skel-line w40"></div>' +
      '<div class="imsg-skel imsg-skel-line w25"></div>' +
      '</div></div>';
  }

  function renderContactSkeleton(count) {
    var host = document.getElementById('msgNewList');
    if (!host) return;
    var n = count || 5;
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<div class="imsg-skel-contact" aria-hidden="true">' +
        '<div class="imsg-skel imsg-skel-avatar"></div>' +
        '<div class="imsg-skel-lines">' +
        '<div class="imsg-skel imsg-skel-line ' + (i % 2 ? 'w55' : 'w70') + '"></div>' +
        '<div class="imsg-skel imsg-skel-line w30"></div>' +
        '</div></div>';
    }
    host.innerHTML = html;
  }

  function renderEmptyChat() {
    var body = document.getElementById('imsgChatBody');
    if (body) {
      body.classList.remove('is-loading');
      body.innerHTML =
        '<div class="imsg-empty-chat">' +
        '<strong>Your messages</strong>' +
        '<span>Select a conversation or start a new one.</span>' +
        '</div>';
    }
    var head = document.getElementById('imsgChatHead');
    if (head) head.innerHTML = '';
    setComposeEnabled(false, 'Select a conversation to start messaging');
  }

  function setComposeLoading(loading, placeholder) {
    var compose = document.getElementById('imsgCompose');
    var inp = document.getElementById('imsgInput');
    var attach = document.getElementById('imsgAttachBtn');
    var send = document.getElementById('imsgSendBtn');
    if (compose) compose.classList.toggle('is-loading', !!loading);
    if (inp) {
      inp.disabled = true;
      if (placeholder) inp.placeholder = placeholder;
    }
    if (attach) attach.disabled = true;
    if (send) send.disabled = true;
  }

  function setComposeEnabled(enabled, placeholder) {
    var compose = document.getElementById('imsgCompose');
    var inp = document.getElementById('imsgInput');
    var attach = document.getElementById('imsgAttachBtn');
    var send = document.getElementById('imsgSendBtn');
    if (compose) compose.classList.remove('is-loading');
    if (inp) {
      inp.disabled = !enabled;
      inp.placeholder = placeholder || (enabled ? 'Type a message' : 'Select a conversation to start messaging');
    }
    if (attach) attach.disabled = !enabled;
    if (send) send.disabled = !enabled;
  }

  function normalizeConv(c) {
    c.participants = c.participants || [];
    c._name = getConvName(c);
    c._avatar = getConvAvatar(c);
    c._preview = getConvPreview(c);
    c._unread = c.unreadCount || 0;
    return c;
  }

  function updateUnreadTotal() {
    state.unreadTotal = state.conversations.reduce(function (s, c) { return s + (c._unread || 0); }, 0);
  }

  // ── Socket Handlers ─────────────────────────────────────────────────

  function setupSocketHandlers() {
    var socket = global.AVChatSocket;
    if (!socket) return;

    socket.on('message:new', function (msg) {
      var conv = state.conversations.find(function (c) { return c.id === msg.conversationId; });
      if (!conv) return loadConversations();
      conv.lastMessageAt = msg.createdAt;
      conv.lastMessageText = msg.messageText;
      conv.lastMessageSender = msg.sender ? msg.sender.fullName : '';
      conv._preview = getConvPreview(conv);

      var myId = currentUserId();
      var isOwn = msg.sender && msg.sender.id === myId;

      if (state.activeId !== msg.conversationId && !isOwn) {
        conv._unread = (conv._unread || 0) + 1;
      }
      sortConversations();
      updateUnreadTotal();
      updateMsgBadge();
      renderMsgConvos();

      if (state.activeId === msg.conversationId) {
        if (!conv._messages) conv._messages = [];
        var exists = conv._messages.some(function (m) {
          return m.id === msg.id || (m._tempId && isOwn && m.messageText === msg.messageText);
        });
        if (exists) {
          // Replace optimistic/temp copy with the real message
          for (var i = 0; i < conv._messages.length; i++) {
            var m = conv._messages[i];
            if (m.id === msg.id || (m._tempId && isOwn && (m._status === 'sending' || m._status === 'sent'))) {
              conv._messages[i] = Object.assign({}, msg, { _status: 'sent' });
              break;
            }
          }
          renderMsgThread();
        } else {
          appendMessageToThread(msg);
        }
      }
    });

    socket.on('typing:indicator', function (data) {
      if (data.conversationId === state.activeId) {
        showTypingIndicator(data.userId, data.isTyping);
      }
    });

    socket.on('presence:update', function (data) {
      if (global.AVPresence) global.AVPresence.handlePresenceUpdate(data);
    });

    socket.on('message:read', function (data) {
      if (data.conversationId === state.activeId) {
        updateMessageStatus(data.messageId, 'read');
      }
    });

    socket.on('conversation:updated', function () {
      loadConversations();
    });
  }

  // ── Typing Indicator ────────────────────────────────────────────────

  var typingTimers = {};

  function showTypingIndicator(userId, isTyping) {
    var el = document.getElementById('imsgTypingIndicator');
    if (!el) return;
    if (isTyping) {
      var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
      var other = (conv ? conv.participants : []).find(function (p) { return p.id === userId; });
      var name = other ? other.fullName.split(' ')[0] : 'Someone';
      el.innerHTML = '<span class="imsg-typing-dots"><span></span><span></span><span></span></span> ' + msgEsc(name) + ' is typing\u2026';
      el.style.display = 'flex';
      clearTimeout(typingTimers[userId]);
      typingTimers[userId] = setTimeout(function () {
        if (el.dataset.userId === userId) el.style.display = 'none';
      }, 4000);
      el.dataset.userId = userId;
    } else {
      if (el.dataset.userId === userId) el.style.display = 'none';
    }
  }

  // ── Conversation List Render ───────────────────────────────────────

  global.renderMsgConvos = function () {
    var host = document.getElementById('imsgConvos');
    if (!host) return;
    if (state.loadingConversations) {
      renderConvoSkeleton();
      return;
    }
    var q = (document.getElementById('imsgSearch') ? document.getElementById('imsgSearch').value.toLowerCase() : '');
    var list = state.conversations;
    if (q) {
      list = list.filter(function (c) {
        return c._name.toLowerCase().includes(q) || (c.lastMessageText || '').toLowerCase().includes(q);
      });
    }
    if (list.length === 0) {
      host.innerHTML = '<div style="padding:30px 16px;text-align:center;color:var(--muted);font-size:13px;">' +
        (q ? 'No conversations match your search.' : 'No conversations yet. Start a new message!') + '</div>';
      return;
    }
    host.innerHTML = list.map(function (c) {
      var isActive = c.id === state.activeId;
      var avatar = c._avatar;
      var online = false;
      if (c.type !== 'GROUP' && c.participants) {
        var other = c.participants.find(function (p) { return p.id !== currentUserId(); });
        if (other && global.AVPresence) online = global.AVPresence.isOnline(other.id);
      }
      var onlineDot = online ? '<span class="imsg-online-dot"></span>' : '';
      var un = c._unread || 0;
      return '<div class="imsg-convo ' + (isActive ? 'active' : '') + ' ' + (un > 0 ? 'unread' : '') + '" onclick="openMsgConvo(\'' + c.id + '\')">' +
        '<div class="imsg-avatar" style="background:' + avatar.color + '">' + msgEsc(avatar.initials) + onlineDot + '</div>' +
        '<div class="imsg-convo-info">' +
        '<div class="imsg-convo-top"><span class="imsg-convo-name">' + msgEsc(c._name) + '</span><span class="imsg-convo-time">' + timeAgo(c.lastMessageAt) + '</span></div>' +
        '<div class="imsg-convo-preview">' + msgEsc(c._preview) + '</div>' +
        '</div>' +
        (un > 0 ? '<span class="imsg-unread-dot">' + (un > 99 ? '99+' : un) + '</span>' : '') +
        '</div>';
    }).join('');
  };

  // ── Open Conversation ──────────────────────────────────────────────

  global.openMsgConvo = async function (id) {
    state.activeId = id;
    var conv = state.conversations.find(function (c) { return c.id === id; });
    if (!conv) return;

    conv._unread = 0;
    updateUnreadTotal();
    updateMsgBadge();
    renderMsgConvos();

    state.loadingMessages = true;
    state.loadingMsgs[id] = true;
    renderHeadSkeleton();
    renderMessageSkeleton();
    setComposeLoading(true, 'Loading messages\u2026');

    try {
      var resp = await global.AVApi.request('/api/v1/messages/conversations/' + id + '/messages?limit=50');
      // Ignore stale responses if user switched conversations mid-load
      if (state.activeId !== id) return;

      state.cursors[id] = resp.cursor || null;
      state.hasMore[id] = resp.hasMore || false;
      conv._messages = resp.messages || [];

      if (global.AVChatSocket && global.AVChatSocket.connected) {
        global.AVChatSocket.markRead(id);
      }
      try {
        await global.AVApi.request('/api/v1/messages/conversations/' + id + '/read', { method: 'POST' });
      } catch (e) {}

      state.loadingMessages = false;
      state.loadingMsgs[id] = false;

      var head = document.getElementById('imsgChatHead');
      if (head) renderChatHead(conv, head);
      renderMsgThread();
      setComposeEnabled(true, 'Type a message');
      var inp = document.getElementById('imsgInput');
      if (inp) inp.focus();
    } catch (e) {
      if (state.activeId !== id) return;
      state.loadingMessages = false;
      state.loadingMsgs[id] = false;
      var body = document.getElementById('imsgChatBody');
      if (body) {
        body.classList.remove('is-loading');
        body.innerHTML = '<div class="imsg-empty-chat"><strong>Couldn\'t load messages</strong><span>' +
          msgEsc(e.message || 'Unknown error') + '</span></div>';
      }
      setComposeEnabled(false, 'Unable to load conversation');
      showError('Failed to load conversation: ' + (e.message || 'Unknown error'));
    }
  };

  function renderChatHead(conv, el) {
    var avatar = conv._avatar;
    var online = false;
    var statusText = 'Offline';
    if (conv.type === 'GROUP') {
      var count = (conv.participants || []).length;
      statusText = count + ' participants';
    } else {
      var other = (conv.participants || []).find(function (p) { return p.id !== currentUserId(); });
      if (other) {
        var pres = global.AVPresence ? global.AVPresence.getStatus(other.id) : null;
        online = pres ? pres.isOnline : false;
        statusText = pres ? global.AVPresence.getStatusLabel(other.id) : 'Offline';
      }
    }
    var onlineDot = online ? '<span class="imsg-online-dot"></span>' : '';
    el.innerHTML = '<div class="imsg-avatar" style="background:' + avatar.color + ';width:34px;height:34px;font-size:12px;">' + msgEsc(avatar.initials) + onlineDot + '</div>' +
      '<div style="flex:1;min-width:0;"><b>' + msgEsc(conv._name) + '</b><div class="imsg-status' + (online ? ' online' : '') + '">' + msgEsc(statusText) + '</div></div>';
  }

  // ── Message Thread Render ──────────────────────────────────────────

  global.renderMsgThread = function () {
    var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
    var body = document.getElementById('imsgChatBody');
    if (!body) return;

    if (state.loadingMessages) {
      renderMessageSkeleton();
      return;
    }

    body.classList.remove('is-loading');

    if (!state.activeId) {
      renderEmptyChat();
      return;
    }

    if (!conv || !conv._messages || conv._messages.length === 0) {
      body.innerHTML = '<div class="imsg-empty-chat">' +
        '<strong>No messages yet</strong>' +
        '<span>Send the first message!</span>' +
        '</div>';
      return;
    }

    var html = '';
    var lastDate = null;
    var lastSenderId = null;

    conv._messages.forEach(function (m, i) {
      if (m.deletedAt) {
        html += '<div class="imsg-bubble-row deleted' + (i === 0 ? '' : '') + '"><div class="imsg-bubble-deleted">This message was deleted</div></div>';
        lastSenderId = null;
        return;
      }

      var msgDate = new Date(m.createdAt).toDateString();
      if (msgDate !== lastDate) {
        html += '<div class="imsg-date-sep"><span>' + formatDateSeparator(m.createdAt) + '</span></div>';
        lastDate = msgDate;
        lastSenderId = null;
      }

      var isMe = m.sender && m.sender.id === currentUserId();
      var side = isMe ? 'me' : 'them';

      var gap = (lastSenderId !== null && lastSenderId !== (m.sender ? m.sender.id : null)) ? ' gap' : (i === 0 ? '' : '');
      lastSenderId = m.sender ? m.sender.id : null;

      var senderHtml = '';
      if (conv.type === 'GROUP' && !isMe && (!conv._messages[i - 1] || conv._messages[i - 1].senderId !== m.senderId)) {
        senderHtml = '<div class="imsg-sender">' + msgEsc(m.sender ? m.sender.fullName : 'Unknown') + '</div>';
      }

      var content = '';
      if (m.metadata && m.metadata.vehiclePreview) {
        var v = m.metadata.vehiclePreview;
        var title = [v.year, v.make, v.model].filter(Boolean).join(' ');
        var vinTail = v.vin ? String(v.vin).slice(-8) : '';
        var priceLabel = '$' + Number(v.price || 0).toLocaleString();
        content = '<button type="button" class="imsg-veh-card" onclick="event.stopPropagation();openDealJacket(\'' + msgEsc(v.vin || '') + '\',\'messages\')">' +
          '<div class="ivc-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17v-6h18v6M5 17v3M19 17v3M3 11l2-5h14l2 5"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg></div>' +
          '<div class="ivc-info">' +
          '<div class="ivc-title">' + msgEsc(title) + '</div>' +
          '<div class="ivc-sub">' + msgEsc(vinTail) + (vinTail ? ' \u00b7 ' : '') + priceLabel + '</div>' +
          '</div>' +
          '<div class="ivc-arrow" aria-hidden="true">\u203a</div>' +
          '</button>';
      }

      var textHtml = m.messageText ? '<div class="imsg-bubble-text">' + linkify(msgEsc(m.messageText)) + '</div>' : '';
      var editedHtml = m.editedAt ? '<span class="imsg-edited">(edited)</span>' : '';

      var statusIcon = '';
      if (isMe) {
        if (m._status === 'sending') statusIcon = '<span class="imsg-status-icon sending" title="Sending">\u23F3</span>';
        else if (m._status === 'failed') statusIcon = '<span class="imsg-status-icon failed" title="Failed - click to retry" onclick="retrySendMessage(\'' + m._tempId + '\')">\u26A0</span>';
        else statusIcon = '<span class="imsg-status-icon sent" title="Sent">\u2713</span>';
      }

      html += '<div class="imsg-bubble-row ' + side + gap + '" data-msg-id="' + (m.id || m._tempId) + '">' +
        senderHtml +
        '<div class="imsg-bubble">' +
        content +
        textHtml +
        '<div class="imsg-bubble-meta">' +
        statusIcon +
        '<span class="imsg-time">' + formatTime(m.createdAt) + '</span>' +
        editedHtml +
        '</div>' +
        '</div>' +
        '</div>';
    });

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
    clearTypingIndicator();
  };

  function linkify(text) {
    var urlRe = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRe, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function appendMessageToThread(msg) {
    var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
    if (!conv) return;
    if (!conv._messages) conv._messages = [];
    conv._messages.push(msg);
    renderMsgThread();
    var body = document.getElementById('imsgChatBody');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function updateMessageStatus(messageId, status) {
    var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
    if (!conv || !conv._messages) return;
    var msg = conv._messages.find(function (m) { return m.id === messageId; });
    if (msg) {
      msg._status = status;
      renderMsgThread();
    }
  }

  function clearTypingIndicator() {
    var el = document.getElementById('imsgTypingIndicator');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  // ── Send Message ──────────────────────────────────────────────────

  global.msgSend = async function () {
    var inp = document.getElementById('imsgInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text && !state.attachedVehicle) return;

    var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
    if (!conv) return;

    var metadata = null;
    if (state.attachedVehicle) {
      var vid = state.attachedVehicle.id;
      var isUuid = typeof vid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vid);
      metadata = {
        vehicleVin: state.attachedVehicle.vin,
        vehiclePreview: {
          year: Number(state.attachedVehicle.year) || 0,
          make: state.attachedVehicle.make || '',
          model: state.attachedVehicle.model || '',
          vin: state.attachedVehicle.vin || '',
          price: Number(state.attachedVehicle.askingPrice || state.attachedVehicle.price || 0),
        },
      };
      if (isUuid) metadata.vehicleId = vid;
    }

    // Allow vehicle-only sends
    if (!text && !metadata) return;

    inp.value = '';
    state.attachedVehicle = null;
    var attachPreview = document.getElementById('imsgAttachPreview');
    if (attachPreview) attachPreview.style.display = 'none';

    var tempId = '_temp_' + Date.now();
    var optimisticMsg = {
      _tempId: tempId,
      id: tempId,
      conversationId: conv.id,
      sender: { id: currentUserId(), fullName: currentUserName() },
      messageText: text,
      metadata: metadata,
      createdAt: new Date().toISOString(),
      _status: 'sending',
    };

    if (!conv._messages) conv._messages = [];
    conv._messages.push(optimisticMsg);
    renderMsgThread();

    try {
      var result;
      if (global.AVChatSocket && global.AVChatSocket.connected) {
        result = await global.AVChatSocket.sendMessage(conv.id, text, metadata, null);
      } else {
        var resp = await global.AVApi.request('/api/v1/messages/conversations/' + conv.id + '/messages', {
          method: 'POST',
          body: JSON.stringify({ messageText: text, metadata: metadata }),
        });
        result = resp.message;
      }

      var idx = conv._messages.indexOf(optimisticMsg);
      if (idx !== -1) {
        conv._messages[idx] = result;
        conv._messages[idx]._status = 'sent';
      }
      conv.lastMessageAt = result.createdAt;
      conv.lastMessageText = result.messageText;
      conv.lastMessageSender = result.sender ? result.sender.fullName : '';
      conv._preview = getConvPreview(conv);
      sortConversations();
      renderMsgConvos();
      renderMsgThread();
      updateMsgBadge();
    } catch (e) {
      optimisticMsg._status = 'failed';
      renderMsgThread();
      showError('Message failed to send. Click the warning icon to retry.');
    }
  };

  global.retrySendMessage = function (tempId) {
    var conv = state.conversations.find(function (c) { return c.id === state.activeId; });
    if (!conv || !conv._messages) return;
    var msg = conv._messages.find(function (m) { return m._tempId === tempId; });
    if (!msg) return;
    msg._status = 'sending';
    renderMsgThread();

    var fn = async function () {
      try {
        var result;
        if (global.AVChatSocket && global.AVChatSocket.connected) {
          result = await global.AVChatSocket.sendMessage(conv.id, msg.messageText, msg.metadata, null);
        } else {
          var resp = await global.AVApi.request('/api/v1/messages/conversations/' + conv.id + '/messages', {
            method: 'POST',
            body: JSON.stringify({ messageText: msg.messageText, metadata: msg.metadata }),
          });
          result = resp.message;
        }
        var idx = conv._messages.indexOf(msg);
        if (idx !== -1) {
          conv._messages[idx] = result;
          conv._messages[idx]._status = 'sent';
        }
        renderMsgThread();
      } catch (e) {
        msg._status = 'failed';
        renderMsgThread();
      }
    };
    fn();
  };

  // ── Vehicle Attachment ─────────────────────────────────────────────

  global.openMsgVehiclePicker = function () {
    var host = document.getElementById('msgVehList');
    if (!host) return;
    var vehicles = global.vehicles || [];
    host.innerHTML = vehicles.map(function (v) {
      var price = v.askingPrice || v.price || 0;
      return '<div class="msg-new-item" onclick="msgAttachVehicle(\'' + v.vin + '\')">' +
        '<div class="ivc-icon" style="width:38px;height:38px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17v-6h18v6M5 17v3M19 17v3M3 11l2-5h14l2 5"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg></div>' +
        '<div><div style="font-weight:700;font-size:13px;color:var(--text);">' + v.year + ' ' + v.make + ' ' + v.model + '</div>' +
        '<div style="font-size:11px;color:var(--muted);font-family:var(--mono);">' + (v.vin || '').slice(-8) + ' \u00b7 $' + Number(price).toLocaleString() + '</div></div>' +
        '</div>';
    }).join('') || '<div style="color:var(--muted);font-size:13px;padding:10px;">No vehicles in inventory.</div>';
    var m = document.getElementById('msgVehModal');
    if (m) m.style.display = 'flex';
  };

  global.closeMsgVeh = function () {
    var m = document.getElementById('msgVehModal');
    if (m) m.style.display = 'none';
  };

  global.msgAttachVehicle = function (vin) {
    closeMsgVeh();
    var vehicle = (global.vehicles || []).find(function (v) { return v.vin === vin; });
    if (!vehicle) return;
    state.attachedVehicle = vehicle;

    var preview = document.getElementById('imsgAttachPreview');
    if (!preview) return;
    var price = vehicle.askingPrice || vehicle.price || 0;
    preview.innerHTML = '<div class="imsg-attach-card">' +
      '<div class="ivc-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17v-6h18v6M5 17v3M19 17v3M3 11l2-5h14l2 5"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg></div>' +
      '<div class="ivc-info"><div class="ivc-title">' + vehicle.year + ' ' + vehicle.make + ' ' + vehicle.model + '</div><div class="ivc-sub">' + (vehicle.vin || '').slice(-8) + ' \u00b7 $' + Number(price).toLocaleString() + '</div></div>' +
      '<button class="imsg-remove-attach" onclick="removeAttachedVehicle()" title="Remove">&times;</button>' +
      '</div>';
    preview.style.display = 'flex';
    var inp = document.getElementById('imsgInput');
    if (inp) inp.focus();
  };

  global.removeAttachedVehicle = function () {
    state.attachedVehicle = null;
    var preview = document.getElementById('imsgAttachPreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  };

  // ── New Conversation ──────────────────────────────────────────────

  global.openMsgNew = async function () {
    var host = document.getElementById('msgNewList');
    if (!host) return;
    var m = document.getElementById('msgNewModal');
    if (m) m.style.display = 'flex';
    renderContactSkeleton();

    var contacts = [];
    try {
      var resp = await global.AVApi.request('/api/v1/messages/contacts');
      contacts = (resp.contacts || []).map(function (c) {
        return {
          id: c.id,
          name: c.fullName || c.name || c.email || 'User',
          role: formatRoleLabel(c.role),
        };
      });
    } catch (e) {
      // Fallback to locally loaded reps/staff
      (global.salesReps || []).forEach(function (r) {
        if (r.id && r.id !== currentUserId()) {
          contacts.push({ id: r.id, name: r.name, role: 'Sales Rep' });
        }
      });
      (global.staff || []).forEach(function (s) {
        if (s.id && s.id !== currentUserId()) {
          contacts.push({ id: s.id, name: s.name, role: s.role || 'Staff' });
        }
      });
    }

    // Deduplicate by id
    var seen = {};
    contacts = contacts.filter(function (c) {
      if (!c.id || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    });

    host.innerHTML = contacts.map(function (c) {
      return '<div class="msg-new-item" onclick="msgStartWith(\'' + c.id + '\',\'' + String(c.name).replace(/'/g, "\\'") + '\')">' +
        '<div class="imsg-avatar" style="background:' + msgColor(c.name) + ';width:38px;height:38px;font-size:13px;">' + msgInitials(c.name) + '</div>' +
        '<div><div style="font-weight:700;font-size:13.5px;color:var(--text);">' + msgEsc(c.name) + '</div><div style="font-size:11.5px;color:var(--muted);">' + msgEsc(c.role) + '</div></div>' +
        '</div>';
    }).join('') || '<div style="color:var(--muted);font-size:13px;padding:10px;">No contacts found.</div>';
  };

  function formatRoleLabel(role) {
    if (!role) return 'Team';
    if (role === 'owner') return 'Owner';
    if (role === 'manager') return 'Manager';
    if (role === 'sales_rep') return 'Sales Rep';
    if (role === 'cpa') return 'CPA';
    return role;
  }

  global.closeMsgNew = function () {
    var m = document.getElementById('msgNewModal');
    if (m) m.style.display = 'none';
  };

  global.msgStartWith = async function (userId, userName) {
    closeMsgNew();
    setComposeLoading(true, 'Starting conversation\u2026');
    renderHeadSkeleton();
    renderMessageSkeleton();
    try {
      var resp = await global.AVApi.request('/api/v1/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ participantIds: [userId], type: 'DIRECT' }),
      });
      var conv = resp.conversation;
      if (conv) {
        var existing = state.conversations.find(function (c) { return c.id === conv.id; });
        if (!existing) {
          state.conversations.unshift(normalizeConv(conv));
          renderMsgConvos();
        }
        if (global.AVChatSocket && global.AVChatSocket.socket && global.AVChatSocket.connected) {
          global.AVChatSocket.socket.emit('conversation:join', { conversationId: conv.id });
        }
        await global.openMsgConvo(conv.id);
      } else {
        setComposeEnabled(false, 'Select a conversation to start messaging');
        renderEmptyChat();
      }
    } catch (e) {
      setComposeEnabled(false, 'Select a conversation to start messaging');
      renderEmptyChat();
      showError('Failed to create conversation: ' + (e.message || 'Unknown error'));
    }
  };

  global.msgMarkAllRead = async function () {
    try {
      await global.AVApi.request('/api/v1/messages/read-all', { method: 'POST' });
      state.conversations.forEach(function (c) { c._unread = 0; });
      updateUnreadTotal();
      updateMsgBadge();
      renderMsgConvos();
    } catch (e) {
      showError('Failed to mark all as read');
    }
  };

  global.loadMsgConversations = loadConversations;

  // ── Badge Updates ─────────────────────────────────────────────────

  function updateMsgBadge() {
    var total = state.unreadTotal;
    var b = document.getElementById('msgNavBadge');
    if (b) { b.textContent = total > 99 ? '99+' : total; b.style.display = total > 0 ? '' : 'none'; }
    var totalBadge = document.getElementById('totalUnreadBadge');
    if (totalBadge) { totalBadge.textContent = total; totalBadge.style.display = total > 0 ? '' : 'none'; }
  }

  global.updateMsgBadge = updateMsgBadge;

  // ── Error Display ─────────────────────────────────────────────────

  function showError(msg) {
    if (typeof AVToast !== 'undefined' && AVToast) {
      if (AVToast.error) AVToast.error(msg);
      else if (AVToast.show) AVToast.show(msg, 'error');
    } else {
      console.error('[messages]', msg);
    }
  }

  // ── Sort Conversations ────────────────────────────────────────────

  function sortConversations() {
    state.conversations.sort(function (a, b) {
      var aTime = a.lastMessageAt || a.createdAt || 0;
      var bTime = b.lastMessageAt || b.createdAt || 0;
      return new Date(bTime) - new Date(aTime);
    });
  }

  // ── Expose helpers globally ───────────────────────────────────────

  global.msgEsc = msgEsc;
  global.msgInitials = msgInitials;
  global.msgColor = msgColor;

})(window);
