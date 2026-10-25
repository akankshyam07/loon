// Developer Cat errors (DESIGN.md §3.8): a curated table answers common errors instantly; everything else goes to
// the model once and is cached by a normalized fingerprint (the way Sentry groups events).
const crypto = require('crypto');

// The line that names the error: Python puts it last, most other runtimes first.
function headline(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (/Traceback \(most recent call last\)/.test(text)) return lines.reverse().find((l) => /\w+(Error|Exception|Warning):?/.test(l)) || lines[0];
  return lines.find((l) => /(Error|Exception|error:|ERR!|panic:|fatal:|failed)/i.test(l)) || lines[0] || '';
}

// Strips everything that varies between occurrences so the same error always hashes the same.
function fingerprint(text) {
  const normalized = headline(text)
    .replace(/(["'`]).*?\1/g, '"_"')
    .replace(/(?:[A-Za-z]:)?(?:[/\\][\w.@-]+)+/g, '<path>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return { normalized, hash: crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16) };
}

const KNOWN = [
  {
    match: /NullPointerException/,
    title: 'NullPointerException (Java)',
    explain: 'Code used a variable that was `null` as if it held an object (called a method, read a field, unboxed it).',
    fix: ['Look at the first `at` line from *your* package: that line dereferences something null.', 'Find where that value is set and why it can be missing.', 'Guard with a null check, `Optional`, or fail early with `Objects.requireNonNull(x, "why")`.'],
  },
  {
    match: /ClassNotFoundException|NoClassDefFoundError/,
    title: 'Class not found (Java)',
    explain: 'A class was available at compile time but not on the classpath at runtime.',
    fix: ['Check the dependency is in the runtime scope (not `provided`/`test`).', 'Rebuild cleanly (`mvn clean package` / `gradle clean build`).', 'Look for version conflicts: `mvn dependency:tree`.'],
  },
  {
    match: /NoSuchBeanDefinitionException|No qualifying bean of type/,
    title: 'Spring can’t find a bean',
    explain: 'Spring was asked to inject a type, but no bean of that type is registered.',
    fix: ['Annotate the class (`@Service`, `@Component`, `@Repository`) or declare a `@Bean`.', 'Make sure its package is under your `@SpringBootApplication` package (component scan).', 'If there are several candidates, pick one with `@Qualifier` or `@Primary`.'],
  },
  {
    match: /BeanCurrentlyInCreationException|circular reference|The dependencies of some of the beans .* form a cycle/i,
    title: 'Circular dependency (Spring)',
    explain: 'Two or more beans depend on each other, so Spring can’t build either first.',
    fix: ['Move the shared logic into a third bean.', 'Inject one side lazily (`@Lazy`) as a last resort.'],
  },
  {
    match: /OutOfMemoryError/,
    title: 'OutOfMemoryError (Java)',
    explain: 'The JVM ran out of heap (or metaspace).',
    fix: ['Check for a collection that grows forever or a huge query result.', 'Take a heap dump (`-XX:+HeapDumpOnOutOfMemoryError`) and inspect it.', 'Only then raise `-Xmx`.'],
  },
  {
    match: /ConcurrentModificationException/,
    title: 'ConcurrentModificationException',
    explain: 'A collection was modified while being iterated.',
    fix: ['Use `iterator.remove()` or `removeIf(...)` instead of removing inside a for-each.', 'Collect changes and apply them after the loop.'],
  },
  {
    match: /Cannot read propert(y|ies) of (undefined|null)|undefined is not an object/,
    title: 'Reading a property of undefined (JavaScript)',
    explain: 'Code accessed `.something` on a value that is `undefined` or `null`.',
    fix: ['Find the variable before the dot on the reported line.', 'Check the data actually arrived (API response, props, async timing).', 'Use optional chaining `a?.b` where missing data is legitimate.'],
  },
  {
    match: /is not a function/,
    title: '"… is not a function" (JavaScript)',
    explain: 'Code called something that isn’t a function: often a wrong import, a typo, or a value that is undefined.',
    fix: ['Log the value right before the call.', 'Check default vs named imports (`import x` vs `import { x }`).'],
  },
  {
    match: /ReferenceError: \w+ is not defined/,
    title: 'ReferenceError: not defined',
    explain: 'A variable name is used that doesn’t exist in this scope.',
    fix: ['Check spelling and imports.', 'In ES modules, globals like `require` or `__dirname` don’t exist.'],
  },
  {
    match: /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/,
    title: 'Module not found (Node)',
    explain: 'Node couldn’t resolve an import: the package isn’t installed, or the path is wrong.',
    fix: ['Run `npm install` (check it’s in package.json).', 'For relative imports, check the path and file extension (ESM needs `.js`).'],
  },
  {
    match: /EADDRINUSE/,
    title: 'Port already in use',
    explain: 'Another process is already listening on that port.',
    fix: ['Find it: `lsof -i :PORT`.', 'Stop that process, or run yours on a different port.'],
  },
  {
    match: /ECONNREFUSED/,
    title: 'Connection refused',
    explain: 'Nothing is listening at that host and port (the server is down, or the address is wrong).',
    fix: ['Check the service is running.', 'Check host/port, and `localhost` vs a container name inside Docker.'],
  },
  {
    match: /ENOENT/,
    title: 'ENOENT: file not found',
    explain: 'A file or directory path doesn’t exist.',
    fix: ['Print the absolute path being used.', 'Paths are relative to the working directory, not the script, unless you use `__dirname`.'],
  },
  {
    match: /EACCES|permission denied/i,
    title: 'Permission denied',
    explain: 'The process isn’t allowed to read, write, or execute that path or port.',
    fix: ['Check file ownership/permissions (`ls -l`).', 'Avoid `sudo npm install -g`; fix npm’s prefix instead.', 'Ports below 1024 need privileges: use a higher port.'],
  },
  {
    match: /has been blocked by CORS policy|No 'Access-Control-Allow-Origin' header/,
    title: 'CORS blocked the request',
    explain: 'The browser refused the response because the server didn’t allow your page’s origin.',
    fix: ['Fix it on the server: send `Access-Control-Allow-Origin` for your origin.', 'For cookies, also `Access-Control-Allow-Credentials: true` and a specific origin (not `*`).', 'In development, use your dev server’s proxy.'],
  },
  {
    match: /Unexpected token .* in JSON|JSON\.parse|is not valid JSON/,
    title: 'Invalid JSON',
    explain: 'Code tried to parse text that isn’t JSON: often an HTML error page or an empty body.',
    fix: ['Log the raw response text before parsing.', 'Check the status code and `Content-Type` first.'],
  },
  {
    match: /ModuleNotFoundError|No module named/,
    title: 'ModuleNotFoundError (Python)',
    explain: 'Python can’t import a package: it isn’t installed in *this* environment.',
    fix: ['Check which Python runs: `python -m pip install <pkg>` installs into that one.', 'Activate your virtualenv first.'],
  },
  {
    match: /IndentationError|TabError/,
    title: 'IndentationError (Python)',
    explain: 'The indentation is inconsistent (often tabs mixed with spaces).',
    fix: ['Convert tabs to 4 spaces in your editor.', 'Check the block above the reported line.'],
  },
  {
    match: /KeyError/,
    title: 'KeyError (Python)',
    explain: 'A dictionary was read with a key it doesn’t have.',
    fix: ['Print the dict’s keys.', 'Use `d.get(key, default)` when the key is optional.'],
  },
  {
    match: /TypeError: .*'NoneType'/,
    title: 'NoneType error (Python)',
    explain: 'A value was `None` where an object was expected, often a function that returned nothing.',
    fix: ['Find where the value is assigned; check functions `return` on every path.'],
  },
  {
    match: /IndexError: list index out of range|ArrayIndexOutOfBoundsException|IndexOutOfBoundsException/,
    title: 'Index out of range',
    explain: 'Code read past the end (or before the start) of a list/array.',
    fix: ['Check the length before indexing.', 'Watch off-by-one loops: `< length`, not `<= length`.'],
  },
  {
    match: /merge conflict|CONFLICT \(content\)/i,
    title: 'Git merge conflict',
    explain: 'Both branches changed the same lines; git needs you to choose.',
    fix: ['Open the files with `<<<<<<<` markers, keep the right code, delete the markers.', '`git add` the files, then `git commit` (or `git rebase --continue`).'],
  },
  {
    match: /command not found: (\S+)|(\S+): command not found/,
    title: 'Command not found',
    explain: 'The shell has no program by that name: a typo, or the tool isn\'t installed or isn\'t on your PATH.',
    fix: ['Check the spelling (`pyhton` → `python`).', 'Installed it just now? Open a new terminal tab, or run `hash -r`.', 'Still missing: install it (e.g. `brew install <name>`) or add its folder to PATH.'],
  },
  {
    match: /error TS2322|is not assignable to type/,
    title: 'TypeScript type mismatch (TS2322)',
    explain: 'A value of one type is being put where another type is expected.',
    fix: ['Look at the two types in the message: fix the value, or widen the declared type if both are valid.', 'Avoid `as any`: it silences the check rather than fixing it.'],
  },
  {
    match: /fatal: not a git repository/,
    title: 'Not a git repository',
    explain: 'The command ran outside a git repo.',
    fix: ['`cd` into the project folder, or `git init` to start one.'],
  },
  {
    match: /npm ERR! ERESOLVE|unable to resolve dependency tree/,
    title: 'npm dependency conflict',
    explain: 'Two packages need incompatible versions of a shared dependency.',
    fix: ['Read which peer dependency conflicts and upgrade one side.', '`npm install --legacy-peer-deps` works around it (it hides the conflict rather than fixing it).'],
  },
  {
    match: /\b(401|Unauthorized)\b/,
    title: '401 Unauthorized',
    explain: 'The request had no valid credentials.',
    fix: ['Check the token is sent (header name, `Bearer ` prefix).', 'Check it hasn’t expired.'],
  },
  {
    match: /\b(403|Forbidden)\b/,
    title: '403 Forbidden',
    explain: 'The server knows who you are but won’t allow this action.',
    fix: ['Check the account’s roles/permissions for this resource.'],
  },
  {
    match: /\b404\b|Not Found/,
    title: '404 Not Found',
    explain: 'The URL doesn’t match any resource or route.',
    fix: ['Check the path, base URL and HTTP method.', 'For APIs, check the route is registered and the id exists.'],
  },
  {
    match: /\b500\b|Internal Server Error/,
    title: '500 Internal Server Error',
    explain: 'The server crashed while handling the request; the real error is in the server logs.',
    fix: ['Open the server logs around that timestamp for the stack trace.'],
  },
];

function lookupKnown(text) {
  const entry = KNOWN.find((k) => k.match.test(text));
  if (!entry) return null;
  const search = `https://stackoverflow.com/search?q=${encodeURIComponent(headline(text).slice(0, 120))}`;
  return `**${entry.title}**\n\n${entry.explain}\n\n**Likely fix**\n${entry.fix.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n[Search Stack Overflow](${search})`;
}

module.exports = { fingerprint, lookupKnown, headline, KNOWN };
