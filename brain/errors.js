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

// A status code, not a line number like app.js:404:3 or "line 500".
const status = (code) => `(?<![:.\\d]|line )\\b${code}\\b(?!:\\d)`;

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
    match: /UnsatisfiedDependencyException|BeanCreationException|Failed to load ApplicationContext/,
    title: 'Spring couldn’t build a bean',
    explain: 'The app failed to start because a bean could not be created. The real cause is in the last `Caused by:` line.',
    fix: ['Scroll to the bottom `Caused by:` and read that one, the top lines only say "creation failed".', 'Typical causes are a missing bean, a bad property in `application.properties`, or a database that is not reachable.'],
  },
  {
    match: /HttpMessageNotReadableException|MismatchedInputException|JsonParseException|JsonMappingException|InvalidFormatException/,
    title: 'Request body can’t be read (400)',
    explain: 'Spring could not turn the JSON body into your DTO. It is malformed, has the wrong type for a field, or the body is missing.',
    fix: ['Compare the JSON with the DTO field names and types (a string sent for a number, or a bad date format).', 'Make sure the DTO has a default constructor or Jackson annotations, and the client sends `Content-Type: application/json`.'],
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
    match: /Cannot read propert(y|ies)( '[^']*')? of (undefined|null)|undefined is not an object/,
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
    match: /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Module not found: (Error: )?Can't resolve/,
    title: 'Module not found (Node)',
    explain: 'Node couldn’t resolve an import: the package isn’t installed, or the path is wrong.',
    fix: ['Run `npm install` (check it’s in package.json).', 'For relative imports, check the path and file extension (ESM needs `.js`).'],
  },
  {
    match: /EADDRINUSE|BindException: Address already in use|Port \d+ (was )?already in use/i,
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
    match: /EACCES|permission denied(?! \(publickey)/i,
    title: 'Permission denied',
    explain: 'The process isn’t allowed to read, write, or execute that path or port.',
    fix: ['Check file ownership/permissions (`ls -l`).', 'Avoid `sudo npm install -g`; fix npm’s prefix instead.', 'Ports below 1024 need privileges: use a higher port.'],
  },
  {
    match: /ValueError: invalid literal|NumberFormatException/,
    title: 'Text isn’t a number',
    explain: 'Code tried to turn text into a number, but the text (often empty, or with spaces or commas) isn’t one.',
    fix: ['Print the exact value, with quotes, right before the conversion.', 'Strip whitespace and handle empty input first.', 'Wrap the conversion in try/except (or try/catch) when user input is involved.'],
  },
  {
    match: /ZeroDivisionError|ArithmeticException: \/ by zero/,
    title: 'Division by zero',
    explain: 'Code divided a number by zero.',
    fix: ['Check the divisor on the reported line, it is often an empty list length or a count that never got set.', 'Guard with `if divisor:` before dividing.'],
  },
  {
    match: /RecursionError|StackOverflowError|Maximum call stack size exceeded/,
    title: 'Infinite recursion',
    explain: 'A function kept calling itself until the call stack ran out.',
    fix: ['Check the base case really stops the recursion.', 'Make sure each call moves closer to it (a smaller input).', 'For very deep data, loop with your own stack instead.'],
  },
  {
    match: /connection to server (on socket|at) .*failed/i,
    title: 'Postgres connection failed',
    explain: 'psql could not reach a Postgres server, so it is not running, or it listens somewhere other than where the client looks.',
    fix: ['Start the server (`brew services start postgresql`, `sudo systemctl start postgresql` or your Docker container).', 'Pass the host and port explicitly: `psql -h localhost -p 5432`.', 'If the message mentions a socket path, the server may be using a different socket directory.'],
  },
  {
    match: /container name .* is already in use/i,
    title: 'Docker container name already in use',
    explain: 'A container with that name exists already, running or stopped, so Docker will not create a second one.',
    fix: ['See it with `docker ps -a`.', 'Remove it with `docker rm -f <name>`, or start the old one with `docker start <name>`.', 'Or pick another name with `--name`, or add `--rm` so it cleans up after itself.'],
  },
  {
    match: /ssh: connect to host .*(Connection timed out|Operation timed out)/i,
    title: 'SSH connection timed out',
    explain: 'The host did not answer on that port, so a firewall, a wrong address or a sleeping server is dropping the traffic.',
    fix: ['Check the hostname or IP and the port (`ssh -p`).', 'Check the server is up and its firewall or security group allows port 22 from your address.', 'Try another network or turn off the VPN, then run `ssh -v` for detail.'],
  },
  {
    match: /FileNotFoundError|No such file or directory/,
    title: 'File not found',
    explain: 'The path doesn’t exist from where the program is running.',
    fix: ['Print the absolute path being opened (`os.path.abspath(path)`).', 'Relative paths depend on the working directory, not the script’s folder.', 'Check spelling and the file extension.'],
  },
  {
    match: /Cannot set propert(y|ies)( '[^']*')? of (undefined|null)/,
    title: 'Setting a property of null (JavaScript)',
    explain: 'Code assigned to `.something` on a value that is `undefined` or `null`. With `innerHTML` it usually means the element wasn’t found.',
    fix: ['Check `document.querySelector(...)` really returned an element.', 'Run the script after the page has loaded (`defer` or `DOMContentLoaded`).'],
  },
  {
    match: /: command not found|command not found:/,
    title: 'Command not found',
    explain: 'The shell can’t find a program with that name: it isn’t installed, or isn’t on your PATH.',
    fix: ['Check the spelling.', 'Install it (`brew install <name>` on macOS).', 'Tools like nvm or conda need their init lines in `~/.zshrc`, then open a new terminal.'],
  },
  {
    match: /ERESOLVE/,
    title: 'npm dependency conflict',
    explain: 'Two packages need versions of a dependency that cannot both be installed. The lines under ERESOLVE name the packages that disagree.',
    fix: ['Read which package wants which version and update the older one.', 'If you trust the mismatch, `npm install --legacy-peer-deps` skips the peer check.'],
  },
  {
    match: /ENOSPC|No space left on device/i,
    title: 'Disk full',
    explain: 'The disk has no free space left. (Watchers can also report ENOSPC when Linux runs out of inotify watches.)',
    fix: ['Check space with `df -h` and clear caches, old builds or downloads.', 'If `df` shows free space, raise `fs.inotify.max_user_watches`.'],
  },
  {
    match: /EMFILE|too many open files/i,
    title: 'Too many open files',
    explain: 'The process hit the limit on open file handles, often a file watcher or a loop that opens files without closing them.',
    fix: ['Close files or streams when done, or limit how many run at once.', 'Raise the limit for the shell with `ulimit -n 10240`.'],
  },
  {
    match: /Segmentation fault|SIGSEGV/i,
    title: 'Segmentation fault',
    explain: 'The program touched memory it does not own and the OS killed it. It is almost always a bug in native code (C, C++, Rust unsafe, a native addon).',
    fix: ['Run it in a debugger (`lldb` or `gdb`) or with AddressSanitizer to see the line.', 'Check for null pointers, freed memory and out of range array access.', 'If it comes from a package, update it or try another version.'],
  },
  {
    match: /CERTIFICATE_VERIFY_FAILED|unable to verify the first certificate|UNABLE_TO_VERIFY_LEAF_SIGNATURE|self[- ]signed certificate/i,
    title: 'Certificate not trusted',
    explain: 'The TLS certificate could not be verified. Common causes are a company proxy, a self-signed certificate or a missing CA bundle.',
    fix: ['Point the tool at the right CA file (`NODE_EXTRA_CA_CERTS` or `SSL_CERT_FILE`).', 'Do not turn verification off except for a local test server.'],
  },
  {
    match: /pathspec '[^']*' did not match/,
    title: 'Git cannot find that branch or file',
    explain: 'The name you gave to checkout or add is not a local branch, tag or file here.',
    fix: ['Run `git fetch` and then `git branch -a` to see the names git knows.', 'Check the spelling and the case, since branch names are case sensitive.'],
  },
  {
    match: /failed to push some refs/,
    title: 'Git push rejected',
    explain: 'The remote has commits you do not have, so git refused to overwrite them.',
    fix: ['Run `git pull --rebase` and push again.', 'Never force push to a shared branch unless you are sure.'],
  },
  {
    match: /cannot find symbol/,
    title: 'Cannot find symbol (Java)',
    explain: 'The compiler found a name it does not know. It is usually a typo, a missing import, or a method that does not exist on that type.',
    fix: ['Read the `symbol:` and `location:` lines under the error.', 'Check the spelling, the import and the type of the variable.'],
  },
  {
    match: /ELIFECYCLE/,
    title: 'npm script failed',
    explain: 'ELIFECYCLE only says an npm script exited with an error. The real cause is printed above it.',
    fix: ['Scroll up to the first error before the `npm ERR!` lines.', 'Try `rm -rf node_modules && npm install` if it started after a dependency change.'],
  },
  {
    match: /ETIMEDOUT|ECONNRESET|ESOCKETTIMEDOUT/,
    title: 'Network timeout or reset',
    explain: 'The connection hung or was dropped before a reply arrived.',
    fix: ['Check you can reach the host (`curl -v <url>`).', 'Check VPN, proxy or firewall settings.', 'Retry with a longer timeout, or with backoff if the server is busy.'],
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
    match: /Unexpected token '?<'?(?! in JSON)|<!DOCTYPE/,
    title: 'Got an HTML page instead of JavaScript or JSON',
    explain: 'The browser or your code asked for a script or data file and received an HTML page, usually the app’s index.html or an error page.',
    fix: ['Open the failing URL in a new tab: if you see a web page, the path is wrong or the server rewrote it.', 'Check the `<script src>` path, the build output folder and the dev server proxy.', 'In an API call, log the status code first, a 404 or 500 page starts with `<`.'],
  },
  {
    match: /NameError: name '\w+' is not defined/,
    title: 'NameError (Python)',
    explain: 'Python met a name it has never seen: a typo, a missing import, or a variable used before it was set.',
    fix: ['Check the spelling and capital letters of the name in the message.', 'Add the missing `import`, or define the variable above the line that uses it.', 'A name set only inside a function or `if` block is not visible outside it.'],
  },
  {
    match: /ImportError: cannot import name/,
    title: 'ImportError (Python)',
    explain: 'The module was found, but it has nothing with that name. Either the name is misspelled, your version is older, or two files import each other.',
    fix: ['Check the name exists in that module and your installed version (`pip show <pkg>`).', 'If the message says "partially initialized module", you have a circular import: move the shared code to a third file.', 'A file of yours named like a library (`random.py`, `json.py`) hides the real one.'],
  },
  {
    match: /SyntaxError: (?:invalid syntax|'[(\[{]' was never closed|unterminated string literal|unexpected EOF while parsing|Missing parentheses in call to|expected ':')/,
    title: 'SyntaxError (Python)',
    explain: 'Python can’t read the code as written. The mistake is often on the line above the one it points to.',
    fix: ['Look at the marked line and the one before it for a missing `)`, `]`, quote or `:`.', 'Check that `print` has parentheses and `==` is used in comparisons, not `=`.', 'Let your editor’s bracket matching find the unclosed one.'],
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
    match: /(TypeError|AttributeError): .*'NoneType'/,
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
    match: /fatal: not a git repository/,
    title: 'Not a git repository',
    explain: 'The command ran outside a git repo.',
    fix: ['`cd` into the project folder, or `git init` to start one.'],
  },
  {
    match: new RegExp(`${status(401)}|\\bUnauthorized\\b`),
    title: '401 Unauthorized',
    explain: 'The request had no valid credentials.',
    fix: ['Check the token is sent (header name, `Bearer ` prefix).', 'Check it hasn’t expired.'],
  },
  {
    match: new RegExp(`${status(403)}|\\bForbidden\\b`),
    title: '403 Forbidden',
    explain: 'The server knows who you are but won’t allow this action.',
    fix: ['Check the account’s roles/permissions for this resource.'],
  },
  {
    match: new RegExp(`${status(404)}|Not Found`),
    title: '404 Not Found',
    explain: 'The URL doesn’t match any resource or route.',
    fix: ['Check the path, base URL and HTTP method.', 'For APIs, check the route is registered and the id exists.'],
  },
  {
    match: new RegExp(`${status(500)}|Internal Server Error`),
    title: '500 Internal Server Error',
    explain: 'The server crashed while handling the request; the real error is in the server logs.',
    fix: ['Open the server logs around that timestamp for the stack trace.'],
  },
  {
    match: /JavaScript heap out of memory|Reached heap limit/,
    title: 'Node ran out of memory',
    explain: 'The Node process hit its heap limit, usually from loading a huge file or data set at once or from a leak.',
    fix: ['Stream or paginate large data instead of loading it all.', 'Look for caches, arrays or listeners that only ever grow.', 'As a stopgap raise the limit: `NODE_OPTIONS=--max-old-space-size=4096`.'],
  },
  {
    match: /ClassCastException/,
    title: 'ClassCastException (Java)',
    explain: 'Code cast an object to a type it is not, often from raw generics or two copies of a class loaded by different class loaders.',
    fix: ['Read the message: it names the actual class and the one it was cast to.', 'Check the code that produced the object, not the cast itself.', 'Use `instanceof` or fix the generic type instead of casting.'],
  },
  {
    match: /Cannot connect to the Docker daemon|docker daemon is not running/i,
    title: 'Docker daemon not reachable',
    explain: 'The docker command could not talk to the Docker engine, so it is probably not running or you lack access to its socket.',
    fix: ['Start Docker Desktop (or `sudo systemctl start docker` on Linux).', 'On Linux, add your user to the `docker` group and log in again.'],
  },
  {
    match: /nil pointer dereference/,
    title: 'Nil pointer panic (Go)',
    explain: 'Go code used a pointer, map or interface that was nil.',
    fix: ['Read the goroutine trace: the first line in your own package is where it happened.', 'Check errors before using the returned value.', 'Initialize maps and structs before use.'],
  },
  {
    match: /borrow of moved value|use of moved value|E0382/,
    title: 'Use of a moved value (Rust)',
    explain: 'A value was moved to another owner and then used again.',
    fix: ['Pass a reference (`&value`) instead of moving it.', 'Call `.clone()` if you really need two owners.'],
  },
  {
    match: new RegExp(`${status(502)}|Bad Gateway`),
    title: '502 Bad Gateway',
    explain: 'A proxy or load balancer got a bad answer, or none, from the app behind it.',
    fix: ['Check the app behind the proxy is running and listening on the expected port.', 'Look at the proxy and app logs at that time.'],
  },
  {
    match: new RegExp(`${status(504)}|Gateway Time-?out`),
    title: '504 Gateway Timeout',
    explain: 'A proxy waited too long for the app behind it to answer.',
    fix: ['Find the slow request: a long query or an external call with no timeout.', 'Raise the proxy timeout only after that.'],
  },
  {
    match: new RegExp(`${status(429)}|Too Many Requests`),
    title: '429 Too Many Requests',
    explain: 'You hit the server’s rate limit.',
    fix: ['Wait and retry; the `Retry-After` header says how long.', 'Slow down or batch your requests, and back off on repeated failures.'],
  },
  {
    match: new RegExp(`${status(503)}|Service Unavailable`),
    title: '503 Service Unavailable',
    explain: 'The server is up but can’t take requests right now (overloaded, restarting or down for maintenance).',
    fix: ['Retry after a short wait.', 'Check the service’s status page.'],
  },
  {
    match: /\bTS2345\b|\bTS2322\b|is not assignable to (?:parameter of )?type/,
    title: 'Type mismatch (TypeScript)',
    explain: 'A value of one type was passed or assigned where TypeScript expects a different type.',
    fix: ['Read the two types in the message: the first is what you gave, the second is what was expected.', 'Convert the value (`Number(x)`, `String(x)`) or widen the declared type if the code is right.', 'Avoid `as any`; it only hides the problem.'],
  },
  {
    match: /TS2304|TS2552|Cannot find name '/,
    title: 'Unknown name (TypeScript)',
    explain: 'TypeScript cannot see a variable, function or type with that name in this scope.',
    fix: ['Check the spelling and add the missing `import`.', 'For globals like `process` or `describe`, install the matching `@types/...` package.'],
  },
  {
    match: /TypeError: '\w+' object is not (?:subscriptable|callable|iterable)|TypeError: unsupported operand type|AttributeError: '\w+' object has no attribute/,
    title: 'Wrong type for this operation (Python)',
    explain: 'The value is not the type the code assumed (for example an int used like a list, or a str added to an int).',
    fix: ['Print `type(x)` for the variable named in the message and trace back to where it was set.', 'Convert it first (`int(x)`, `str(x)`), or fix the code that returned the wrong type.'],
  },
  {
    match: /unique "key" prop/,
    title: 'Missing key prop (React)',
    explain: 'Items rendered from a list need a stable `key` so React can tell them apart between renders.',
    fix: ['Add `key={item.id}` to the outermost element inside `.map()`.', 'Use the array index only if the list never reorders.'],
  },
  {
    match: /duplicate key value violates unique constraint|UNIQUE constraint failed|Duplicate entry .* for key/,
    title: 'Duplicate value (SQL)',
    explain: 'An insert or update would create a second row with a value that must be unique.',
    fix: ['Check the constraint name in the message to see which column it protects.', 'Look the row up first, or use an upsert (`ON CONFLICT` / `ON DUPLICATE KEY UPDATE`).'],
  },
  {
    match: /DataIntegrityViolationException|ConstraintViolationException|violates (?:foreign key|not-null) constraint/i,
    title: 'Database constraint violated',
    explain: 'The database refused a write because it broke a rule: a duplicate unique value, a missing required column, or a foreign key that points nowhere.',
    fix: ['Read the `Caused by:` line, it names the constraint or column.', 'Check the entity has the field set and the value is not already in the table.', 'For a foreign key, save the parent row first.'],
  },
  {
    match: /UnsupportedClassVersionError|class file version \d+/,
    title: 'Java version too old for this code',
    explain: 'The class was compiled with a newer Java than the one running it.',
    fix: ['Run `java -version` and compare it with the version your build targets.', 'Switch `JAVA_HOME` to the newer JDK, or compile for the older one.'],
  },
  {
    match: /would be overwritten by (?:merge|checkout)/,
    title: 'Local changes would be overwritten (git)',
    explain: 'Git will not switch or merge because it would erase edits you have not committed.',
    fix: ['Commit the changes, or `git stash` them and run the command again.', '`git stash pop` brings them back afterwards.'],
  },
  {
    match: /NoSuchMethodError/,
    title: 'Method missing at runtime (Java)',
    explain: 'The code was compiled against a version of a library that had this method, but a different version is on the classpath when it runs.',
    fix: ['Run `mvn dependency:tree` (or `gradle dependencies`) and look for two versions of the library named in the message.', 'Pin one version, exclude the other, then do a clean build.'],
  },
  {
    match: /LazyInitializationException/,
    title: 'Lazy loading outside a session (Hibernate)',
    explain: 'A lazy field or collection was read after the database session was already closed.',
    fix: ['Load what you need inside the transaction (`JOIN FETCH` or `@EntityGraph`).', 'Or map to a DTO before leaving the service method. Avoid switching on open-session-in-view just to silence it.'],
  },
  {
    match: /refusing to merge unrelated histories/,
    title: 'Unrelated histories (git)',
    explain: 'The two branches have no common starting commit, which usually means two separate repos were created.',
    fix: ['If you really want to join them, run `git pull --allow-unrelated-histories` and resolve any conflicts.', 'If it was a mistake, check the remote URL with `git remote -v`.'],
  },
  {
    match: /UnicodeDecodeError/,
    title: 'Wrong text encoding (Python)',
    explain: 'The file or bytes are not in the encoding Python assumed, usually UTF-8.',
    fix: ['Open the file with the right encoding, for example `open(path, encoding="latin-1")`.', 'For a quick workaround use `errors="replace"`, but that loses characters.'],
  },
  {
    match: /Hydration failed|Text content does not match server-rendered HTML|did not match\. Server:/,
    title: 'Hydration mismatch (React / Next.js)',
    explain: 'The HTML the server sent is different from what React rendered in the browser on first load.',
    fix: ['Look for values that differ per render, like `Date.now()`, `Math.random()` or `window` checks.', 'Move those into `useEffect`, or invalid HTML nesting such as a `<div>` inside a `<p>` can also cause it.'],
  },
];

function lookupKnown(text) {
  const entry = KNOWN.find((k) => k.match.test(text));
  if (!entry) return null;
  const search = `https://stackoverflow.com/search?q=${encodeURIComponent(headline(text).slice(0, 120))}`;
  return `**${entry.title}**\n\n${entry.explain}\n\n**Likely fix**\n${entry.fix.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n[Search Stack Overflow](${search})`;
}

module.exports = { fingerprint, lookupKnown, headline, KNOWN };
