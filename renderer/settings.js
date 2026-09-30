const $ = (id) => document.getElementById(id);

function render(s) {
  for (const box of document.querySelectorAll('[data-key]')) box.checked = Boolean(s[box.dataset.key]);
  $('browser').textContent = s.connected ? 'Connected to Chrome ✓' : 'Not connected. Load the extension, then paste the pairing code into its popup.';
  const { code = 0, cache = 0, local = 0 } = s.counts?.tiers || {};
  $('counts').textContent = `${code + cache} answers were instant (no model), ${local} used the model on your Mac.`;
  $('notesDir').textContent = s.notesDir;
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
$('copyCode').addEventListener('click', () => { window.loon.copyPairingCode(); $('copyCode').textContent = 'Copied ✓'; });
$('openNotes').addEventListener('click', () => window.loon.openNotesFolder());
$('clearMemory').addEventListener('click', async () => {
  if (confirm('Forget everything Loon remembers about you? This also clears remembered answers.')) render(await window.loon.clearMemory());
});
window.loon.onSettingsChanged(render);
window.loon.getSettings().then(render);
