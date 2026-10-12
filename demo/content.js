// What the demo video shows Loon saying. Answers are the exact output of the real code paths (brain/define.js,
// brain/shopping.js, brain/food.js) for the fake pages on the stage; test/demo.test.js recomputes them so the video
// can't drift from what Loon actually does. Persona lines are picked from renderer/persona.js by index.
(function (root) {
  const SHOP_ITEMS = [
    { name: 'Bubbly Lime 12 x 355 ml', price: 5.99, currency: 'USD', color: 'lime' },
    { name: 'Fizz & Co. 8 x 250 ml', price: 4.49, currency: 'USD', color: 'pink' },
    { name: 'Glacier Spring 6 x 500 ml', price: 7.99, currency: 'USD', color: 'blue' },
  ];
  const MENU_TEXT = [
    'Crispy Chicken Sandwich $14',
    'fried chicken, aioli, fries',
    'Grilled Salmon Bowl $18',
    'salmon, brown rice, steamed greens, vinaigrette',
    'Truffle Mac & Cheese $13',
    'creamy cheese sauce, crispy bacon',
    'Miso Tofu Salad $12',
    'tofu, edamame, greens, sesame dressing',
  ].join('\n');

  const content = {
    SHOP_ITEMS,
    MENU_TEXT,
    word: 'ephemeral',
    // brain/define.js define('ephemeral', { maxSenses: 2 }), tier code · WordNet dictionary
    define: '**ephemeral**\n- **noun**: anything short-lived, as an insect that lives only for a day in its winged form\n- **adjective**: lasting a very short time _e.g. the ephemeral joys of childhood_',
    // brain/skills.js 'shopping': verdict + renderTable for SHOP_ITEMS
    shop: "Bubbly Lime 12 x 355 ml is the best value. Glacier Spring 6 x 500 ml costs 89% more per 100 ml. You'd be paying for the logo.\n\n| Item | Price | per 100 ml | |\n|---|---|---|---|\n| Bubbly Lime 12 x 355 ml | $5.99 | $0.14 | 🏆 value |\n| Fizz & Co. 8 x 250 ml | $4.49 | $0.22 | 💸 cheapest |\n| Glacier Spring 6 x 500 ml | $7.99 | $0.27 |  |",
    // brain/food.js recommend(extractMenu(MENU_TEXT), 'lightest', { count: 2 })
    food: '**Lightest picks**\n- **Grilled Salmon Bowl** $18.00 (grilled, steamed, vinaigrette, greens)\n- **Miso Tofu Salad** $12.00 (salad, greens)\n  _Tip: Ask for the dressing on the side._\n\nFrom menu wording only: no numbers here. Tap "Estimate calories" for rough estimates.\n\nTiny warning: Crispy Chicken Sandwich is probably doing crimes.',
    // persona lines: [companion, event, index into the list]
    lines: {
      selection: ['luna', 'selection', 0],
      shopNudge: ['luna', 'nudge.shopping'],
      shopFlavor: ['luna', 'shopping', 1],
      call: ['luna', 'call', 0],
      guest: ['soju', 'guest', 0],
      teachDone: ['luna', 'pet', 2],
    },
    // What the cats "say". Balloons show the text (from persona.js when `from` is set; otherwise the reel's own line, like
    // Soju copying his sister). The sound is cute-game babble plus synthesized cat noises (demo/voices.js):
    //   ['babble', text]  chirpy syllables · ['copy', lineId, text]  Soju babbles along to Luna's melody for that line
    //   ['meow'] · ['purr'] · ['trill'] · ['chirp']. A trailing `true` marks real words (variant B can speak those).
    voice: [
      { id: 'greet', who: 'luna', from: ['luna', 'greeting', 0], sound: [['meow'], ['babble', 'Hi. I was already looking at you.']] },
      { id: 'what', who: 'luna', from: ['luna', 'selection', 0], sound: [['babble', "Ooh. What's that?"]] },
      { id: 'opinions', who: 'luna', from: ['luna', 'nudge.shopping'], sound: [['babble', 'I have opinions about these prices.']] },
      { id: 'darling', who: 'luna', from: ['luna', 'shopping', 1], sound: [['babble', 'Price per unit, darling. Always.']] },
      { id: 'dept', who: 'luna', from: ['luna', 'call', 0], sound: [['babble', "This is Soju's department."]] },
      { id: 'food', who: 'soju', from: ['soju', 'guest', 0], sound: [['chirp'], ['babble', 'Did someone say food?!', true]] },
      { id: 'purr', who: 'soju', from: ['soju', 'pet', 0], sound: [['purr'], ['babble', 'More!', true]] },
      { id: 'acceptable', who: 'luna', from: ['luna', 'pet', 1], sound: [['trill'], ['babble', 'Acceptable.']] },
      { id: 'acceptabubble', who: 'soju', text: 'Mrrr! Acceptabubble!', sound: [['chirp'], ['copy', 'acceptable', 'Acceptabubble!']] },
      { id: 'byeLuna', who: 'luna', text: 'Bye bye!', sound: [['babble', 'Bye bye!'], ['meow']] },
      { id: 'byeSoju', who: 'soju', text: 'Bye bye bye bye!', sound: [['copy', 'byeLuna', 'Bye bye bye bye!', true], ['meow']] },
    ],
    // persona: renderer/persona.js (window.LoonPersona or require) → [{ id, who, text, sound }]
    voiceLines(persona) {
      return content.voice.map((v) => {
        const value = v.from && v.from[1].split('.').reduce((node, key) => node && node[key], persona.PERSONAS[v.from[0]].lines);
        const text = v.from ? (typeof value === 'string' ? value : value[v.from[2]]) : v.text;
        return { id: v.id, who: v.who, text, sound: v.sound };
      });
    },
    teach: {
      question: 'how do I save this as a PNG?',
      steps: ['Pick PNG as the format', 'Click Export… to save it'],
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = content;
  else root.LoonDemoContent = content;
})(typeof window !== 'undefined' ? window : globalThis);
