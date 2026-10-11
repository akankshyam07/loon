// Loon extension service worker: one WebSocket to the Loon app on this computer (127.0.0.1 only).
// A socket with regular traffic keeps an MV3 worker alive (Chrome 116+), so we ping every 20 s.
const APP_URL = 'ws://127.0.0.1:47631/';
let socket = null;
let backoff = 1000;
let reconnectTimer = null;
let heartbeat = null;
let status = 'disconnected';

function setStatus(next) {
  status = next;
  chrome.action.setBadgeText({ text: next === 'connected' ? '' : next === 'unpaired' ? '?' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: next === 'unpaired' ? '#6f9a66' : '#9b3b3b' });
}

async function connect() {
  clearTimeout(reconnectTimer);
  if (socket && socket.readyState <= 1) return;
  const { pairingCode } = await chrome.storage.local.get('pairingCode');
  if (!pairingCode) return setStatus('unpaired');
  socket = new WebSocket(`${APP_URL}?token=${encodeURIComponent(pairingCode)}`);
  socket.onopen = () => {
    backoff = 1000;
    setStatus('connected');
    heartbeat = setInterval(() => send({ type: 'ping' }), 20000);
    send({ type: 'hello', version: chrome.runtime.getManifest().version });
    reportActiveTab();
  };
  socket.onmessage = (event) => onAppMessage(JSON.parse(event.data));
  socket.onclose = () => {
    clearInterval(heartbeat);
    socket = null;
    setStatus('disconnected');
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30000);
  };
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  else connect();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function reportActiveTab() {
  const tab = await activeTab();
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'report-page' }).catch(() => {});
}

// Tabs Loon opened for a "do it for me" task; besides these it only acts in the tab the user is looking at.
const agentTabs = new Set();
chrome.tabs.onRemoved.addListener((id) => agentTabs.delete(id));

async function onAgentMessage(message) {
  if (message.type === 'agent-open') {
    if (!/^https?:\/\//i.test(message.url || '')) return { error: 'Only web links can be opened' };
    const tab = await chrome.tabs.create({ url: message.url, active: true });
    agentTabs.add(tab.id);
    return { ok: true, tabId: tab.id };
  }
  if (message.type === 'agent-end') {
    for (const id of agentTabs) chrome.tabs.sendMessage(id, { type: 'agent-clear' }).catch(() => {});
    agentTabs.clear();
    message = { ...message, type: 'agent-clear' };
  }
  const active = await activeTab();
  const tabId = message.tabId || active?.id;
  if (!tabId) return { error: 'No browser tab is open' };
  if (tabId !== active?.id && !agentTabs.has(tabId)) return { error: 'That is not the tab you are looking at. Switch back to it and ask again' };
  try {
    return { ...(await chrome.tabs.sendMessage(tabId, message)), tabId };
  } catch (err) {
    // A click that navigates tears down the page before it can answer: that is the click working.
    if (message.type === 'agent-act' && ['click', 'enter', 'back'].includes(message.op) && /closed|receiving end/i.test(err.message)) return { ok: true, navigated: true, tabId };
    return { error: `The page did not answer (${err.message}). Try reloading it.` };
  }
}

// Requests from the app, answered with { replyTo }.
async function onAppMessage(message) {
  if (message.type === 'pong' || !message.requestId) return;
  if (message.type.startsWith('agent-')) return send({ ...(await onAgentMessage(message)), replyTo: message.requestId });
  const tabId = message.tabId || (await activeTab())?.id;
  let reply;
  try {
    reply = tabId ? await chrome.tabs.sendMessage(tabId, message) : { error: 'No browser tab is open' };
  } catch (err) {
    reply = { error: `The page did not answer (${err.message}). Try reloading it.` };
  }
  send({ ...reply, replyTo: message.requestId });
}

// Messages from content scripts: stamp them with where they came from and pass them on.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === 'status') {
    reply({ status });
    return false;
  }
  if (!sender.tab) return false;
  send({ ...message, tabId: sender.tab.id, url: sender.tab.url, title: sender.tab.title, active: sender.tab.active });
  return false;
});

chrome.tabs.onActivated.addListener(reportActiveTab);
chrome.windows.onFocusChanged.addListener((id) => { if (id !== chrome.windows.WINDOW_ID_NONE) reportActiveTab(); });
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.pairingCode) return;
  socket?.close();
  socket = null;
  connect();
});

// Right-click → "Ask Loon about this".
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ask-loon', title: 'Ask Loon about “%s”', contexts: ['selection'] });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'ask-loon' || !info.selectionText) return;
  send({ type: 'context-menu', text: info.selectionText, tabId: tab?.id, url: tab?.url, title: tab?.title });
});

connect();
