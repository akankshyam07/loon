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
  // Without a model the input stays open: math, timers, reminders and definitions are all code.
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
  // The context mode (Developer Cat, Shopping Cat…) as a tiny pixel badge; it only reorders chips and flavor.
  const badge = context.modeBadge;
  $('modeBadge').hidden = !badge;
  $('modeBadge').textContent = badge?.badge || '';
  $('modeBadge').title = badge ? `${badge.name} · right-click the cat → Mode to change` : '';
  renderChips(false);
  const onboarding = context.mode === 'onboard';
  $('onboard').hidden = !onboarding;
  // Typing is for questions; next to a selection the buttons come first and "Ask…" reveals the box.
  $('askForm').hidden = onboarding || !(['ask', 'sensitive', 'screen'].includes(context.mode) || showInput);
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
  if (!['ask', 'sensitive', 'onboard', 'screen'].includes(context.mode) && !showInput) {
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
  $('greeting').hidden = !context.greeting;
  $('greeting').textContent = context.greeting || '';
  const ideas = ['What can you do?', 'Where did I leave off?', 'Remind me to stretch in 30 minutes'];
  // No page paired: "Look at my screen" reads the window in front (main/screen.js), only on this click.
  const look = context.lookChip ? [chipButton('Look at my screen', 'Reads the window you were on, on this Mac', () => runChip('screen_look', 'Look at my screen'))] : [];
  $('suggestions').replaceChildren(...look, ...ideas.map((text) => {
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

function answerActions({ id, canGoDeeper, replaceText, text, question, quiz, tier, model, detail, estimated, fromScreen, pageOffer = false, memoryUsed = [] }) {
  const row = document.createElement('div');
  row.className = 'answer-tools';
  const add = (parent, label, onClick) => {
    const b = Object.assign(document.createElement('button'), { textContent: label });
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  };
  const flash = (b, label) => { const old = b.textContent; b.textContent = label; setTimeout(() => { b.textContent = old; }, 1400); };
  const answerEl = () => row.parentElement;
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
  if (pageOffer && question) add(row, 'Answer from this page', (e) => { e.target.remove(); if (!current) ask(question, { page: true }); });
  if (quiz) add(row, 'Harder questions', () => runChip('quiz_harder', 'Harder questions'));
  if (canGoDeeper && lastTask) add(row, 'Go deeper', () => runChip(lastTask, context.chips.find((c) => c.id === lastTask)?.label || 'Answer', true));

  const menu = document.createElement('span');
  menu.className = 'menu';
  const list = Object.assign(document.createElement('div'), { className: 'menu-list', hidden: true });
  // "Remember this" uses the sentence selected in this answer, so it is read before the click can clear it.
  let selected = '';
  const toggle = add(menu, '⋯', () => { list.hidden = !list.hidden; toggle.setAttribute('aria-expanded', String(!list.hidden)); requestAnimationFrame(reportHeight); });
  toggle.title = 'More actions';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('mousedown', () => {
    const sel = window.getSelection();
    selected = sel && !sel.isCollapsed && answerEl()?.contains(sel.anchorNode) ? sel.toString() : '';
  });
  const item = (label, onClick) => add(list, label, (e) => { list.hidden = true; toggle.setAttribute('aria-expanded', 'false'); onClick(e); requestAnimationFrame(reportHeight); });
  for (const chip of (context.chips || []).filter((c) => c.id !== lastTask)) item(chip.label, () => runChip(chip.id, chip.label));
  if (context.mode === 'screen') item('Look again', () => runChip('screen_look', 'Look again'));
  if ($('askForm').hidden) item('Ask a follow-up', () => { showInput = true; $('askForm').hidden = false; focused = true; window.loon.focusBubble(); input.focus(); reportHeight(); });
  add(list, 'Save to notes', async (e) => {
    try {
      await window.loon.saveNote({ question, text });
      flash(e.target, 'Saved ✓');
    } catch (err) {
      flash(e.target, 'Could not save');
      console.error(err);
    }
  });
  if (!context.privacy) item('Remember this', () => rememberThis(id, selected, row));
  if (memoryUsed.length) item('Forget what you used', () => forgetUsed(memoryUsed, row));
  item('Save this chat', () => saveChat(row));
  item('History', () => window.loon.openHistory());
  item('Ask in Claude', () => handoff('claude'));
  item('Ask in ChatGPT', () => handoff('chatgpt'));
  item('Ask in Gemini', () => handoff('gemini'));
  row.append(menu);

  if (estimated) row.append(Object.assign(document.createElement('span'), { className: 'estimated', textContent: 'estimated' }));
  // 👍/👎: stored on this Mac with the task and settings (not the answer); nothing in Privacy mode.
  if (!context.privacy) {
    const votes = Object.assign(document.createElement('span'), { className: 'votes' });
    for (const [vote, icon, label] of [[1, '👍', 'Good answer'], [-1, '👎', 'Not helpful']]) {
      const b = add(votes, icon, async () => {
        for (const other of votes.children) other.disabled = true;
        b.setAttribute('aria-pressed', 'true');
        const result = await window.loon.feedback(id, vote);
        if (result?.nudge) styleNudge(result.nudge, row);
      });
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', 'false');
    }
    row.append(votes);
  }
  const icon = Object.assign(document.createElement('span'), { className: 'tier-icon', textContent: tier === 'local' ? '🐾' : tier === 'cloud' ? '☁️' : '⚡' });
  icon.title = tierLabel({ tier, model, detail, estimated }) + (fromScreen ? '\n👀 read from your screen' : '') + (memoryUsed.length ? `\nRemembered: ${memoryUsed.map((f) => f.text).join('; ')}` : '');
  // Where the answer came from is trust information, so keyboard and screen-reader users get it too, not only on hover.
  Object.assign(icon, { tabIndex: 0 });
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', icon.title.replace(/\n/g, '. '));
  row.append(icon, list);
  return row;
}

// Cards that open under an answer's tools row (one of each kind at a time).
function underAnswer(row, className, node) {
  row.parentElement.querySelector(`:scope > .${className}`)?.remove();
  node.classList.add(className);
  row.after(node);
  log.scrollTop = log.scrollHeight;
  return node;
}
const noteEl = (text) => Object.assign(document.createElement('div'), { className: 'note', textContent: text });
const chipButton = (label, title, onClick) => {
  const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: label, title, type: 'button' });
  b.addEventListener('click', onClick);
  return b;
};

// A reply-style nudge after several 👎: a question with ✓/✗, never a silent change.
function styleNudge({ key, label }, row) {
  const box = document.createElement('div');
  box.className = 'suggest';
  box.append(Object.assign(document.createElement('span'), { textContent: `🐾 ${label}` }));
  const answer = async (accept) => {
    const result = await window.loon.answerNudge(key, accept);
    box.replaceWith(noteEl(result?.message || 'Okay.'));
  };
  box.append(chipButton('✓', 'Yes, change it', () => answer(true)), chipButton('✗', "No, and don't ask again", () => answer(false)));
  underAnswer(row, 'nudge-box', box);
}

// "Remember this": an editable proposal; nothing is saved until ✓ (the normal remember action, then the toast).
async function rememberThis(id, selected, row) {
  const { text } = await window.loon.proposeMemory(id, selected);
  const box = document.createElement('div');
  box.className = 'confirm';
  box.append(Object.assign(document.createElement('div'), { className: 'confirm-title', textContent: 'Remember this?' }));
  const field = Object.assign(document.createElement('textarea'), { value: text || '', placeholder: 'What should I remember?', maxLength: 200, rows: 2 });
  field.setAttribute('aria-label', 'Memory to save');
  field.addEventListener('mousedown', () => { if (!focused) { focused = true; window.loon.focusBubble(); } });
  const buttons = Object.assign(document.createElement('div'), { className: 'confirm-buttons' });
  const yes = Object.assign(document.createElement('button'), { className: 'primary', textContent: '✓ Remember', type: 'button' });
  const no = Object.assign(document.createElement('button'), { className: 'secondary', textContent: 'Cancel', type: 'button' });
  yes.addEventListener('click', () => {
    const fact = field.value.trim();
    if (!fact) return;
    box.remove();
    window.loon.confirmAction(id, { action: 'remember', text: fact });
  });
  no.addEventListener('click', () => box.remove());
  buttons.append(yes, no);
  box.append(field, buttons);
  underAnswer(row, 'remember-box', box);
  field.focus();
  field.setSelectionRange(0, 0);
}

// "Forget what you used": the memories this answer was given, each with ✕.
function forgetUsed(facts, row) {
  const box = document.createElement('div');
  box.className = 'used';
  box.append(Object.assign(document.createElement('div'), { className: 'used-title', textContent: 'I used these memories:' }));
  const ul = document.createElement('ul');
  for (const fact of facts) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: fact.text }));
    const x = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Forget this', type: 'button' });
    x.setAttribute('aria-label', `Forget "${fact.text}"`);
    x.addEventListener('click', async () => {
      x.disabled = true;
      await window.loon.deleteMemory(fact.id);
      li.classList.add('gone');
      li.replaceChildren(Object.assign(document.createElement('span'), { textContent: fact.text }), Object.assign(document.createElement('em'), { textContent: 'forgotten' }));
    });
    li.append(x);
    ul.append(li);
  }
  box.append(ul);
  underAnswer(row, 'used-box', box);
}

// "Save this chat": the thread goes to the notes folder; facts the user stated in it come back as a tick list.
async function saveChat(row) {
  let result;
  try {
    result = await window.loon.saveChat();
  } catch (err) {
    underAnswer(row, 'chat-box', noteEl(`Couldn't save: ${err.message}`));
    return;
  }
  const box = document.createElement('div');
  box.append(noteEl(`Saved this chat to ${result.file.split('/').slice(-2).join('/')}.`));
  if (result.facts.length) {
    const card = Object.assign(document.createElement('div'), { className: 'confirm' });
    card.append(Object.assign(document.createElement('div'), { className: 'confirm-title', textContent: 'Remember these too?' }));
    const checks = result.facts.map((fact) => {
      const check = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
      const label = Object.assign(document.createElement('label'), { className: 'fact' });
      label.append(check, document.createTextNode(` ${fact}`));
      card.append(label);
      return { fact, check };
    });
    const buttons = Object.assign(document.createElement('div'), { className: 'confirm-buttons' });
    const yes = Object.assign(document.createElement('button'), { className: 'primary', textContent: '✓ Remember ticked', type: 'button' });
    const no = Object.assign(document.createElement('button'), { className: 'secondary', textContent: 'No thanks', type: 'button' });
    yes.addEventListener('click', async () => {
      const keep = checks.filter((c) => c.check.checked).map((c) => c.fact);
      card.remove();
      if (keep.length) await window.loon.rememberFacts(keep);
    });
    no.addEventListener('click', () => card.remove());
    buttons.append(yes, no);
    card.append(buttons);
    box.append(card);
  }
  underAnswer(row, 'chat-box', box);
}

// "Loon remembered…": every saved fact shows here for 5 s with Undo. Several in a row share one toast.
const toast = { ids: [], texts: [], timer: null };
function showToast() {
  clearTimeout(toast.timer);
  $('toastText').textContent = toast.ids.length > 1 ? `🐾 Loon remembered ${toast.ids.length} things` : `🐾 Loon remembered “${toast.texts[0]}”`;
  $('toastUndo').hidden = false;
  $('toast').hidden = false;
  toast.timer = setTimeout(hideToast, 5000);
}
function hideToast() {
  clearTimeout(toast.timer);
  $('toast').hidden = true;
  toast.ids = [];
  toast.texts = [];
}
window.loon.onBubbleRemembered(({ id, text }) => {
  toast.ids.push(id);
  toast.texts.push(text);
  showToast();
});
$('toastUndo').addEventListener('click', async () => {
  const ids = toast.ids.slice();
  clearTimeout(toast.timer);
  $('toastUndo').hidden = true;
  $('toastText').textContent = ids.length > 1 ? 'Okay, forgot those.' : 'Okay, forgot it.';
  for (const id of ids) await window.loon.deleteMemory(id);
  toast.ids = [];
  toast.texts = [];
  toast.timer = setTimeout(hideToast, 1400);
});

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

// buttons: optional { yes, no, cancelled } labels (the first-time "look at my screen" card).
function confirmCard(id, summary, command, buttons = {}) {
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
  const row = document.createElement('div');
  row.className = 'confirm-buttons';
  const yes = document.createElement('button');
  yes.className = 'primary';
  yes.textContent = buttons.yes || '✓ Do it';
  const no = document.createElement('button');
  no.className = 'secondary';
  no.textContent = buttons.no || 'Cancel';
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
    card.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: buttons.cancelled || 'Cancelled. Nothing was changed.' }));
    current = null;
    autosize();
  });
  row.append(yes, no);
  card.append(row);
  return card;
}

window.loon.onBubbleConfirm(({ id, summary, command, buttons }) => {
  if (current?.id !== id) return;
  current.el.replaceChildren(confirmCard(id, summary, command, buttons));
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

// "Do it for me" (§3.13.1): a step log, one card per change (✓ Do it / ⏭ Skip / ✕ Stop), and a ✕ that stops the task.
const STEP_ICONS = { done: '✓', auto: '⚡', read: '👀', skipped: '⏭', refused: '🔒', error: '⚠', info: '🐾' };
let agentPanel = null; // { id, steps, slot }

function agentButton(label, className, onClick) {
  const b = Object.assign(document.createElement('button'), { className, textContent: label });
  b.addEventListener('click', onClick);
  return b;
}

function agentCard(msg) {
  const box = document.createElement('div');
  box.className = 'confirm';
  box.append(Object.assign(document.createElement('div'), { className: 'confirm-title', textContent: msg.title }));
  const answer = (decision, facts) => {
    box.replaceWith(Object.assign(document.createElement('div'), { className: 'note', textContent: decision === 'stop' ? 'Stopping…' : '' }));
    window.loon.agentDecision(msg.stepId, decision, facts);
  };
  if (msg.kind === 'facts') {
    const boxes = msg.facts.map((fact) => {
      const row = document.createElement('label');
      row.className = 'fact';
      const check = Object.assign(document.createElement('input'), { type: 'checkbox' });
      row.append(check, document.createTextNode(` ${fact}`));
      box.append(row);
      return check;
    });
    box.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'Only ticked items are used, only for this task. Never passwords or card details.' }));
    const buttons = document.createElement('div');
    buttons.className = 'confirm-buttons';
    buttons.append(
      agentButton('✓ Continue', 'primary', () => answer('do', boxes.flatMap((c, i) => (c.checked ? [i] : [])))),
      agentButton('✕ Stop', 'secondary', () => answer('stop')),
    );
    box.append(buttons);
    return box;
  }
  if (msg.target) box.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: `On the page: ${msg.target}${msg.site ? ` · ${msg.site}` : ''}` }));
  if (msg.reason) box.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: `Why: ${msg.reason}` }));
  if (msg.risky) box.append(Object.assign(document.createElement('div'), { className: 'risky', textContent: 'This one spends, sends or deletes something, so it always needs your click.' }));
  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';
  buttons.append(
    agentButton('✓ Do it', 'primary', () => answer('do')),
    agentButton('⏭ Skip', 'secondary', () => answer('skip')),
    agentButton('✕ Stop', 'secondary', () => answer('stop')),
  );
  box.append(buttons);
  if (msg.canAllowRest) box.append(agentButton(`Allow the rest of this task on ${msg.site}`, 'linkish', () => answer('allow')));
  return box;
}

window.loon.onBubbleAgent((msg) => {
  if (msg.type === 'start') {
    if (current?.id !== msg.id) return;
    const panel = document.createElement('div');
    panel.className = 'agent';
    const head = document.createElement('div');
    head.className = 'agent-head';
    head.append(Object.assign(document.createElement('span'), { textContent: '🐾 On it, step by step' }), agentButton('✕', 'agent-stop', () => window.loon.cancelAsk()));
    head.lastChild.title = 'Stop (Esc)';
    agentPanel = { id: msg.id, steps: Object.assign(document.createElement('ol'), { className: 'agent-steps' }), slot: document.createElement('div') };
    panel.append(head, agentPanel.steps, agentPanel.slot);
    current.el.replaceChildren(panel);
  } else if (!agentPanel || agentPanel.id !== msg.id) {
    return;
  } else if (msg.type === 'log') {
    agentPanel.slot.replaceChildren();
    const li = Object.assign(document.createElement('li'), { textContent: `${STEP_ICONS[msg.kind] || '·'} ${msg.text}` });
    li.className = msg.kind;
    agentPanel.steps.append(li);
  } else if (msg.type === 'confirm') {
    agentPanel.slot.replaceChildren(agentCard(msg));
    if (!focused) { focused = true; window.loon.focusBubble(); }
  } else if (msg.type === 'end') {
    agentPanel.slot.replaceChildren(Object.assign(document.createElement('div'), { className: msg.ok ? 'note' : 'a error', textContent: msg.message }));
    agentPanel.slot.closest('.agent')?.querySelector('.agent-stop')?.remove();
    agentPanel = null;
    if (current?.id === msg.id) current = null;
    autosize();
  }
  log.scrollTop = log.scrollHeight;
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
    if (waitingForBrain && !current) {
      const question = waitingForBrain;
      waitingForBrain = null;
      const waiting = document.querySelector('.a.waiting');
      if (waiting?.previousElementSibling?.classList.contains('q')) waiting.previousElementSibling.remove();
      waiting?.remove();
      ask(question);
    }
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

let lastTyped = null;
let waitingForBrain = null; // a typed question that needs the model, answered once the download finishes
function ask(text, options) {
  lastTask = null;
  lastTyped = text;
  const id = startAnswer(text);
  window.loon.ask(id, text, options);
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
  // the companion's little aside, kept apart from the answer (copy, speech and memory use only the answer)
  if (meta.flavor) current.el.append(Object.assign(document.createElement('p'), { className: 'flavor', textContent: meta.flavor }));
  current.el.append(answerActions({ ...meta, id, text: text || current.raw, question: current.question }));
  current = null;
  autosize();
  if (focused) input.focus();
});
window.loon.onAskError(({ id, message }) => {
  if (current?.id !== id) return;
  if (/no model available/i.test(message) && current.question === lastTyped) {
    waitingForBrain = current.question;
    current.el.classList.add('waiting');
    current.el.textContent = "That one needs my brain. Tap Download above and I'll answer it as soon as it's ready.";
    current = null;
    autosize();
    return;
  }
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
  hideToast();
  current = null;
  lastTask = null;
  agentPanel = null;
  renderContext(next);
  // History → Continue: the earlier turns come back so the next question is a follow-up.
  for (const turn of context.thread || []) {
    log.append(Object.assign(document.createElement('div'), { className: 'q', textContent: turn.question }));
    const a = Object.assign(document.createElement('div'), { className: 'a' });
    a.innerHTML = renderMarkdown(turn.answer);
    log.append(a);
  }
  if (context.thread?.length) log.append(noteEl('Picked up from History. Ask a follow-up.'));
  renderEmpty();
  if (context.mode === 'onboard') window.LoonOnboard.start($('onboard'), { privacy: Boolean(context.onboard?.privacy), onClose: () => window.loon.closeBubble() });
  else $('onboard').replaceChildren();
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
  $('onboard').replaceChildren();
  hideToast();
  current = null;
  agentPanel = null;
  input.value = '';
  autosize();
});
