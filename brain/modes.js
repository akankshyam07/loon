// Context modes (CLAUDE.md "Modes", DESIGN.md §3.12.2): Developer, Shopping, Food, Study and Work Cat, picked from
// the site, page kind, selection kind or app in plain code. A mode only reorders the chips, picks the greeting's
// flavor line and boosts memories from its domain. It never changes which task runs or what an answer says.

const MODES = {
  dev: { name: 'Developer Cat', badge: 'dev', domain: 'code', chips: ['explain_code', 'find_bug', 'explain_error', 'likely_fix', 'explain_json', 'make_dto_java', 'make_dto_ts'] },
  shopping: { name: 'Shopping Cat', badge: 'shop', domain: 'shopping', chips: ['shop_value', 'shop_reviews', 'shop_take', 'shop_add', 'shop_basket'] },
  food: { name: 'Food Cat', badge: 'food', domain: 'food', chips: ['food_lightest', 'food_protein', 'food_veg', 'food_estimate'] },
  study: { name: 'Study Cat', badge: 'study', domain: 'study', chips: ['summarize', 'explain', 'quiz', 'simplify', 'page_summary', 'page_notes'] },
  work: { name: 'Work Cat', badge: 'work', domain: 'work', chips: ['professional', 'shorter', 'fix_grammar', 'rewrite', 'summarize', 'page_checklist'] },
};

const SITES = [
  ['dev', /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|stackexchange\.com|developer\.mozilla\.org|npmjs\.com|pypi\.org|leetcode\.com|vercel\.app|codepen\.io)$|^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/],
  ['shopping', /(^|\.)(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|walmart\.com|target\.com|bestbuy\.com|ikea\.com|aliexpress\.com|costco\.com|newegg\.com)$/],
  ['food', /(^|\.)(doordash\.com|ubereats\.com|grubhub\.com|deliveroo\.[a-z.]+|seamless\.com|opentable\.com|toasttab\.com|justeat\.[a-z.]+)$/],
  ['work', /^(mail\.google\.com|docs\.google\.com|calendar\.google\.com|outlook\.(live|office)\.com|outlook\.office365\.com)$|(^|\.)(notion\.so|slack\.com|linear\.app|atlassian\.net|figma\.com|airtable\.com)$/],
  ['study', /(^|\.)(wikipedia\.org|arxiv\.org|khanacademy\.org|coursera\.org|edx\.org|quizlet\.com|britannica\.com|medium\.com|substack\.com)$|\.edu$|^docs\./],
];
const PAGE_KINDS = { code: 'dev', leetcode: 'dev', shopping: 'shopping', menu: 'food', article: 'study' };
const SELECTION_KINDS = { code: 'dev', json: 'dev', stacktrace: 'dev', editable: 'work', document: 'study' };
const APPS = [
  ['dev', /^(code|visual studio code|cursor|xcode|terminal|iterm2?|warp|intellij idea|pycharm|webstorm|android studio|ghostty|zed)$/i],
  ['work', /^(mail|outlook|microsoft outlook|slack|pages|microsoft word|word|keynote|numbers|notion|microsoft teams|zoom\.us|calendar)$/i],
  ['study', /^(preview|books|kindle|notes|obsidian|anki)$/i],
];
const ROLE_MODES = { student: 'study', dev: 'dev', work: 'work' };

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// → a MODES id or null. override: the cat menu's choice ('auto' or a mode id); role: from onboarding, used only when
// nothing on screen says otherwise. The selection beats the page, the page kind beats the site.
function detectMode({ url = '', pageKind = null, selectionKind = null, app = '', role = '', override = 'auto' } = {}) {
  if (override && override !== 'auto') return Object.hasOwn(MODES, override) ? override : null;
  if (SELECTION_KINDS[selectionKind]) return SELECTION_KINDS[selectionKind];
  if (PAGE_KINDS[pageKind]) return PAGE_KINDS[pageKind];
  const host = hostOf(url);
  const site = host && SITES.find(([, re]) => re.test(host));
  if (site) return site[0];
  const fromApp = app && APPS.find(([, re]) => re.test(String(app).trim()));
  if (fromApp) return fromApp[0];
  return ROLE_MODES[role] || null;
}

// Stable: the mode's chips first in its order, everything else after in the original order. Same set of chips.
function orderChips(chips, mode) {
  const preferred = MODES[mode]?.chips;
  if (!preferred) return chips;
  const rank = (c) => {
    const i = preferred.indexOf(c.id);
    return i < 0 ? preferred.length : i;
  };
  return chips.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

const badgeFor = (mode) => (MODES[mode] ? { id: mode, badge: MODES[mode].badge, name: MODES[mode].name } : null);

module.exports = { MODES, detectMode, orderChips, badgeFor };
