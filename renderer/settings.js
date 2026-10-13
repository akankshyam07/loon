const $ = (id) => document.getElementById(id);

function render(s) {
  for (const box of document.querySelectorAll('[data-key]')) box.checked = box.dataset.key === 'speakReplies' ? s.speakReplies !== 'never' : Boolean(s[box.dataset.key]);
  renderSmarter(s);
  renderLook(s);
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
  $('ratings').textContent = s.ratings.up + s.ratings.down ? `${s.ratings.up} 👍 and ${s.ratings.down} 👎 so far.` : 'No ratings yet. Tap 👍 or 👎 under an answer.';
  $('historyPaused').hidden = !s.privacy;
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
// ---------- Smarter answers: plan CLI or own API key ----------
// The key is typed here once and sent to the main process; only "saved · ends in …abcd" ever comes back.
let smarter = null;
function renderSmarter(s) {
  smarter = s;
  const mode = s.cloudCli || 'off';
  for (const radio of document.querySelectorAll('[name=cloudCli]')) radio.checked = radio.value === mode;
  $('cloudNote').hidden = !s.privacy || mode === 'off';
  $('apiBox').hidden = mode !== 'api';
  // Your plan: plan-first or this Mac first, and which model answers per difficulty (blank = the default shown).
  const plan = ['claude', 'codex'].includes(mode);
  $('planBox').hidden = !plan;
  for (const radio of document.querySelectorAll('[name=answerWith]')) radio.checked = radio.value === (s.answerWith === 'mac' ? 'mac' : 'plan');
  if (plan) {
    const chosen = s.planModels?.[mode] || {};
    const defaults = s.planModelDefaults[mode];
    for (const [id, level] of [['planMedium', 'medium'], ['planHard', 'hard']]) {
      if (document.activeElement !== $(id)) $(id).value = chosen[level] || '';
      $(id).placeholder = defaults[level] || "Codex's default";
    }
  }
  $('planMsg').textContent = s.planModelError || '';
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
  $('teachScreenshots').checked = Boolean(s.teachScreenshots);
  $('teachScreenshots').closest('label').hidden = !['codex', 'api'].includes(mode);
}
// Pictures can't be redacted, so switching this on explains that first and needs an OK (§3.18.4).
$('teachScreenshots').addEventListener('change', async (e) => {
  const on = e.target.checked;
  if (on && !confirm('Send screenshots for teaching?\n\nWhen you ask Loon to explain your screen, the picture of your screen goes to your ChatGPT plan (Codex) or your API provider. Text is redacted before it leaves this Mac, but pictures can\'t be: anything visible goes along.\n\nLoon never sends one in Privacy mode, while a password manager, bank or private page is open, or without you asking. You can switch this off any time.')) {
    e.target.checked = false;
    return;
  }
  render(await window.loon.setSetting('teachScreenshots', on));
});
const saveApiConfig = async (changes = {}) => {
  const current = { provider: $('apiProvider').value, baseUrl: $('apiBase').value, normal: $('apiNormal').value, hard: $('apiHard').value };
  render(await window.loon.setSetting('api', { ...current, ...changes }));
};
for (const radio of document.querySelectorAll('[name=cloudCli]')) {
  radio.addEventListener('change', async () => render(await window.loon.setSetting('cloudCli', radio.value)));
}
for (const radio of document.querySelectorAll('[name=answerWith]')) {
  radio.addEventListener('change', async () => render(await window.loon.setSetting('answerWith', radio.value)));
}
for (const [id, level] of [['planMedium', 'medium'], ['planHard', 'hard']]) {
  $(id).addEventListener('change', async () => render(await window.loon.setSetting('planModel', { which: smarter.cloudCli, level, model: $(id).value })));
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
// ---------- Your cat: style, companion and wardrobe (live previews drawn with the real sprites) ----------
const PX = window.LoonPixel;
let look = { catStyle: 'pixel', companion: 'luna', costume: 'none' };
const PREVIEW_CELL = 2;
function renderLook(s) {
  look = { catStyle: s.catStyle || 'pixel', companion: s.companion || 'luna', costume: s.costume || 'none' };
  for (const radio of document.querySelectorAll('[name=catStyle], [name=companion]')) radio.checked = radio.value === look[radio.name];
  if (!$('wardrobe').children.length) {
    $('wardrobe').append(...Object.entries(PX.COSTUMES).map(([id, costume]) => {
      const label = Object.assign(document.createElement('label'), { className: 'costume' });
      const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'costume', value: id });
      radio.addEventListener('change', async () => render(await window.loon.setSetting('costume', id)));
      const preview = Object.assign(document.createElement('canvas'), { width: PX.W * PREVIEW_CELL * 2, height: PX.ROWS * PREVIEW_CELL * 2 });
      preview.dataset.costume = id;
      preview.setAttribute('aria-hidden', 'true');
      label.append(radio, preview, Object.assign(document.createElement('span'), { textContent: costume?.name || 'Nothing' }));
      return label;
    }));
  }
  for (const radio of document.querySelectorAll('[name=costume]')) radio.checked = radio.value === look.costume;
  const classic = look.catStyle === 'classic';
  $('wardrobe').classList.toggle('off', classic);
  $('wardrobeNote').hidden = !classic;
  drawWardrobe();
}
// Two frames a second, stepped like the cat itself; still when motion is reduced or the window is hidden.
let previewClock = 0;
function drawWardrobe() {
  for (const preview of document.querySelectorAll('#wardrobe canvas')) {
    const blink = previewClock % 8 === 7;
    const frame = PX.pickFrame({ now: previewClock * 500, tailPeriod: 2400, lidL: blink ? 1 : 0.08, lidR: blink ? 1 : 0.08, costume: preview.dataset.costume }, look.companion);
    PX.drawGrid(preview.getContext('2d'), PX.compose(frame), PX.colorsFor(look.companion), PREVIEW_CELL * 2, { rim: 'rgba(255, 240, 250, 0.3)' });
  }
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
setInterval(() => { if (!document.hidden && !reduceMotion.matches) { previewClock++; drawWardrobe(); } }, 500);
for (const radio of document.querySelectorAll('[name=catStyle], [name=companion]')) {
  radio.addEventListener('change', async () => render(await window.loon.setSetting(radio.name, radio.value)));
}

// ---------- History: past conversations, search, read, continue in the bubble, delete ----------
const day = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
function renderHistory(list) {
  $('historyList').replaceChildren(...(list.length ? list : [null]).map((c) => {
    const li = document.createElement('li');
    if (!c) {
      li.className = 'muted';
      li.textContent = $('historySearch').value.trim() ? 'No conversations match.' : 'No conversations yet.';
      return li;
    }
    li.className = 'conv';
    const head = document.createElement('div');
    head.className = 'row';
    const open = Object.assign(document.createElement('button'), { className: 'conv-title', type: 'button' });
    open.setAttribute('aria-expanded', 'false');
    open.append(Object.assign(document.createElement('b'), { textContent: c.title }), Object.assign(document.createElement('span'), { className: 'mono', textContent: [c.scope, day(c.updated), `${c.count} answer${c.count > 1 ? 's' : ''}`].filter(Boolean).join(' · ') }));
    const resume = Object.assign(document.createElement('button'), { textContent: 'Continue', title: 'Open this conversation in the bubble and keep going' });
    resume.addEventListener('click', () => window.loon.continueHistory(c.id));
    const del = Object.assign(document.createElement('button'), { textContent: 'Delete', className: 'danger' });
    del.addEventListener('click', async () => { await window.loon.historyDelete(c.id); refreshHistory(); });
    head.append(open, resume, del);
    const turns = Object.assign(document.createElement('div'), { className: 'conv-turns', hidden: true });
    open.addEventListener('click', async () => {
      if (turns.hidden && !turns.children.length) {
        const full = await window.loon.historyGet(c.id);
        for (const t of full?.turns || []) {
          turns.append(Object.assign(document.createElement('p'), { className: 'conv-q', textContent: t.question }), Object.assign(document.createElement('p'), { className: 'conv-a', textContent: t.answer }));
        }
      }
      turns.hidden = !turns.hidden;
      open.setAttribute('aria-expanded', String(!turns.hidden));
    });
    li.append(head, turns);
    return li;
  }));
}
let historyQuery = 0;
async function refreshHistory() {
  const mine = ++historyQuery;
  const list = await window.loon.historyList($('historySearch').value.trim());
  if (mine === historyQuery) renderHistory(list);
}
$('historySearch').addEventListener('input', refreshHistory);
$('historyClear').addEventListener('click', async () => {
  if (!confirm('Clear all of your conversation history? Memories and notes stay.')) return;
  renderHistory(await window.loon.historyClear());
});
$('onboarding').addEventListener('click', () => window.loon.startOnboarding());
window.loon.onSettingsShow((section) => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
refreshHistory();

window.loon.onSettingsChanged((s) => { render(s); refreshHistory(); });
window.loon.getSettings().then(render);
