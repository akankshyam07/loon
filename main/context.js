// ContextPackets (DESIGN.md §2.2): every piece of screen context takes this shape, and every one is redacted here,
// before any task, model, or hand-off can see it.
const { redact } = require('../brain/redact');

function selectionPacket(message) {
  const text = redact(message.text || '');
  const surrounding = redact(message.surrounding || '');
  return {
    source: 'selection',
    text: text.text,
    surrounding: surrounding.text,
    redactions: text.count + surrounding.count,
    selectionKind: message.kind || 'paragraph',
    editable: message.kind === 'editable',
    pageKind: message.pageKind,
    url: message.url,
    title: message.title,
    tabId: message.tabId,
    anchor: message.anchor || null,
  };
}

// Main-content extraction with Defuddle (MIT) on a linkedom DOM; falls back to all visible text.
async function pagePacket(reply, tabId) {
  const [{ parseHTML }, { Defuddle }] = await Promise.all([import('linkedom'), import('defuddle/node')]);
  const { document } = parseHTML(reply.html);
  let text = '';
  try {
    const result = await Defuddle(document, reply.url);
    text = textFromHtml(parseHTML, result.content || '');
  } catch (err) {
    console.warn('[page] Defuddle failed, using raw text:', err.message);
  }
  if (text.length < 200) text = textFromHtml(parseHTML, reply.html);
  if (reply.outline?.length) text += `\n\nHeadings and buttons on the page: ${reply.outline.join(' | ')}`;
  const cleaned = redact(text);
  return {
    source: 'page',
    text: cleaned.text,
    // Raw HTML stays in the main process for deterministic extractors (prices, reviews); prompts only ever use `text`.
    html: reply.html,
    redactions: cleaned.count,
    url: reply.url,
    title: reply.title,
    tabId,
  };
}

function textFromHtml(parseHTML, html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const el of document.querySelectorAll('script, style, noscript, svg, nav, footer, header, aside')) el.remove();
  const BLOCKS = 'h1, h2, h3, h4, p, li, pre, blockquote, td';
  const blocks = [...document.querySelectorAll(BLOCKS)]
    .filter((el) => !el.querySelector(BLOCKS)) // innermost blocks only, so nested text isn't repeated
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = blocks.length ? blocks.join('\n') : document.body.textContent;
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { selectionPacket, pagePacket };
