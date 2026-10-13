// Personalities for Luna and Soju (DESIGN.md §5.0.3). Flavor only: short lines shown around answers (never inside the
// answer text, never sent to a model), reactions, nudge wording, idle-routine weights and the cameo rules.
// Plain UMD like pixel-sprites.js: the cat window loads it as window.LoonPersona, main/companion.js and tests require it.
(function (root) {
  const PERSONAS = {
    // The big sister: a little sassy, smart, sweet. Grooms, judges, loafs perfectly.
    luna: {
      name: 'Luna',
      moves: { fancyGroom: 4, judgeStare: 3, perfectLoaf: 3, knockItOff: 2, stretch: 2, moonMagic: 1, tailChase: 1, pounce: 1, edgePeek: 1, zoomies: 0.5, hop: 1 },
      groomChance: 0.6, // how often an idle fidget is a paw groom
      lines: {
        greeting: ['Hi. I was already looking at you.', 'What are we figuring out today?', 'Back again? Good. I missed you. A little.', 'Ready when you are. Obviously.'],
        pet: ['Fine. You may continue.', 'Mrrr. Acceptable.', "Okay, that's nice.", "Two more minutes. Then I'm busy."],
        selection: ["Ooh. What's that?", 'Want me to look?', 'I see you highlighting.'],
        fileDrop: ['A gift? Let me read it.', "For me? I'll take a look."],
        error: ["Hm. That didn't work. Not my fault.", 'My brain tripped. Try again?'],
        privacy: ["Private page. I'm not looking.", 'Eyes closed. Your secrets are safe.'],
        shopping: ["I've seen better deals. Here's the math.", 'Price per unit, darling. Always.', 'Judged. Fairly.'],
        nudge: {
          shopping: 'I have opinions about these prices.',
          menu: 'Hungry? I can pick something sensible.',
          code: 'Need a second pair of eyes?',
          dense: "That's a lot of words. Short version?",
          today: 'Want the plan for today?',
          break: 'Stretch with me. You earned it.',
        },
        call: ["This is Soju's department 🙄", 'Soju! Food. Your favorite subject.', 'Ugh, menus. SOJU!'], // calls Soju in (food)
        guest: ["Move over, Soju. I've got this.", 'Let the smart one look.', 'Ahem. Big sister here.'], // her line in Soju's brainy cameo
        // greeting flavor per context mode (brain/modes.js)
        mode: {
          dev: ['Code? Show me the scary part.', 'Developer Cat, reporting. Paste the error.'],
          shopping: ['Shopping Cat is on duty. Prices, please.', 'Let me judge these deals.'],
          food: ['Menus. Let me find the sensible thing.', 'Food Cat. I read the fine print on sauces.'],
          study: ['Study time. I can make this make sense.', 'Dense page? I love those.'],
          work: ['Work mode. Short and professional, got it.', 'Inbox face on. What needs doing?'],
        },
        // "Get to know you" (onboarding): Luna asks
        onboard: {
          intro: "Hi, I'm Luna, and this is my little brother Soju. Five quick questions so I can help you better? All optional, and it all stays on this Mac.",
          name: 'First things first. What should I call you?',
          role: 'What do you mostly do on your Mac?',
          style: 'How do you like your answers?',
          food: 'Any food rules I should know about? Soju insists.',
          interests: 'Last one. What are you into?',
          review: "Here's what I'll remember. Untick anything you'd rather I didn't.",
          done: 'All set. I already like you.',
        },
      },
    },
    // The little brother: younger, goofy, always hungry, a bit clumsy.
    soju: {
      name: 'Soju',
      moves: { eatBowl: 4, sprawlNap: 3, zoomies: 3, edgePeek: 3, trip: 2, bonk: 2, clumsyChase: 2, playNap: 2, tailChase: 2, pounce: 1, stretch: 1, hop: 1 },
      groomChance: 0.2,
      lines: {
        greeting: ['Hiii! Is it snack time?', "Oh! You're here! Hi hi!", "I'm awake! Mostly!"],
        pet: ['Purrrr! More!', 'Yay! Again!', 'Best day ever!'],
        selection: ['Ooh, shiny words!', 'Is that food? No? Still cool!'],
        fileDrop: ['Ooh, a present!', 'Is it a treat? Let me see!'],
        error: ['Oops. I bonked my brain.', 'Uh oh. Try again?'],
        privacy: ['Private! Paws over eyes!', 'Not peeking! Promise!'],
        shopping: ['Can we buy snacks too?', 'Cheapest one gets a treat!', 'Ooh, numbers! I counted them.'],
        nudge: {
          shopping: 'Shopping? Can I help? Please?',
          menu: 'FOOD! I can help with food!',
          code: "Ooh, code! I'll get Luna if it's hard.",
          dense: 'So many words. Short version?',
          today: 'What are we doing today?',
          break: 'Break time! Snack break?',
        },
        call: ["LUNA! This one's brainy!", 'Luna, help! Big words!', 'Hold on, getting my sister!'], // calls Luna in (brainy)
        guest: ['Did someone say food?!', "I'd eat all of it, but okay.", 'Nom. Approved by Soju.'], // his line in Luna's food cameo
        mode: {
          dev: ["Ooh, code! I'll get Luna if it's hard.", 'Beep boop! Developer Cat!'],
          shopping: ['Shopping! Can we get snacks?', 'I love a bargain!'],
          food: ['FOOD! My favorite mode!', 'Menu time! I call dibs on dessert.'],
          study: ['Study buddy mode! I brought pencils.', "Big words! I'm ready!"],
          work: ['Work Cat! I put on my tiny tie.', 'Business time! Very serious. Mostly.'],
        },
        // "Get to know you": Soju reacts to each answer (flavor only)
        onboard: {
          name: ['Nice to meet you!', 'Ooh, pretty name!', "I'll remember it! Probably!"],
          role: { student: 'A student! Do you have snacks in your backpack?', dev: 'A coder! Luna loves bugs. The code kind.', design: 'An artist! Can you draw me?', work: 'Busy bee! I can be quiet. Mostly.', other: 'Mysterious! I like it.' },
          style: { short: 'Short! Like me!', normal: 'Just right!', detailed: 'Luna will love that. She talks a LOT.' },
          food: ['Noted! More snacks for me.', "Got it! I'll never offer you the wrong treat."],
          interests: ['Ooh, fun!', "That's so cool!"],
          skip: ['Skipping is fine!', 'Next!'],
          done: ['Yay! New friend!', 'Best day ever!'],
        },
      },
    },
  };

  const BRAINY_TASKS = ['explain_error', 'find_bug', 'likely_fix', 'fact_check', 'page_summary'];
  const FOOD_NUDGES = ['menu', 'break', 'snack'];

  const personaOf = (id) => PERSONAS[id] || PERSONAS.luna;
  const pick = (list, rand = Math.random) => (list?.length ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))] : '');

  // A line for an event ('pet', 'nudge.menu', …); '' when the persona has nothing to say.
  function line(id, event, rand = Math.random) {
    const value = event.split('.').reduce((node, key) => node?.[key], personaOf(id).lines);
    return typeof value === 'string' ? value : pick(value, rand);
  }

  // A tiny verdict quip next to shopping answers (only when Judgmental is on). Never part of the answer text.
  function flavorFor({ companion, task, judgmental = true, rand = Math.random }) {
    if (judgmental === false || !/^shop_(value|reviews|basket)$/.test(task || '')) return null;
    return line(companion, 'shopping', rand) || null;
  }

  // Who pops in: Luna calls Soju for food (food tasks, a menu page, a snack or break nudge); Soju calls Luna for
  // brainy tasks. Never on sensitive pages, never when Cameos is off. The answer itself is untouched either way.
  function cameoFor({ companion, task = null, pageKind = null, nudge = null, sensitive = false, enabled = true, rand = Math.random }) {
    if (!enabled || sensitive) return null;
    const food = (task && (/^food_/.test(task) || pageKind === 'menu')) || FOOD_NUDGES.includes(nudge);
    let guest = null;
    if (companion === 'luna' && food) guest = 'soju';
    else if (companion === 'soju' && task && BRAINY_TASKS.includes(task)) guest = 'luna';
    if (!guest) return null;
    return { host: companion, guest, kind: guest === 'soju' ? 'food' : 'brainy', call: line(companion, 'call', rand), line: line(guest, 'guest', rand) };
  }

  // Weighted pick of an idle routine from the moves a cat can do right now.
  function pickMove(id, available, rand = Math.random) {
    const entries = Object.entries(personaOf(id).moves).filter(([name, weight]) => weight > 0 && available.includes(name));
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let r = rand() * total;
    for (const [name, weight] of entries) if ((r -= weight) < 0) return name;
    return entries.length ? entries[entries.length - 1][0] : null;
  }

  const api = { PERSONAS, BRAINY_TASKS, line, flavorFor, cameoFor, pickMove, other: (id) => (id === 'soju' ? 'luna' : 'soju') };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoonPersona = api;
})(typeof window !== 'undefined' ? window : globalThis);
