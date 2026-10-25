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
  // Terminal and build output: unmistakable on their own, even on one line.
  const TERMINAL_ERROR = [
    /^npm (?:ERR!|error) /m,
    /^fatal: /m, // git
    /^error(?:\[E\d{4}\])?: /m, // rustc, cargo, yarn
    /^\S+\.\w+:\d+(?::\d+)?: (?:fatal )?error: /m, // gcc, clang, go build
    /\(\d+,\d+\): error TS\d+/, // tsc
    /\b(?:command not found|No such file or directory|Permission denied|Segmentation fault)\b/,
    /^(?:ModuleNotFoundError|ImportError|SyntaxError): /m,
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

  function classifySelection(text, { editable = false, monospace = false } = {}) {
    const t = text.trim();
    if (editable) return 'editable';
    if (looksLikeJson(t)) return 'json';
    if (TERMINAL_ERROR.some((re) => re.test(t))) return 'stacktrace';
    if (STACK_TRACE.some((re) => re.test(t)) && (t.includes('\n') || /(Error|Exception)/.test(t))) return 'stacktrace';
    if (looksLikeCode(t, { monospace })) return 'code';
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 3) return 'word';
    const sentences = (t.match(/[.!?](\s|$)/g) || []).length;
    if (sentences <= 1 && t.length < 260) return 'sentence';
    return 'paragraph';
  }

  const api = { classifySelection };
  root.LoonClassify = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
