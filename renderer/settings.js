const $ = (id) => document.getElementById(id);

function render(s) {
  for (const box of document.querySelectorAll('[data-key]')) box.checked = box.dataset.key === 'speakReplies' ? s.speakReplies !== 'never' : Boolean(s[box.dataset.key]);
  renderSmarter(s);
  $('browser').textContent = s.connected ? 'Connected to Chrome ✓' : 'Not connected. Load the extension, then paste the pairing code into its popup.';
  const { code = 0, cache = 0, local = 0, cloud = 0, api = 0 } = s.counts?.tiers || {};
  $('counts').textContent = `${code + cache} answers were instant (no model), ${local} used the model on your Mac${cloud ? `, ${cloud} used your plan` : ''}${api ? `, ${api} went via your API key` : ''}.`;
  $('notesDir').textContent = s.notesDir;
  $('embedSize').textContent = `≈${s.embedder.sizeMb}`;
  $('embedStatus').textContent = s.embedder.ready ? `${s.embedder.name} installed ✓` : 'Not installed. Everything works without it.';
  $('downloadEmbedder').hidden = s.embedder.ready;
  $('downloadEmbedder').disabled = Boolean(s.embedder.downloading);
  $('connectors').replaceChildren(...(s.connectorList.length ? s.connectorList : [null]).map((x) => {
    const li = document.createElement('li');
    if (!x) { li.className = 'muted'; li.textContent = 'No apps connected yet.'; return li; }
    li.className = 'row';
    const text = document.createElement('span');
    text.innerHTML = '<b></b> <span class="mono"></span> <span class="tag"></span>';
    text.querySelector('b').textContent = x.name;
    text.querySelector('.mono').textContent = x.baseUrl;
    text.querySelector('.tag').textContent = x.ready ? `${x.operations} actions${x.canSend ? ' · can receive pages' : ''}` : 'not running';
    const remove = Object.assign(document.createElement('button'), { textContent: 'Remove' });
    remove.addEventListener('click', async () => render(await window.loon.removeConnector(x.id)));
    li.append(text, remove);
    return li;
  }));
  $('projects').replaceChildren(...(s.projectChoices.length ? s.projectChoices : [null]).map((p) => {
    const li = document.createElement('li');
    if (!p) { li.className = 'muted'; li.textContent = 'No git projects found on your Desktop.'; return li; }
    const label = document.createElement('label');
    label.className = 'toggle';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: p.allowed });
    box.addEventListener('change', async () => render(await window.loon.setSetting('project', { path: p.path, allowed: box.checked })));
    const text = document.createElement('span');
    text.innerHTML = `<b></b><span class="mono"></span>`;
    text.querySelector('b').textContent = p.name;
    text.querySelector('.mono').textContent = p.path.replace(/^\/Users\/[^/]+/, '~');
    label.append(box, text);
    li.append(label);
    return li;
  }));
  $('memory').replaceChildren(...(s.memory.length ? s.memory : [null]).map((m) => {
    const li = document.createElement('li');
    if (!m) {
      li.className = 'muted';
      li.textContent = 'Nothing yet. Say "remember that …" in the bubble.';
      return li;
    }
    const tag = Object.assign(document.createElement('span'), { className: 'tag', textContent: m.category });
    const input = Object.assign(document.createElement('input'), { value: m.text });
    input.addEventListener('change', async () => render(await window.loon.updateMemory(m.id, input.value)));
    const del = Object.assign(document.createElement('button'), { textContent: 'Delete' });
    del.addEventListener('click', async () => render(await window.loon.deleteMemory(m.id)));
    li.append(tag, input, del);
    return li;
  }));
  $('audit').replaceChildren(...(s.audit.length ? s.audit : [null]).map((a) => {
    const li = document.createElement('li');
    li.textContent = a ? `${new Date(a.time).toLocaleString()} · ${a.action} · ${a.ok ? 'done' : `failed (${a.error})`}` : 'No actions yet.';
    return li;
  }));
}

for (const box of document.querySelectorAll('[data-key]')) {
  box.addEventListener('change', async () => render(await window.loon.setSetting(box.dataset.key, box.checked)));
}
// ---------- Smarter answers: plan CLI or own API key ----------
// The key is typed here once and sent to the main process; only "saved · ends in …abcd" ever comes back.
let smarter = null;
function renderSmarter(s) {
  smarter = s;
  const mode = s.cloudCli || 'off';
  for (const radio of document.querySelectorAll('[name=cloudCli]')) radio.checked = radio.value === mode;
  $('cloudNote').hidden = !s.privacy || mode === 'off';
  $('apiBox').hidden = mode !== 'api';
  const { provider, baseUrl, normal, hard } = s.apiConfig;
  if (!$('apiProvider').options.length) {
    $('apiProvider').append(...Object.entries(s.apiProviders).map(([id, p]) => new Option(p.name, id)));
  }
  $('apiProvider').value = provider;
  const fill = (id, value) => { if (document.activeElement !== $(id)) $(id).value = value; };
  fill('apiBase', baseUrl);
  fill('apiNormal', normal);
  fill('apiHard', hard);
  $('apiNormal').placeholder = provider === 'custom' ? 'e.g. meta-llama/llama-3.3-70b-instruct' : '';
  $('apiHard').placeholder = $('apiNormal').placeholder;
  $('apiBaseRow').hidden = provider !== 'custom';
  $('geminiNote').hidden = provider !== 'gemini';
  const hint = s.apiKeys[provider];
  $('apiKeyStatus').textContent = hint ? `saved · ends in …${hint.last4}` : provider === 'custom' ? 'no key (fine for a local server)' : 'no key saved';
  $('apiRemove').hidden = !hint;
  $('apiMsg').textContent = s.apiError || '';
}
const saveApiConfig = async (changes = {}) => {
  const current = { provider: $('apiProvider').value, baseUrl: $('apiBase').value, normal: $('apiNormal').value, hard: $('apiHard').value };
  render(await window.loon.setSetting('api', { ...current, ...changes }));
};
for (const radio of document.querySelectorAll('[name=cloudCli]')) {
  radio.addEventListener('change', async () => render(await window.loon.setSetting('cloudCli', radio.value)));
}
// A new provider starts from its own default models.
$('apiProvider').addEventListener('change', () => saveApiConfig({ baseUrl: '', normal: '', hard: '' }));
for (const id of ['apiBase', 'apiNormal', 'apiHard']) $(id).addEventListener('change', () => saveApiConfig());
$('apiSave').addEventListener('click', async () => {
  const key = $('apiKey').value;
  $('apiKey').value = '';
  if (key.trim()) render(await window.loon.saveApiKey(smarter.apiConfig.provider, key));
});
$('apiRemove').addEventListener('click', async () => render(await window.loon.removeApiKey(smarter.apiConfig.provider)));
$('apiTest').addEventListener('click', async () => {
  $('apiMsg').textContent = 'Testing…';
  const { ok, error } = await window.loon.testApiKey();
  $('apiMsg').textContent = ok ? 'Key works ✓ (checked without generating anything)' : error;
});
window.loon.detectCli().then((found) => {
  for (const [which, info] of Object.entries(found)) {
    const status = document.querySelector(`[data-status="${which}"]`);
    status.textContent = info.found ? `found${info.version ? ` · ${info.version}` : ''}` : 'not found on this Mac';
    const radio = document.querySelector(`[name=cloudCli][value="${which}"]`);
    if (!info.found && !radio.checked) radio.disabled = true;
  }
});
$('copyCode').addEventListener('click', () => { window.loon.copyPairingCode(); $('copyCode').textContent = 'Copied ✓'; });
$('openNotes').addEventListener('click', () => window.loon.openNotesFolder());
$('clearMemory').addEventListener('click', async () => {
  if (confirm('Forget everything Loon remembers about you? This also clears your history and remembered answers.')) render(await window.loon.clearMemory());
});
$('downloadEmbedder').addEventListener('click', async () => {
  $('downloadEmbedder').disabled = true;
  $('embedStatus').textContent = 'Downloading…';
  const s = await window.loon.downloadEmbedder();
  render(s);
  if (!s.embedder.ready) $('embedStatus').textContent = 'Download failed. Check your connection and try again.';
});
window.loon.onEmbedderProgress(({ downloaded, total }) => {
  $('embedStatus').textContent = `Downloading… ${Math.round((downloaded / total) * 100)}%`;
});
$('discover').addEventListener('click', async () => {
  $('discover').textContent = 'Looking…';
  const found = await window.loon.discoverConnectors();
  $('discover').textContent = 'Find apps on this Mac';
  $('found').replaceChildren(...(found.length ? found : [null]).map((f) => {
    const li = document.createElement('li');
    if (!f) { li.className = 'muted'; li.textContent = 'No running apps with an OpenAPI description found on common ports (3000, 5000, 5173, 8000, 8080…).'; return li; }
    li.className = 'row';
    li.append(Object.assign(document.createElement('span'), { textContent: `${f.name} · ${f.baseUrl} · ${f.operations} actions` }));
    const add = Object.assign(document.createElement('button'), { textContent: 'Connect' });
    add.addEventListener('click', async () => { render(await window.loon.addConnector(f)); li.remove(); });
    li.append(add);
    return li;
  }));
});
window.loon.onSettingsChanged(render);
window.loon.getSettings().then(render);
