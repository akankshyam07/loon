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

// Text hidden with inline styles is a classic place for prompt injection; a reader never sees it, so neither does Loon.
// Removed before Defuddle, which drops style attributes.
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)|font-size\s*:\s*[01](?:\.\d+)?px|left\s*:\s*-\d{3,}px/i;
function removeHidden(document) {
  for (const el of document.querySelectorAll('[hidden], [aria-hidden="true"], [style]')) {
    if (!el.hasAttribute('style') || HIDDEN_STYLE.test(el.getAttribute('style'))) el.remove();
  }
}

// Main-content extraction with Defuddle (MIT) on a linkedom DOM; falls back to all visible text.
async function pagePacket(reply, tabId) {
  const [{ parseHTML }, { Defuddle }] = await Promise.all([import('linkedom'), import('defuddle/node')]);
  const { document } = parseHTML(reply.html);
  removeHidden(document);
  let text = '';
  try {
    const result = await Defuddle(document, reply.url);
    text = textFromHtml(parseHTML, result.content || '');
  } catch (err) {
    console.warn('[page] Defuddle failed, using raw text:', err.message);
  }
  if (text.length < 200) text = textFromHtml(parseHTML, document.documentElement.outerHTML);
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

// Every visible text node, with a line break at each block element. Prices and calories often sit in bare <span>,
// <small> or <div> elements, so collecting only paragraphs and headings lost them.
const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL']);
function textFromHtml(parseHTML, html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const el of document.querySelectorAll('script, style, noscript, svg, nav, footer, header, aside, template, [hidden], [aria-hidden="true"]')) el.remove();
  removeHidden(document);
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      out.push(node.textContent);
      return;
    }
    if (node.nodeType !== 1) return;
    const block = BLOCK.has(node.tagName);
    if (block) out.push('\n');
    for (const child of node.childNodes) walk(child);
    out.push(block ? '\n' : ' ');
  };
  walk(document.body);
  return out.join('').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').trim();
}

module.exports = { selectionPacket, pagePacket };
