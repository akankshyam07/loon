// Word definitions from bundled WordNet 3.1 (Princeton license): instant, offline, no model, no made-up senses.
let wordpos = null;
// Irregular forms WordNet's morphy would resolve via its *.exc files (not shipped in wordnet-db).
const IRREGULAR = Object.fromEntries(`arose:arise awoke:awake was:be were:be bore:bear beat:beat became:become began:begin
bent:bend bet:bet bit:bite bled:bleed blew:blow broke:break brought:bring built:build burnt:burn bought:buy caught:catch
chose:choose came:come cost:cost crept:creep cut:cut dealt:deal dug:dig did:do done:do drew:draw dreamt:dream drank:drink
drove:drive driven:drive ate:eat eaten:eat fell:fall fallen:fall fed:feed felt:feel fought:fight found:find fled:flee
flew:fly flown:fly forbade:forbid forgot:forget forgotten:forget forgave:forgive froze:freeze frozen:freeze got:get
gotten:get gave:give given:give went:go gone:go grew:grow grown:grow hung:hang had:have heard:hear hid:hide hidden:hide
hit:hit held:hold hurt:hurt kept:keep knelt:kneel knew:know known:know laid:lay led:lead leapt:leap learnt:learn left:leave
lent:lend let:let lay:lie lain:lie lit:light lost:lose made:make meant:mean met:meet paid:pay put:put quit:quit read:read
rode:ride ridden:ride rang:ring rung:ring rose:rise risen:rise ran:run said:say saw:see seen:see sought:seek sold:sell
sent:send set:set shook:shake shaken:shake shone:shine shot:shoot showed:show shown:show shrank:shrink shut:shut sang:sing
sung:sing sank:sink sunk:sink sat:sit slept:sleep slid:slide spoke:speak spoken:speak spent:spend spun:spin spread:spread
sprang:spring stood:stand stole:steal stolen:steal stuck:stick stung:sting struck:strike swore:swear sworn:swear swept:sweep
swam:swim swum:swim swung:swing took:take taken:take taught:teach tore:tear torn:tear told:tell thought:think threw:throw
thrown:throw understood:understand woke:wake woken:wake wore:wear worn:wear wove:weave woven:weave wept:weep won:win
wound:wind wrote:write written:write children:child men:man women:woman feet:foot teeth:tooth geese:goose mice:mouse
lice:louse oxen:ox people:person dice:die criteria:criterion phenomena:phenomenon data:datum analyses:analysis
theses:thesis crises:crisis cacti:cactus fungi:fungus nuclei:nucleus radii:radius indices:index matrices:matrix
better:good best:good worse:bad worst:bad`.split(/\s+/).map((pair) => pair.split(':')));
const POS_ORDER = { n: 0, a: 1, s: 1, v: 2, r: 3 };

const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };

// Minimal morphy: try the word as typed, then common inflection rules (WordNet's own approach, simplified).
function candidates(word) {
  const w = word.toLowerCase();
  const out = [w, ...(IRREGULAR[w] ? [IRREGULAR[w]] : [])];
  const rules = [[/ies$/, 'y'], [/ves$/, 'f'], [/(ches|shes|sses|xes|zes)$/, (m) => m.slice(0, -2)], [/s$/, ''],
    [/ied$/, 'y'], [/(.)\1ed$/, '$1'], [/ed$/, 'e'], [/ed$/, ''], [/(.)\1ing$/, '$1'], [/ing$/, 'e'], [/ing$/, ''],
    [/ier$/, 'y'], [/iest$/, 'y'], [/er$/, ''], [/est$/, '']];
  for (const [re, rep] of rules) if (re.test(w)) out.push(w.replace(re, rep));
  return [...new Set(out)].filter((c) => c.length > 1);
}

// Returns markdown text, or null when WordNet has no entry.
async function define(phrase, { maxSenses = 4 } = {}) {
  if (!wordpos) {
    const WordPOS = require('wordpos');
    wordpos = new WordPOS();
  }
  const cleaned = phrase.trim().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ');
  if (!cleaned || cleaned.split(' ').length > 3) return null;
  for (const candidate of candidates(cleaned.replace(/ /g, '_'))) {
    const senses = (await wordpos.lookup(candidate)).sort((x, y) => (POS_ORDER[x.pos] ?? 9) - (POS_ORDER[y.pos] ?? 9));
    if (!senses.length) continue;
    const seen = new Set();
    const lines = [];
    for (const sense of senses) {
      const def = sense.def.trim();
      if (seen.has(def) || lines.length >= maxSenses) continue;
      seen.add(def);
      const example = sense.exp?.[0] ? ` _e.g. ${sense.exp[0].replace(/^"|"$/g, '')}_` : '';
      lines.push(`- **${POS_NAMES[sense.pos] || sense.pos}**: ${def}${example}`);
    }
    const word = candidate.replace(/_/g, ' ');
    return `**${word}**\n${lines.join('\n')}`;
  }
  return null;
}

// A typed dictionary question ("define ephemeral", "what does ephemeral mean?", "meaning of the word ephemeral") → the
// term, or null. Pronouns and "the error" style phrases are left to the model, since they point at something on screen.
const DICTIONARY_ASK = /^(?:define:?|definition:?|definition of|meaning of|what(?:'s| is| does)(?: the)? (?:meaning|definition) of|what does)\s+(?:the (?:word|term) )?["'“‘]?([\p{L}-]+(?: [\p{L}-]+)??)["'”’]?(?: mean)?$|^what(?:'?s| is) ([\p{L}-]+) mean$|^([\p{L}-]+) (?:meaning|definition|means)$/iu;
const NOT_A_TERM = /^(?:this|that|it|these|those|here|there|the|my|your|his|her|our|their|a|an|going on|wrong|new|up|happening|next|today|time)\b/i;

function dictionaryTerm(question) {
  const m = String(question || '').trim().replace(/[’‘]/g, "'")
    .replace(/^(?:(?:hey|ok|okay) )?(?:loon[,\s]+)?(?:(?:please|pls|plz|can you|could you|would you)\s+)*/i, '')
    .replace(/[\s?!.\p{Extended_Pictographic}]*$/u, '')
    .replace(/(?:,? (?:please|pls|for me|in english|exactly|lol))+$/i, '')
    .replace(/[\s?!.]*$/, '').match(DICTIONARY_ASK);
  const term = m && (m[1] || m[2] || m[3]);
  return term && !NOT_A_TERM.test(term) ? term : null;
}

module.exports = { define, candidates, dictionaryTerm };
