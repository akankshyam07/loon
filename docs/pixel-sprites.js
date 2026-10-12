// Pixel skin (DESIGN.md §5.0.2): hand-drawn 32×32 sprite parts, the characters that color them, and the rules that
// pick a frame from the cat's live state. Used by renderer/cat.js (window.LoonPixel) and test/pixel.test.js.
//
// Maps use semantic characters, so one set of frames serves every character (Luna, Soju):
//   k fur · s fur shade (inner lines) · O outline/rim · u muzzle fur · e eye · E closed-eye line · w shine
//   n nose · i inner ear · p paw pad · c collar · m pendant · t tail fur · r open mouth · x marking (patch)
//   f freckle · l/L lock and keyboard lavender · M/y pendant glow (added in code)
//   '.' keeps what is underneath, '_' erases to transparent.
// The head is one locked master: eyes, nose and ears sit on the same pixels in every frame. Only blink, the
// happy squint, the shine pixel (gaze), an ear twitch and a tiny mouth for talking ever touch the face.
(function (root) {
  const W = 32;
  const H = 32;
  const MID = 24; // breathing and squash remove/duplicate rows here, so the head and chest move together

  // ---------- master head (20×16), drawn at HEAD_X, headY ----------
  const HEAD = [
    '.OO..............OO.',
    '.OkO............OkO.',
    '.OikO..........OkiO.',
    '.OiikOOOOOOOOOOkiiO.',
    'OkiikkkkkkkkkkkkiikO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkuukkkkkkkkO',
    'OkkbbkkkunnukkkbbkkO',
    'OkkkkkkuOuuOukkkkkkO',
    '.OkkkkkkuOOukkkkkkO.',
    '..OkkkkkkkkkkkkkkO..',
    '...OOOOOOOOOOOOOO...',
  ];
  const HEAD_BACK = [
    '.OO..............OO.',
    '.OkO............OkO.',
    '.OkkO..........OkkO.',
    '.OkkkOOOOOOOOOOkkkO.',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    '.OkkkkkkkkkkkkkkkkO.',
    '..OkkkkkkkkkkkkkkO..',
    '...OOOOOOOOOOOOOO...',
  ];
  const HEAD_X = 6;
  const EYE_L = [4, 7]; // head-relative, 3×3
  const EYE_R = [13, 7];
  const MOUTH = [8, 12]; // head-relative 4×2 ":3" glyph under the nose; expressions swap the glyph in place

  // Eyes keep their 3×3 box; only the shine moves (gaze) or the box becomes a closed line / squint.
  const EYES = {
    center: ['wee', 'eee', 'eee'],
    left: ['eee', 'wee', 'eee'],
    right: ['eee', 'eew', 'eee'],
    up: ['ewe', 'eee', 'eee'],
    down: ['eee', 'eee', 'ewe'],
    half: ['kkk', 'wee', 'eee'],
    closed: ['...', 'EEE', '...'],
    happy: ['.E.', 'E.E', '...'],
  };
  const MOUTHS = { smile: ['OuuO', 'uOOu'], flat: ['uuuu', 'uOOu'], pop: ['OrrO', 'OrrO', '.OO.'] };
  // One ear flicks its tip a pixel outward; the other stays put.
  const EAR_TWITCH_L = ['OO___', 'OkkO_'];
  const EAR_TWITCH_R = mirror(EAR_TWITCH_L);

  // ---------- bodies (32×32, no head) ----------
  const BLANK = '................................';
  const top = (n) => Array(n).fill(BLANK);
  const SIT = [
    ...top(15),
    '..........OkkkkkkkkkkO..........',
    '..........OkkkkkkkkkkO..........',
    '.........OccccccccccccO.........',
    '.........OkkkkkmmkkkkkO.........',
    '........OkkkkkkmkkkkkkkO........',
    '........OkkkkkkmmkkkkkkO........',
    '.......OkkkkkkkkkkkkkkkkO.......',
    '.......OkkkkkkkkkkkkkkkkO.......',
    '.......OkkkkkkkkkkkkkkkkO.......',
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkkskkkkkkkkkkskkkO......',
    '......OkkkskkkksskkkkskkkO......',
    '......OkkkskkkksskkkkskkkO......',
    '......OkkkskkkksskkkkskkkO......',
    '......OkkkskkkksskkkkskkkO......',
    '......OOOOOOOOOOOOOOOOOOOO......',
  ];
  // Same body with the front legs lifted (paws over eyes, catching, leaping, typing).
  const ARMS_UP = [
    ...SIT.slice(0, 26),
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkkkkkkkkkkkkkkkkkO......',
    '......OkkskkkkkkkkkkkkskkO......',
    '......OOOOOOOOOOOOOOOOOOOO......',
  ];
  // Left front leg down, right one busy (grooming, swatting).
  const ONE_ARM = [
    ...SIT.slice(0, 26),
    '......OkkkskkkkkkkkkkkkkkO......',
    '......OkkkskkkkOkkkkkkkkkO......',
    '......OkkkskkkkOkkkkkkkkkO......',
    '......OkkkskkkkOkkkkkkkkkO......',
    '......OkkkskkkkOkkkkkkkkkO......',
    '......OOOOOOOOOOOOOOOOOOOO......',
  ];
  const LOAF = [
    ...top(18),
    '....OOO..................OOO....',
    '...OOkkkkkkkkkkkkkkkkkkkkkkOO...',
    '..OkkkkkkkkkkkkkkkkkkkkkkkkkkO..',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkkkkkkkkkkkkkkkkO.',
    '.OttttkkkOkkkkOkkOkkkkOkkkkkkkO.',
    '.OttttttsOOOOOOkkOOOOOOkkkkkkkO.',
    '..OOOOOOOOOOOOOOOOOOOOOOOOOOOO..',
  ];
  const STRETCH = [
    ...top(20),
    '..........OkkkkkkkkkkO..........',
    '..........OkkkkkkkkkkO..........',
    '.........OkkkkkkkkkkkkO.........',
    '...OOkkkkOccccccccccccOkkkkOO...',
    '..OkkkkkkkkkkkkmmkkkkkkkkkkkkO..',
    '.OkkkkkkkkkkkkkmkkkkkkkkkkkkkkO.',
    '.OkkkkkkkkkkkkkmmkkkkkkkkkkkkkO.',
    'OkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkskkkkkkkkkkkkkkkkskkkkkkO',
    'OkkkkkkskkkkkkkkkkkkkkkkskkkkkkO',
    'OppkkkkskkkkkkkkkkkkkkkkskkkkppO',
    '.OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.',
  ];
  const BACK = ARMS_UP.map((row) => row.replace(/m/g, 'k'));

  // ---------- tails (8×14 at 24,17, drawn behind the body) ----------
  const TAIL_BASE = ['....OttO', '...OttO.', '..OttO..', 'OOttO...', 'tttO....', 'ttO.....', 'OO......'];
  const TAIL_MID = ['.....OtO', '.....OtO', '.....OtO'];
  const TAILS = [
    ['....OO..', '...OttO.', '...OttO.', '....OttO', ...TAIL_MID, ...TAIL_BASE],
    ['.....OO.', '....OttO', '....OttO', '....OttO', ...TAIL_MID, ...TAIL_BASE],
    ['..OOO...', '.OtttO..', '.OOOttO.', '....OttO', ...TAIL_MID, ...TAIL_BASE],
  ];
  const TAIL_WAG = [0, 1, 0, 2];
  const TAIL_POOF = ['...OOOO.', '..OttttO', '..OttttO', '..OttttO', '...OtttO', '...OtttO', '...OtttO', '..OttttO', '.OttttO.', 'OttttO..', 'ttttO...', 'tttO....', 'ttO.....', 'OO......'];
  const TAIL_BACK = ['.OO.', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO', 'OttO'];

  // ---------- paws, props and effects ----------
  const COVER = [ // paws over both eyes; the nose peeks out between them
    '.OOOOO....OOOOO.',
    '.OkskO....OkskO.',
    '.OkkkO....OkkkO.',
    '.OkkkO....OkkkO.',
    '..OkO......OkO..',
    '..OkO......OkO..',
    '..OkO......OkO..',
    '..OkO......OkO..',
    '..OkO......OkO..',
    '..OkO......OkO..',
    '..OkO......OkO..',
  ];
  const LOCK = ['.lll.', 'l...l', 'l...l', 'mmmmm', 'mmOmm', 'mmmmm'];
  const ARM_UP_L = ['.OOO.', 'OpkpO', 'OkpkO', 'OkkkO', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '..OkO', '..OkO', '..OkO', '..OkO'];
  const ARM_UP_R = mirror(ARM_UP_L);
  const ARM_SIDE_R = ['.....OOO.', 'OOOOOkpkO', 'kkkkkpkpO', 'OOOOOkkkO', '.....OOO.'];
  const GROOM_PAW = ['.OOO.', 'OkskO', 'OkkkO', 'OkkkO', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.', '.OkO.'];
  const TYPE_PAW = ['OkkO', 'OkkO', 'OkkO', 'OkkO', 'OkkO', 'OkkO', '.OO.'];
  const KEYBOARD = ['OOOOOOOOOOOOOOOOOOOOOO', 'OLwLwLwLwLwLwLwLwLwLLO', 'OOOOOOOOOOOOOOOOOOOOOO'];
  const SPIKES = [ // fur poof when startled
    '.............O....O.............', BLANK, BLANK,
    '.....O....................O.....', BLANK, BLANK,
    '.....O....................O.....', BLANK, BLANK,
    '.....O....................O.....', BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
    '.......O................O.......', BLANK, BLANK,
    '......O..................O......', BLANK, BLANK,
    '.....O....................O.....', BLANK, BLANK,
    '.....O....................O.....',
  ]; // drawn at y=3

  // ---------- side view (walk / run / spin), facing right ----------
  const SIDE = [
    ...top(4),
    '.OO.............................',
    'OttO............................',
    'OttO.................O....O.....',
    '.OtO................OkO..OkO....',
    '.OtO................OikOOOkiO...',
    '..OtO..............OkkkkkkkkkO..',
    '..OtO..............OkkkkkkkkkkO.',
    '...OtO.............OkkkkkkwekkuO',
    '...OtO.............OkkkkkkeeekuO',
    '....OtO............OkkkkkkeeeuuO',
    '....OtOOOOOOOOOOOOOOckkkkkkkuunn',
    '....OkkkkkkkkkkkkkkkckkkkkkkuuO.',
    '....OkkkkkkkkkkkkkkkcmmkkkkkkO..',
    '....OkkkkkkkkkkkkkkkkmkOOOOOO...',
    '....OkkkkkkkkkkkkkkkkmmkkO......',
    '....OkkkkkkkkkkkkkkkkkkkkO......',
    '....OkkkkkkkkkkkkkkkkkkkkO......',
    '.....OkkkkkkkkkkkkkkkkkkkO......',
    '.....OkkkkkkkkkkkkkkkkkkO.......',
    '......OkkkkkkkkkkkkkkkkO........',
  ];
  // Legs (32×8 at y=24): near legs fur, far legs shaded; stride, pass, stride, pass.
  const LEGS = [
    [
      '.......kkss.......sskk..........',
      '......kk..ss.....ss..kk.........',
      '......kk..ss.....ss..kk.........',
      '.....kk....ss...ss....kk........',
      '.....kk....ss...ss....kk........',
      '....kk......ss.ss......kk.......',
      '....kk......ss.ss......kk.......',
      '...OOO.....OOO.OOO.....OOO......',
    ],
    [
      '.......kkss.......sskk..........',
      '.......kkss.......sskk..........',
      '.......kkss.......sskk..........',
      '.......kk.ss.....ss.kk..........',
      '.......kk..ss...ss..kk..........',
      '.......kk...........kk..........',
      '.......kk...........kk..........',
      '.......OOO..........OOO.........',
    ],
  ];
  LEGS.push(LEGS[0].map(swapShade), LEGS[1].map(swapShade));
  // Legs get a side outline in code, so a white cat's legs still read on a light desktop.
  LEGS.forEach((legs, n) => { LEGS[n] = legs.map((row) => row.replace(/\.(?=[ks])|(?<=[ks])\./g, 'O')); });

  // ---------- characters ----------
  // A character is a palette plus optional markings: head-relative masks that only recolor fur (`only`), so every
  // frame above works for every character. `animations` lets a character add its own entries later
  // (Soju: eating, belly-up nap; Luna: grooming, judging stare).
  const CHARACTERS = {
    luna: {
      name: 'Luna',
      colors: { k: '#2e2733', s: '#463c4f', O: '#2b1d24', u: '#5a4d66', e: '#80e27e', E: '#80e27e', w: '#ffffff', n: '#0e0b14', b: '#ff8fb8', i: '#ff8fb8', p: '#ff8fb8', c: '#ff8fb8', m: '#ffd166', t: '#2e2733', r: '#ff6f9f', x: '#2e2733', f: '#0e0b14' },
      marks: [],
      animations: {},
    },
    // The second companion: white, a dark patch over the viewer's-left eye up into that ear's base, a thin
    // streak at the other ear's base, a freckle on the viewer's-left side of the pink nose, and a gray tail.
    soju: {
      name: 'Soju',
      colors: { k: '#fbf8f3', s: '#ddd5e2', O: '#4a3b44', u: '#fbf8f3', e: '#b8c75a', E: '#6f7a2e', w: '#ffffff', n: '#ff9fbf', b: '#ffc2d4', i: '#ffb3cc', p: '#ffb3cc', c: '#8fd3ff', m: '#ffd166', t: '#8c8896', r: '#e0607f', x: '#2b262e', f: '#1a1418' },
      marks: [{
        on: 'head', x: 0, y: 0, only: 'kbufn', map: [
          '....................',
          '..x.................',
          '..xx................',
          '..xxx...............',
          '.xxxx..........x....',
          '.xxxxxxx............',
          '.xxxxxxxx...........',
          '.xxxxxxxx...........', // the eye box too: a closed or happy eye sits on the patch
          '.xxxxxxxx...........',
          '.xxxxxxxx...........',
          '.xxxxxxx.nn.........', // a taller pink nose (2×2) so the freckle can sit on it
          '.........f..........', // the freckle: black, on the viewer's left of the nose
        ],
      }, {
        // side view: the patch around the eye and up into the near ear, so Soju is still Soju mid-walk
        on: 'side', x: 24, y: 7, only: 'k', map: ['..x...', '.xxx..', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', '.xxxx.'],
      }],
      animations: {},
    },
  };

  // ---------- costumes ----------
  // Every costume has an anchor for each of the three views, so it rides along on every frame:
  //   front: head-relative [x, y, map] on the locked head (sit, loaf, stretch, poses; follows breathing and squash)
  //   side:  absolute [x, y, map] on the side view, facing right (walk, run, spin)
  //   back:  head-relative [x, y, map] on the back of the head (the middle of a tail chase)
  const COSTUME_COLORS = { R: '#ff6b7d', Y: '#ffd166', V: '#7ed69a', D: '#3e9b63', A: '#8e6bd1', B: '#3a3150', T: '#f2c98a', K: '#b5763f' };
  const HOOD = [ // ears poke out above, the face shows through the window
    '......ORRRRRRRRO......',
    '.....ORRYRRRRYRRO.....',
    'ORRYRRRRRYRRRRRYRRRRYO',
    'ORRO..............ORRO',
    'ORYO..............OYRO',
    'ORRO..............ORRO',
    'ORRO..............ORRO',
    'ORYO..............OYRO',
    'ORRO..............ORRO',
    '.ORRO............ORRO.',
    '..ORRO..........ORRO..',
    '...ORRRRRRRRRRRRRRO...',
    '....OOOOOOOOOOOOOO....',
  ];
  const SIDE_HOOD = [ // x=17, last row of the top lands on y=7; the face shows on the right
    '..ORRRRRRRRO..',
    '.ORRYRRRRYRRO.',
    'ORRRRRRRRRRRO.',
    'ORYRRRO.......',
    'ORRRRYO.......',
    'ORYRRRO.......',
    'ORRRRRO.......',
    '.OORRRO.......',
    '...OOO........',
  ];
  // Bread: the face pokes through a slice; the crust dome hides the ears.
  const BREAD = [
    '.....OOOOOOOOOOOO.....',
    '...OOKKKKKKKKKKKKOO...',
    '..OKKTTTTTTTTTTTTKKO..',
    '.OKTTTTTTTTTTTTTTTTKO.',
    'OKTTTTTTTTTTTTTTTTTTKO',
    'OKTTTTTTTTTTTTTTTTTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    'OKTTO............OTTKO',
    '.OKTTO..........OTTKO.',
    '..OKTTOOOOOOOOOOTTKO..',
    '...OKKTTTTTTTTTTKKO...',
    '....OOOOOOOOOOOOOO....',
  ];
  const recolor = (map, from, to) => map.map((row) => row.replace(new RegExp(`[${from}]`, 'g'), (c) => to[from.indexOf(c)]));
  const fillWindow = (map, fill) => map.map((row) => row.replace(/(?<=O)\.+(?=O)/g, (m) => fill.repeat(m.length)));
  // A hood costume from its toppers (front 22 wide, side 14 wide) and an optional recolor of the hood fabric.
  function hood(name, front, side, from = 'RY', to = 'RY', fill = to[0]) {
    const body = recolor(HOOD, from, to);
    return {
      name, slot: 'hood',
      front: [-1, 3 - front.length, [...front, ...body]],
      side: [17, 8 - side.length, [...side, ...recolor(SIDE_HOOD, from, to)]],
      back: [-1, 3 - front.length, [...front, ...fillWindow(body, fill)]],
    };
  }
  // A hat sits on top of the head; the side view moves it over the profile head.
  function hat(name, x, y, map, side = [x + 15, y + 5]) {
    return { name, slot: 'hat', front: [x, y, map], side: [...side, map], back: [x, y, map] };
  }
  const BEE_STRIPES = (map) => map.map((row, i) => ([2, 5, 8, 11].includes(i) ? row.replace(/Y/g, 'B') : row));
  const bee = hood('Bee hood', ['......O........O......', '.......O......O.......'], ['..O......O....', '...O....O.....', '..............'], 'RY', 'YY');
  bee.front[2] = [...bee.front[2].slice(0, 2), ...BEE_STRIPES(bee.front[2].slice(2))];
  bee.back[2] = [...bee.back[2].slice(0, 2), ...BEE_STRIPES(bee.back[2].slice(2))];
  bee.side[2] = [...bee.side[2].slice(0, 3), ...BEE_STRIPES(bee.side[2].slice(3))];
  const COSTUMES = {
    none: null,
    strawberry: hood('Strawberry hood', ['..........VV..........', '........VDVVDV........'], ['......VV......', '.....VDDV.....']),
    frog: hood('Frog hood', ['.....OOO......OOO.....', '.....OwOV....VOwO.....'], ['...OOO..OOO...', '...OwO..OwO...'], 'RY', 'VV'),
    bee,
    witch: hat('Witch hat', 3, -5, ['.........OO...', '........OAAO..', '.......OAAO...', '......OAAAO...', '.....OAAAAAO..', '.....OYYYYYO..', '....OAAAAAAAO.', '.OAAAAAAAAAAO.', '..OOOOOOOOOO..']),
    santa: hat('Santa hat', 4, -5, ['....OwwO....', '....OwwO....', '....ORRO....', '...ORRRRO...', '..ORRRRRRO..', '.ORRRRRRRRO.', 'OwwwwwwwwwwO', 'OwwwwwwwwwwO']),
    party: hat('Party hat', 4, -5, ['.....YY.....', '....OYYO....', '....OLLO....', '...OiiiiO...', '...OLLLLO...', '..OiiiiiiO..', '..OLLLLLLO..', '.OiiiiiiiiO.', '.OOOOOOOOOO.']),
    grad: hat('Graduation cap', 2, -1, ['.OOOOOOOOOOOOOO.', 'OBBBBBBBBBBBBBYO', '.OOOOBBBBBBOOOOY', '....OBBBBBBO...Y', '....OOOOOOOO..YY'], [16, 4]),
    bowtie: { name: 'Bow tie', slot: 'neck', front: [6, 15, ['OO....OO', 'ORROORRO', 'ORRRRRRO', 'ORROORRO', 'OO....OO']], side: [20, 14, ['.OO', 'ORR', 'ORR', '.OO']], back: [8, 15, ['ORRO']] },
    // Lavender frames so they read on a black cat as well as a white one.
    sunglasses: { name: 'Sunglasses', slot: 'face', front: [3, 7, ['LLLLLLLLLLLLLL', 'LBwBL....LBwBL', 'LBBBL....LBBBL', '.LLL......LLL.']], side: [20, 11, ['LLLLLLLLLL', '.....LBwBL', '.....LBBBL', '......LLL.']], back: [1, 8, ['LLLLLLLLLLLLLLLLLL']] },
    bread: { name: 'Bread loaf', slot: 'hood', front: [-1, -2, BREAD], side: [17, 5, [...['....OOOOOO....', '..OOKKKKKKOO..', '.OKTTTTTTTTKO.'], ...recolor(SIDE_HOOD, 'RY', 'TK')]], back: [-1, -2, fillWindow(BREAD, 'T')] },
  };

  // Seasonal costumes (opt-in): a witch hat at the end of October, a Santa hat in December.
  function seasonalCostume(date = new Date()) {
    if (date.getMonth() === 9 && date.getDate() >= 20) return 'witch';
    if (date.getMonth() === 11) return 'santa';
    return null;
  }

  // ---------- helpers ----------
  function mirror(map) { return map.map((row) => [...row].reverse().join('')); }
  function swapShade(row) { return row.replace(/[ks]/g, (c) => (c === 'k' ? 's' : 'k')); }

  function lookDir(look = { x: 0, y: 0 }) {
    const { x = 0, y = 0 } = look;
    if (Math.abs(x) > 2.2 && Math.abs(x) >= Math.abs(y) * 1.2) return x < 0 ? 'left' : 'right';
    if (Math.abs(y) > 1.8) return y < 0 ? 'up' : 'down';
    return 'center';
  }

  function eyeFor(v, lid, gaze) {
    if (v.happy > 0.5) return EYES.happy;
    if (lid > 0.85) return EYES.closed;
    if (lid > 0.4) return EYES.half;
    return EYES[gaze];
  }

  // ---------- frame picking ----------
  // v: the cat's live state from cat.js (see VIEW_DEFAULTS). Returns layers + whole-grid tweaks for compose().
  const VIEW_DEFAULTS = {
    now: 0, state: 'idle', pose: 'sit', mood: 'neutral', move: null, look: { x: 0, y: 0 }, lidL: 0.08, lidR: 0.08, happy: 0,
    mouth: 'smile', twitchL: 0, twitchR: 0, glow: 0, tailPeriod: 4200, travel: null, facing: 1, spin: 0, sy: 1, bodyRot: 0,
    privacy: false, dragging: false, fileOver: false, fidget: null, costume: 'none',
  };

  function pickFrame(input, characterId = 'luna') {
    const v = { ...VIEW_DEFAULTS, ...input };
    const character = CHARACTERS[characterId] || CHARACTERS.luna;
    const costume = COSTUMES[v.costume] || null;
    const t = v.now;
    const tick = (ms, n) => Math.floor(t / ms) % n;
    const layers = [];
    const put = (map, x, y, only, costumeLayer = false) => layers.push({ map, x, y, only, costume: costumeLayer });
    const wear = ([x, y, map], dx = 0, dy = 0) => put(map, x + dx, Math.min(y + dy, H - map.length), undefined, true);
    const frame = { layers, squash: 0, shift: 0, flip: false, glow: 0, pose: 'sit' };
    const side = (legs) => {
      put(SIDE, 0, 0);
      put(LEGS[legs], 0, 24);
      for (const mark of character.marks) if (mark.on === 'side') put(mark.map, mark.x, mark.y, mark.only);
      if (costume) wear(costume.side);
    };

    const phase = v.spin ? ((Math.round(v.spin / 90) % 4) + 4) % 4 : 0;
    if (phase) {
      frame.pose = 'spin';
      if (phase === 2) { put(BACK, 0, 0); put(TAIL_BACK, 14, 17); put(HEAD_BACK, HEAD_X, 1); if (costume) wear(costume.back, HEAD_X, 1); } else { side(1); frame.flip = phase === 3; }
      return frame;
    }
    if (v.travel === 'walk' || v.travel === 'run') {
      frame.pose = v.travel;
      side(tick(v.travel === 'run' ? 90 : 160, 4));
      frame.flip = v.facing < 0;
      return frame;
    }

    let pose = 'sit';
    if (v.travel === 'leap') pose = 'leap';
    else if (v.dragging) pose = 'startled';
    else if (v.fileOver) pose = 'catch';
    else if (v.state === 'acting') pose = 'busy';
    else if (v.pose === 'loaf') pose = 'loaf';
    else if (v.pose === 'pawsUp') pose = v.move === 'knockItOff' ? 'swat' : 'cover';
    else if (v.pose === 'crouch') pose = v.move === 'stretch' ? 'stretch' : 'crouch';
    else if (v.fidget === 'groom') pose = 'groom';
    frame.pose = pose;

    const body = { loaf: LOAF, stretch: STRETCH, cover: ARMS_UP, catch: ARMS_UP, leap: ARMS_UP, busy: ARMS_UP, swat: ONE_ARM, groom: ONE_ARM }[pose] || SIT;
    const headY = { loaf: 13, stretch: 7 }[pose] ?? 1;

    // tail (behind everything)
    const wagMs = Math.max(90, Math.min(1100, v.tailPeriod / 4));
    if (pose === 'startled') put(TAIL_POOF, 24, 17);
    else if (pose !== 'loaf') put(TAILS[TAIL_WAG[tick(wagMs, 4)]], 24, 17);
    put(body, 0, 0);

    // the locked face: only the eye and mouth glyphs swap, always on the same pixels
    put(HEAD, HEAD_X, headY);
    const groomUp = pose === 'groom' && tick(320, 2) === 0;
    const gaze = pose === 'busy' ? 'down' : lookDir(v.look);
    const groomEyes = pose === 'groom' ? 1 : null;
    put(eyeFor(v, groomEyes ?? v.lidL, gaze), HEAD_X + EYE_L[0], headY + EYE_L[1]);
    put(eyeFor(v, groomEyes ?? v.lidR, gaze), HEAD_X + EYE_R[0], headY + EYE_R[1]);
    const pop = v.mouth === 'open' || v.fidget === 'yawn' || pose === 'startled';
    const flat = ['judgy', 'suspicious', 'focused', 'protective', 'confused'].includes(v.mood);
    if (pop) put(MOUTHS.pop, HEAD_X + MOUTH[0], headY + MOUTH[1]);
    else if (flat) put(MOUTHS.flat, HEAD_X + MOUTH[0], headY + MOUTH[1]);
    if (v.twitchL > 6) put(EAR_TWITCH_L, HEAD_X, headY);
    if (v.twitchR > 6) put(EAR_TWITCH_R, HEAD_X + 15, headY);
    for (const mark of character.marks) if (mark.on === 'head') put(mark.map, HEAD_X + mark.x, headY + mark.y, mark.only);

    // costume over the face/body, under the paws
    if (costume) wear(costume.front, HEAD_X, headY);

    // what the paws are doing
    if (pose === 'cover') { put(COVER, 8, 7); if (v.privacy) put(LOCK, 26, 1); }
    if (pose === 'catch' || pose === 'leap') { put(ARM_UP_L, 0, 2); put(ARM_UP_R, 27, 2); }
    if (pose === 'swat') put(ARM_SIDE_R, 23, 17);
    if (pose === 'groom') put(GROOM_PAW, 13, groomUp ? 12 : 14);
    if (pose === 'busy') { const a = tick(125, 2); put(KEYBOARD, 5, 29); put(TYPE_PAW, 11, 21 + a); put(TYPE_PAW, 17, 22 - a); }
    if (pose === 'startled') put(SPIKES, 0, 3);

    // whole-grid tweaks: 1px breathing bob, squash/stretch from the move tweens, a 1px wiggle, pendant glow
    const breathe = ['sit', 'loaf', 'cover', 'busy'].includes(pose) && v.sy > 0.97 && v.sy < 1.03 ? tick(v.state === 'napping' ? 1400 : 1000, 2) : 0;
    const quant = v.sy < 0.93 ? 2 : v.sy < 0.97 ? 1 : v.sy > 1.08 ? -2 : v.sy > 1.03 ? -1 : 0;
    frame.squash = Math.max(-2, Math.min(4, breathe + quant + (pose === 'crouch' ? 3 : 0) + (pose === 'leap' ? -1 : 0)));
    frame.shift = v.bodyRot > 1.5 ? 1 : v.bodyRot < -1.5 ? -1 : 0;
    frame.glow = v.glow > 0.66 ? 2 : v.glow > 0.3 ? 1 : 0;
    return frame;
  }

  // Grid = TOP rows of headroom (hats) + the 32×32 art + one floor-shadow row. Layer coordinates are art coordinates.
  const TOP = 6;
  const ROWS = TOP + H + 1;
  function compose({ layers, squash = 0, shift = 0, flip = false, glow = 0 }) {
    let g = Array.from({ length: ROWS }, () => Array(W).fill('.'));
    for (const { map, x, y, only } of layers) {
      map.forEach((row, j) => {
        const gy = TOP + y + j;
        if (gy < 0 || gy >= TOP + H) return;
        for (let i = 0; i < row.length; i++) {
          const c = row[i];
          const gx = x + i;
          if (c === '.' || gx < 0 || gx >= W) continue;
          if (only && !only.includes(g[gy][gx])) continue;
          g[gy][gx] = c === '_' ? '.' : c;
        }
      });
    }
    if (glow) {
      const halo = [];
      g.forEach((row, y) => row.forEach((c, x) => {
        if (c !== 'm') return;
        row[x] = 'M';
        if (glow > 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + dy]?.[x + dx] === 'k') halo.push([x + dx, y + dy]);
      }));
      for (const [x, y] of halo) g[y][x] = 'y';
    }
    const floor = g.pop();
    if (squash > 0) { g.splice(TOP + MID, squash); for (let i = 0; i < squash; i++) g.unshift(Array(W).fill('.')); }
    if (squash < 0) { for (let i = 0; i < -squash; i++) g.splice(TOP + MID, 0, [...g[TOP + MID]]); g.splice(0, -squash); }
    if (shift > 0) g = g.map((r) => ['.', ...r.slice(0, -1)]);
    if (shift < 0) g = g.map((r) => [...r.slice(1), '.']);
    if (flip) g = g.map((r) => r.reverse());
    // soft floor shadow: one row, a little narrower than the feet
    const feet = g[g.length - 1];
    const first = feet.findIndex((c) => c !== '.');
    const last = feet.length - 1 - [...feet].reverse().findIndex((c) => c !== '.');
    if (first >= 0) for (let x = first + 1; x < last; x++) floor[x] = 'z';
    g.push(floor);
    return g.map((r) => r.join(''));
  }

  const BASE_COLORS = { l: '#cfc4e6', L: '#b9a4ff', M: '#fff4c8', y: '#ffe08a', z: 'rgba(43, 29, 36, 0.22)', ...COSTUME_COLORS };
  const colorsFor = (characterId) => ({ ...BASE_COLORS, ...(CHARACTERS[characterId] || CHARACTERS.luna).colors });

  // Paints a composed grid at an integer cell size. `rim` adds a faint light edge outside the silhouette so a dark
  // cat still reads on a dark desktop (it is not part of the hit area).
  function drawGrid(ctx, grid, colors, cell, { rim = null } = {}) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const solid = (x, y) => { const c = grid[y]?.[x]; return c && c !== '.' && c !== 'z'; };
    if (rim) {
      ctx.fillStyle = rim;
      grid.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x * cell, y * cell, cell, cell); });
    }
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.') continue;
        ctx.fillStyle = colors[c] || '#f0f';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    });
  }

  // ---------- the animation table (sprite sheet, docs, tests) ----------
  // Each entry is a list of view patches; frames come out of pickFrame, so the sheet shows exactly what the app draws.
  const at = (n, ms, patch = {}) => Array.from({ length: n }, (_, i) => ({ ...patch, now: i * ms }));
  const BASE_ANIMATIONS = {
    idle: { fps: 1, frames: at(4, 1050) },
    blink: { fps: 10, frames: [{ lidL: 0.5, lidR: 0.5 }, { lidL: 1, lidR: 1 }, {}] },
    earTwitch: { fps: 6, frames: [{}, { twitchL: 14 }, {}, { twitchR: 14 }] },
    tailWag: { fps: 8, frames: at(4, 125, { tailPeriod: 500 }) },
    look: { fps: 4, frames: [{}, { look: { x: -6, y: 0 } }, { look: { x: 6, y: 0 } }, { look: { x: 0, y: -4 } }, { look: { x: 0, y: 4 } }] },
    happy: { fps: 2, frames: at(2, 1000, { state: 'petted', mood: 'happy', happy: 1 }) },
    think: { fps: 8, frames: at(4, 225, { state: 'thinking', mood: 'focused', look: { x: 2.5, y: -4.5 }, tailPeriod: 900, glow: 0.9 }).map((f, i) => ({ ...f, glow: i % 2 ? 0.5 : 0.9 })) },
    talk: { fps: 7, frames: [{ state: 'talking' }, { state: 'talking', mouth: 'open' }, { state: 'talking' }, { state: 'talking', mouth: 'open' }] },
    eat: { fps: 7, frames: [{ state: 'eating', mouth: 'open' }, { state: 'eating' }] },
    sleep: { fps: 1, frames: at(2, 1400, { state: 'napping', pose: 'loaf', mood: 'asleep', lidL: 1, lidR: 1 }) },
    yawn: { fps: 3, frames: [{ state: 'waking', mood: 'sleepy', lidL: 0.62, lidR: 0.62, mouth: 'open' }, { state: 'waking', mood: 'sleepy', lidL: 1, lidR: 1, mouth: 'open' }] },
    stretch: { fps: 3, frames: [{ move: 'stretch', pose: 'crouch', mood: 'asleep', lidL: 1, lidR: 1, mouth: 'open' }, { move: 'stretch', pose: 'crouch', mood: 'asleep', lidL: 1, lidR: 1, mouth: 'open', bodyRot: 3 }] },
    groom: { fps: 3, frames: at(2, 320, { fidget: 'groom' }) },
    judge: { fps: 1, frames: [{ mood: 'judgy', lidL: 0.52, lidR: 0.52 }] },
    curious: { fps: 1, frames: [{ mood: 'curious', look: { x: 5.5, y: -3.5 } }] },
    confused: { fps: 1, frames: [{ mood: 'confused', lidL: 0.5, lidR: 0 }] },
    privacy: { fps: 1, frames: [{ pose: 'pawsUp', mood: 'protective', privacy: true }] },
    busy: { fps: 8, frames: at(2, 125, { state: 'acting', tailPeriod: 600 }) },
    startled: { fps: 1, frames: [{ dragging: true, mood: 'wide', sy: 1.07 }] },
    catch: { fps: 1, frames: [{ fileOver: true, mood: 'wide' }] },
    moonMagic: { fps: 4, frames: [{ mood: 'wide', glow: 0.5 }, { mood: 'wide', glow: 1 }, { mood: 'happy', happy: 1, glow: 1 }] },
    pounce: { fps: 6, frames: [{ move: 'pounce', pose: 'crouch' }, { move: 'pounce', pose: 'crouch', bodyRot: 2.5 }, { move: 'pounce', pose: 'crouch', bodyRot: -2.5 }, { move: 'pounce', pose: 'crouch', sy: 1.12 }, { move: 'pounce', travel: 'leap' }, { move: 'pounce', sy: 0.87 }, { move: 'pounce', mood: 'happy', happy: 1 }] },
    edgePeek: { fps: 2, frames: [{ move: 'edgePeek', look: { x: 0, y: -2 } }, { move: 'edgePeek', look: { x: -5, y: -1 } }, { move: 'edgePeek', look: { x: 5, y: -1 } }] },
    knockItOff: { fps: 3, frames: [{ move: 'knockItOff', mood: 'judgy', lidL: 0.52, lidR: 0.52 }, { move: 'knockItOff', pose: 'pawsUp' }] },
    tailChase: { fps: 8, frames: [0, 90, 180, 270].map((spin) => ({ move: 'tailChase', spin })) },
    walk: { fps: 6, frames: at(4, 160, { travel: 'walk' }) },
    run: { fps: 11, frames: at(4, 90, { travel: 'run' }) },
    hop: { fps: 6, frames: [{ sy: 0.92 }, { travel: 'leap' }, { sy: 0.87 }] },
  };
  const animationsFor = (characterId) => ({ ...BASE_ANIMATIONS, ...(CHARACTERS[characterId] || CHARACTERS.luna).animations });

  // What the cat.js state machine shows, by state and by move (tested against cat.js).
  const STATE_ANIM = { idle: 'idle', petted: 'happy', napping: 'sleep', waking: 'yawn', eating: 'eat', thinking: 'think', talking: 'talk', acting: 'busy', move: 'idle' };
  const MOVE_ANIM = { moonMagic: 'moonMagic', pounce: 'pounce', edgePeek: 'edgePeek', stretch: 'stretch', tailChase: 'tailChase', knockItOff: 'knockItOff', zoomies: 'run', hop: 'hop' };

  const MAPS = { HOOD, HEAD, HEAD_BACK, EYES, MOUTHS, EAR_TWITCH_L, EAR_TWITCH_R, SIT, ARMS_UP, ONE_ARM, LOAF, STRETCH, BACK, TAILS, TAIL_POOF, TAIL_BACK, COVER, LOCK, ARM_UP_L, ARM_UP_R, ARM_SIDE_R, GROOM_PAW, TYPE_PAW, KEYBOARD, SPIKES, SIDE, LEGS };
  const api = { W, H, TOP, ROWS, drawGrid, MAPS, CHARACTERS, COSTUMES, seasonalCostume, BASE_COLORS, colorsFor, pickFrame, compose, lookDir, BASE_ANIMATIONS, animationsFor, STATE_ANIM, MOVE_ANIM, VIEW_DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoonPixel = api;
})(typeof window !== 'undefined' ? window : globalThis);
