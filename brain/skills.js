// Code tiers for M3 modes (DESIGN.md §2.10): each returns an answer without a model, or null to fall through.
// Only the shopping extractor generator and explicitly word-shaped requests ever reach the LLM.
const fs = require('fs');
const path = require('path');
const shopping = require('./shopping');
const { summarizeReviews, extractReviews } = require('./reviews');
const food = require('./food');
const { lookupKnown } = require('./errors');
const { jsonToDto, fixGrammar } = require('./devtools');
const { redact } = require('./redact');
const { makeQuiz } = require('./quiz');

class Skills {
  constructor({ dataDir, brain }) {
    this.brain = brain;
    this.extractorsDir = path.join(dataDir, 'extractors');
    this.basketFile = path.join(dataDir, 'compare.json');
  }

  async doc(packet) {
    if (!packet.html) return null;
    const { parseHTML } = await import('linkedom');
    return parseHTML(packet.html).document;
  }

  // ---------- shopping ----------
  extractorFile(url) {
    return path.join(this.extractorsDir, `${new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_')}.json`);
  }

  // Structured data first; then a cached per-domain extractor; generating one (the only LLM step) if needed.
  async products(packet, { allowGenerate = true } = {}) {
    const doc = await this.doc(packet);
    if (!doc) return { items: [], via: 'none' };
    const structured = shopping.extractStructured(doc);
    if (structured.length >= 2 || (structured.length === 1 && !allowGenerate)) return { items: structured, via: 'structured data' };
    const file = packet.url && this.extractorFile(packet.url);
    if (file && fs.existsSync(file)) {
      const extractor = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (shopping.validExtractor(doc, extractor)) return { items: shopping.applyExtractor(doc, extractor), via: 'saved site extractor' };
      fs.rmSync(file); // the site changed: regenerate below
    }
    if (structured.length === 1) return { items: structured, via: 'structured data' };
    if (!allowGenerate || !file) return { items: [], via: 'none' };
    const extractor = await this.generateExtractor(doc);
    if (!extractor) return { items: [], via: 'none' };
    fs.mkdirSync(this.extractorsDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(extractor, null, 2));
    return { items: shopping.applyExtractor(doc, extractor), via: 'new site extractor (one-time model call)' };
  }

  async generateExtractor(doc) {
    const outline = shopping.outlineForExtractor(doc).map((l) => ({ ...l, text: redact(l.text).text }));
    if (outline.length < 2) return null;
    const prompt = [
      'You write CSS selectors for a product listing. Below is a flat JSON outline of page elements that contain prices:',
      'each has a CSS path (tag.class chain) and its text.',
      'Reply with ONLY a JSON object: {"item": "<selector for one repeated product card>", "name": "<selector inside the card for the product name>", "price": "<selector inside the card for the price>"}',
      '',
      JSON.stringify(outline, null, 0),
    ].join('\n');
    let reply = '';
    await this.brain.chat(prompt, { onText: (t) => { reply += t; }, maxTokens: 200 });
    this.brain.resetThread();
    const match = reply.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    try {
      const extractor = JSON.parse(match[0]);
      return shopping.validExtractor(doc, extractor) ? extractor : null;
    } catch {
      return null;
    }
  }

  basket() {
    try {
      return JSON.parse(fs.readFileSync(this.basketFile, 'utf8'));
    } catch {
      return [];
    }
  }

  saveBasket(items) {
    fs.writeFileSync(this.basketFile, JSON.stringify(items, null, 2));
  }

  // ---------- dispatcher ----------
  async run(tier, taskId, packet, { memory = [], judgmental = true } = {}) {
    switch (tier) {
      case 'shopping': {
        const { items, via } = await this.products(packet);
        if (!items.length) return { text: "I couldn't find products with prices on this page.", mood: 'confused', detail: 'no products found' };
        const analysis = shopping.analyze(items, packet.text);
        const { text: line, mood } = shopping.verdict(analysis, { judgmental });
        packet.analysis = analysis;
        return { text: `${line}\n\n${shopping.renderTable(analysis)}`, mood, detail: `${items.length} products · ${via}`, usedModel: via.startsWith('new site extractor') };
      }
      case 'reviews': {
        const doc = await this.doc(packet);
        const summary = doc && summarizeReviews(extractReviews(doc));
        return summary ? { text: summary, mood: 'focused', detail: 'review keywords, no model' } : { text: "I don't see any reviews on this page.", mood: 'curious', detail: 'no reviews found' };
      }
      case 'basket-add': {
        const { items } = await this.products(packet, { allowGenerate: false });
        if (!items.length) return { text: "I couldn't find a product price to save from this page.", mood: 'confused' };
        const item = { ...items[0], site: new URL(packet.url).hostname.replace(/^www\./, ''), url: packet.url, savedAt: Date.now() };
        const basket = this.basket().filter((b) => !(b.name === item.name && b.site === item.site));
        basket.push(item);
        this.saveBasket(basket.slice(-12));
        return { text: `Saved **${shopping.short(item.name)}** (${shopping.money(item)}) to your compare basket. ${basket.length} item${basket.length > 1 ? 's' : ''} so far.`, mood: 'happy', detail: 'compare basket' };
      }
      case 'basket-compare': {
        const basket = this.basket();
        if (basket.length < 2) return { text: `Your compare basket has ${basket.length} item${basket.length === 1 ? '' : 's'}. Add products from a few pages first.`, mood: 'curious', detail: 'compare basket' };
        const analysis = shopping.analyze(basket);
        const { text: line, mood } = shopping.verdict(analysis);
        packet.analysis = analysis;
        return { text: `${line}\n\n${shopping.renderTable(analysis)}\n\nFrom: ${[...new Set(basket.map((b) => b.site))].join(', ')}`, mood, detail: `${basket.length} saved products` };
      }
      case 'basket-clear':
        this.saveBasket([]);
        return { text: 'Compare basket cleared.', mood: 'happy', detail: 'compare basket' };
      case 'food': {
        const items = food.extractMenu(packet.text || '');
        if (!items.length) return { text: "I couldn't read menu items with prices here. A screenshot (⌥⇧S) can help with menu images.", mood: 'confused' };
        const goal = { food_lightest: 'lightest', food_protein: 'protein', food_veg: 'vegetarian' }[taskId];
        // Memory without a model: a saved "I'm vegetarian" filters every menu answer.
        const vegetarian = memory.some((m) => /\b(vegetarian|vegan)\b/i.test(m)) && !/\bnot (vegetarian|vegan)\b/i.test(memory.join(' '));
        const result = food.recommend(items, goal, { vegetarianOnly: vegetarian, judgmental });
        return { ...result, detail: `${items.length} menu items · keywords, no model${vegetarian ? ' · using your saved diet' : ''}` };
      }
      case 'errors': {
        const text = lookupKnown(packet.text || '');
        return text ? { text, mood: 'focused', detail: 'known-error table' } : null;
      }
      case 'dto': {
        try {
          JSON.parse(packet.text);
        } catch {
          return { text: "That isn't valid JSON, so I can't make types from it.", mood: 'confused' };
        }
        const language = taskId === 'make_dto_ts' ? 'typescript' : 'java';
        return { text: await jsonToDto(packet.text, language), mood: 'happy', detail: 'quicktype' };
      }
      case 'ocr-text':
        return packet.text ? { text: `\`\`\`\n${packet.text}\n\`\`\``, mood: 'happy', detail: 'Tesseract OCR on this Mac', copyText: packet.text } : null;
      case 'quiz': {
        const quiz = makeQuiz(packet.text || '', 3);
        if (!quiz.length) return { text: 'There isn\u2019t enough text here for a quiz.', mood: 'confused' };
        return { text: `**Quiz**: fill in the blanks (${quiz.length} questions).`, mood: 'focused', detail: 'cloze cards from key sentences, no model', quiz };
      }
      case 'grammar': {
        const { fixed, changes } = await fixGrammar(packet.text || '');
        if (!changes.length) return { text: 'No grammar or spelling problems found. ✨', mood: 'happy', detail: 'Harper grammar checker' };
        return { text: `${fixed}\n\n_Fixed: ${changes.join(' · ')}_`, mood: 'happy', detail: 'Harper grammar checker', replaceText: fixed };
      }
      default:
        return null;
    }
  }
}

module.exports = { Skills };
