// Selection kinds (DESIGN.md §3.2): decides which chips the bubble offers. Plain code, no model.
// Shared by the content script and the unit tests.
(function (root) {
  const STACK_TRACE = [
    /^\s*at [\w$.<>]+\(.*:\d+\)/m, // Java / Kotlin
    /^\s*at .+ \(.*:\d+:\d+\)/m, // JavaScript
    /Traceback \(most recent call last\)/, // Python
    /^\s*File ".+", line \d+/m,
    /\b\w+(Error|Exception)\b[:\s].{3,}/,
    /^\s*(Uncaught\s+)?(Error|Exception): \S/, // a bare "Error: ..." line
    /^\s*panic: /m, // Go
    /^npm ERR!/m,
    /\bSegmentation fault\b|: command not found\b/,
    /^\s*Exception in thread\b/m, // Java crash line
    /^\s*(fatal|error|FATAL|ERROR)(\[E\d+\])?: \S/m, // git, rustc (with its E0382 style code), gcc and database error lines
  ];

  // Short error lines with no trace around them: Node system error codes, HTTP status lines, build and test failures, a lone stack frame, TypeScript and browser console messages
  const ERROR_LINE = /^\s*error TS\d+:|\bCannot (read|set) propert(y|ies) of (undefined|null)\b|\bis not (defined|a function)\b|\bpanicked at \S|\bE(RESOLVE|LIFECYCLE|CONNREFUSED|CONNRESET|NOENT|ADDRINUSE|ACCES|PERM|TIMEDOUT|NOTFOUND|XIST)\b|\bexit(ed)? (with )?(code|status) [1-9]\d*\b|\bBUILD (FAILURE|FAILED)\b|^\s*FAILED \S+::|\bFailed to compile\b|^\s*Module not found: Error\b|\bCannot find module '|blocked by CORS policy|\bshould have a unique "key" prop\b|^\s*Failed to load resource: the server responded|^\s*\[ERROR\] Failed to execute goal|^\s*Hydration failed\b|\bUnhandled (Promise Rejection|rejection)\b|\bCould not find a version that satisfies\b|\bCompilation error\b|^\s*(zsh|bash|sh|fish): (.+: )?(permission denied|no such file or directory|command not found)|^\s*dyld: |^\s*Permission denied \(publickey|\bAccess denied for user\b|\bnet::ERR_[A-Z_]+|\b(CrashLoopBackOff|ImagePullBackOff|OOMKilled)\b|^\s*!?\s*\[rejected\]|^\s*CONFLICT \(|\bCERTIFICATE_VERIFY_FAILED\b|\bcertificate signed by unknown authority\b|^\s*Failed to fetch\s*$|\bundefined reference to\b|\bNo such file or directory\b|^\s*ssh: connect to host\b|^\s*at [\w$.<>]+\(.*:\d+\)\s*$|^\s*HTTP [45]\d\d\s*$|^\s*(HTTP\/[\d.]+ |HTTP )?[45]\d\d (Bad Request|Unauthorized|Forbidden|Not Found|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\s*$/i;

  // Whole selections that are a known error message with no other words around it
  const ERROR_PHRASE = /^\s*(Traceback|(Connection|Read) (refused|reset by peer|timed out)|Out of memory|Killed(: \d+)?|Permission denied|Access is denied|No module named \S+|FAIL \S+\.(test|spec)\.\S+)[.!]?\s*$/i;

  // A bare exception class name such as "NullPointerException" or "java.lang.IllegalStateException"
  const ERROR_NAME = /^[A-Za-z_][\w.]*[a-z](Error|Exception)$/;

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

  const SQL = /^\s*(select\s+(distinct\s+)?(\*|[\w.()*`"]+(\s+as\s+\w+)?(\s*,\s*[\w.()*`"]+(\s+as\s+\w+)?)*)\s+from\s+\S|insert\s+into\b|update\s+\w+\s+set\b|delete\s+from\b|create\s+table\b)/i;
  // A known tool followed by a flag, a path or a subcommand, so "git is great" stays prose
  const SHELL = /^\s*(\$\s+)?(sudo\s+)?(git|npm|npx|yarn|pnpm|docker|kubectl|apt|apt-get|brew|pip3?|curl|ssh|chmod|rm|mkdir|ls|cd|mvn|gradle|cargo|go|make|python3?|node|java)\s+(-\S|\S*[/~.]\S*|(install|run|add|remove|commit|push|pull|clone|checkout|status|build|update|start|test|init|up|down|exec|get|apply|clean|compile|package)\b)/;

  // One-line import and include statements have too few symbols for the density check
  const IMPORT = /^\s*(import\s+[\w{*][^\n]*\sfrom\s+['"]|import\s+[\w.]+(\.\*)?;|from\s+[\w.]+\s+import\s+\w|#include\s*[<"]|using\s+[\w.]+;|package\s+[\w.]+;)/;

  // Short snippets have too few symbols for the density check, so "console.log('hi')" and "x += 1" would get Define
  const SNIPPET = /^[\w$.]+\(.*\);?$|^[a-z_$][\w$.[\]]*\s*([-+*\/%|&^]|\*\*|\?\?|\|\|)?={1,3}\s*\S|=>|^\s*(pub\s+)?fn\s+\w+\s*\(|^<\/?[a-z][\w-]*(\s[^<>]*)?\/?>$/;

  function looksLikeCommand(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    return lines.length > 0 && (SQL.test(text) || lines.every((l) => SHELL.test(l) || IMPORT.test(l)))
      || (lines.length === 1 && SNIPPET.test(text.trim()));
  }

  // Whole selections that are not a word to look up: a URL, an email address, a file path or name, a version, a colour or a clock time
  const NOT_A_WORD = /^(https?:\/\/|www\.)\S+$|^[^\s@]+@[^\s@]+\.\w+$|^(~|[A-Za-z]:\\|\.{0,2}\/)\S*[\/\\]\S*$|^[\w.-]+(\/[\w.-]+)*\/[\w-]+\.\w{1,5}$|^v\d+(\.\d+)+$|^#[0-9a-f]{3,8}$|^\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?$|^[\w-]+\.(md|txt|pdf|json|ya?ml|csv|png|jpe?g|gif|zip|docx?|xlsx?|pptx?)$/i;

  function classifySelection(text, { editable = false, monospace = false } = {}) {
    const t = text.trim();
    if (editable) return 'editable';
    if (looksLikeJson(t)) return 'json';
    if (STACK_TRACE.some((re) => re.test(t)) && (t.includes('\n') || /(error|exception|ERR!|fault|not found|fatal|traceback)/i.test(t))) return 'stacktrace';
    if (ERROR_LINE.test(t) || ERROR_NAME.test(t) || ERROR_PHRASE.test(t)) return 'stacktrace';
    if (looksLikeCode(t, { monospace }) || looksLikeCommand(t)) return 'code';
    // CJK text has no spaces, so count roughly one word per two characters
    const cjk = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const words = t.split(/\s+/).filter(Boolean);
    const wordCount = cjk > 0 ? words.length + Math.floor(cjk / 2) : words.length;
    // A short question such as "What is this?" is not a word to define
    const isQuestion = words.length > 1 && /\?$|^¿/.test(t);
    // Prices, dates, emoji, links and paths have no dictionary entry, so they get Explain instead of Define
    const lookup = /\p{L}/u.test(t) && !NOT_A_WORD.test(t);
    if (wordCount <= 3 && !isQuestion && lookup) return 'word';
    if (wordCount <= 3 && !isQuestion) return 'sentence';
    const sentences = (t.replace(/\b(?:mr|mrs|ms|dr|prof|st|vs|etc)\.|\b[ap]\.m\.|\b(?:e\.g|i\.e)\./gi, ' ').match(/[.!?](\s|$)|[。！？]/g) || []).length;
    if (sentences <= 1 && t.length < 260) return 'sentence';
    return 'paragraph';
  }

  const api = { classifySelection };
  root.LoonClassify = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
