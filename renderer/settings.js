const $ = (id) => document.getElementById(id);

function render(s) {
  for (const box of document.querySelectorAll('[data-key]')) box.checked = box.dataset.key === 'speakReplies' ? s.speakReplies !== 'never' : Boolean(s[box.dataset.key]);
  for (const radio of document.querySelectorAll('[name=cloudCli]')) radio.checked = radio.value === (s.cloudCli || 'off');
  $('cloudNote').hidden = !s.privacy || (s.cloudCli || 'off') === 'off';
  $('browser').textContent = s.connected ? 'Connected to Chrome ✓' : 'Not connected. Load the extension, then paste the pairing code into its popup.';
  const { code = 0, cache = 0, local = 0, cloud = 0 } = s.counts?.tiers || {};
  $('counts').textContent = `${code + cache} answers were instant (no model), ${local} used the model on your Mac${cloud ? `, ${cloud} used your plan` : ''}.`;
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
  const p = s.personal;
  for (const field of document.querySelectorAll('[data-personal]')) {
    if (document.activeElement !== field) field.value = p[field.dataset.personal] || '';
  }
  for (const radio of document.querySelectorAll('[name=length], [name=tone]')) radio.checked = radio.value === p[radio.name];
  $('emoji').checked = p.emoji;
  countChars();
  $('profile').replaceChildren(...(s.profile.length ? s.profile : [null]).map((line) => {
    const li = document.createElement('li');
    if (!line) { li.className = 'muted'; li.textContent = 'Nothing yet. Tell Loon your name, or fill in "About you" above.'; return li; }
    if (line.source === 'setting') {
      li.className = 'from-setting';
      li.textContent = line.text;
      li.title = 'From "About you & replies" above';
      return li;
    }
    const input = Object.assign(document.createElement('input'), { value: line.text });
    input.setAttribute('aria-label', 'Edit this line');
    input.addEventListener('change', async () => render(await window.loon.updateMemory(line.id, input.value)));
    const unpin = Object.assign(document.createElement('button'), { textContent: 'Unpin', title: 'Keep the memory, drop it from this summary' });
    unpin.addEventListener('click', async () => render(await window.loon.pinMemory(line.id, false)));
    li.append(input, unpin);
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
    input.addEventListener('change', async () => { render(await window.loon.updateMemory(m.id, input.value)); window.loonBrain?.refresh(); });
    const del = Object.assign(document.createElement('button'), { textContent: 'Delete' });
    del.addEventListener('click', async () => { render(await window.loon.deleteMemory(m.id)); window.loonBrain?.refresh(); });
    li.append(tag, input, del);
    return li;
  }));
  $('audit').replaceChildren(...(s.audit.length ? s.audit : [null]).map((a) => {
    const li = document.createElement('li');
    li.textContent = a ? `${new Date(a.time).toLocaleString()} · ${a.action} · ${a.ok ? 'done' : `failed (${a.error})`}` : 'No actions yet.';
    return li;
  }));
}

function countChars() {
  for (const span of document.querySelectorAll('[data-count]')) {
    const field = $(span.dataset.count);
    span.textContent = field.value.length > field.maxLength * 0.8 ? `${field.value.length}/${field.maxLength}` : '';
  }
}
const savePersonal = async (patch) => render(await window.loon.setSetting('personal', patch));
for (const field of document.querySelectorAll('[data-personal]')) {
  field.addEventListener('input', countChars);
  field.addEventListener('change', () => savePersonal({ [field.dataset.personal]: field.value }));
}
for (const radio of document.querySelectorAll('[name=length], [name=tone]')) {
  radio.addEventListener('change', () => savePersonal({ [radio.name]: radio.value }));
}
$('emoji').addEventListener('change', () => savePersonal({ emoji: $('emoji').checked }));
window.loonSettings = { render: (s) => render(s) };

for (const box of document.querySelectorAll('[data-key]')) {
  box.addEventListener('change', async () => render(await window.loon.setSetting(box.dataset.key, box.checked)));
}
for (const radio of document.querySelectorAll('[name=cloudCli]')) {
  radio.addEventListener('change', async () => render(await window.loon.setSetting('cloudCli', radio.value)));
}
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
  if (!confirm('Forget everything Loon remembers about you? This also clears your history and remembered answers.')) return;
  render(await window.loon.clearMemory());
  window.loonBrain?.refresh();
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
