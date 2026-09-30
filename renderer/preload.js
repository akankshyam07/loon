const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, payload) => callback(payload));

contextBridge.exposeInMainWorld('loon', {
  // cat window
  getCatSvg: () => ipcRenderer.invoke('cat-svg'),
  onCursor: on('cursor'),
  onBrain: on('brain'),
  onBubble: on('bubble'),
  onDebug: on('debug'),
  onPower: on('power'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  dragStart: (offsetX, offsetY) => ipcRenderer.send('drag-start', { offsetX, offsetY }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  animateWindow: (opts) => ipcRenderer.invoke('animate-window', opts),
  windowInfo: () => ipcRenderer.invoke('window-info'),
  showMenu: () => ipcRenderer.send('cat-menu'),
  openBubble: () => ipcRenderer.send('open-bubble'),

  // bubble window
  closeBubble: () => ipcRenderer.send('close-bubble'),
  setBubbleHeight: (height) => ipcRenderer.send('bubble-height', height),
  brainStatus: () => ipcRenderer.invoke('brain-status'),
  downloadModel: () => ipcRenderer.invoke('download-model'),
  ask: (id, text) => ipcRenderer.send('ask', { id, text }),
  cancelAsk: () => ipcRenderer.send('ask-cancel'),
  onBubbleShown: on('bubble-shown'),
  onBubbleHidden: on('bubble-hidden'),
  onAskChunk: on('ask-chunk'),
  onAskDone: on('ask-done'),
  onAskError: on('ask-error'),
  onDownloadProgress: on('download-progress'),
});
