// Offline translation (DESIGN.md §2.10, tier T2): franc detects the language, Bergamot translates.
// Returns null when the pair isn't supported so the caller can fall back to the local LLM.
const path = require('path');

// franc returns ISO 639-3; Bergamot models use ISO 639-1.
const ISO3_TO_1 = {
  eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it', por: 'pt', nld: 'nl', pol: 'pl', ces: 'cs', est: 'et', bul: 'bg',
  rus: 'ru', ukr: 'uk', isl: 'is', nno: 'nn', nob: 'nb', fas: 'fa', pes: 'fa', ell: 'el', hun: 'hu', ron: 'ro', slk: 'sk',
  slv: 'sl', hrv: 'hr', srp: 'sr', dan: 'da', swe: 'sv', fin: 'fi', lit: 'lt', lav: 'lv', tur: 'tr', cat: 'ca', mlt: 'mt',
  jpn: 'ja', kor: 'ko', cmn: 'zh', zho: 'zh', arb: 'ar', ara: 'ar', heb: 'he', hin: 'hi', vie: 'vi', ind: 'id',
};
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
const languageName = (code) => LANGUAGE_NAMES.of(code) || code;

// franc guesses badly on a few words ("Ich bin müde heute" → Turkish, "hola amigo, ¿cómo estás?" → nothing), and short
// phrases are most of what people translate. Common words and letters settle those; longer text goes to franc.
const HINTS = {
  en: /(?<!\p{L})(the|and|is|are|you|what|this|with|have|hello|thanks|please|how|my|i'm|it's)(?!\p{L})/gu,
  es: /[¿¡ñ]|(?<!\p{L})(hola|gracias|cómo|como|estás|qué|por favor|amigo|amiga|buenos|buenas|dónde|el|los|las|una|es|está|muy|pero|yo|tengo|quiero)(?!\p{L})/gu,
  fr: /[çœ]|(?<!\p{L})(bonjour|bonsoir|merci|je|tu|vous|est|le|les|une|et|très|où|oui|non|suis|c'est|j'ai|avec|pour)(?!\p{L})/gu,
  de: /[ß]|(?<!\p{L})(ich|bin|und|nicht|danke|bitte|heute|ist|der|die|das|ein|eine|guten|morgen|müde|wie|geht|es|mir|sehr)(?!\p{L})/gu,
  it: /(?<!\p{L})(ciao|grazie|sono|che|non|il|della|buongiorno|buonasera|come|stai|sei|molto|perché|anche|questo)(?!\p{L})/gu,
  pt: /[ãõ]|(?<!\p{L})(olá|obrigado|obrigada|você|não|está|bom|dia|tudo|bem|muito|eu|sou|também)(?!\p{L})/gu,
  nl: /(?<!\p{L})(hallo|dank|je|ik|niet|het|een|goedemorgen|hoe|gaat|met|jij|ben|heel)(?!\p{L})/gu,
};
function shortTextLanguage(text) {
  if (text.length > 80) return null;
  const lower = text.toLowerCase();
  const scores = Object.entries(HINTS).map(([lang, re]) => [lang, (lower.match(re) || []).length]).sort((a, b) => b[1] - a[1]);
  const [[best, top], [, second]] = scores;
  return top >= 1 && top > second ? best : null;
}

class Translator {
  constructor({ cacheDir }) {
    this.cacheDir = cacheDir;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  async detect(text) {
    const hinted = shortTextLanguage(text);
    if (hinted) return hinted;
    const { franc } = await import('franc-min');
    const code3 = franc(text, { minLength: 3 });
    return ISO3_TO_1[code3] || null;
  }

  start() {
    if (this.child) return;
    const script = path.join(__dirname, 'translator-host.mjs');
    const env = { ...process.env, LOON_TRANSLATION_CACHE: this.cacheDir };
    let electron = null;
    try { electron = require('electron'); } catch { /* plain Node (tests) */ }
    if (electron?.utilityProcess) {
      this.child = electron.utilityProcess.fork(script, [], { env, serviceName: 'loon-translator' });
      this.child.on('message', (m) => this.onMessage(m));
    } else {
      this.child = require('child_process').fork(script, [], { env, stdio: 'ignore' });
      this.child.on('message', (m) => this.onMessage(m));
    }
    this.child.on('exit', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Translator stopped'));
      this.pending.clear();
      this.child = null;
    });
  }

  onMessage(message) {
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error));
    else waiter.resolve(message);
  }

  call(payload, timeoutMs = 60000) {
    this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Translation timed out')); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      if (this.child.send) this.child.send({ id, ...payload }); // child_process
      else this.child.postMessage({ id, ...payload }); // Electron utilityProcess
    });
  }

  async supports(from, to) {
    this.pairs ??= this.call({ type: 'pairs' }).then((r) => new Set(r.pairs)).catch(() => new Set());
    const pairs = await this.pairs;
    // Bergamot pivots through English when there is no direct model.
    return pairs.has(`${from}-${to}`) || (pairs.has(`${from}-en`) && pairs.has(`en-${to}`));
  }

  // → { text, from, to, fromName, toName } | { sameLanguage, from } | null (unsupported)
  async translate(text, { to = 'en', fallbackTo = 'es' } = {}) {
    const from = await this.detect(text);
    if (!from) return null;
    const target = from === to ? fallbackTo : to;
    if (from === target) return { sameLanguage: true, from };
    if (!(await this.supports(from, target))) return null;
    const { text: translated } = await this.call({ from, to: target, text });
    return { text: translated, from, to: target, fromName: languageName(from), toName: languageName(target) };
  }

  stop() {
    this.child?.kill();
    this.child = null;
  }
}

module.exports = { Translator, languageName, shortTextLanguage };
