const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const shopping = require('../brain/shopping');
const food = require('../brain/food');
const { summarizeReviews, extractReviews } = require('../brain/reviews');
const { fingerprint, lookupKnown } = require('../brain/errors');
const { jsonToDto, fixGrammar } = require('../brain/devtools');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const dom = async (html) => (await import('linkedom')).parseHTML(html).document;

test('parseQuantity handles multipacks, compound weights and counts', () => {
  const q = (s) => shopping.parseQuantity(s);
  assert.deepStrictEqual(q('Fizz 12 x 330ml'), { amount: 3960, unit: 'ml' });
  assert.deepStrictEqual(q('1.5 L'), { amount: 1500, unit: 'ml' });
  assert.strictEqual(Math.round(q('2 lb 4 oz').amount), 1021);
  assert.strictEqual(Math.round(q('16 fl oz').amount), 473);
  assert.deepStrictEqual(q('Pack of 6'), { amount: 6, unit: 'count' });
  assert.deepStrictEqual(q('Coffee pods 3 x 20 pods'), { amount: 60, unit: 'count' });
  assert.strictEqual(q('no size here'), null);
});

test('shop page: structured data → unit prices, best value, warnings, judgy verdict', async () => {
  const doc = await dom(fixture('shop.html'));
  const items = shopping.extractStructured(doc);
  assert.strictEqual(items.length, 3);
  const analysis = shopping.analyze(items, 'Subscribe & Save 5% on repeat deliveries.');
  assert.strictEqual(analysis.unit, 'ml');
  assert.match(analysis.bestValue.name, /Bubbly/); // 11.49 / 8520 ml is cheapest per ml
  assert.match(analysis.cheapest.name, /Fizz/);
  assert.ok(analysis.items.find((i) => /Maison/.test(i.name)).warnings.includes('only 12 reviews'));
  assert.strictEqual(analysis.pageWarnings.length, 1);
  const { text, mood } = shopping.verdict(analysis);
  assert.strictEqual(mood, 'judgy');
  assert.match(text, /Bubbly.*best value.*Maison.*% more per 100 ml/s);
  assert.match(shopping.renderTable(analysis), /\| Bubbly Seltzer 24 x 355ml \| \$11\.49 \| \$0\.13 \| 🏆 value/);
});

test('extractor selectors apply to listings without structured data', async () => {
  const doc = await dom(fixture('shop-plain.html'));
  assert.strictEqual(shopping.extractStructured(doc).length, 0);
  const extractor = { item: 'li.card', name: '.title', price: '.cost' };
  assert.ok(shopping.validExtractor(doc, extractor));
  const analysis = shopping.analyze(shopping.applyExtractor(doc, extractor));
  assert.strictEqual(analysis.unit, 'g');
  assert.match(analysis.bestValue.name, /Espresso Roast 2 lb/);
  assert.ok(shopping.outlineForExtractor(doc).some((l) => /li\.card > span\.cost/.test(l.path)));
  assert.deepStrictEqual(shopping.guessExtractor(doc), { item: 'li.card', name: 'span.title', price: 'span.cost' });
  const mixed = shopping.analyze([{ name: 'Water 1 L', price: 2, currency: 'USD' }, { name: 'Coffee 500g', price: 9, currency: 'USD' }]);
  assert.match(shopping.verdict(mixed).text, /different kinds of products/);
});

test('reviews: aspects, stars and quotes without a model', async () => {
  const reviews = extractReviews(await dom(fixture('shop.html')));
  assert.strictEqual(reviews.length, 3);
  const summary = summarizeReviews(reviews);
  assert.match(summary, /Average 3\.7★ from 3 ratings/);
  assert.match(summary, /People like:.*price/);
  assert.match(summary, /Complaints:.*shipping/);
});

test('menu: lightest, protein and vegetarian picks with tips and a warning', () => {
  const text = fixture('menu.html').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const items = food.extractMenu(text);
  assert.strictEqual(items.length, 7);
  const lightest = food.recommend(items, 'lightest');
  assert.match(lightest.text, /Steamed Veggie Dumplings|Grilled Chicken Salad/);
  assert.match(lightest.text, /doing crimes/);
  assert.match(food.recommend(items, 'protein').text, /Seared Salmon Bowl|Grilled Chicken Salad/);
  const veg = food.recommend(items, 'vegetarian').text;
  assert.match(veg, /Lemon Sorbet/);
  assert.doesNotMatch(veg, /Calamari|Salmon|Burger/);
  assert.match(veg, /ask the restaurant about allergens/);
});

test('errors: fingerprint ignores paths/values; known errors answer from the table', () => {
  const a = fingerprint('TypeError: Cannot read properties of undefined (reading "id")\n    at /Users/a/app.js:12:5');
  const b = fingerprint('TypeError: Cannot read properties of undefined (reading "name")\n    at /srv/x.js:99:1');
  assert.strictEqual(a.hash, b.hash);
  assert.match(lookupKnown('java.lang.NullPointerException\n at com.x.A.run(A.java:3)'), /NullPointerException \(Java\)[\s\S]*Likely fix/);
  assert.match(lookupKnown('Access to fetch at x has been blocked by CORS policy'), /CORS/);
  assert.strictEqual(lookupKnown('SomethingTotallyNewError: flux capacitor'), null);
});

test('JSON → DTO with quicktype; grammar fixes with Harper', async () => {
  const java = await jsonToDto('{"id": 7, "name": "Loon", "tags": ["cat"]}', 'java');
  assert.match(java, /```java[\s\S]*class Root[\s\S]*private List<String> tags;/);
  const ts = await jsonToDto('{"id": 7}', 'typescript');
  assert.match(ts, /export interface Root \{\s+id: number;/);
  const { fixed, changes } = await fixGrammar('Their is a issue with teh report.');
  assert.strictEqual(fixed, 'There is an issue with the report.');
  assert.strictEqual(changes.length, 3);
});

test('email: thread chips on mail pages, and Draft reply first for a selection in Work mode', () => {
  const { pageChipsFor, SELECTION_CHIPS } = require('../brain/tasks');
  const { orderChips } = require('../brain/modes');
  assert.deepStrictEqual(pageChipsFor('email'), ['email_summary', 'email_reply', 'page_checklist']);
  const chips = SELECTION_CHIPS.paragraph.map((id) => ({ id }));
  assert.strictEqual(orderChips(chips, 'work')[0].id, 'draft_reply');
});

test('reply drafts name who writes to whom, read from the greeting and sign-off', () => {
  const { replyInstruction } = require('../brain/tasks');
  const full = replyInstruction("Hi Akankshya, thanks for the demo yesterday. Could you send over the pricing for 20 seats? Best, Jordan");
  assert.match(full, /You are writing as Akankshya\. Below is a message Akankshya received from Jordan\./);
  assert.match(full, /Start the reply with "Hi Jordan,"/);
  const none = replyInstruction('can you send me the file? thanks for everything');
  assert.match(none, /Below is a message the user received\./);
  assert.match(none, /Start the reply with "Hi there,"/);
});
