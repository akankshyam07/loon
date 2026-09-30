const $ = (id) => document.getElementById(id);
const LABELS = { connected: 'Connected to Loon', disconnected: 'Loon app not running', unpaired: 'Not paired yet' };

async function refresh() {
  const { status } = await chrome.runtime.sendMessage({ type: 'status' });
  $('state').textContent = LABELS[status] || 'Loon';
  $('dot').classList.toggle('on', status === 'connected');
  $('help').hidden = status === 'connected';
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 6) return;
  await chrome.storage.local.set({ pairingCode: code });
  setTimeout(refresh, 800);
});

refresh();
