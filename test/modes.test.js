const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const shopping = require('../brain/shopping');
const food = require('../brain/food');
const { summarizeReviews, extractReviews } = require('../brain/reviews');
const { fingerprint, lookupKnown } = require('../brain/errors');
const { jsonToDto, parseJson, fixGrammar } = require('../brain/devtools');

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

test('parseQuantity reads fractions, counted cans and "12-ct"; parsePrice splits "5 for $10"', () => {
  const q = (s) => shopping.parseQuantity(s);
  assert.strictEqual(Math.round(q('1/2 gallon').amount), 1893);
  assert.strictEqual(Math.round(q('12 cans x 12 fl oz').amount), 4259);
  assert.deepStrictEqual(q('12-ct'), { amount: 12, unit: 'count' });
  assert.strictEqual(q('500g x 2').amount, 1000);
  assert.strictEqual(shopping.parsePrice('5 for $10'), 2);
});

test('parseQuantity reads spelled-out packs, a bare dozen and "pt"', () => {
  const q = (s) => shopping.parseQuantity(s);
  assert.deepStrictEqual(q('six pack'), { amount: 6, unit: 'count' });
  assert.deepStrictEqual(q('Dozen eggs'), { amount: 12, unit: 'count' });
  assert.deepStrictEqual(q('half dozen'), { amount: 6, unit: 'count' });
  assert.strictEqual(Math.round(q('1 pt').amount), 473);
  assert.strictEqual(Math.round(q('two-pack, 8 oz').amount), 454);
});

test('parseQuantity reads hyphenated sizes, pints and "gr"; parsePrice takes the sale price', () => {
  const q = (s) => shopping.parseQuantity(s);
  assert.strictEqual(Math.round(q('32-oz bottle').amount), 907);
  assert.strictEqual(Math.round(q('1 pint').amount), 473);
  assert.deepStrictEqual(q('500 gr'), { amount: 500, unit: 'g' });
  assert.strictEqual(shopping.parsePrice('Was $20.00 Now $15.00'), 15);
});

test('parsePrice ignores a saving printed next to the price', () => {
  assert.strictEqual(shopping.parsePrice('Save $5 $20'), 20);
  assert.strictEqual(shopping.parsePrice('$20.00 You save 25%'), 20);
  assert.strictEqual(shopping.parsePrice('$4 off $19.99'), 19.99);
  assert.strictEqual(shopping.parsePrice('$20 (save $5)'), 20);
});

test('parsePrice reads decimal-comma prices with a thousands separator', () => {
  assert.strictEqual(shopping.parsePrice('1.299,99 €'), 1299.99);
  assert.strictEqual(shopping.parsePrice('1 299,00 €'), 1299);
  assert.strictEqual(shopping.parsePrice('$1,299.99'), 1299.99);
  assert.strictEqual(shopping.parsePrice('12,5'), 12.5);
});

test('parsePrice reads prices that group thousands with a space', () => {
  assert.strictEqual(shopping.parsePrice('1 000 Kč'), 1000);
  assert.strictEqual(shopping.parsePrice('12\u00a0500 Ft'), 12500);
  assert.strictEqual(shopping.parsePrice('2 500 ₽'), 2500);
  assert.strictEqual(shopping.parsePrice('$12 99'), 12);
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

test('menu: "-free" dishes are dishes, and stray spaces after the price are tidied', () => {
  const items = food.extractMenu('Gluten-free Pasta $14\nChicken-free Pad Thai $12\nMargherita Pizza $14 (V)\nFree refills $0');
  assert.deepStrictEqual(items.map((i) => i.name), ['Gluten-free Pasta', 'Chicken-free Pad Thai', 'Margherita Pizza (V)']);
  assert.strictEqual(food.score(items[1]).likelyVegetarian, true);
  assert.strictEqual(food.score({ name: 'Gluten-free Chicken Wrap', description: '' }).likelyVegetarian, false);
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

test('menu: dishes with hidden meat or fish are not called vegetarian', () => {
  for (const name of ['Caesar Salad', 'Cobb Salad', 'Spaghetti Carbonara', 'Ragù Pappardelle', 'French Onion Soup']) {
    assert.strictEqual(food.score({ name, description: '' }).likelyVegetarian, false, name);
  }
  for (const name of ['Salade Nicoise', 'Chicken Gyro', 'Doner Kebab', 'Wiener Schnitzel', 'Tonkotsu Ramen', 'Philly Cheesesteak', 'BLT', 'Meat Lovers Pizza', 'Seafood Paella', 'Surf and Turf', 'Sloppy Joe', 'Beef Pho', 'Banh Mi', 'Tacos de Carnitas', 'Poke Bowl', 'Lox Bagel']) {
    assert.strictEqual(food.score({ name, description: '' }).likelyVegetarian, false, name);
  }
  assert.strictEqual(food.score({ name: 'Meat-free Chili', description: '' }).likelyVegetarian, true);
  assert.strictEqual(food.score({ name: 'Garden Salad', description: '' }).likelyVegetarian, true);
});

test('errors: fingerprint ignores paths/values; known errors answer from the table', () => {
  const a = fingerprint('TypeError: Cannot read properties of undefined (reading "id")\n    at /Users/a/app.js:12:5');
  const b = fingerprint('TypeError: Cannot read properties of undefined (reading "name")\n    at /srv/x.js:99:1');
  assert.strictEqual(a.hash, b.hash);
  assert.match(lookupKnown('java.lang.NullPointerException\n at com.x.A.run(A.java:3)'), /NullPointerException \(Java\)[\s\S]*Likely fix/);
  assert.match(lookupKnown('Access to fetch at x has been blocked by CORS policy'), /CORS/);
  assert.match(lookupKnown("error: pathspec 'main' did not match any file(s) known to git"), /branch or file/);
  assert.match(lookupKnown('docker: Error response from daemon: Conflict. The container name "/web" is already in use by container abc.'), /docker rm/);
  assert.match(lookupKnown('ssh: connect to host example.com port 22: Operation timed out'), /SSH connection timed out/);
  assert.match(lookupKnown('psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory'), /Postgres/);
  assert.strictEqual(lookupKnown('SomethingTotallyNewError: flux capacitor'), null);
  assert.strictEqual(lookupKnown('ValueError: bad input\n  at run (/src/app.js:404:3)'), null, 'a line number is not an HTTP status');
  assert.strictEqual(lookupKnown('Process failed at line 500'), null);
  assert.match(lookupKnown('Request failed with status code 404'), /404 Not Found/);
  assert.match(lookupKnown("AttributeError: 'NoneType' object has no attribute 'foo'"), /NoneType/);
  assert.strictEqual(lookupKnown('git@github.com: Permission denied (publickey).'), null, 'an SSH key problem is not a file permission problem');
  assert.match(lookupKnown("ValueError: invalid literal for int() with base 10: 'abc'"), /isn’t a number/);
  assert.match(lookupKnown('ZeroDivisionError: division by zero'), /Division by zero/);
  assert.match(lookupKnown("TypeError: Cannot read property 'length' of undefined"), /Reading a property/);
  assert.match(lookupKnown("TypeError: Cannot set property 'x' of undefined"), /Setting a property/);
  assert.match(lookupKnown("Module not found: Error: Can't resolve 'react' in '/app/src'"), /Module not found/);
  assert.match(lookupKnown("NameError: name 'totl' is not defined"), /NameError \(Python\)/);
  assert.match(lookupKnown("ImportError: cannot import name 'x' from 'y' (y.py)"), /ImportError \(Python\)/);
  assert.match(lookupKnown('  File "a.py", line 3\n    print "hi"\nSyntaxError: Missing parentheses in call to \'print\'.'), /SyntaxError \(Python\)/);
  assert.match(lookupKnown("Uncaught SyntaxError: Unexpected token '<'"), /HTML page/);
  assert.match(lookupKnown('Unexpected token < in JSON at position 0'), /Invalid JSON/, 'the JSON entry keeps its own answer');
  assert.strictEqual(lookupKnown("SyntaxError: Unexpected token '}'"), null, 'a stray brace is not an HTML page');
  assert.match(lookupKnown('java.net.BindException: Address already in use'), /Port already in use/);
  assert.match(lookupKnown('Web server failed to start. Port 8080 was already in use.'), /Port already in use/);
  assert.match(lookupKnown('zsh: command not found: nvm'), /Command not found/);
  assert.match(lookupKnown('Error: Request failed with status code 429'), /429 Too Many Requests/);
  assert.match(lookupKnown('HTTP/1.1 503 Service Unavailable'), /503/);
  assert.match(lookupKnown("TypeError: Cannot set properties of null (setting 'innerHTML')"), /Setting a property of null/);
  assert.match(lookupKnown("FileNotFoundError: [Errno 2] No such file or directory: 'x.csv'"), /File not found/);
  assert.match(lookupKnown('npm ERR! code ELIFECYCLE'), /npm script failed/);
  assert.match(lookupKnown('npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE could not resolve'), /dependency conflict/);
  assert.match(lookupKnown('ENOSPC: no space left on device, write'), /Disk full/);
  assert.match(lookupKnown("Error: EMFILE: too many open files, open 'a.txt'"), /Too many open files/);
  assert.match(lookupKnown('zsh: Segmentation fault  ./a.out'), /Segmentation fault/);
  assert.match(lookupKnown('Error: unable to verify the first certificate'), /Certificate not trusted/);
  assert.match(lookupKnown("error: failed to push some refs to 'origin'"), /push rejected/);
  assert.match(lookupKnown('Main.java:5: error: cannot find symbol'), /Cannot find symbol/);
  assert.match(lookupKnown('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'), /Node ran out of memory/);
  assert.match(lookupKnown('java.lang.ClassCastException: class A cannot be cast to class B'), /ClassCastException/);
  assert.match(lookupKnown('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'), /Docker daemon/);
  assert.match(lookupKnown("src/app.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'."), /TypeScript/);
  assert.match(lookupKnown("TypeError: 'int' object is not subscriptable"), /Python/);
  assert.match(lookupKnown('Warning: Each child in a list should have a unique "key" prop.'), /React/);
  assert.match(lookupKnown('ERROR: duplicate key value violates unique constraint "users_pkey"'), /Duplicate value/);
  assert.match(lookupKnown('error: Your local changes to the following files would be overwritten by merge:'), /git/);
  assert.match(lookupKnown('panic: runtime error: invalid memory address or nil pointer dereference'), /Nil pointer/);
  assert.match(lookupKnown('error[E0382]: borrow of moved value: `s`'), /moved value/);
  assert.match(lookupKnown('502 Bad Gateway'), /502 Bad Gateway/);
  assert.match(lookupKnown('upstream: 504 Gateway Time-out'), /504 Gateway Timeout/);
  assert.strictEqual(lookupKnown('ValueError at app.js:502:9'), null, 'a line number is not a 502');
  assert.match(lookupKnown('Exception in thread "main" java.lang.NoSuchMethodError: com.foo.Bar.baz()V'), /Method missing/);
  assert.match(lookupKnown('org.hibernate.LazyInitializationException: could not initialize proxy - no Session'), /Lazy loading/);
  assert.match(lookupKnown('fatal: refusing to merge unrelated histories'), /Unrelated histories/);
  assert.match(lookupKnown("org.springframework.beans.factory.UnsatisfiedDependencyException: Error creating bean with name 'userController'"), /couldn’t build a bean/);
  assert.match(lookupKnown('org.springframework.dao.DataIntegrityViolationException: could not execute statement'), /constraint/);
  assert.match(lookupKnown("com.fasterxml.jackson.databind.exc.MismatchedInputException: Cannot deserialize value of type `int`"), /Request body/);
  assert.match(lookupKnown("UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 0"), /encoding/);
  assert.match(lookupKnown('Error: Hydration failed because the initial UI does not match what was rendered on the server.'), /Hydration/);
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

test('JSON → DTO accepts trailing commas but still rejects other broken JSON', async () => {
  const java = await jsonToDto('{"id": 7, "tags": ["a",],}', 'java');
  assert.match(java, /private long id;[\s\S]*List<String> tags;/);
  await assert.rejects(jsonToDto('{"id": 7', 'java'));
});

test('JSON → DTO reads JS object literals: single quotes, bare keys, comments', async () => {
  const java = await jsonToDto("{id: 7, 'name': 'it\\'s', // who\n tags: ['a'],}", 'java');
  assert.match(java, /private long id;[\s\S]*String name;[\s\S]*List<String> tags;/);
  assert.deepStrictEqual(parseJson('{"s": "a,}", "b": true}'), { s: 'a,}', b: true });
  assert.throws(() => parseJson('{bad'));
});

test('JSON → DTO reads Python literals, JSON lines and JSON with prose around it', () => {
  assert.deepStrictEqual(parseJson("{'ok': True, 'x': None, 'n': False}"), { ok: true, x: null, n: false });
  assert.deepStrictEqual(parseJson('{"a": 1}\n{"a": 2}'), [{ a: 1 }, { a: 2 }]);
  assert.deepStrictEqual(parseJson('Here is the response: {"id": 7} hope that helps'), { id: 7 });
  assert.throws(() => parseJson('hello world\nnothing here'));
});

test('JSON → DTO reads curly quotes from word processors and chat apps', () => {
  assert.deepStrictEqual(parseJson('{“id”: 7, “name”: “it’s Loon”}'), { id: 7, name: 'it’s Loon' });
  assert.deepStrictEqual(parseJson('{”a”: ”b”}'), { a: 'b' });
});

test('JSON → DTO keeps the other fields when a value is NaN, Infinity or undefined', () => {
  assert.deepStrictEqual(parseJson('{"a": NaN, "b": -Infinity, "c": Infinity, "d": undefined, "e": 1}'), { a: null, b: null, c: null, d: null, e: 1 });
  assert.deepStrictEqual(parseJson('{"NaN": 1}'), { NaN: 1 });
});

test('JSON → DTO types a number written as 10.0 as a decimal, not a long', async () => {
  const out = await jsonToDto('{"price": 10.0, "qty": 2, "note": "v1.0 is 2.0", "tags": [1.0, 2]}');
  assert.match(out, /double price;/);
  assert.match(out, /long qty;/);
  assert.match(out, /List<Double> tags;/);
});

test('JSON → DTO handles top-level arrays, plain values and multi-class Java', async () => {
  const list = await jsonToDto('[{"id": 1}, {"id": 2, "name": "x"}]', 'java');
  assert.match(list, /one per item/);
  assert.match(list, /class Root[\s\S]*private String name;/);
  assert.match(await jsonToDto('42', 'java'), /no fields/);
  const nested = await jsonToDto('{"user": {"id": 1}, "items": [{"sku": "a"}]}', 'java');
  assert.ok(!/package io\.quicktype/.test(nested), 'no package line left in the extra classes');
});

test('Java DTOs keep JSON names that getters would not bind, without the converter boilerplate', async () => {
  const java = await jsonToDto('{"created_at": "x", "first-name": "A", "userId": 3}', 'java');
  assert.match(java, /@JsonProperty\("created_at"\)/);
  assert.match(java, /@JsonProperty\("userId"\)/);
  assert.ok(!/Converter/.test(java), 'no Converter class');
  const plain = await jsonToDto('{"id": 7, "name": "Loon"}', 'java');
  assert.ok(!/JsonProperty/.test(plain), 'simple keys stay annotation free');
});

test('grammar fixer leaves other languages and chat shorthand alone', async () => {
  const spanish = await fixGrammar('Hola, como estas? Quiero un cafe por favor.');
  assert.strictEqual(spanish.fixed, 'Hola, como estas? Quiero un cafe por favor.');
  assert.ok(spanish.notEnglish);
  const chat = await fixGrammar('can u send me teh report');
  assert.strictEqual(chat.fixed, 'can u send me the report');
  for (const text of ['omg that was fun', 'thx for the help', 'lol that is funny', 'ok see you', 'brb in a sec']) {
    assert.strictEqual((await fixGrammar(text)).fixed, text);
  }
});

test('grammar fixer does not swap unknown names for other words or restyle phone numbers', async () => {
  const name = 'Thanks,\n\nAkankshya';
  assert.strictEqual((await fixGrammar(name)).fixed, name);
  assert.strictEqual((await fixGrammar('Call me on 555-1234 please')).fixed, 'Call me on 555-1234 please');
  assert.strictEqual((await fixGrammar('I recieve alot of emails')).fixed, 'I receive a lot of emails');
});

test('grammar fixer keeps names, does not shrink words to one letter and does not loop', async () => {
  assert.strictEqual((await fixGrammar('Dear Sam, I hope your well.')).fixed, 'Dear Sam, I hope your well.');
  assert.strictEqual((await fixGrammar('Ill be there at 5 and im bringing cake')).fixed, 'Ill be there at 5 and im bringing cake');
  const loop = await fixGrammar("They're going to there house");
  assert.ok(loop.changes.length < 5, `${loop.changes.length} changes`);
  assert.strictEqual(loop.fixed, "They're going to their house");
});

test('grammar fixer leaves acronyms, British spellings and initialisms alone', async () => {
  for (const text of ['Can you send it by EOD?', 'The meeting is cancelled, my favourite colour is blue.', 'Reply ASAP please.']) {
    assert.strictEqual((await fixGrammar(text)).fixed, text);
  }
});

test('menu: veggie burgers count as vegetarian, two prices on one line name one dish, currency is kept', () => {
  const items = food.extractMenu('Soup $6 | Bowl $8\nVeggie Burger $11\nHamburger $12\nFish & Chips £13.50');
  assert.strictEqual(items[0].name, 'Soup');
  const picks = food.recommend(items, 'vegetarian').text;
  assert.match(picks, /Veggie Burger/);
  assert.doesNotMatch(picks, /\*\*Hamburger/);
  assert.match(food.recommend(items, 'protein').text, /£13\.50/);
});

test('parsePrice and parseQuantity read lakh grouping, bare cents, dozens and half sizes', () => {
  assert.strictEqual(shopping.parsePrice('₹1,29,999'), 129999);
  assert.strictEqual(shopping.parsePrice('$.99'), 0.99);
  assert.deepStrictEqual(shopping.parseQuantity('1 dozen'), { amount: 12, unit: 'count' });
  assert.deepStrictEqual(shopping.parseQuantity('half dozen eggs'), { amount: 6, unit: 'count' });
  assert.ok(Math.abs(shopping.parseQuantity('half gallon').amount - 1892.705892) < 1e-6);
});

test('parseQuantity reads a thousands comma but keeps a European decimal', () => {
  assert.deepStrictEqual(shopping.parseQuantity('1,000 g'), { amount: 1000, unit: 'g' });
  assert.deepStrictEqual(shopping.parseQuantity('2 x 1,500 ml'), { amount: 3000, unit: 'ml' });
  assert.deepStrictEqual(shopping.parseQuantity('0,125 l'), { amount: 125, unit: 'ml' });
  assert.deepStrictEqual(shopping.parseQuantity('1,5 l'), { amount: 1500, unit: 'ml' });
});

test('parseQuantity: a count spelled out twice is not doubled, "kilo", "gm" and "set of" parse', () => {
  assert.deepStrictEqual(shopping.parseQuantity('12 ct (2 x 6)'), { amount: 12, unit: 'count' });
  assert.deepStrictEqual(shopping.parseQuantity('12 Count (Pack of 2)'), { amount: 24, unit: 'count' });
  assert.deepStrictEqual(shopping.parseQuantity('1 Kilo'), { amount: 1000, unit: 'g' });
  assert.deepStrictEqual(shopping.parseQuantity('250gm'), { amount: 250, unit: 'g' });
  assert.deepStrictEqual(shopping.parseQuantity('Set of 4'), { amount: 4, unit: 'count' });
});

test('parseQuantity: "a pound", "case of 24", pairs and sheets parse', () => {
  assert.deepStrictEqual(shopping.parseQuantity('a pound'), { amount: 453.59237, unit: 'g' });
  assert.deepStrictEqual(shopping.parseQuantity('Case of 24'), { amount: 24, unit: 'count' });
  assert.deepStrictEqual(shopping.parseQuantity('3 pairs'), { amount: 3, unit: 'count' });
  assert.deepStrictEqual(shopping.parseQuantity('100 sheets'), { amount: 100, unit: 'count' });
});

test('menu: one-digit cents keep the whole price, em dashes are trimmed, "Veg Burger" is vegetarian', () => {
  const items = food.extractMenu('Side salad $4.5\nCheese pizza 9.5€\nTofu Stir-fry — $13\nVeg Burger $12');
  assert.deepStrictEqual(items.map((i) => [i.name, i.price]), [['Side salad', 4.5], ['Cheese pizza', 9.5], ['Tofu Stir-fry', 13], ['Veg Burger', 12]]);
  assert.match(food.recommend(items, 'vegetarian').text, /Veg Burger/);
});

test('menu: a price range is one price and "cod" is not counted as a second fish protein', () => {
  const items = food.extractMenu('Pizza $11 - 14\nPasta $12 - 15 oz\nFish & Chips $14\nBeer-battered cod with fries');
  assert.deepStrictEqual(items.map((i) => [i.name, i.price]), [['Pizza', 11], ['Pasta - 15 oz', 12], ['Fish & Chips', 14]]);
  assert.deepStrictEqual(food.score(items[2]).proteins, ['cod']);
});

test('menu: chicken-fried steak is not counted as chicken protein', () => {
  const [item] = food.extractMenu('Chicken-fried Steak $16');
  assert.deepStrictEqual(food.score(item).proteins, ['steak']);
});

test('grammar fixer leaves code identifiers, stretched words and vowel-less abbreviations alone', async () => {
  for (const text of ['using useState hook to fetch data', 'that was sooo funny', 'see you tmrw at the office']) {
    assert.strictEqual((await fixGrammar(text)).changes.filter((c) => /use|soo|tmrw/.test(c)).length, 0, text);
  }
  assert.ok((await fixGrammar('I recieve it')).fixed.includes('receive'));
});

test('menu: a trailing comma after the dish name is dropped, and falafel counts as protein, tom yum and lard as not vegetarian', () => {
  const [item] = food.extractMenu('Plant-based nuggets, $8');
  assert.strictEqual(item.name, 'Plant-based nuggets');
  assert.deepStrictEqual(food.score({ name: 'Falafel wrap', description: '' }).proteins, ['falafel']);
  assert.strictEqual(food.score({ name: 'Tom Yum soup', description: '' }).likelyVegetarian, false);
  assert.strictEqual(food.score({ name: 'Refried beans cooked in lard', description: '' }).likelyVegetarian, false);
});
