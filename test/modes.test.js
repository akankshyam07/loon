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

test('parseQuantity does not double count restated sizes and reads spelled-out units', () => {
  const q = (s) => shopping.parseQuantity(s);
  assert.strictEqual(Math.round(q('16 oz (1 lb)').amount), 454);
  assert.deepStrictEqual(q('Total 1kg (2 x 500g)'), { amount: 1000, unit: 'g' });
  assert.strictEqual(Math.round(q('Sauce 8 oz x 3').amount), 680);
  assert.deepStrictEqual(q('500 grams'), { amount: 500, unit: 'g' });
  assert.deepStrictEqual(q('2 kilograms'), { amount: 2000, unit: 'g' });
  assert.deepStrictEqual(q('750 millilitres'), { amount: 750, unit: 'ml' });
  assert.deepStrictEqual(q('1 liter'), { amount: 1000, unit: 'ml' });
  assert.strictEqual(Math.round(q('1 gallon').amount), 3785);
});

test('parsePrice reads decimal-comma prices with a thousands separator', () => {
  assert.strictEqual(shopping.parsePrice('1.299,99 €'), 1299.99);
  assert.strictEqual(shopping.parsePrice('1 299,00 €'), 1299);
  assert.strictEqual(shopping.parsePrice('$1,299.99'), 1299.99);
  assert.strictEqual(shopping.parsePrice('12,5'), 12.5);
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

test('menu: decimal-comma prices and burger words are read correctly', () => {
  const [pizza] = food.extractMenu('Margherita Pizza €11,50\nTomato and basil');
  assert.deepStrictEqual([pizza.name, pizza.price], ['Margherita Pizza', 11.5]);
  assert.strictEqual(food.score({ name: 'Hamburger', description: '' }).likelyVegetarian, false);
  assert.strictEqual(food.score({ name: 'Cheeseburger', description: '' }).likelyVegetarian, false);
});

test('menu: bare and trailing-symbol prices count, promos and add-ons do not', () => {
  const items = food.extractMenu('$5 off any entree today\nFree delivery over $25\nGrilled Chicken Wrap - 13.50\nPad Thai 14.00 €\nAdd bacon +$2');
  assert.deepStrictEqual(items.map((i) => [i.name, i.price]), [['Grilled Chicken Wrap', 13.5], ['Pad Thai', 14]]);
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
  assert.strictEqual(lookupKnown('ValueError: bad input\n  at run (/src/app.js:404:3)'), null, 'a line number is not an HTTP status');
  assert.strictEqual(lookupKnown('Process failed at line 500'), null);
  assert.match(lookupKnown('Request failed with status code 404'), /404 Not Found/);
  assert.match(lookupKnown("AttributeError: 'NoneType' object has no attribute 'foo'"), /NoneType/);
  assert.strictEqual(lookupKnown('git@github.com: Permission denied (publickey).'), null, 'an SSH key problem is not a file permission problem');
  assert.match(lookupKnown("ValueError: invalid literal for int() with base 10: 'abc'"), /isn’t a number/);
  assert.match(lookupKnown('ZeroDivisionError: division by zero'), /Division by zero/);
  assert.match(lookupKnown('zsh: command not found: nvm'), /Command not found/);
  assert.match(lookupKnown('Error: Request failed with status code 429'), /429 Too Many Requests/);
  assert.match(lookupKnown('HTTP/1.1 503 Service Unavailable'), /503/);
  assert.match(lookupKnown("TypeError: Cannot set properties of null (setting 'innerHTML')"), /Setting a property of null/);
  assert.match(lookupKnown("FileNotFoundError: [Errno 2] No such file or directory: 'x.csv'"), /File not found/);
  assert.match(lookupKnown('npm ERR! code ELIFECYCLE'), /npm script failed/);
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

test('JSON → DTO handles top-level arrays, plain values and multi-class Java', async () => {
  const list = await jsonToDto('[{"id": 1}, {"id": 2, "name": "x"}]', 'java');
  assert.match(list, /one per item/);
  assert.match(list, /class Root[\s\S]*private String name;/);
  assert.match(await jsonToDto('42', 'java'), /no fields/);
  const nested = await jsonToDto('{"user": {"id": 1}, "items": [{"sku": "a"}]}', 'java');
  assert.ok(!/package io\.quicktype/.test(nested), 'no package line left in the extra classes');
});

test('grammar fixer leaves other languages and chat shorthand alone', async () => {
  const spanish = await fixGrammar('Hola, como estas? Quiero un cafe por favor.');
  assert.strictEqual(spanish.fixed, 'Hola, como estas? Quiero un cafe por favor.');
  assert.ok(spanish.notEnglish);
  const chat = await fixGrammar('can u send me teh report');
  assert.strictEqual(chat.fixed, 'can u send me the report');
});
