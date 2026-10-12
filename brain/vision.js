// Who may look at the pixels of a "Teach me on my screen" capture (DESIGN.md §3.18.4). The default path never sends
// pixels anywhere: OCR on this Mac, then a text model gets the redacted element list. Redaction works on text, not on
// pixels, so a screenshot only leaves the Mac when the user switched on "Send screenshots to your plan/API for
// teaching" (off by default), Privacy mode is off, nothing private is on screen, and the route takes images.
const { cloudRoute } = require('./teach');

// The cloud route that can take this screenshot, or null. Claude Code is text-only here: it reads images through its
// tools, and Loon runs it with every tool off. Codex takes `--image`; all four API shapes take an image part.
function imageRoute(settings = {}, { sensitive = false } = {}) {
  if (settings.teachScreenshots !== true) return null;
  const route = cloudRoute(settings, { sensitive });
  if (!route) return null;
  if (route.kind === 'cli') return route.which === 'codex' ? route : null;
  return route;
}

// A local vision model plugs in here later (planned: a Qwen3-VL GGUF through llama.cpp's multimodal support, loaded on
// demand like the smart model, downloaded only when the user asks). Until then nothing is local, so explain mode stays
// OCR + text model. Interface: available() → boolean; describe({ image, prompt, signal }) → reply text in the
// TEACH_SCHEMA shape, ids from the same element list.
const localVision = {
  available: () => false,
  async describe() {
    throw new Error('No local vision model is installed.');
  },
};

module.exports = { imageRoute, localVision };
