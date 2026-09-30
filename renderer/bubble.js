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

// Small markdown subset: code fences, tables, quotes, bullet lists, inline code/bold/italic/links, paragraphs.
function inline(t) {
  return t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => `<a href="#" data-url="${url}">${label}</a>`);
}

function renderBlock(para) {
  const lines = para.split('\n');
  if (lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && lines.length >= 2) {
    const cells = (l) => l.trim().slice(1, -1).split('|').map((c) => inline(c.trim()));
    const body = lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
    const [head, ...rows] = body.map(cells);
    return `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  if (lines.every((l) => /^&gt; ?/.test(l))) return `<blockquote>${lines.map((l) => inline(l.replace(/^&gt; ?/, ''))).join('<br>')}</blockquote>`;
  if (lines.every((l) => /^\s*([-*•]|\d+\.) /.test(l) || /^\s{2,}\S/.test(l) || !l.trim())) {
    const items = [];
    for (const l of lines.filter((x) => x.trim())) {
      if (/^\s*([-*•]|\d+\.) /.test(l)) items.push(inline(l.replace(/^\s*([-*•]|\d+\.) /, '')));
      else items[items.length - 1] += `<br>${inline(l.trim())}`;
    }
    const ordered = /^\s*\d+\. /.test(lines[0]);
    return `<${ordered ? 'ol' : 'ul'}>${items.map((i) => `<li>${i}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  }
  return `<p>${lines.map(inline).join('<br>')}</p>`;
}

function renderMarkdown(raw) {
  const parts = raw.split(/```(?:[\w-]+)?\n?/);
  return parts.map((chunk, i) => (i % 2 ? `<pre>${escapeHtml(chunk.replace(/\n$/, ''))}</pre>` : escapeHtml(chunk).split(/\n{2,}/).filter((p) => p.trim()).map(renderBlock).join(''))).join('');
}

// Links open in the user's browser; the bubble itself never navigates.
log.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-url]');
  if (!link) return;
  e.preventDefault();
  window.loon.openLink(link.dataset.url);
});

function formatCounts(counts) {
  if (!counts) return '';
  const { code = 0, cache = 0, local = 0 } = counts.tiers;
  return `this week: ${code + cache} instant · ${local} on-device`;
}

function tierLabel({ tier, model, detail, estimated }) {
  const suffix = estimated ? ' · estimated' : '';
  if (tier === 'code') return `⚡ instant · ${detail || 'no model needed'}`;
  if (tier === 'cache') return `⚡ instant · remembered answer${suffix}`;
  return `🐾 on your Mac · ${model}${detail ? ` · ${detail}` : ''}${suffix}`;
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
  $('notice').hidden = !context.notice;
  $('notice').textContent = context.notice || '';
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
  current = { id: nextId++, el: a, raw: '', question: questionText };
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

function answerActions({ canGoDeeper, replaceText, text, question, quiz }) {
  const row = document.createElement('div');
  row.className = 'actions';
  const add = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    row.append(b);
  };
  if (replaceText && context.editable) {
    add('Replace', async (e) => {
      try {
        await window.loon.replace(replaceText);
        e.target.textContent = 'Replaced ✓';
        e.target.disabled = true;
      } catch (err) {
        e.target.textContent = 'Could not replace';
        console.error(err);
      }
    });
  }
  if (quiz) add('Harder questions', () => runChip('quiz_harder', 'Harder questions'));
  if (canGoDeeper && lastTask) add('Go deeper', () => runChip(lastTask, context.chips.find((c) => c.id === lastTask)?.label || 'Answer', true));
  add('Save to notes', async (e) => {
    try {
      await window.loon.saveNote({ question, text });
      e.target.textContent = 'Saved ✓';
      e.target.disabled = true;
    } catch (err) {
      e.target.textContent = 'Could not save';
      console.error(err);
    }
  });
  const label = document.createElement('span');
  label.textContent = 'Ask in:';
  row.append(label);
  add('Claude', () => handoff('claude'));
  add('ChatGPT', () => handoff('chatgpt'));
  add('Gemini', () => handoff('gemini'));
  return row;
}

// Cloze quiz, graded in plain code with the same rules as brain/quiz.js (renderer/lib/grade.js).
function quizCard(quiz) {
  const box = document.createElement('div');
  box.className = 'quiz';
  const inputs = quiz.map((q, i) => {
    const row = document.createElement('label');
    row.className = 'quiz-q';
    row.innerHTML = `<span>${i + 1}. ${escapeHtml(q.prompt).replace('_____', '<b>_____</b>')}</span>`;
    const input = document.createElement('input');
    input.placeholder = 'answer';
    input.addEventListener('mousedown', () => { if (!focused) { focused = true; window.loon.focusBubble(); } });
    row.append(input);
    box.append(row);
    return input;
  });
  const check = document.createElement('button');
  check.className = 'secondary';
  check.textContent = 'Check answers';
  const result = document.createElement('div');
  result.className = 'note';
  check.addEventListener('click', () => {
    let right = 0;
    inputs.forEach((input, i) => {
      const ok = window.LoonGrade.grade(input.value, quiz[i].answer);
      right += ok;
      input.classList.toggle('right', ok);
      input.classList.toggle('wrong', !ok);
      if (!ok) input.title = `Answer: ${quiz[i].answer}`;
    });
    result.textContent = `${right}/${quiz.length} right${right < quiz.length ? `. Answers: ${quiz.map((q) => q.answer).join(', ')}` : '. Nice!'}`;
  });
  box.append(check, result);
  return box;
}

// Confirm card for actions (§3.13): nothing happens until ✓, and the details can be edited first.
const toLocalInput = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function confirmCard(id, summary, command) {
  const card = document.createElement('div');
  card.className = 'confirm';
  card.innerHTML = `<div class="confirm-title">${escapeHtml(summary)}</div>`;
  const fields = {};
  const addField = (key, label, type, value) => {
    const row = document.createElement('label');
    row.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.addEventListener('mousedown', () => { if (!focused) { focused = true; window.loon.focusBubble(); } });
    row.append(input);
    card.append(row);
    fields[key] = input;
  };
  if (command.title !== undefined) addField('title', 'What', 'text', command.title);
  if (command.text !== undefined) addField('text', 'What', 'text', command.text);
  if (command.action === 'reminder') addField('when', 'When', 'datetime-local', command.when ? toLocalInput(command.when) : '');
  if (command.action === 'event') addField('start', 'When', 'datetime-local', toLocalInput(command.start));
  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';
  const yes = document.createElement('button');
  yes.className = 'primary';
  yes.textContent = '✓ Do it';
  const no = document.createElement('button');
  no.className = 'secondary';
  no.textContent = 'Cancel';
  yes.addEventListener('click', () => {
    const edited = { ...command };
    for (const [key, input] of Object.entries(fields)) {
      if (input.type === 'datetime-local') edited[key] = input.value ? new Date(input.value).toISOString() : null;
      else edited[key] = input.value.trim();
    }
    if (edited.action === 'event' && edited.start) edited.end = new Date(new Date(edited.start).getTime() + (new Date(command.end) - new Date(command.start))).toISOString();
    yes.disabled = true;
    no.disabled = true;
    window.loon.confirmAction(id, edited);
  });
  no.addEventListener('click', () => {
    card.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: 'Cancelled. Nothing was changed.' }));
    current = null;
    autosize();
  });
  buttons.append(yes, no);
  card.append(buttons);
  return card;
}

window.loon.onBubbleConfirm(({ id, summary, command }) => {
  if (current?.id !== id) return;
  current.el.replaceChildren(confirmCard(id, summary, command));
});
window.loon.onBubbleAction(({ id, ok, message, results }) => {
  const note = Object.assign(document.createElement('div'), { className: ok ? 'note' : 'a error', textContent: message });
  if (results?.length) {
    const list = document.createElement('ul');
    for (const file of results) {
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { className: 'linkish', textContent: file.split('/').slice(-2).join('/') });
      b.title = file;
      b.addEventListener('click', () => window.loon.reveal(file));
      li.append(b);
      list.append(li);
    }
    note.append(list);
  }
  if (current?.id === id) {
    current.el.replaceChildren(note);
    current = null;
    autosize();
  } else {
    log.append(note);
  }
  log.scrollTop = log.scrollHeight;
});

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
  if (meta.quiz) current.el.append(quizCard(meta.quiz));
  current.el.append(badge, answerActions({ ...meta, text: text || current.raw, question: current.question }));
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
// Voice turns arrive as text and take exactly the typed path, so the bubble shows what Loon heard.
window.loon.onBubbleAsk(({ text }) => { if (!current) ask(text); });
window.loon.onCancelConfirm(({ id }) => {
  const card = log.querySelector('.confirm');
  if (!card) return;
  card.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: 'Cancelled. Nothing was changed.' }));
  if (current?.id === id) current = null;
  autosize();
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
