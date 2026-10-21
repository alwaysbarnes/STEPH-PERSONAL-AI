/**
 * STEPH — Personal AI Assistant
 * Frontend Application Engine
 */

// Base API URL (supports local dev server, Vercel production, and direct file:// access)
const API_BASE = (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:'))
  ? ''
  : 'http://localhost:3000';

// Application State
const state = {
  conversations: [],
  activeConversationId: null,
  activeLanguageMode: 'auto', // 'auto' | 'twi' | 'pidgin' | 'english'
  isGenerating: false,
  abortController: null,
  stagedAttachments: [],
  searchQuery: '',
  settings: {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-3.8-flash',
    defaultLanguage: 'auto'
  },
  serverStatus: null
};

// DOM Elements
const elements = {
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  sidebarCollapseBtn: document.getElementById('sidebarCollapseBtn'),
  sidebarExpandBtn: document.getElementById('sidebarExpandBtn'),
  brandHomeBtn: document.getElementById('brandHomeBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  sidebarChats: document.getElementById('sidebarChats'),
  currentChatTitle: document.getElementById('currentChatTitle'),
  stephStatusDot: document.getElementById('stephStatusDot'),
  stephStatusText: document.getElementById('stephStatusText'),
  activeModelTag: document.getElementById('activeModelTag'),
  chatMessagesContainer: document.getElementById('chatMessagesContainer'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  messagesList: document.getElementById('messagesList'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  attachFileBtn: document.getElementById('attachFileBtn'),
  fileInput: document.getElementById('fileInput'),
  stagedAttachmentsTray: document.getElementById('stagedAttachmentsTray'),
  micBtn: document.getElementById('micBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  stopGeneratingContainer: document.getElementById('stopGeneratingContainer'),
  stopGeneratingBtn: document.getElementById('stopGeneratingBtn'),
  // Language selector
  langSelectorBtn: document.getElementById('langSelectorBtn'),
  activeLangLabel: document.getElementById('activeLangLabel'),
  langDropdownMenu: document.getElementById('langDropdownMenu'),
  // Settings modal
  settingsModal: document.getElementById('settingsModal'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  headerSettingsBtn: document.getElementById('headerSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  providerSelect: document.getElementById('providerSelect'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
  modelInput: document.getElementById('modelInput'),
  defaultLangSelect: document.getElementById('defaultLangSelect'),
  getFreeKeyLink: document.getElementById('getFreeKeyLink'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  providerStatusTag: document.getElementById('providerStatusTag'),
  toastNotice: document.getElementById('toastNotice')
};

// Provider Defaults & Documentation Links
const PROVIDER_METADATA = {
  gemini: {
    defaultModel: 'gemini-3.8-flash',
    freeUrl: 'https://aistudio.google.com/',
    hint: 'Get free Google AI Studio key'
  },
  groq: {
    defaultModel: 'llama-3.3-70b-versatile',
    freeUrl: 'https://console.groq.com/',
    hint: 'Get free Groq high-speed key'
  },
  openai: {
    defaultModel: 'gpt-4o-mini',
    freeUrl: 'https://platform.openai.com/api-keys',
    hint: 'OpenAI API key console'
  },
  anthropic: {
    defaultModel: 'claude-3-5-sonnet-20241022',
    freeUrl: 'https://console.anthropic.com/',
    hint: 'Anthropic console'
  },
  openrouter: {
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    freeUrl: 'https://openrouter.ai/keys',
    hint: 'OpenRouter keys'
  }
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  loadLocalSettings();
  setupEventListeners();
  await checkServerStatus();
  await loadConversations();

  if (state.conversations.length === 0) {
    createNewConversation();
  } else {
    // Select the first active or recent conversation
    setActiveConversation(state.conversations[0].id);
  }

  setupAutoResizeTextarea();
  setupSpeechRecognition();
});

/* ==========================================================================
   SETTINGS & SERVER STATUS
   ========================================================================== */

function loadLocalSettings() {
  try {
    const saved = localStorage.getItem('steph_settings');
    if (saved) {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to parse settings:', e);
  }

  // Auto-migrate deprecated models to gemini-3.8-flash
  if (!state.settings.model || state.settings.model === 'gemini-2.0-flash' || state.settings.model === 'gemini-1.5-flash' || state.settings.model.includes('2.0') || state.settings.model.includes('1.5')) {
    state.settings.model = 'gemini-3.8-flash';
    try {
      localStorage.setItem('steph_settings', JSON.stringify(state.settings));
    } catch (e) {}
  }

  // Sync to form
  if (elements.providerSelect) elements.providerSelect.value = state.settings.provider;
  if (elements.apiKeyInput) elements.apiKeyInput.value = state.settings.apiKey;
  if (elements.modelInput) elements.modelInput.value = state.settings.model;
  if (elements.defaultLangSelect) elements.defaultLangSelect.value = state.settings.defaultLanguage;
  if (elements.activeModelTag) elements.activeModelTag.textContent = state.settings.model;

  updateProviderHints();
}

function saveLocalSettings() {
  state.settings.provider = elements.providerSelect.value;
  state.settings.apiKey = elements.apiKeyInput.value.trim();
  state.settings.model = elements.modelInput.value.trim() || PROVIDER_METADATA[state.settings.provider].defaultModel;
  state.settings.defaultLanguage = elements.defaultLangSelect.value;

  localStorage.setItem('steph_settings', JSON.stringify(state.settings));
  if (elements.activeModelTag) elements.activeModelTag.textContent = state.settings.model;
}

function updateProviderHints() {
  const meta = PROVIDER_METADATA[elements.providerSelect.value] || PROVIDER_METADATA.gemini;
  if (elements.getFreeKeyLink) {
    elements.getFreeKeyLink.href = meta.freeUrl;
    elements.getFreeKeyLink.innerHTML = `${meta.hint} <i class='bx bx-link-external'></i>`;
  }
}

async function checkServerStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (res.ok) {
      state.serverStatus = await res.json();
      console.log('STEPH Backend Status:', state.serverStatus);

      // If server has active configured provider, reflect status
      if (state.serverStatus.isConfigured) {
        if (elements.providerStatusTag) {
          elements.providerStatusTag.textContent = 'Server Ready';
          elements.providerStatusTag.style.color = '#10b981';
        }
        if (elements.stephStatusText) elements.stephStatusText.textContent = 'STEPH Online';
        if (elements.stephStatusDot) elements.stephStatusDot.className = 'status-dot-active';
        if (elements.apiKeyInput && !elements.apiKeyInput.value) {
          elements.apiKeyInput.placeholder = 'Connected via .env (GEMINI_API_KEY)';
        }
      } else {
        if (elements.providerStatusTag) {
          elements.providerStatusTag.textContent = 'Needs API Key';
          elements.providerStatusTag.style.color = '#f59e0b';
        }
      }
    }
  } catch (err) {
    console.warn('Backend server status check failed:', err);
    if (elements.providerStatusTag) elements.providerStatusTag.textContent = 'Offline / Connecting';
    if (elements.stephStatusText) elements.stephStatusText.textContent = 'Connecting...';
  }
}

/* ==========================================================================
   CONVERSATION MANAGEMENT
   ========================================================================== */

async function loadConversations() {
  try {
    // Check server first
    const res = await fetch(`${API_BASE}/api/conversations`);
    if (res.ok) {
      const serverConvs = await res.json();
      if (Array.isArray(serverConvs) && serverConvs.length > 0) {
        state.conversations = serverConvs;
        renderSidebarConversations();
        return;
      }
    }
  } catch (e) {
    // fallback to localStorage
  }

  const localSaved = localStorage.getItem('steph_conversations');
  if (localSaved) {
    try {
      state.conversations = JSON.parse(localSaved);
    } catch (e) {
      state.conversations = [];
    }
  }
  renderSidebarConversations();
}

function saveConversations() {
  localStorage.setItem('steph_conversations', JSON.stringify(state.conversations));
  // Sync to server background
  fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.conversations)
  }).catch(() => {});
}

function createNewConversation() {
  const newChat = {
    id: 'conv_' + Date.now(),
    title: 'New Conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    messages: []
  };

  state.conversations.unshift(newChat);
  saveConversations();
  renderSidebarConversations();
  setActiveConversation(newChat.id);

  if (window.innerWidth <= 768) {
    closeSidebarMobile();
  }
}

function getActiveConversation() {
  return state.conversations.find(c => c.id === state.activeConversationId);
}

function setActiveConversation(id) {
  state.activeConversationId = id;
  const conv = getActiveConversation();
  if (!conv) return;

  elements.currentChatTitle.textContent = conv.title;
  renderSidebarConversations();
  renderMessages(conv.messages);

  if (window.innerWidth <= 768) {
    closeSidebarMobile();
  } else {
    elements.messageInput.focus();
  }
}

function pinConversation(id, event) {
  if (event) event.stopPropagation();
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;

  conv.pinned = !conv.pinned;
  saveConversations();
  renderSidebarConversations();
  showToast(conv.pinned ? 'Chat pinned to top' : 'Chat unpinned');
}

function deleteConversation(id, event) {
  if (event) event.stopPropagation();
  const index = state.conversations.findIndex(c => c.id === id);
  if (index === -1) return;

  const conv = state.conversations[index];
  if (!confirm(`Delete conversation "${conv.title}"?`)) return;

  state.conversations.splice(index, 1);
  saveConversations();

  if (state.activeConversationId === id) {
    if (state.conversations.length > 0) {
      setActiveConversation(state.conversations[0].id);
    } else {
      createNewConversation();
    }
  } else {
    renderSidebarConversations();
  }
  showToast('Conversation deleted');
}

function startRenameConversation(id, event) {
  if (event) event.stopPropagation();
  const titleSpan = document.getElementById(`chat-title-${id}`);
  if (!titleSpan) return;

  const currentTitle = titleSpan.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-item-edit-input';
  input.value = currentTitle;

  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newTitle = input.value.trim() || currentTitle;
    const conv = state.conversations.find(c => c.id === id);
    if (conv) {
      conv.title = newTitle;
      saveConversations();
      if (state.activeConversationId === id) {
        elements.currentChatTitle.textContent = newTitle;
      }
    }
    renderSidebarConversations();
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishRename();
    if (e.key === 'Escape') renderSidebarConversations();
  });
}

function renderSidebarConversations() {
  const container = elements.sidebarChats;
  container.innerHTML = '';

  const filter = state.searchQuery.toLowerCase().trim();
  const filtered = state.conversations.filter(c => {
    if (!filter) return true;
    if (c.title.toLowerCase().includes(filter)) return true;
    return c.messages?.some(m => m.content?.toLowerCase().includes(filter));
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px 12px; text-align: center; color: var(--text-dim); font-size: 0.8rem;">
        ${filter ? 'No conversations matching your search.' : 'No conversations yet.'}
      </div>
    `;
    return;
  }

  // Separate pinned and chronological groups
  const pinnedChats = filtered.filter(c => c.pinned);
  const unpinnedChats = filtered.filter(c => !c.pinned);

  // Group unpinned by timeframe
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayChats = [];
  const yesterdayChats = [];
  const previousWeekChats = [];
  const olderChats = [];

  unpinnedChats.forEach(c => {
    const time = c.updatedAt || c.createdAt || now;
    const diff = now - time;
    if (diff < oneDay) todayChats.push(c);
    else if (diff < 2 * oneDay) yesterdayChats.push(c);
    else if (diff < 7 * oneDay) previousWeekChats.push(c);
    else olderChats.push(c);
  });

  const renderGroup = (title, icon, list) => {
    if (list.length === 0) return;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'chat-group-list';

    const header = document.createElement('div');
    header.className = 'chat-group-title';
    header.innerHTML = `<i class='${icon}'></i> <span>${title}</span>`;
    groupDiv.appendChild(header);

    list.forEach(c => {
      const item = document.createElement('div');
      item.className = `chat-item ${c.id === state.activeConversationId ? 'active' : ''} ${c.pinned ? 'pinned' : ''}`;
      item.onclick = () => setActiveConversation(c.id);

      item.innerHTML = `
        <div class="chat-item-main">
          <i class='bx ${c.pinned ? 'bxs-pin' : 'bx-message-square-dots'} chat-item-icon'></i>
          <span id="chat-title-${c.id}" class="chat-item-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
        </div>
        <div class="chat-item-actions">
          <button class="chat-action-btn" title="${c.pinned ? 'Unpin' : 'Pin'}" onclick="pinConversation('${c.id}', event)">
            <i class='bx ${c.pinned ? 'bxs-pin' : 'bx-pin'}'></i>
          </button>
          <button class="chat-action-btn" title="Rename" onclick="startRenameConversation('${c.id}', event)">
            <i class='bx bx-edit-alt'></i>
          </button>
          <button class="chat-action-btn delete-btn" title="Delete" onclick="deleteConversation('${c.id}', event)">
            <i class='bx bx-trash'></i>
          </button>
        </div>
      `;
      groupDiv.appendChild(item);
    });

    container.appendChild(groupDiv);
  };

  if (pinnedChats.length > 0) renderGroup('PINNED', 'bx bxs-pin', pinnedChats);
  if (todayChats.length > 0) renderGroup('TODAY', 'bx bx-time-five', todayChats);
  if (yesterdayChats.length > 0) renderGroup('YESTERDAY', 'bx bx-calendar', yesterdayChats);
  if (previousWeekChats.length > 0) renderGroup('PREVIOUS 7 DAYS', 'bx bx-calendar-week', previousWeekChats);
  if (olderChats.length > 0) renderGroup('OLDER', 'bx bx-archive', olderChats);
}

// Global scope bindings for inline HTML onclicks
window.pinConversation = pinConversation;
window.deleteConversation = deleteConversation;
window.startRenameConversation = startRenameConversation;

/* ==========================================================================
   MESSAGES RENDERING & MARKDOWN ENGINE
   ========================================================================== */

function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    elements.welcomeScreen.style.display = 'flex';
    elements.messagesList.style.display = 'none';
    elements.messagesList.innerHTML = '';
    return;
  }

  elements.welcomeScreen.style.display = 'none';
  elements.messagesList.style.display = 'flex';
  elements.messagesList.innerHTML = '';

  messages.forEach((msg, idx) => {
    appendMessageDOM(msg, idx === messages.length - 1 && msg.role === 'assistant');
  });

  scrollToBottom();
}

function appendMessageDOM(msg, isLastAssistant = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${msg.role === 'user' ? 'user' : 'steph'}`;
  wrapper.id = `msg-${msg.id || Date.now()}`;

  const timeFormatted = formatMessageTime(msg.timestamp || Date.now());

  let avatarHTML = '';
  if (msg.role === 'user') {
    avatarHTML = `<div class="message-avatar-box">ME</div>`;
  } else {
    avatarHTML = `
      <div class="message-avatar-box">
        <div class="message-avatar-inner">
          <img src="steph-logo.svg" alt="STEPH">
        </div>
      </div>
    `;
  }

  // Attachments HTML
  let attachmentsHTML = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachmentsHTML = `<div class="message-attachments-container">`;
    msg.attachments.forEach(att => {
      if (att.mimeType && att.mimeType.startsWith('image/') && att.base64) {
        attachmentsHTML += `<img src="${att.base64}" class="message-attachment-img" alt="${escapeHtml(att.name)}">`;
      } else {
        attachmentsHTML += `
          <div class="message-attachment-chip">
            <i class='bx bx-file'></i>
            <span>${escapeHtml(att.name)}</span>
          </div>
        `;
      }
    });
    attachmentsHTML += `</div>`;
  }

  // Format content using markdown formatter
  const formattedContent = msg.role === 'assistant' 
    ? parseMarkdown(msg.content)
    : escapeHtml(msg.content).replace(/\n/g, '<br>');

  // Action buttons on STEPH responses
  let actionsHTML = '';
  if (msg.role === 'assistant') {
    actionsHTML = `
      <div class="message-actions-row">
        <button class="msg-action-btn" title="Copy response" onclick="copyMessageText(this, '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">
          <i class='bx bx-copy'></i>
          <span>Copy</span>
        </button>
        <button class="msg-action-btn" title="Regenerate response" onclick="regenerateLastResponse()">
          <i class='bx bx-refresh'></i>
          <span>Regenerate</span>
        </button>
        <button class="msg-action-btn" title="Read aloud" onclick="speakMessageText('${escapeHtml(msg.content).replace(/'/g, "\\'")}')">
          <i class='bx bx-volume-full'></i>
          <span>Listen</span>
        </button>
      </div>
    `;
  }

  wrapper.innerHTML = `
    ${avatarHTML}
    <div class="message-content-wrapper">
      <div class="message-sender-meta">
        <span class="message-sender-name">${msg.role === 'user' ? 'You' : 'STEPH'}</span>
        <span>•</span>
        <span>${timeFormatted}</span>
      </div>
      ${attachmentsHTML}
      <div class="message-bubble ${msg.role === 'user' ? 'user-bubble' : 'steph-bubble'}">
        ${formattedContent}
      </div>
      ${actionsHTML}
    </div>
  `;

  elements.messagesList.appendChild(wrapper);
}

// Markdown parser supporting headers, bold/italic, code blocks, tables, lists
function parseMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Protect code blocks first
  const codeBlocks = [];
  html = html.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ lang: lang || 'code', code: code.trim() });
    return placeholder;
  });

  // Protect inline code
  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(code);
    return placeholder;
  });

  // Basic HTML Escaping
  html = escapeHtml(html);

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold & Italics
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Unordered list items
  html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, ''); // consolidate adjoining lists

  // Line breaks to paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul>') || p.startsWith('<blockquote>') || p.startsWith('__CODE_BLOCK_')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  // Restore inline codes
  html = html.replace(/__INLINE_CODE_(\d+)__/g, (match, idx) => {
    return `<code>${escapeHtml(inlineCodes[idx])}</code>`;
  });

  // Restore code blocks with syntax styled shell and copy button
  html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, idx) => {
    const block = codeBlocks[idx];
    const safeCode = escapeHtml(block.code);
    const codeId = `code_${Date.now()}_${idx}`;

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">${escapeHtml(block.lang)}</span>
          <button class="copy-code-btn" onclick="copyCodeBlock('${codeId}', this)">
            <i class='bx bx-copy'></i>
            <span>Copy Code</span>
          </button>
        </div>
        <pre class="code-block-pre"><code id="${codeId}">${highlightCodeSyntax(safeCode, block.lang)}</code></pre>
      </div>
    `;
  });

  return html;
}

// Lightweight syntax highlight styling for common code keywords
function highlightCodeSyntax(escapedCode, lang) {
  let highlighted = escapedCode;

  // strings in quotes
  highlighted = highlighted.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="token-string">$1</span>');

  // comments
  highlighted = highlighted.replace(/(\/\/.*?$|\/\*[\s\S]*?\*\/|#.*?$)/gm, '<span class="token-comment">$1</span>');

  // keywords
  const keywords = /\b(const|let|var|function|return|if|else|import|export|from|class|extends|async|await|try|catch|for|while|new|this|typeof|def|class|print|True|False|None)\b/g;
  highlighted = highlighted.replace(keywords, '<span class="token-keyword">$1</span>');

  // numbers
  highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="token-number">$1</span>');

  return highlighted;
}

function copyCodeBlock(codeId, button) {
  const codeEl = document.getElementById(codeId);
  if (!codeEl) return;
  const text = codeEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    button.classList.add('copied');
    button.innerHTML = `<i class='bx bx-check'></i><span>Copied!</span>`;
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = `<i class='bx bx-copy'></i><span>Copy Code</span>`;
    }, 2000);
  });
}
window.copyCodeBlock = copyCodeBlock;

function copyMessageText(button, text) {
  navigator.clipboard.writeText(text).then(() => {
    const origHtml = button.innerHTML;
    button.classList.add('copied');
    button.innerHTML = `<i class='bx bx-check'></i><span>Copied!</span>`;
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = origHtml;
    }, 2000);
  });
}
window.copyMessageText = copyMessageText;

function speakMessageText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Speech synthesis not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  // Strip code blocks and markdown symbols for audio reading
  const cleanText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.')
                        .replace(/[#*`_~]/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
}
window.speakMessageText = speakMessageText;

function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  setTimeout(() => {
    elements.chatMessagesContainer.scrollTop = elements.chatMessagesContainer.scrollHeight;
  }, 30);
}

function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   REAL STREAMING AI INVOCATION
   ========================================================================== */

async function sendMessage(overrideText = null) {
  const text = (overrideText !== null ? overrideText : elements.messageInput.value).trim();
  if (!text && state.stagedAttachments.length === 0) return;
  if (state.isGenerating) return;

  const conv = getActiveConversation();
  if (!conv) return;

  // Update conversation title if first message
  if (conv.messages.length === 0) {
    conv.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
    elements.currentChatTitle.textContent = conv.title;
  }

  // Create User Message object
  const userMsg = {
    id: 'msg_' + Date.now(),
    role: 'user',
    content: text,
    timestamp: Date.now(),
    attachments: [...state.stagedAttachments]
  };

  conv.messages.push(userMsg);
  conv.updatedAt = Date.now();
  saveConversations();

  // Reset inputs
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  state.stagedAttachments = [];
  renderStagedAttachments();

  // Update UI
  renderMessages(conv.messages);
  renderSidebarConversations();

  // Start STEPH Streaming Generation
  await triggerStephResponse(conv);
}

async function regenerateLastResponse() {
  if (state.isGenerating) return;
  const conv = getActiveConversation();
  if (!conv || conv.messages.length === 0) return;

  // Remove last assistant message if exists
  if (conv.messages[conv.messages.length - 1].role === 'assistant') {
    conv.messages.pop();
  }

  saveConversations();
  renderMessages(conv.messages);
  await triggerStephResponse(conv);
}

async function triggerStephResponse(conv) {
  state.isGenerating = true;
  setGeneratingUI(true);

  // Create a placeholder message in conversation
  const stephMsgId = 'msg_' + Date.now();
  const stephMsg = {
    id: stephMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now()
  };
  conv.messages.push(stephMsg);

  // Append temporary STEPH bubble with typing wave
  const typingWrapper = document.createElement('div');
  typingWrapper.className = 'message-wrapper steph';
  typingWrapper.id = `steph-stream-wrapper`;
  typingWrapper.innerHTML = `
    <div class="message-avatar-box">
      <div class="message-avatar-inner">
        <img src="steph-logo.svg" alt="STEPH">
      </div>
    </div>
    <div class="message-content-wrapper">
      <div class="message-sender-meta">
        <span class="message-sender-name">STEPH</span>
        <span>•</span>
        <span>Thinking...</span>
      </div>
      <div class="typing-indicator-wrapper" id="streamTypingIndicator">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <span class="typing-status-text">STEPH is thinking...</span>
      </div>
      <div class="message-bubble steph-bubble" id="streamBubbleText" style="display: none;"></div>
    </div>
  `;
  elements.messagesList.appendChild(typingWrapper);
  scrollToBottom();

  const bubbleText = typingWrapper.querySelector('#streamBubbleText');
  const typingIndicator = typingWrapper.querySelector('#streamTypingIndicator');

  state.abortController = new AbortController();

  try {
    // Filter out empty messages to prevent Gemini API 400 Invalid Argument errors
    const formattedHistory = conv.messages
      .slice(0, -1)
      .filter(m => (m.content && m.content.trim()) || (m.attachments && m.attachments.length > 0))
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const lastUserMsg = conv.messages[conv.messages.length - 2];
    const attachmentsPayload = lastUserMsg?.attachments || [];

    const headers = {
      'Content-Type': 'application/json'
    };
    if (state.settings.apiKey) {
      headers['x-api-key'] = state.settings.apiKey;
    }
    headers['x-ai-provider'] = state.settings.provider;
    headers['x-ai-model'] = state.settings.model;

    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: formattedHistory,
        attachments: attachmentsPayload,
        languageMode: state.activeLanguageMode
      }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const errMsg = errJson?.error || `Server responded with status ${response.status}`;

      if (response.status === 401) {
        promptOpenSettings(errMsg);
      }
      throw new Error(errMsg);
    }

    // Read SSE Stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let buffer = '';
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('data:')) continue;

        const dataStr = line.replace(/^data:\s*/, '').trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.text) {
            accumulatedText += parsed.text;
            stephMsg.content = accumulatedText;

            // Update DOM dynamically
            if (typingIndicator) typingIndicator.style.display = 'none';
            if (bubbleText) {
              bubbleText.style.display = 'block';
              bubbleText.innerHTML = parseMarkdown(accumulatedText);
            }
            scrollToBottom();
          } else if (parsed.error) {
            streamError = parsed.error;
            break;
          }
        } catch (jsonErr) {
          // ignore partial JSON parse errors
        }
      }

      if (streamError) break;
    }

    if (streamError) {
      throw new Error(streamError);
    }

    if (!accumulatedText.trim()) {
      throw new Error('STEPH could not generate a response. Please check your Gemini API key in Settings or .env.');
    }

    // Stream finished successfully
    conv.updatedAt = Date.now();
    saveConversations();
    renderMessages(conv.messages);

  } catch (error) {
    if (error.name === 'AbortError') {
      showToast('Response stopped.');
      if (!stephMsg.content) {
        stephMsg.content = '*Response stopped.*';
      }
    } else {
      console.error('Generation failure:', error);
      showToast('Error: ' + error.message);
      stephMsg.content = `> ⚠️ **Could not complete response:**\n${error.message}\n\n*Make sure your API key in \`.env\` or Settings is valid.*`;
      renderMessages(conv.messages);
    }
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    setGeneratingUI(false);
    // Don't retain completely empty assistant messages
    if (!stephMsg.content || !stephMsg.content.trim()) {
      const idx = conv.messages.findIndex(m => m.id === stephMsg.id);
      if (idx !== -1) conv.messages.splice(idx, 1);
    }
    saveConversations();
  }
}

function stopGenerating() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

function setGeneratingUI(isGenerating) {
  elements.sendBtn.disabled = isGenerating;
  elements.stopGeneratingContainer.style.display = isGenerating ? 'flex' : 'none';

  if (isGenerating) {
    elements.stephStatusDot.classList.add('thinking');
    elements.stephStatusText.textContent = 'STEPH Crafting...';
  } else {
    elements.stephStatusDot.classList.remove('thinking');
    elements.stephStatusText.textContent = 'STEPH Online';
  }
}

/* ==========================================================================
   ATTACHMENTS & FILE INPUT
   ========================================================================== */

function handleFileSelection(files) {
  if (!files || files.length === 0) return;

  Array.from(files).forEach(file => {
    const isImage = file.type.startsWith('image/');

    const reader = new FileReader();
    if (isImage) {
      reader.onload = (e) => {
        state.stagedAttachments.push({
          name: file.name,
          size: file.size,
          mimeType: file.type,
          base64: e.target.result
        });
        renderStagedAttachments();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (e) => {
        state.stagedAttachments.push({
          name: file.name,
          size: file.size,
          mimeType: file.type || 'text/plain',
          text: e.target.result
        });
        renderStagedAttachments();
      };
      reader.readAsText(file);
    }
  });

  elements.fileInput.value = '';
}

function renderStagedAttachments() {
  const tray = elements.stagedAttachmentsTray;
  tray.innerHTML = '';

  if (state.stagedAttachments.length === 0) {
    tray.classList.remove('has-items');
    return;
  }

  tray.classList.add('has-items');
  state.stagedAttachments.forEach((att, idx) => {
    const chip = document.createElement('div');
    chip.className = 'staged-attachment-item';
    chip.innerHTML = `
      <i class='bx ${att.mimeType?.startsWith('image/') ? 'bx-image' : 'bx-file'}'></i>
      <span>${escapeHtml(att.name)}</span>
      <button class="remove-attachment-btn" onclick="removeStagedAttachment(${idx})">
        <i class='bx bx-x'></i>
      </button>
    `;
    tray.appendChild(chip);
  });
}

function removeStagedAttachment(index) {
  state.stagedAttachments.splice(index, 1);
  renderStagedAttachments();
}
window.removeStagedAttachment = removeStagedAttachment;

/* ==========================================================================
   EVENT LISTENERS & UI INTERACTIONS
   ========================================================================== */

function setupEventListeners() {
  // Brand Home
  elements.brandHomeBtn.addEventListener('click', () => {
    createNewConversation();
  });

  // New Chat
  elements.newChatBtn.addEventListener('click', () => {
    createNewConversation();
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      createNewConversation();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleSidebar();
    }
  });

  // Sidebar Collapse / Expand
  elements.sidebarCollapseBtn.addEventListener('click', toggleSidebar);
  elements.sidebarExpandBtn.addEventListener('click', toggleSidebar);
  elements.sidebarOverlay.addEventListener('click', closeSidebarMobile);

  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    elements.clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
    renderSidebarConversations();
  });

  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.style.display = 'none';
    renderSidebarConversations();
  });

  // Textarea Enter / Send
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  elements.sendBtn.addEventListener('click', () => sendMessage());

  // Stop Generating
  elements.stopGeneratingBtn.addEventListener('click', stopGenerating);

  // Attachments
  elements.attachFileBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });
  elements.fileInput.addEventListener('change', (e) => {
    handleFileSelection(e.target.files);
  });

  // Clear current chat
  elements.clearChatBtn.addEventListener('click', () => {
    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) return;
    if (confirm('Clear all messages in this conversation?')) {
      conv.messages = [];
      saveConversations();
      renderMessages([]);
      showToast('Conversation cleared');
    }
  });

  // Welcome cards quick prompts
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  // Language Mode Dropdown
  elements.langSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.langDropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!elements.langDropdownMenu.contains(e.target) && e.target !== elements.langSelectorBtn) {
      elements.langDropdownMenu.classList.remove('show');
    }
  });

  document.querySelectorAll('.lang-option').forEach(option => {
    option.addEventListener('click', () => {
      const lang = option.getAttribute('data-lang');
      setLanguageMode(lang);
      elements.langDropdownMenu.classList.remove('show');
    });
  });

  // Settings Modal Triggers
  elements.openSettingsBtn.addEventListener('click', openSettings);
  elements.headerSettingsBtn.addEventListener('click', openSettings);
  elements.closeSettingsBtn.addEventListener('click', closeSettings);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettings();
  });

  elements.providerSelect.addEventListener('change', () => {
    const meta = PROVIDER_METADATA[elements.providerSelect.value];
    if (meta) {
      elements.modelInput.value = meta.defaultModel;
    }
    updateProviderHints();
  });

  elements.toggleApiKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.apiKeyInput.type === 'password';
    elements.apiKeyInput.type = isPassword ? 'text' : 'password';
    elements.toggleApiKeyVisibility.innerHTML = isPassword ? "<i class='bx bx-show'></i>" : "<i class='bx bx-hide'></i>";
  });

  elements.saveSettingsBtn.addEventListener('click', async () => {
    saveLocalSettings();
    showToast('Saving settings...');

    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: state.settings.provider,
          apiKey: state.settings.apiKey,
          model: state.settings.model
        })
      });
      if (res.ok) {
        showToast('Settings saved successfully!');
        await checkServerStatus();
      }
    } catch (e) {
      showToast('Settings saved locally in session.');
    }

    closeSettings();
  });

  elements.testConnectionBtn.addEventListener('click', testAPIConnection);
}

function setLanguageMode(mode) {
  state.activeLanguageMode = mode;
  document.querySelectorAll('.lang-option').forEach(opt => {
    const isSelected = opt.getAttribute('data-lang') === mode;
    opt.classList.toggle('selected', isSelected);
    let check = opt.querySelector('.check-icon');
    if (isSelected && !check) {
      opt.insertAdjacentHTML('beforeend', `<i class='bx bx-check check-icon'></i>`);
    } else if (!isSelected && check) {
      check.remove();
    }
  });

  const labels = {
    auto: 'Auto-Detect',
    twi: 'Akan / Twi',
    pidgin: 'Ghanaian Pidgin',
    english: 'English'
  };
  elements.activeLangLabel.textContent = labels[mode] || 'Auto-Detect';
  showToast(`Language set to ${labels[mode]}`);
}

function toggleSidebar() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    elements.sidebar.classList.toggle('mobile-open');
    elements.sidebarOverlay.classList.toggle('show');
  } else {
    elements.sidebar.classList.toggle('collapsed');
  }
}

function closeSidebarMobile() {
  elements.sidebar.classList.remove('mobile-open');
  elements.sidebarOverlay.classList.remove('show');
}

function openSettings() {
  elements.settingsModal.classList.add('open');
}

function closeSettings() {
  elements.settingsModal.classList.remove('open');
}

function promptOpenSettings(message) {
  openSettings();
  showToast(message || 'Please configure your API key');
}

async function testAPIConnection() {
  const apiKey = elements.apiKeyInput.value.trim();
  const provider = elements.providerSelect.value;
  const model = elements.modelInput.value.trim();

  // If no client key is provided, check if server has key configured
  if (!apiKey && (!state.serverStatus || !state.serverStatus.isConfigured)) {
    showToast('Please enter an API key to test.');
    return;
  }

  elements.testConnectionBtn.textContent = 'Testing...';
  elements.testConnectionBtn.disabled = true;

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-ai-provider': provider,
      'x-ai-model': model
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(`${API_BASE}/api/test-connection`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider,
        apiKey,
        model
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast(`✅ Connection verified! (${data.model || model})`);
      if (elements.providerStatusTag) {
        elements.providerStatusTag.textContent = 'Active & Connected';
        elements.providerStatusTag.style.color = '#10b981';
      }
      if (elements.stephStatusDot) elements.stephStatusDot.className = 'status-dot-active';
      if (elements.stephStatusText) elements.stephStatusText.textContent = 'STEPH Online';
    } else {
      showToast('❌ Connection failed: ' + (data.error || res.statusText));
    }
  } catch (e) {
    showToast('❌ Connection error: ' + e.message);
  } finally {
    elements.testConnectionBtn.textContent = 'Test Connection';
    elements.testConnectionBtn.disabled = false;
  }
}

/* ==========================================================================
   INPUT TEXTAREA AUTO-RESIZE & SPEECH
   ========================================================================== */

function setupAutoResizeTextarea() {
  const textarea = elements.messageInput;
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
  });
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.micBtn.style.opacity = '0.4';
    elements.micBtn.title = 'Speech recognition not supported in this browser';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let isRecording = false;

  elements.micBtn.addEventListener('click', () => {
    if (!isRecording) {
      try {
        recognition.start();
        isRecording = true;
        elements.micBtn.classList.add('active-mic');
        showToast('Listening... Speak to STEPH');
      } catch (e) {
        console.error(e);
      }
    } else {
      recognition.stop();
      isRecording = false;
      elements.micBtn.classList.remove('active-mic');
    }
  });

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('');
    elements.messageInput.value = transcript;
    elements.messageInput.dispatchEvent(new Event('input'));
  };

  recognition.onerror = () => {
    isRecording = false;
    elements.micBtn.classList.remove('active-mic');
  };

  recognition.onend = () => {
    isRecording = false;
    elements.micBtn.classList.remove('active-mic');
  };
}

/* ==========================================================================
   TOAST NOTIFICATION
   ========================================================================== */

let toastTimeout = null;
function showToast(message) {
  const toast = elements.toastNotice;
  toast.textContent = message;
  toast.style.display = 'flex';
  toast.style.opacity = '1';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 3500);
}
