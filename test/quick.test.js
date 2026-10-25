const test = require('node:test');
const assert = require('node:assert');
const { quickAnswer, evaluate } = require('../brain/quick');

const now = new Date(2026, 9, 25, 13, 0); // Sunday Oct 25 2026
const text = (q) => quickAnswer(q, now)?.text ?? null;

test('arithmetic and percentages in code, never eval', () => {
  assert.match(text("what's 15% of 84"), /\*\*12\.6\*\*/);
  assert.match(text('20% off 80'), /\*\*64\*\*.*save 16/);
  assert.match(text('18% tip on $42.50'), /^An 18% tip.*\*\*7\.65\*\*.*\*\*50\.15\*\*/);
  assert.match(text('12 * 7'), /= \*\*84\*\*/);
  assert.match(text('what is 2 + 3 * 4'), /\*\*14\*\*/);
  assert.match(text('(2+3)*4'), /\*\*20\*\*/);
  assert.match(text('2^10'), /\*\*1,024\*\*/);
  assert.match(text('100 divided by 8'), /\*\*12\.5\*\*/);
  assert.match(text('1,250 + 750'), /\*\*2,000\*\*/);
  assert.match(text('0.1 + 0.2'), /\*\*0\.3\*\*/);
  assert.strictEqual(text('42'), null);
  assert.strictEqual(text('1/0'), null);
  assert.strictEqual(text('what is love'), null);
  assert.strictEqual(text('process.exit()'), null);
  assert.strictEqual(evaluate('2 +'), null);
  assert.strictEqual(evaluate('(1'), null);
});

test('unit conversions', () => {
  assert.match(text('convert 5 miles to km'), /5 mi = \*\*8\.05 km\*\*/);
  assert.match(text('72 f in c'), /72 °F = \*\*22\.2 °C\*\*/);
  assert.match(text('100 celsius to fahrenheit'), /\*\*212 °F\*\*/);
  assert.match(text('10 in to cm'), /\*\*25\.4 cm\*\*/);
  assert.match(text('5 ft in cm'), /\*\*152\.4 cm\*\*/);
  assert.match(text('8 oz to ml'), /\*\*236\.59 ml\*\*/);
  assert.match(text('how many grams in a pound'), /1 lb = \*\*453\.59 g\*\*/);
  assert.match(text('60 mph to km/h'), /\*\*96\.56 km\/h\*\*/);
  assert.strictEqual(text('5 miles to kg'), null);
  assert.strictEqual(text('5 apples to oranges'), null);
});

test('days until holidays and dates', () => {
  assert.match(text('how many days until christmas'), /\*\*61 days\*\* until Friday, December 25\. That's about 9 weeks/);
  assert.match(text('how many days until halloween'), /\*\*6 days\*\*/);
  assert.match(text('how many days until thanksgiving?'), /November 26/);
  assert.match(text("how many days until valentine's day"), /February 14, 2027/);
  assert.match(text('days until oct 25'), /today/);
  assert.match(text('how many days until march 3'), /March 3, 2027/);
  assert.strictEqual(text('how long until the movie is over'), null);
});

test('coins, dice and random numbers', () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(text('flip a coin'), /Heads|Tails/);
    const [n] = text('roll a d20').match(/\d+/);
    assert.ok(n >= 1 && n <= 20);
    const pick = Number(text('pick a number between 1 and 10').match(/\d+/)[0]);
    assert.ok(pick >= 1 && pick <= 10);
  }
  assert.match(text('roll 2 dice'), /total \*\*\d+\*\*/);
});

test('timers parse as internal commands', () => {
  const { parseCommand } = require('../brain/commands');
  assert.deepStrictEqual(parseCommand('set a timer for 5 minutes'), { action: 'timer', seconds: 300, label: null });
  assert.deepStrictEqual(parseCommand('5 minute timer for pasta'), { action: 'timer', seconds: 300, label: 'pasta' });
  assert.deepStrictEqual(parseCommand('set a 1 hour timer'), { action: 'timer', seconds: 3600, label: null });
  assert.deepStrictEqual(parseCommand('cancel timer'), { action: 'timer', seconds: 0 });
  assert.deepStrictEqual(parseCommand('how long is left on my timer?'), { action: 'timer', seconds: null });
  assert.strictEqual(parseCommand('what is a timer'), null);
});

test('short phrases get the right language before franc guesses', () => {
  const { shortTextLanguage } = require('../brain/translate');
  const cases = { 'hola amigo, ¿cómo estás?': 'es', 'Ich bin müde heute': 'de', 'olá você está bem': 'pt', 'très bien merci': 'fr', 'ciao come stai': 'it', 'hello how are you': 'en' };
  for (const [text, lang] of Object.entries(cases)) assert.strictEqual(shortTextLanguage(text), lang, text);
  assert.strictEqual(shortTextLanguage('sushi'), null);
  assert.strictEqual(shortTextLanguage('x'.repeat(100)), null);
});

test('model answers lose the trailing "let me know if…" filler, never the answer', () => {
  const { stripTrailingFiller: f } = require('../brain/resolve');
  assert.strictEqual(f('15% of 84 is 12.6. Let me know if you need help with anything else!'), '15% of 84 is 12.6.');
  assert.strictEqual(f('TCP is reliable. UDP is fast. Hope this helps! 😊'), 'TCP is reliable. UDP is fast.');
  assert.strictEqual(f('Video calls use UDP.\n\nIf you have any more questions, feel free to ask!'), 'Video calls use UDP.');
  assert.strictEqual(f('Let me know if you need anything.'), 'Let me know if you need anything.');
  assert.strictEqual(f('Feel free to ask about the weather of Paris; it is sunny.'), 'Feel free to ask about the weather of Paris; it is sunny.');
});

test('weather is an offer to open a forecast, behind a confirm card', () => {
  const { parseCommand } = require('../brain/commands');
  assert.match(parseCommand("what's the weather like in Boston tomorrow").target, /q=weather%20Boston%20tomorrow$/);
  assert.match(parseCommand('will it rain today?').target, /q=weather%20today$/);
  assert.strictEqual(parseCommand('what is the weather of my mood'), null);
});

test('offers to look things up are trimmed: Loon cannot browse', () => {
  const { stripTrailingFiller: f } = require('../brain/resolve');
  assert.strictEqual(f('Shroomami has tofu. Would you like me to check nutritional info?'), 'Shroomami has tofu.');
  assert.strictEqual(f('Kale Caesar is light. Would you like more details on any of them?'), 'Kale Caesar is light.');
  assert.strictEqual(f('Pick the salad. Would you like a recipe for it?'), 'Pick the salad. Would you like a recipe for it?');
});

test('a hedge the answer contradicts is dropped', () => {
  const { stripTrailingFiller: f } = require('../brain/resolve');
  assert.strictEqual(f("I don't know the answer, but I can tell you that the capital of France is Paris."), 'The capital of France is Paris.');
  assert.strictEqual(f("I don't know who won the 2031 cup."), "I don't know who won the 2031 cup.");
});
