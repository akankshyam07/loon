// Duo mode timing (DESIGN.md §5.0.3): when an idle duo scene may start, playing its beats, and stopping it the
// instant the user does anything. No drawing here; cat.js renders whatever beat is current. Timers come from `clock`
// so the tests drive it with a fake one.
(function (root) {
  const realClock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) };

  // Plays a scene's beats in order. Resolves true when it finished, false as soon as `signal` aborts (no beat after).
  function runScene(scene, { clock = realClock, signal, onStep }) {
    return new Promise((resolve) => {
      let i = 0;
      let timer = null;
      const stop = () => { clock.clearTimeout(timer); resolve(false); };
      if (signal?.aborted) return resolve(false);
      signal?.addEventListener('abort', stop, { once: true });
      const next = () => {
        if (signal?.aborted) return;
        if (i >= scene.steps.length) { signal?.removeEventListener('abort', stop); return resolve(true); }
        const step = scene.steps[i++];
        onStep(step, i - 1);
        timer = clock.setTimeout(next, step.ms ?? scene.ms ?? 250);
      };
      next();
    });
  }

  // Every `gap` ms (random in range) it tries to start a scene; canStart() says whether the cats are free (idle, no
  // bubble, no drag, not answering). interrupt() aborts the current scene at once and waits a full gap again.
  // queue(name) asks for a specific scene soon (the heart after a task), kept for `queueFor` ms until it can play.
  function createDuoScheduler({ clock = realClock, canStart, play, pick, gap = [60_000, 150_000], retry = 8_000, queueFor = 60_000, rand = Math.random }) {
    let timer = null;
    let playing = null; // { name, controller }
    let queued = null; // { name, until }
    let stopped = true;
    const schedule = (ms) => {
      clock.clearTimeout(timer);
      if (!stopped) timer = clock.setTimeout(tick, ms ?? gap[0] + rand() * (gap[1] - gap[0]));
    };
    function tick() {
      if (playing || stopped) return;
      if (queued && clock.now() > queued.until) queued = null;
      if (!canStart()) return schedule(queued ? 1_000 : retry);
      const name = queued?.name || pick();
      queued = null;
      const controller = new AbortController();
      playing = { name, controller };
      Promise.resolve(play(name, controller.signal)).finally(() => {
        if (playing?.controller === controller) { playing = null; schedule(); }
      });
    }
    return {
      start() { stopped = false; schedule(); },
      stop() { stopped = true; clock.clearTimeout(timer); playing?.controller.abort(); playing = null; },
      interrupt() {
        if (!playing) return false;
        playing.controller.abort();
        playing = null;
        schedule();
        return true;
      },
      queue(name, delay = 1_200) { queued = { name, until: clock.now() + queueFor }; if (!playing) schedule(delay); },
      get playing() { return playing?.name || null; },
    };
  }

  const api = { runScene, createDuoScheduler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoonDuo = api;
})(typeof window !== 'undefined' ? window : globalThis);
