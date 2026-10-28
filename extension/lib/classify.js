// Selection kinds (DESIGN.md §3.2): decides which chips the bubble offers. Plain code, no model.
// Shared by the content script and the unit tests.
(function (root) {
  const STACK_TRACE = [
    /^\s*at [\w$.<>]+\(.*:\d+\)/m, // Java / Kotlin
    /^\s*at .+ \(.*:\d+:\d+\)/m, // JavaScript
    /Traceback \(most recent call last\)/, // Python
    /^\s*File ".+", line \d+/m,
    /\b\w+(Error|Exception)\b[:\s].{3,}/,
    /^\s*panic: /m, // Go
  ];

  function looksLikeJson(text) {
    const t = text.trim();
    if (!/^[[{]/.test(t) || t.length < 2) return false;
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  }

  function looksLikeCode(text, { monospace } = {}) {
    const symbols = (text.match(/[{}();=<>[\]]/g) || []).length;
    const density = symbols / Math.max(text.length, 1);
    const keywords = /\b(function|const|let|var|return|class|def|import|public|private|static|void|if|else|for|while)\b/.test(text);
    if (monospace && (text.includes('\n') || density > 0.03 || keywords)) return true;
    return density > 0.06 && (keywords || text.includes('\n'));
  }

  const SQL = /^\s*(select\b[\s\S]+\bfrom\b|insert\s+into\b|update\s+\w+\s+set\b|delete\s+from\b|create\s+table\b)/i;
  // A known tool followed by a flag, a path or a subcommand, so "git is great" stays prose
  const SHELL = /^\s*(\$\s+)?(sudo\s+)?(git|npm|npx|yarn|pnpm|docker|kubectl|apt|apt-get|brew|pip3?|curl|ssh|chmod|rm|mkdir|ls|cd)\s+(-\S|\S*[/~.]\S*|(install|run|add|remove|commit|push|pull|clone|checkout|status|build|update|start|test|init|up|down|exec|get|apply)\b)/;

  function looksLikeCommand(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    return lines.length > 0 && (SQL.test(text) || lines.every((l) => SHELL.test(l)));
  }

  function classifySelection(text, { editable = false, monospace = false } = {}) {
    const t = text.trim();
    if (editable) return 'editable';
    if (looksLikeJson(t)) return 'json';
    if (STACK_TRACE.some((re) => re.test(t)) && (t.includes('\n') || /(Error|Exception)/.test(t))) return 'stacktrace';
    if (looksLikeCode(t, { monospace }) || looksLikeCommand(t)) return 'code';
    // CJK text has no spaces, so count roughly one word per two characters
    const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const words = t.split(/\s+/).filter(Boolean);
    const wordCount = cjk > 0 ? words.length + Math.floor(cjk / 2) : words.length;
    if (wordCount <= 3) return 'word';
    const sentences = (t.replace(/\b(?:mr|mrs|ms|dr|prof|st|vs|etc)\.|\b[ap]\.m\.|\b(?:e\.g|i\.e)\./gi, ' ').match(/[.!?](\s|$)|[。！？]/g) || []).length;
    if (sentences <= 1 && t.length < 260) return 'sentence';
    return 'paragraph';
  }

  const api = { classifySelection };
  root.LoonClassify = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
