// "Get to know you" (DESIGN.md §3.12.1): five optional questions in the bubble, Luna asking and Soju reacting, then a
// review screen. The cats' lines are flavor only. What gets saved is worked out in brain/personal.js
// (onboardingResult, via the main process) and only after the user ticks it on the review screen.
(function () {
  const PX = window.LoonPixel;
  const P = window.LoonPersona;
  const CELL = 2;
  const STEPS = ['intro', 'name', 'role', 'style', 'food', 'interests', 'review', 'done'];
  const QUESTIONS = 5;
  const ROLES = [['student', 'Student'], ['dev', 'Developer'], ['design', 'Design'], ['work', 'Work'], ['other', 'Something else']];
  const DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['gluten_free', 'Gluten-free'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['lactose', 'No lactose']];
  const LENGTHS = [['short', 'Short'], ['normal', 'Normal'], ['detailed', 'Detailed']];
  const TONES = [['playful', 'Playful'], ['plain', 'Plain'], ['formal', 'Formal']];

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c != null));
    return node;
  };

  function start(root, { privacy = false, onClose = () => {} } = {}) {
    const answers = { diets: [] };
    let step = 0;
    let clock = 0;
    let soju = { line: '', happy: 0 };
    const luna = el('canvas', { width: PX.W * CELL, height: PX.ROWS * CELL, className: 'ob-cat' });
    const sojuCat = el('canvas', { width: PX.W * CELL, height: PX.ROWS * CELL, className: 'ob-cat' });
    luna.setAttribute('aria-hidden', 'true');
    sojuCat.setAttribute('aria-hidden', 'true');
    const say = el('p', { className: 'ob-say' });
    say.setAttribute('aria-live', 'polite');
    const react = el('p', { className: 'ob-react' });
    const body = el('div', { className: 'ob-body' });
    const dots = el('div', { className: 'ob-dots' });
    const buttons = el('div', { className: 'ob-buttons' });
    root.replaceChildren(
      dots,
      el('div', { className: 'ob-row' }, luna, say),
      body,
      el('div', { className: 'ob-row soju' }, react, sojuCat),
      buttons,
    );

    // Two frames a second like the settings previews; still when motion is reduced. Luna talks, Soju beams.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    function draw() {
      const blink = clock % 9 === 8;
      const talk = !reduce.matches && clock % 2 === 0 && clock % 12 < 4;
      PX.drawGrid(luna.getContext('2d'), PX.compose(PX.pickFrame({ now: clock * 500, tailPeriod: 2400, lidL: blink ? 1 : 0.08, lidR: blink ? 1 : 0.08, look: { x: 3, y: 0 }, mouth: talk ? 'open' : 'smile' }, 'luna')), PX.colorsFor('luna'), CELL, { rim: 'rgba(255, 240, 250, 0.35)' });
      PX.drawGrid(sojuCat.getContext('2d'), PX.compose(PX.pickFrame({ now: clock * 500, tailPeriod: 1200, happy: soju.happy > 0 ? 1 : 0, look: { x: -3, y: 0 }, mouth: soju.happy > 1 ? 'open' : 'smile' }, 'soju')), PX.colorsFor('soju'), CELL, { rim: 'rgba(255, 240, 250, 0.35)' });
    }
    const timer = setInterval(() => {
      if (!luna.isConnected) return clearInterval(timer);
      if (document.hidden || reduce.matches) return;
      clock++;
      if (soju.happy > 0) soju.happy -= 0.5;
      draw();
    }, 500);

    const sojuSays = (event) => {
      soju = { line: P.line('soju', `onboard.${event}`), happy: 3 };
      react.textContent = soju.line;
      react.hidden = !soju.line;
      draw();
    };

    const button = (label, className, onClick) => {
      const b = el('button', { className, textContent: label, type: 'button' });
      b.addEventListener('click', onClick);
      return b;
    };
    const pills = (options, { multi = false, get, set, react: event }) => {
      const row = el('div', { className: 'ob-pills', role: multi ? 'group' : 'radiogroup' });
      for (const [value, label] of options) {
        const b = el('button', { type: 'button', className: 'chip', textContent: label });
        b.setAttribute('aria-pressed', String(multi ? get().includes(value) : get() === value));
        b.addEventListener('click', () => {
          set(multi ? (get().includes(value) ? get().filter((v) => v !== value) : [...get(), value]) : value);
          for (const other of row.children) other.setAttribute('aria-pressed', String(multi ? get().includes(options[[...row.children].indexOf(other)][0]) : other === b));
          if (event) sojuSays(typeof event === 'function' ? event(value) : event);
        });
        row.append(b);
      }
      return row;
    };
    const textField = (key, placeholder, max) => {
      const input = el('input', { className: 'ob-input', placeholder, maxLength: max, value: answers[key] || '' });
      input.addEventListener('input', () => { answers[key] = input.value; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      setTimeout(() => input.focus(), 0);
      return input;
    };

    function skipAll() {
      clearInterval(timer);
      window.loon.skipOnboarding();
      onClose();
    }
    function next() {
      const name = STEPS[step];
      if (name === 'name' && answers.name?.trim()) sojuSays('name');
      if (name === 'interests' && answers.interests?.trim()) sojuSays('interests');
      step = Math.min(step + 1, STEPS.length - 1);
      render();
    }
    function back() {
      step = Math.max(step - 1, 1);
      render();
    }

    async function render() {
      const name = STEPS[step];
      say.textContent = P.line('luna', `onboard.${name}`);
      const asked = step >= 1 && step <= QUESTIONS;
      dots.replaceChildren(...Array.from({ length: QUESTIONS }, (_, i) => el('i', { className: i < step ? 'on' : '' })));
      dots.hidden = !asked;
      dots.setAttribute('aria-label', asked ? `Question ${step} of ${QUESTIONS}` : '');
      if (name === 'intro' || name === 'review') { react.textContent = ''; react.hidden = true; }
      body.replaceChildren();
      buttons.replaceChildren();
      if (name === 'intro') {
        buttons.append(button('Skip for now', 'secondary', skipAll), button("Let's go", 'primary', next));
      } else if (name === 'name') {
        body.append(textField('name', 'e.g. Sam', 40));
      } else if (name === 'role') {
        body.append(pills(ROLES, { get: () => answers.role, set: (v) => { answers.role = v; }, react: (v) => `role.${v}` }));
      } else if (name === 'style') {
        body.append(
          el('div', { className: 'ob-label', textContent: 'Length' }),
          pills(LENGTHS, { get: () => answers.length, set: (v) => { answers.length = v; }, react: (v) => `style.${v}` }),
          el('div', { className: 'ob-label', textContent: 'Tone' }),
          pills(TONES, { get: () => answers.tone, set: (v) => { answers.tone = v; } }),
        );
      } else if (name === 'food') {
        body.append(
          pills(DIETS, { multi: true, get: () => answers.diets, set: (v) => { answers.diets = v; }, react: 'food' }),
          textField('allergies', 'Allergies? e.g. peanuts, shellfish', 120),
        );
      } else if (name === 'interests') {
        body.append(textField('interests', 'e.g. jazz, climbing, Rust', 160));
      } else if (name === 'review') {
        const result = await window.loon.previewOnboarding(answers);
        const boxes = result.facts.map((fact) => {
          const check = el('input', { type: 'checkbox', checked: !privacy, disabled: privacy });
          body.append(el('label', { className: 'fact' }, check, document.createTextNode(` ${fact}`)));
          return { fact, check };
        });
        const style = [result.personal.length && `${result.personal.length} replies`, result.personal.tone && `${result.personal.tone} tone`].filter(Boolean);
        if (style.length) body.append(el('p', { className: 'muted', textContent: `Reply style: ${style.join(', ')} (Settings → About you & replies).` }));
        if (!boxes.length && !style.length) body.append(el('p', { className: 'muted', textContent: 'Nothing to save, and that is fine. You can do this again from Settings.' }));
        if (privacy && boxes.length) body.append(el('p', { className: 'muted', textContent: "Privacy mode is on, so I'll only keep the reply style." }));
        buttons.append(button('Back', 'secondary', back), button('Save', 'primary', async () => {
          const keep = boxes.filter((b) => b.check.checked).map((b) => b.fact);
          await window.loon.saveOnboarding({ answers, keep });
          next();
        }));
        return;
      } else if (name === 'done') {
        sojuSays('done');
        clearInterval(timer);
        buttons.append(button('Done 🐾', 'primary', onClose));
        return;
      }
      if (asked) buttons.append(button('Skip all', 'linkish', skipAll), button('Skip', 'secondary', () => { sojuSays('skip'); step++; render(); }), button('Next', 'primary', next));
    }

    react.hidden = true;
    draw();
    render();
    return { stop: () => clearInterval(timer), get step() { return STEPS[step]; } };
  }

  window.LoonOnboard = { start, STEPS };
})();
