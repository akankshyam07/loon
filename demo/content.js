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
    teach: {
      question: 'how do I save this as a PNG?',
      steps: ['Pick PNG as the format', 'Click Export… to save it'],
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = content;
  else root.LoonDemoContent = content;
})(typeof window !== 'undefined' ? window : globalThis);
