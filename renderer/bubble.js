// Loon's speech bubble: typed questions in, streamed answers out (DESIGN.md §2.8).
const $ = (id) => document.getElementById(id);
const card = $('card');
const log = $('log');
const input = $('input');
const send = $('send');
const setup = $('setup');

let current = null; // { id, el, raw }
let nextId = 1;

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

function tierLabel({ tier, model }) {
  if (tier === 'code') return '⚡ instant · no model needed';
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
  } else {
    input.focus();
  }
  autosize();
}

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
  const q = document.createElement('div');
  q.className = 'q';
  q.textContent = text;
  const a = document.createElement('div');
  a.className = 'a';
  a.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.append(q, a);
  current = { id: nextId++, el: a, raw: '' };
  window.loon.ask(current.id, text);
  input.value = '';
  autosize();
  log.scrollTop = log.scrollHeight;
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
  current.el.appendChild(badge);
  $('counts').textContent = formatCounts(meta.counts);
  current = null;
  autosize();
  input.focus();
});
window.loon.onAskError(({ id, message }) => {
  if (current?.id !== id) return;
  current.el.classList.add('error');
  current.el.textContent = `My brain hiccuped: ${message}`;
  current = null;
  autosize();
});

window.loon.onBubbleShown(refreshStatus);
window.loon.onBubbleHidden(() => {
  log.replaceChildren();
  current = null;
  input.value = '';
  autosize();
});
