// Pixel skin (DESIGN.md §5.0.2): hand-drawn 32×32 sprite parts, the characters that color them, and the rules that
// pick a frame from the cat's live state. Used by renderer/cat.js (window.LoonPixel) and test/pixel.test.js.
//
// Maps use semantic characters, so one set of frames serves every character (Luna, Soju):
//   k fur · s fur shade (inner lines) · O outline/rim · u muzzle fur · e eye · P slit pupil · D dilated (scared) pupil · E closed-eye line · w shine
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
    'OkkkkkkkknnkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    'OkkkkkkkkkkkkkkkkkkO',
    '.OkkkkkkkkkkkkkkkkO.',
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

  // The eyes do all the emoting (the face is otherwise just a tiny nose): a tall slit pupil that slides with the
  // gaze, a flat half-lid for judging, big round black pupils (one shine pixel) when scared, lines for sleepy,
  // ^ ^ for happy.
  const EYES = {
    center: ['ePe', 'ePe', 'ePe'],
    left: ['Pee', 'Pee', 'Pee'],
    right: ['eeP', 'eeP', 'eeP'],
    up: ['ePe', 'ePe', 'eee'],
    down: ['eee', 'ePe', 'ePe'],
    half: ['...', 'EEE', 'ePe'],
    wide: ['wDD', 'DDD', 'DDD'],
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
  // Belly-up sprawl: on his back with the head upside down at the left (ears toward the floor), a long body, all four
  // paws in the air and the tail flopped on the floor.
  const SPRAWL = [
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '........................OppOppO.',
    '........................OkkOkkO.',
    '.................OppOppOOkkOkkO.',
    '.................OkkOkkOOkkOkkO.',
    '.................OkkOkkOOkkOkkO.',
    '...............OOkkkkkkkkkkkkkOO',
    '..............OkkkkkkkkkkkkkkkkO',
    '..............OkkkkkkkkkkkkkkkkO',
    '..............OkkkkkkkkkkkkkkkkO',
    '..............OkkkkkkkkkkkkkkkkO',
    '..............OkkkkkkkkkkkkkkkkO',
    '...............OkkkkkkkkkkkkkkO.',
    '................OOOOOOOOOOOOOOtO',
    '.............................OtO',
    '...........................OttO.',
    '.........................OttO...',
    '.........................OOO....',
    '................................',
    '................................',
  ];

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
  const TONGUE = ['rr', '.r']; // head-relative at MOUTH + 1: a lick (grooming, eating air)
  const BOWL = [ // Soju's food bowl, in front of his paws
    '..OOOOOOOOOOOOOO..',
    '.OKTKKTKTKKTKTKKO.',
    'OQQQQQQQQQQQQQQQQO',
    'OQqqQQQQQQQQQQQQQO',
    '.OQQQQQQQQQQQQQQO.',
    '..OOOOOOOOOOOOOO..',
  ];
  const CRUMBS = [['K......................T', '........................'], ['........................', '.T....................K.']]; // flying out beside the bowl
  const STARS = [ // dizzy stars over the head after a bonk or a trip
    '.Y..............Y...',
    'YwY............YwY..',
    '.Y.......Y......Y...',
    '........YwY.........',
    '.........Y..........',
  ];
  const BONK = ['...Y...', '.Y.Y.Y.', '..YYY..', 'YYYwYYY', '..YYY..', '.Y.Y.Y.', '...Y...'];
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
      colors: { k: '#2e2733', s: '#463c4f', O: '#2b1d24', u: '#5a4d66', e: '#80e27e', P: '#14301a', E: '#80e27e', w: '#ffffff', D: '#08060b', n: '#0e0b14', b: '#ff8fb8', i: '#ff8fb8', p: '#ff8fb8', c: '#ff8fb8', m: '#ffd166', t: '#2e2733', r: '#ff6f9f', x: '#2e2733', f: '#0e0b14' },
      marks: [],
      animations: {},
    },
    // The second companion: white, a dark patch over the viewer's-left eye up into that ear's base, a thin
    // streak at the other ear's base, a freckle on the viewer's-left side of the pink nose, and a black tail like his patch.
    soju: {
      name: 'Soju',
      pendant: false, // the moon pendant is Luna's; Soju just wears the collar
      colors: { k: '#fbf8f3', s: '#ddd5e2', O: '#4a3b44', u: '#fbf8f3', e: '#b8c75a', P: '#2a2c10', E: '#6f7a2e', w: '#ffffff', D: '#08060b', n: '#ff9fbf', b: '#ffc2d4', i: '#ffb3cc', p: '#ffb3cc', c: '#8fd3ff', m: '#ffd166', t: '#2b262e', r: '#e0607f', x: '#2b262e', f: '#1a1418' },
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

  function eyeFor(v, lid, gaze, pose) {
    if (v.happy > 0.5) return EYES.happy;
    if (pose === 'startled' || v.mood === 'wide') return EYES.wide;
    if (lid > 0.85) return EYES.closed;
    if (lid > 0.4) return EYES.half;
    return EYES[gaze];
  }

  // ---------- frame picking ----------
  // v: the cat's live state from cat.js (see VIEW_DEFAULTS). Returns layers + whole-grid tweaks for compose().
  const ACTS = ['eat', 'sprawl', 'fancyGroom', 'lick'];
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
      side(v.legs ?? tick(v.travel === 'run' ? 90 : 160, 4));
      if (v.act === 'bonk') put(BONK, 25, 5);
      frame.flip = v.facing < 0;
      frame.squash = v.crumple || 0;
      return frame;
    }

    // Character acts (Soju eats from his bowl and sprawls belly-up; Luna's fancy groom; licks in duo scenes) come
    // before the everyday poses; a leap or a drag still wins.
    let pose = 'sit';
    if (v.travel === 'leap') pose = 'leap';
    else if (v.dragging) pose = 'startled';
    else if (ACTS.includes(v.act)) pose = v.act;
    else if (v.fileOver) pose = 'catch';
    else if (v.state === 'acting') pose = 'busy';
    else if (v.pose === 'loaf') pose = 'loaf';
    else if (v.pose === 'pawsUp') pose = v.move === 'knockItOff' ? 'swat' : 'cover';
    else if (v.pose === 'crouch') pose = v.move === 'stretch' ? 'stretch' : 'crouch';
    else if (v.fidget === 'groom') pose = 'groom';
    frame.pose = pose;
    const step = v.step || 0; // which beat of an act (fancyGroom: lick, lick, ear, done)

    const body = { loaf: LOAF, stretch: STRETCH, cover: ARMS_UP, catch: ARMS_UP, leap: ARMS_UP, busy: ARMS_UP, swat: ONE_ARM, groom: ONE_ARM, sprawl: SPRAWL, fancyGroom: step < 3 ? ONE_ARM : SIT }[pose] || SIT;
    const headX = pose === 'sprawl' ? 0 : HEAD_X;
    const headY = { loaf: 13, stretch: 7, sprawl: 16, eat: 1 + (v.headDrop ?? 3) }[pose] ?? 1;

    // tail (behind everything); the sprawl draws its own, flopped on the floor
    const wagMs = Math.max(90, Math.min(1100, v.tailPeriod / 4));
    if (pose === 'startled') put(TAIL_POOF, 24, 17);
    else if (pose !== 'loaf' && pose !== 'sprawl') put(TAILS[v.tailFrame ?? TAIL_WAG[tick(wagMs, 4)]], 24, 17);
    put(body, 0, 0);

    // the locked face: only the eye and mouth glyphs swap, always on the same pixels
    const headLayers = layers.length;
    put(HEAD, headX, headY);
    const groomUp = pose === 'groom' && tick(320, 2) === 0;
    const gaze = pose === 'busy' ? 'down' : lookDir(v.look);
    const groomEyes = pose === 'groom' || pose === 'lick' || (pose === 'fancyGroom' && step < 3) ? 1 : null;
    const judging = ['judgy', 'suspicious', 'focused', 'protective', 'confused'].includes(v.mood);
    const lidL = groomEyes ?? (judging ? Math.max(v.lidL, 0.5) : v.lidL);
    const lidR = groomEyes ?? (judging ? Math.max(v.lidR, 0.5) : v.lidR);
    const happyEyes = pose === 'fancyGroom' && step >= 3 ? { ...v, happy: 1 } : v;
    put(eyeFor(happyEyes, lidL, gaze, pose), headX + EYE_L[0], headY + EYE_L[1]);
    put(eyeFor(happyEyes, lidR, gaze, pose), headX + EYE_R[0], headY + EYE_R[1]);
    if (happyEyes.happy > 0.5) { put(['bb'], headX + 2, headY + 10); put(['bb'], headX + 16, headY + 10); }
    // no mouth at rest; it only opens to talk, yawn, eat or gasp, and a lick shows a tiny tongue
    if (v.mouth === 'open' || v.fidget === 'yawn' || pose === 'startled') put(MOUTHS.pop, headX + MOUTH[0], headY + MOUTH[1]);
    else if (pose === 'lick' || (pose === 'fancyGroom' && step < 2 && step % 2 === 0)) put(TONGUE, headX + MOUTH[0] + 1, headY + MOUTH[1] + 1);
    if (v.twitchL > 6) put(EAR_TWITCH_L, headX, headY);
    if (v.twitchR > 6) put(EAR_TWITCH_R, headX + 15, headY);
    for (const mark of character.marks) if (mark.on === 'head') put(mark.map, headX + mark.x, headY + mark.y, mark.only);

    // costume over the face/body, under the paws
    if (costume) wear(costume.front, headX, headY);
    // belly-up: the whole head (face, markings, costume) is drawn upside down around its own 16 rows
    if (pose === 'sprawl') for (let i = headLayers; i < layers.length; i++) {
      const l = layers[i];
      layers[i] = { ...l, flipY: true, y: 2 * headY + 15 - l.y - l.map.length + 1 };
    }

    // what the paws are doing
    if (pose === 'cover') { put(COVER, 8, 7); if (v.privacy) put(LOCK, 26, 1); }
    if (pose === 'catch' || pose === 'leap') { put(ARM_UP_L, 0, 2); put(ARM_UP_R, 27, 2); }
    if (pose === 'swat') put(ARM_SIDE_R, 23, 17);
    if (pose === 'groom') put(GROOM_PAW, 13, groomUp ? 12 : 14);
    if (pose === 'fancyGroom' && step < 3) put(GROOM_PAW, ...[[17, 12], [17, 14], [7, 3]][step]);
    if (pose === 'eat') { put(BOWL, 7, 26); if (v.mouth === 'open') put(CRUMBS[tick(140, 2)], 4, 24); }
    if (pose === 'busy') { const a = tick(125, 2); put(KEYBOARD, 5, 29); put(TYPE_PAW, 11, 21 + a); put(TYPE_PAW, 17, 22 - a); }
    if (pose === 'startled') put(SPIKES, 0, 3);
    if (v.dizzy) put(STARS, headX, headY - 5 + tick(250, 2));

    // whole-grid tweaks: 1px breathing bob, squash/stretch from the move tweens, a 1px wiggle, pendant glow
    const breathe = ['sit', 'loaf', 'cover', 'busy'].includes(pose) && v.sy > 0.97 && v.sy < 1.03 ? tick(v.state === 'napping' ? 1400 : 1000, 2) : 0;
    const quant = v.sy < 0.93 ? 2 : v.sy < 0.97 ? 1 : v.sy > 1.08 ? -2 : v.sy > 1.03 ? -1 : 0;
    frame.squash = Math.max(-2, Math.min(4, breathe + quant + (pose === 'crouch' ? 3 : 0) + (pose === 'leap' ? -1 : 0)));
    frame.shift = v.bodyRot > 1.5 ? 1 : v.bodyRot < -1.5 ? -1 : 0;
    frame.glow = character.pendant === false ? 0 : v.glow > 0.66 ? 2 : v.glow > 0.3 ? 1 : 0;
    frame.noPendant = character.pendant === false;
    return frame;
  }

  // Grid = TOP rows of headroom (hats) + the 32×32 art + one floor-shadow row. Layer coordinates are art coordinates.
  const TOP = 6;
  const ROWS = TOP + H + 1;
  function compose({ layers, squash = 0, shift = 0, flip = false, glow = 0, noPendant = false }) {
    let g = Array.from({ length: ROWS }, () => Array(W).fill('.'));
    for (const { map, x, y, only, flipY } of layers) {
      (flipY ? [...map].reverse() : map).forEach((row, j) => {
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
    if (noPendant) g.forEach((row) => row.forEach((c, x) => { if (c === 'm') row[x] = 'k'; }));
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

  // Props (bowl, crumbs, stars, hearts, dust) use these on any cat: Q/q bowl, h heart, g/G dust, a/j fur bits, J Soju's tail.
  const PROP_COLORS = { O: '#2b1d24', w: '#ffffff', Q: '#7fb7e8', q: '#d6ecff', h: '#ff6f9f', g: '#f3edf6', G: '#cfc2dc', a: '#2e2733', j: '#fbf8f3', J: '#2b262e' };
  const BASE_COLORS = { l: '#cfc4e6', L: '#b9a4ff', M: '#fff4c8', y: '#ffe08a', z: 'rgba(43, 29, 36, 0.22)', ...COSTUME_COLORS, ...PROP_COLORS };
  const colorsFor = (characterId) => ({ ...BASE_COLORS, ...(CHARACTERS[characterId] || CHARACTERS.luna).colors });

  // Paints a composed grid at an integer cell size. `rim` adds a faint light edge outside the silhouette so a dark
  // cat still reads on a dark desktop (it is not part of the hit area). `colors` is a palette, or (x, y, c) => color.
  function drawGrid(ctx, grid, colors, cell, { rim = null } = {}) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const color = typeof colors === 'function' ? colors : (x, y, c) => colors[c];
    const solid = (x, y) => { const c = grid[y]?.[x]; return c && c !== '.' && c !== 'z'; };
    if (rim) {
      ctx.fillStyle = rim;
      grid.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x * cell, y * cell, cell, cell); });
    }
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.') continue;
        ctx.fillStyle = color(x, y, c) || '#f0f';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    });
  }

  // ---------- two cats in one picture (duo mode, cameos) ----------
  // A scene is a wider grid with several cats and props; `owner` says which cat each pixel belongs to, so hit-testing
  // and colors stay per cat. Luna always stands left of Soju, GAP sprite pixels apart (origin to origin).
  const GAP = 24;
  function composeScene({ width, cats = [], props = [] }) {
    const grid = Array.from({ length: ROWS }, () => Array(width).fill('.'));
    const owner = Array.from({ length: ROWS }, () => Array(width).fill(''));
    const stamp = (map, x, y, id) => map.forEach((row, j) => {
      if (y + j < 0 || y + j >= ROWS) return;
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '.' || x + i < 0 || x + i >= width) continue;
        if (c === 'z' && grid[y + j][x + i] !== '.') continue; // a floor shadow never covers the other cat
        grid[y + j][x + i] = c;
        owner[y + j][x + i] = id;
      }
    });
    for (const { id, view, x, y = 0 } of cats) stamp(compose(pickFrame(view, id)), x, y, id);
    for (const { map, x, y } of props) stamp(map, x, TOP + y, '');
    return { grid: grid.map((r) => r.join('')), owner };
  }
  function drawScene(ctx, scene, cell, opts) {
    const palettes = {};
    drawGrid(ctx, scene.grid, (x, y, c) => {
      const id = scene.owner[y][x];
      return (palettes[id] ??= id ? colorsFor(id) : BASE_COLORS)[c];
    }, cell, opts);
  }
  // One beat of a scene → cats and props for composeScene. `at` is Luna's origin column. A cat whose entry in the
  // step is a view patch is scripted; `false` hides it; missing falls back to its live view (the helper keeps doing
  // its job during a cameo).
  function sceneLayers(step, at, { now = 0, costumes = {}, live = {} } = {}) {
    const cats = [];
    for (const id of step.back === 'soju' ? ['soju', 'luna'] : ['luna', 'soju']) {
      const home = at + (id === 'luna' ? 0 : GAP);
      const patch = step[id];
      if (patch) cats.push({ id, view: { now, costume: costumes[id] || 'none', ...patch }, x: at + (id === 'luna' ? step.lx ?? 0 : step.sx ?? GAP) });
      else if (patch === undefined && live[id]) cats.push({ id, view: live[id].view, x: home + (live[id].dx || 0), y: live[id].dy || 0 });
    }
    const props = (step.props || []).map(([name, x, y, n]) => ({ map: n === undefined ? PROPS[name] : PROPS[name][n], x: at + x, y }));
    return { cats, props };
  }

  // A dust cloud for the wrestle, made from a seed so each beat jitters: a bumpy blob with a soft outline.
  function dustCloud(seed) {
    const w = 46;
    const h = 24;
    const inside = (x, y) => ((x - w / 2 + 0.5) / (w / 2 - 1)) ** 2 + ((y - h / 2 + 0.5) / (h / 2 - 1)) ** 2 + 0.16 * Math.sin(x * 0.9 + seed * 2.1) * Math.cos(y * 0.8 + seed) < 0.92;
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
      if (!inside(x, y)) return '.';
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return 'O';
      return (x * 3 + y * 7 + seed * 5) % 13 === 0 || (y > h * 0.62 && (x + y + seed) % 4 === 0) ? 'G' : 'g';
    }).join(''));
  }
  const overlay = (map, bits) => bits.reduce((m, [bit, bx, by]) => m.map((row, y) => {
    const b = bit[y - by];
    return b ? [...row].map((c, x) => (b[x - bx] && b[x - bx] !== '.' ? b[x - bx] : c)).join('') : row;
  }), map);
  const PAW_DARK = ['OOO', 'OaO', 'OaO'];
  const PAW_WHITE = ['OOO', 'OjO', 'OjO'];
  const TAIL_DARK = ['.OO', 'OaO', 'OaO', 'OaO'];
  const TAIL_SOJU = ['OO.', 'OJO', 'OJO', 'OJO'];
  const STAR = ['.Y.', 'YwY', '.Y.'];
  const PROPS = {
    BOWL,
    HEART: ['.OO.OO.', 'OhhOhhO', 'OhwhhhO', 'OhhhhhO', '.OhhhO.', '..OhO..', '...O...'],
    Z: ['llll', '..l.', '.l..', 'llll'],
    z: ['lll', '.l.', 'lll'],
    // three rows of air on top, so a tail can stick out of the cloud
    DUST: [
      [1, [[TAIL_DARK, 8, 1], [PAW_WHITE, 35, 4], [STAR, 40, 11]]],
      [2, [[PAW_DARK, 2, 11], [TAIL_SOJU, 32, 1], [STAR, 6, 4]]],
      [3, [[PAW_WHITE, 12, 3], [PAW_DARK, 41, 13], [STAR, 28, 3]]],
    ].map(([seed, bits]) => overlay([...Array(3).fill('.'.repeat(46)), ...dustCloud(seed)], bits)),
  };

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
  // Character-only animations: Soju is the goofy little brother (eats, sprawls belly-up, trips, bonks into the screen
  // edge); Luna is the big sister (a fancy groom, a slow judging stare, the perfect loaf). Faces stay the locked design.
  const munch = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? { act: 'eat', headDrop: 3, lidL: 1, lidR: 1, now: i * 140 } : { act: 'eat', headDrop: 2, mouth: 'open', happy: 1, now: i * 140 }));
  const judgy = { mood: 'judgy', lidL: 0.52, lidR: 0.52 };
  CHARACTERS.soju.animations = {
    eatBowl: { fps: 6, frames: munch(6) },
    sprawlNap: { fps: 1, frames: at(2, 1400, { act: 'sprawl', state: 'napping', mood: 'asleep', lidL: 1, lidR: 1 }) },
    trip: { fps: 6, frames: [{ travel: 'walk', legs: 0 }, { travel: 'walk', legs: 1, crumple: 2 }, { travel: 'walk', legs: 2, crumple: 4 }, { act: 'sprawl', mood: 'wide', dizzy: true }, { act: 'sprawl', lidL: 1, lidR: 1, dizzy: true, now: 250 }, { mood: 'happy', happy: 1 }] },
    bonk: { fps: 6, frames: [{ travel: 'walk', legs: 0 }, { travel: 'walk', legs: 1 }, { travel: 'walk', legs: 2, act: 'bonk', crumple: 1 }, { mood: 'wide', dizzy: true }, { lidL: 1, lidR: 1, dizzy: true, now: 250 }, { lidL: 0.5, lidR: 0.5 }] },
  };
  CHARACTERS.luna.animations = {
    fancyGroom: { fps: 3, frames: [0, 1, 0, 1, 2, 2, 3].map((step) => ({ act: 'fancyGroom', step })) },
    judgeStare: { fps: 2, frames: [{}, { lidL: 0.45, lidR: 0.45 }, { ...judgy, tailFrame: 0 }, { ...judgy, tailFrame: 2 }, { ...judgy, tailFrame: 1 }, { ...judgy, tailFrame: 0 }] },
    perfectLoaf: { fps: 1, frames: [{ pose: 'loaf', lidL: 0.5, lidR: 0.5 }, { pose: 'loaf', lidL: 1, lidR: 1 }, { pose: 'loaf', lidL: 0.5, lidR: 0.5 }, { pose: 'loaf', mood: 'happy', happy: 1 }] },
  };
  const animationsFor = (characterId) => ({ ...BASE_ANIMATIONS, ...(CHARACTERS[characterId] || CHARACTERS.luna).animations });

  // What the cat.js state machine shows, by state and by move (tested against cat.js).
  const STATE_ANIM = { idle: 'idle', petted: 'happy', napping: 'sleep', waking: 'yawn', eating: 'eat', thinking: 'think', talking: 'talk', acting: 'busy', move: 'idle' };
  const MOVE_ANIM = {
    moonMagic: 'moonMagic', pounce: 'pounce', edgePeek: 'edgePeek', stretch: 'stretch', tailChase: 'tailChase', knockItOff: 'knockItOff', zoomies: 'run', hop: 'hop',
    // character moves (renderer/persona.js weighs them per cat)
    fancyGroom: 'fancyGroom', judgeStare: 'judgeStare', perfectLoaf: 'perfectLoaf', eatBowl: 'eatBowl', sprawlNap: 'sprawlNap', trip: 'trip', bonk: 'bonk', clumsyChase: 'trip', playNap: 'sprawlNap',
  };

  // ---------- duo scenes (idle only) and cameos ----------
  // A scene is a list of beats: { luna, soju } view patches (false hides a cat), lx/sx shift each cat from its spot,
  // `back: 'soju'` draws Soju behind Luna, props are [name, x, y, variant] in Luna-origin coordinates, ms is the beat.
  const sleepy = { pose: 'loaf', state: 'napping', mood: 'asleep', lidL: 1, lidR: 1 };
  const run = (facing, legs, x) => ({ soju: { travel: 'run', facing, legs }, sx: x });
  const DUO_SCENES = {
    // Luna grooms Soju: he squirms, falls over, then headbutts her back.
    groomSoju: { ms: 300, steps: [
      { luna: { look: { x: 6, y: 1 } }, soju: { look: { x: -6, y: 0 } } },
      { luna: { act: 'lick' }, lx: 2, soju: { lidL: 1, lidR: 1 } },
      { luna: { act: 'lick' }, lx: 3, soju: { happy: 1, bodyRot: 2 } },
      { luna: { act: 'lick' }, lx: 3, soju: { happy: 1, bodyRot: -2 } },
      { luna: { act: 'lick' }, lx: 3, soju: { happy: 1, bodyRot: 2 } },
      { luna: { mood: 'wide' }, lx: 1, soju: { act: 'sprawl', mood: 'wide' }, sx: 26 },
      { luna: { look: { x: 6, y: 3 } }, soju: { act: 'sprawl', happy: 1 }, sx: 26, ms: 600 },
      { luna: { mood: 'wide' }, lx: -1, soju: { lidL: 1, lidR: 1 }, sx: 20 },
      { luna: { happy: 1 }, soju: { happy: 1 }, sx: 23, ms: 900 },
    ] },
    // Soju tries to groom Luna and licks the air next to her.
    lickAir: { ms: 320, steps: [
      { luna: {}, soju: { look: { x: -6, y: 0 } } },
      { luna: { look: { x: 5, y: 0 } }, soju: { act: 'lick' }, sx: 23 },
      { luna: { look: { x: 5, y: 0 } }, lx: -1, soju: { act: 'lick' }, sx: 23 },
      { luna: { ...judgy, look: { x: 5, y: 0 } }, lx: -1, soju: { act: 'lick', bodyRot: 2 }, sx: 23 },
      { luna: { ...judgy, look: { x: 5, y: 0 }, tailFrame: 2 }, lx: -1, soju: { act: 'lick' }, sx: 23 },
      { luna: { ...judgy, tailFrame: 1 }, lx: -1, soju: { happy: 1 }, sx: 24, ms: 700 },
      { luna: { lidL: 1, lidR: 1 }, soju: { happy: 1 }, ms: 500 },
    ] },
    // Soju pounces Luna's swishing tail; she swats once.
    tailPounce: { ms: 220, steps: [
      { luna: { tailFrame: 2 }, soju: { look: { x: -6, y: 3 } } },
      { luna: { tailFrame: 1 }, soju: { pose: 'crouch', mood: 'focused', look: { x: -6, y: 3 } } },
      { luna: { tailFrame: 2 }, soju: { pose: 'crouch', mood: 'focused', look: { x: -6, y: 3 }, bodyRot: 2 } },
      { luna: { tailFrame: 1 }, soju: { pose: 'crouch', mood: 'focused', look: { x: -6, y: 3 }, bodyRot: -2 } },
      { luna: { tailFrame: 0, mood: 'wide' }, soju: { travel: 'leap', mood: 'wide' }, sx: 19 },
      { luna: { pose: 'pawsUp', move: 'knockItOff', ...judgy }, soju: { mood: 'wide', sy: 0.87 }, sx: 19, back: 'soju', ms: 300 },
      { luna: judgy, soju: { mood: 'wide' }, sx: 24, ms: 500 },
      { luna: judgy, soju: { lidL: 1, lidR: 1 }, ms: 400 },
    ] },
    // Zoomies around Luna (in front going left, behind coming back), then a trip.
    zoomies: { ms: 110, steps: [
      { luna: { look: { x: 5, y: 0 } }, ...run(-1, 0, 18) },
      { luna: {}, ...run(-1, 1, 10) },
      { luna: { look: { x: -5, y: 0 } }, ...run(-1, 2, 2) },
      { luna: { look: { x: -5, y: 0 } }, ...run(-1, 3, -6) },
      { luna: { look: { x: -5, y: 0 } }, ...run(1, 0, -2), back: 'soju' },
      { luna: {}, ...run(1, 1, 8), back: 'soju' },
      { luna: { look: { x: 5, y: 0 } }, ...run(1, 2, 18), back: 'soju' },
      { luna: { look: { x: 5, y: 0 } }, ...run(1, 3, 26) },
      { luna: { ...judgy, look: { x: 5, y: 1 } }, soju: { act: 'sprawl', mood: 'wide', dizzy: true }, sx: 26, ms: 600 },
      { luna: { ...judgy, look: { x: 5, y: 1 }, tailFrame: 2 }, soju: { act: 'sprawl', lidL: 1, lidR: 1, dizzy: true, now: 250 }, sx: 26, ms: 700 },
    ] },
    // A quick wrestle in a dust cloud; Luna wins.
    wrestle: { ms: 170, steps: [
      { luna: judgy, soju: { pose: 'crouch', mood: 'focused', look: { x: -6, y: 1 } } },
      { luna: { mood: 'wide' }, soju: { travel: 'leap', mood: 'wide' }, sx: 17 },
      { luna: false, soju: false, props: [['DUST', 4, 6, 0]] },
      { luna: false, soju: false, props: [['DUST', 5, 7, 1]] },
      { luna: false, soju: false, props: [['DUST', 3, 6, 2]] },
      { luna: false, soju: false, props: [['DUST', 5, 6, 0]] },
      { luna: false, soju: false, props: [['DUST', 4, 7, 1]] },
      { luna: { mood: 'happy', happy: 1 }, soju: { act: 'sprawl', mood: 'wide', dizzy: true }, sx: 26, ms: 700 },
      { luna: { ...judgy, tailFrame: 2 }, soju: { act: 'sprawl', lidL: 1, lidR: 1, dizzy: true, now: 250 }, sx: 26, ms: 700 },
    ] },
    // Cuddle nap: Soju belly-up, Luna loafed beside him.
    cuddleNap: { ms: 1100, steps: [
      { luna: { pose: 'loaf', mood: 'sleepy', lidL: 0.62, lidR: 0.62 }, soju: { act: 'sprawl', mood: 'sleepy', lidL: 0.62, lidR: 0.62 }, lx: -2, sx: 28 },
      { luna: { ...sleepy, now: 0 }, soju: { act: 'sprawl', ...sleepy, pose: 'sit' }, lx: -2, sx: 28 },
      { luna: { ...sleepy, now: 1400 }, soju: { act: 'sprawl', ...sleepy, pose: 'sit' }, lx: -2, sx: 28, props: [['z', 24, 4]] },
      { luna: { ...sleepy, now: 0 }, soju: { act: 'sprawl', ...sleepy, pose: 'sit' }, lx: -2, sx: 28, props: [['Z', 26, 0], ['z', 24, 5]] },
      { luna: { ...sleepy, now: 1400 }, soju: { act: 'sprawl', ...sleepy, pose: 'sit' }, lx: -2, sx: 28, props: [['Z', 28, -3], ['z', 25, 2]] },
      { luna: { ...sleepy, now: 0 }, soju: { act: 'sprawl', ...sleepy, pose: 'sit' }, lx: -2, sx: 28, props: [['z', 24, 4]] },
      { luna: { pose: 'loaf', mood: 'sleepy', lidL: 0.62, lidR: 0.62 }, soju: { act: 'sprawl', lidL: 0.62, lidR: 0.62 }, lx: -2, sx: 28 },
    ] },
    // Side by side with a heart, after a task went well.
    heart: { ms: 300, steps: [
      { luna: { look: { x: 6, y: 0 } }, soju: { look: { x: -6, y: 0 } } },
      { luna: { look: { x: 6, y: 0 } }, lx: 1, soju: { look: { x: -6, y: 0 } }, sx: 23 },
      { luna: { mood: 'happy', happy: 1 }, lx: 1, soju: { mood: 'happy', happy: 1 }, sx: 23, props: [['HEART', 25, -3]] },
      { luna: { mood: 'happy', happy: 1 }, lx: 1, soju: { mood: 'happy', happy: 1 }, sx: 23, props: [['HEART', 25, -4]] },
      { luna: { mood: 'happy', happy: 1 }, lx: 1, soju: { mood: 'happy', happy: 1 }, sx: 23, props: [['HEART', 25, -5]] },
      { luna: { lidL: 1, lidR: 1 }, lx: 1, soju: { lidL: 1, lidR: 1 }, sx: 23, props: [['HEART', 25, -6]] },
      { luna: {}, soju: {} },
    ] },
  };
  // The idle scenes the scheduler picks from (heart is played after a task, not at random).
  const IDLE_SCENES = ['groomSoju', 'lickAir', 'tailPounce', 'zoomies', 'wrestle', 'cuddleNap'];

  // A cameo: the other cat runs in, does its bit beside the helper, and leaves. Only the guest is scripted; the helper
  // keeps its live state (it is usually thinking or answering). `present`: duo mode, the guest is already there.
  // say: 'call' (the helper calls the guest in) and 'guest' (the guest's line) mark when the lines appear.
  function cameoScene(guest, { present = false } = {}) {
    const soju = guest === 'soju';
    const key = soju ? 'sx' : 'lx';
    const spot = soju ? GAP : 0;
    const away = soju ? 1 : -1; // Soju comes from the right, Luna from the left
    const enter = present ? [] : Array.from({ length: 5 }, (_, i) => ({ [guest]: { travel: 'run', facing: -away, legs: i % 4 }, [key]: spot + away * (40 - i * 8), ms: 90 }));
    const leave = present ? [] : Array.from({ length: 7 }, (_, i) => ({ [guest]: { travel: 'walk', facing: away, legs: i % 4 }, [key]: spot + away * (i + 1) * 6, ms: 160 }));
    const act = soju
      ? [{ soju: { sy: 0.87, mood: 'wide' }, ms: 200 }, { soju: { mood: 'happy', happy: 1 }, ms: 400 }, ...munch(6).map((v) => ({ soju: v, ms: 220 })), { soju: { mood: 'happy', happy: 1 }, say: 'guest', ms: 1600 }]
      : [{ luna: { sy: 0.87 }, ms: 200 }, { luna: { mood: 'focused', look: { x: 2.5, y: -4.5 }, glow: 0.5 }, ms: 400 }, { luna: { mood: 'focused', look: { x: 2.5, y: -4.5 }, glow: 0.9 }, ms: 400 }, { luna: { mood: 'wide', glow: 1 }, ms: 300 }, { luna: { mood: 'happy', happy: 1, glow: 1 }, say: 'guest', ms: 1400 }, { luna: { ...judgy, look: { x: 6, y: 0 } }, ms: 900 }];
    return { guest, steps: [{ say: 'call', ...(present ? {} : { [guest]: false }), ms: 700 }, ...enter, ...act.map((s) => ({ [key]: spot, ...s })), ...leave] };
  }

  const MAPS = { HOOD, HEAD, HEAD_BACK, EYES, MOUTHS, EAR_TWITCH_L, EAR_TWITCH_R, SIT, ARMS_UP, ONE_ARM, LOAF, STRETCH, BACK, SPRAWL, TAILS, TAIL_POOF, TAIL_BACK, COVER, LOCK, ARM_UP_L, ARM_UP_R, ARM_SIDE_R, GROOM_PAW, TYPE_PAW, KEYBOARD, SPIKES, SIDE, LEGS, TONGUE, BOWL, CRUMBS, STARS, BONK, HEART: PROPS.HEART, Z: PROPS.Z, z: PROPS.z, DUST: PROPS.DUST };
  const api = { W, H, TOP, ROWS, GAP, drawGrid, drawScene, composeScene, sceneLayers, MAPS, CHARACTERS, COSTUMES, seasonalCostume, BASE_COLORS, colorsFor, pickFrame, compose, lookDir, BASE_ANIMATIONS, animationsFor, STATE_ANIM, MOVE_ANIM, VIEW_DEFAULTS, DUO_SCENES, IDLE_SCENES, cameoScene };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoonPixel = api;
})(typeof window !== 'undefined' ? window : globalThis);
