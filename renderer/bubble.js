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
  // "Intro:\n- a\n- b" → a paragraph followed by a list
  if (lines.length > 2 && !/^\s*([-*•]|\d+\.) /.test(lines[0]) && lines.slice(1).every((l) => /^\s*([-*•]|\d+\.) /.test(l))) {
    return renderBlock(lines[0]) + renderBlock(lines.slice(1).join('\n'));
  }
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

function tierLabel({ tier, model, detail, estimated }) {
  const suffix = estimated ? ' · estimated' : '';
  if (tier === 'code') return `⚡ instant · ${detail || 'no model needed'}`;
  if (tier === 'cache') return `⚡ instant · remembered answer${suffix}`;
  if (tier === 'cloud') return `☁️ ${detail}${suffix}`;
  return `🐾 on your Mac · ${model}${detail ? ` · ${detail}` : ''}${suffix}`;
}

function reportHeight() {
  if (document.body.classList.contains('pill')) return;
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
  $('sourceLabel').textContent = context.label ? `· ${context.label}` : '';
  $('redacted').hidden = !context.redactions;
  $('redacted').textContent = context.redactions ? `🔒 ${context.redactions} private item${context.redactions > 1 ? 's' : ''} hidden from the model` : '';
  $('sensitive').hidden = !context.sensitive;
  $('notice').hidden = !context.notice;
  $('notice').textContent = context.notice || '';
  input.placeholder = context.placeholder || 'Ask me anything…';
  renderChips(false);
  // Typing is for questions; next to a selection the buttons come first and "Ask…" reveals the box.
  $('askForm').hidden = !(context.mode === 'ask' || context.mode === 'sensitive' || showInput);
  renderEmpty();
}

// At most three buttons; the rest wait behind "More".
let showInput = false;
function renderChips(all) {
  const list = context.chips || [];
  const visible = all ? list : list.slice(0, 3);
  const buttons = visible.map(({ id, label }) => {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: label });
    b.dataset.task = id;
    b.addEventListener('click', () => runChip(id, label));
    return b;
  });
  if (!all && list.length > 3) {
    const more = Object.assign(document.createElement('button'), { className: 'chip more', textContent: 'More…' });
    more.dataset.more = '1';
    more.addEventListener('click', () => renderChips(true));
    buttons.push(more);
  }
  if (context.mode !== 'ask' && context.mode !== 'sensitive' && !showInput) {
    const askB = Object.assign(document.createElement('button'), { className: 'chip more', textContent: 'Ask…' });
    askB.addEventListener('click', () => { showInput = true; $('askForm').hidden = false; askB.remove(); focused = true; window.loon.focusBubble(); input.focus(); });
    buttons.push(askB);
  }
  $('chips').replaceChildren(...buttons);
}

// Empty bubble: a few things to try, so it never feels like a blank chat box.
function renderEmpty() {
  const empty = !log.children.length && !(context.chips || []).length && context.mode === 'ask' && !context.notice;
  $('empty').hidden = !empty;
  if (!empty) return;
  const ideas = ['What can you do?', 'Where did I leave off?', 'Remind me to stretch in 30 minutes'];
  $('suggestions').replaceChildren(...ideas.map((text) => {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: text });
    b.addEventListener('click', () => ask(text));
    return b;
  }));
}

function startAnswer(questionText, typed = true) {
  const a = document.createElement('div');
  a.className = 'a';
  a.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  // Typed questions are echoed; a button press doesn't need repeating back.
  if (typed) log.append(Object.assign(document.createElement('div'), { className: 'q', textContent: questionText }));
  log.append(a);
  $('empty').hidden = true;
  current = { id: nextId++, el: a, raw: '', question: questionText };
  autosize();
  log.scrollTop = log.scrollHeight;
  return current.id;
}

function runChip(task, label, deeper = false) {
  if (current) return;
  expandPill();
  $('chips').hidden = true; // the answer takes the space; other actions live in its ⋯ menu
  lastTask = task;
  const id = startAnswer(deeper ? `${label} (deeper)` : label, false);
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

function answerActions({ canGoDeeper, replaceText, text, question, quiz, tier, model, detail, estimated, memoryUsed = [] }) {
  const row = document.createElement('div');
  row.className = 'answer-tools';
  const add = (parent, label, onClick) => {
    const b = Object.assign(document.createElement('button'), { textContent: label });
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  };
  const flash = (b, label) => { const old = b.textContent; b.textContent = label; setTimeout(() => { b.textContent = old; }, 1400); };
  if (replaceText && context.editable) {
    add(row, 'Replace', async (e) => {
      try {
        await window.loon.replace(replaceText);
        e.target.textContent = 'Replaced ✓';
        e.target.disabled = true;
      } catch (err) {
        flash(e.target, 'Could not replace');
        console.error(err);
      }
    });
  }
  add(row, 'Copy', (e) => { navigator.clipboard.writeText(replaceText || text || ''); flash(e.target, 'Copied ✓'); });
  if (quiz) add(row, 'Harder questions', () => runChip('quiz_harder', 'Harder questions'));
  if (canGoDeeper && lastTask) add(row, 'Go deeper', () => runChip(lastTask, context.chips.find((c) => c.id === lastTask)?.label || 'Answer', true));

  const menu = document.createElement('span');
  menu.className = 'menu';
  const list = Object.assign(document.createElement('div'), { className: 'menu-list', hidden: true });
  add(menu, '⋯', () => { list.hidden = !list.hidden; requestAnimationFrame(reportHeight); }).title = 'More actions';
  for (const chip of (context.chips || []).filter((c) => c.id !== lastTask)) add(list, chip.label, () => { list.hidden = true; runChip(chip.id, chip.label); });
  if ($('askForm').hidden) add(list, 'Ask a follow-up', () => { list.hidden = true; showInput = true; $('askForm').hidden = false; focused = true; window.loon.focusBubble(); input.focus(); reportHeight(); });
  add(list, 'Save to notes', async (e) => {
    try {
      await window.loon.saveNote({ question, text });
      flash(e.target, 'Saved ✓');
    } catch (err) {
      flash(e.target, 'Could not save');
      console.error(err);
    }
  });
  add(list, 'Ask in Claude', () => { list.hidden = true; handoff('claude'); });
  add(list, 'Ask in ChatGPT', () => { list.hidden = true; handoff('chatgpt'); });
  add(list, 'Ask in Gemini', () => { list.hidden = true; handoff('gemini'); });
  row.append(menu);

  if (estimated) row.append(Object.assign(document.createElement('span'), { className: 'estimated', textContent: 'estimated' }));
  const icon = Object.assign(document.createElement('span'), { className: 'tier-icon', textContent: tier === 'local' ? '🐾' : tier === 'cloud' ? '☁️' : '⚡' });
  icon.title = tierLabel({ tier, model, detail, estimated }) + (memoryUsed.length ? `\nRemembered: ${memoryUsed.join('; ')}` : '');
  row.append(icon, list);
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
  // Connector calls list their parameters; required ones are marked.
  for (const f of command.fields || []) addField(`field:${f.name}`, `${f.name}${f.required ? ' *' : ''}`, 'text', f.value ?? '');
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
    if (edited.fields) edited.fields = edited.fields.map((f) => ({ ...f, value: fields[`field:${f.name}`].value.trim() }));
    for (const [key, input] of Object.entries(fields)) {
      if (key.startsWith('field:')) continue;
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
// Close calls from connector routing: the user picks, instead of a model guessing.
window.loon.onBubbleChoices(({ id, prompt, options }) => {
  if (current?.id !== id) return;
  const box = document.createElement('div');
  box.append(Object.assign(document.createElement('div'), { className: 'note', textContent: prompt }));
  const row = document.createElement('div');
  row.className = 'choices';
  for (const option of options) {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: option.label });
    b.addEventListener('click', () => {
      if (option.direct) {
        box.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: `${option.label}…` }));
        window.loon.confirmAction(id, option.command);
      } else {
        box.replaceWith(confirmCard(id, `${option.command.connectorName}: ${option.label}`, option.command));
      }
    });
    row.append(b);
  }
  box.append(row);
  current.el.replaceChildren(box);
});

// "Remember this?" after an answer: ✓ saves through the normal remember action, ✗ means don't ask again for it.
window.loon.onBubbleSuggest(({ id, text, label }) => {
  const row = document.createElement('div');
  row.className = 'suggest';
  row.append(Object.assign(document.createElement('span'), { textContent: `🐾 ${label}` }));
  const yes = Object.assign(document.createElement('button'), { className: 'chip', textContent: '✓', title: 'Remember this' });
  const no = Object.assign(document.createElement('button'), { className: 'chip', textContent: '✗', title: "Don't remember, and don't ask again" });
  yes.addEventListener('click', () => { row.remove(); window.loon.confirmAction(id, { action: 'remember', text }); });
  no.addEventListener('click', () => {
    window.loon.dismissSuggestion(text);
    row.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: "Okay, I won't ask about that again." }));
  });
  row.append(yes, no);
  log.append(row);
  log.scrollTop = log.scrollHeight;
});

window.loon.onBubbleAction(({ id, ok, message, results, markdown }) => {
  const note = Object.assign(document.createElement('div'), { className: ok ? (markdown ? 'a' : 'note') : 'a error' });
  if (markdown) note.innerHTML = renderMarkdown(message);
  else note.textContent = message;
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

window.loon.onAskChunk(({ id, chunk, restart }) => {
  if (current?.id !== id) return;
  if (restart) {
    current.raw = '';
    current.el.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    return;
  }
  current.raw += chunk;
  current.el.innerHTML = renderMarkdown(current.raw.trimStart());
  log.scrollTop = log.scrollHeight;
});
window.loon.onAskDone(({ id, text, ...meta }) => {
  if (current?.id !== id) return;
  current.el.innerHTML = renderMarkdown(text || current.raw.trim() || '…');
  if (meta.quiz) current.el.append(quizCard(meta.quiz));
  current.el.append(answerActions({ ...meta, text: text || current.raw, question: current.question }));
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

// Pill: a small paw beside a selection; clicking it opens the full card.
function expandPill() {
  if (!document.body.classList.contains('pill')) return;
  document.body.classList.remove('pill');
  window.loon.expandBubble();
  requestAnimationFrame(reportHeight);
}
$('paw').addEventListener('click', expandPill);

window.loon.onBubbleShown(({ context: next, focus, pill } = {}) => {
  focused = focus !== false;
  showInput = false;
  $('chips').hidden = false;
  document.body.classList.toggle('pill', Boolean(pill));
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
