// The demo video (demo/) is staged, but what Loon says in it must be what Loon really says for those pages.
const test = require('node:test');
const assert = require('node:assert');
const demo = require('../demo/content');
const { define } = require('../brain/define');
const shopping = require('../brain/shopping');
const food = require('../brain/food');
const persona = require('../renderer/persona');

test('demo answers match the real code paths', async () => {
  assert.strictEqual(await define(demo.word, { maxSenses: 2 }), demo.define);
  const analysis = shopping.analyze(demo.SHOP_ITEMS);
  assert.strictEqual(`${shopping.verdict(analysis).text}\n\n${shopping.renderTable(analysis)}`, demo.shop);
  assert.strictEqual(food.recommend(food.extractMenu(demo.MENU_TEXT), 'lightest', { count: 2 }).text, demo.food);
});

test('demo persona lines exist in renderer/persona.js', () => {
  for (const [who, event, index] of Object.values(demo.lines)) {
    const value = event.split('.').reduce((node, key) => node?.[key], persona.PERSONAS[who].lines);
    assert.ok(typeof value === 'string' || value?.[index], `${who} ${event} ${index}`);
  }
  // spoken lines marked `from` say exactly that persona line; the rest are the reel's own (Soju copying Luna)
  for (const line of demo.voiceLines(persona)) {
    const spec = demo.voice.find((v) => v.id === line.id);
    assert.ok(line.text && line.sound.length, line.id);
    if (spec.from) assert.strictEqual(spec.from[0], spec.who, line.id);
  }
  const cameo = persona.cameoFor({ companion: 'luna', task: 'food_lightest', rand: () => 0 });
  assert.deepStrictEqual([cameo.guest, cameo.call, cameo.line], ['soju', persona.PERSONAS.luna.lines.call[0], persona.PERSONAS.soju.lines.guest[0]]);
});
