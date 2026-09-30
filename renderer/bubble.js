// Loon's speech bubble: typed questions in, streamed answers out (DESIGN.md §2.8).
const $ = (id) => document.getElementById(id);
const card = $('card');
const log = $('log');
const input = $('input');
const send = $('send');
const setup = $('setup');

let current = null; // { id, el, raw }
let nextId = 1;
let context = { mode: 'ask', chips: [] };
let lastTask = null;
let focused = true; // false while showing chips beside a selection without taking focus

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Small markdown subset: code fences, inline code, bold, bullet lists, paragraphs.
function renderMarkdown(raw) {
  const parts = raw.split(/```(?:[\w-]+)?\n?/);
  return parts.map((chunk, i) => {
    if (i % 2) return `<pre>${escapeHtml(chunk.replace(/\n$/, ''))}</pre>`;
    return escapeHtml(chunk).split(/\n{2,}/).map((para) => {
      const lines = para.split('\n');
      const inline = (t) => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      if (lines.every((l) => /^\s*[-*•] /.test(l) || !l.trim())) {
        return `<ul>${lines.filter((l) => l.trim()).map((l) => `<li>${inline(l.replace(/^\s*[-*•] /, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    }).join('');
  }).join('');
}

function formatCounts(counts) {
  if (!counts) return '';
  const { code = 0, cache = 0, local = 0 } = counts.tiers;
  return `this week: ${code + cache} instant · ${local} on-device`;
}

function tierLabel({ tier, model, detail }) {
  if (tier === 'code') return `⚡ instant · ${detail || 'no model needed'}`;
  if (tier === 'cache') return '⚡ instant · remembered answer';
  return `🐾 on your Mac · ${model}`;
}

function reportHeight() {
  window.loon.setBubbleHeight(Math.ceil(card.getBoundingClientRect().height) + 20);
}
new ResizeObserver(reportHeight).observe(card);

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
  send.disabled = Boolean(current) || !input.value.trim();
}
input.addEventListener('input', autosize);

async function refreshStatus() {
  const status = await window.loon.brainStatus();
  $('counts').textContent = formatCounts(status.counts);
  const needsBrain = !status.ready;
  setup.hidden = !needsBrain;
  input.disabled = needsBrain && !status.downloading;
  if (needsBrain) {
    const { name, sizeGb } = status.recommended;
    $('setupText').textContent = `I need my brain first: ${name}, about ${sizeGb} GB. It downloads once, then I run fully offline on your Mac. No account, no key.`;
    $('download').textContent = `Download ${name}`;
    $('download').disabled = Boolean(status.downloading);
  } else if (focused) {
    input.focus();
  }
  autosize();
}

function renderContext(next) {
  context = next || context;
  $('source').hidden = !context.label;
  $('sourceLabel').textContent = context.label || '';
  $('redacted').textContent = context.redactions ? `· ${context.redactions} private item${context.redactions > 1 ? 's' : ''} hidden` : '';
  $('sensitive').hidden = !context.sensitive;
  input.placeholder = context.placeholder || 'Ask me anything…';
  $('chips').replaceChildren(...(context.chips || []).map(({ id, label }) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.task = id;
    b.textContent = label;
    b.addEventListener('click', () => runChip(id, label));
    return b;
  }));
  $('context').textContent = { selection: 'used: your selection', page: 'used: this page', sensitive: 'used: nothing' }[context.mode] || 'used: what you typed';
}

function startAnswer(questionText) {
  const q = document.createElement('div');
  q.className = 'q';
  q.textContent = questionText;
  const a = document.createElement('div');
  a.className = 'a';
  a.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.append(q, a);
  current = { id: nextId++, el: a, raw: '' };
  autosize();
  log.scrollTop = log.scrollHeight;
  return current.id;
}

function runChip(task, label, deeper = false) {
  if (current) return;
  lastTask = task;
  const id = startAnswer(deeper ? `${label} (deeper)` : label);
  window.loon.runTask(id, task, deeper);
}

async function handoff(app) {
  try {
    const { name } = await window.loon.handoff({ app, task: lastTask });
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = `Copied. Paste it into ${name} with ⌘V.`;
    log.append(note);
    log.scrollTop = log.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

function answerActions({ canGoDeeper }) {
  const row = document.createElement('div');
  row.className = 'actions';
  const add = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    row.append(b);
  };
  if (canGoDeeper && lastTask) add('Go deeper', () => runChip(lastTask, context.chips.find((c) => c.id === lastTask)?.label || 'Answer', true));
  const label = document.createElement('span');
  label.textContent = 'Ask in:';
  row.append(label);
  add('Claude', () => handoff('claude'));
  add('ChatGPT', () => handoff('chatgpt'));
  add('Gemini', () => handoff('gemini'));
  return row;
}

$('lookAnyway').addEventListener('click', () => window.loon.lookAnyway());
// Chips can show without focus (so the browser keeps its selection); typing needs focus.
input.addEventListener('mousedown', () => { if (!focused) { focused = true; window.loon.focusBubble(); } });

$('download').addEventListener('click', async () => {
  $('download').disabled = true;
  $('progress').hidden = false;
  try {
    await window.loon.downloadModel();
    $('progress').hidden = true;
    $('progressText').textContent = '';
    await refreshStatus();
  } catch (err) {
    $('progressText').textContent = `Download failed: ${err.message}. Try again?`;
    $('download').disabled = false;
  }
});
window.loon.onDownloadProgress(({ downloaded, total }) => {
  const pct = total ? (downloaded / total) * 100 : 0;
  $('bar').style.width = `${pct.toFixed(1)}%`;
  $('progressText').textContent = `${(downloaded / 2 ** 30).toFixed(2)} / ${(total / 2 ** 30).toFixed(2)} GB`;
});

function ask(text) {
  lastTask = null;
  const id = startAnswer(text);
  window.loon.ask(id, text);
  input.value = '';
  autosize();
}

$('askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (text && !current) ask(text);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('askForm').requestSubmit();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.loon.closeBubble(); });
$('close').addEventListener('click', () => window.loon.closeBubble());

window.loon.onAskChunk(({ id, chunk }) => {
  if (current?.id !== id) return;
  current.raw += chunk;
  current.el.innerHTML = renderMarkdown(current.raw.trimStart());
  log.scrollTop = log.scrollHeight;
});
window.loon.onAskDone(({ id, text, ...meta }) => {
  if (current?.id !== id) return;
  current.el.innerHTML = renderMarkdown(text || current.raw.trim() || '…');
  const badge = document.createElement('span');
  badge.className = 'tier';
  badge.textContent = tierLabel(meta);
  current.el.append(badge, answerActions(meta));
  $('counts').textContent = formatCounts(meta.counts);
  current = null;
  autosize();
  if (focused) input.focus();
});
window.loon.onAskError(({ id, message }) => {
  if (current?.id !== id) return;
  current.el.classList.add('error');
  current.el.textContent = `My brain hiccuped: ${message}`;
  current = null;
  autosize();
});

window.loon.onBubbleShown(({ context: next, focus } = {}) => {
  focused = focus !== false;
  log.replaceChildren();
  current = null;
  lastTask = null;
  renderContext(next);
  refreshStatus();
});
window.loon.onBubbleContext(renderContext);
window.loon.onBubbleSensitive(({ id }) => {
  if (current?.id === id) {
    current.el.textContent = '';
    current = null;
    autosize();
  }
  renderContext({ ...context, mode: 'sensitive', sensitive: true, chips: [] });
});
window.loon.onBubbleRun(({ task }) => {
  const known = context.chips.find((c) => c.id === task);
  runChip(task, known?.label || task);
});
window.loon.onBubbleHidden(() => {
  log.replaceChildren();
  current = null;
  input.value = '';
  autosize();
});
