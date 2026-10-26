# Feedback loop log

## 2026-10-25 — typed questions and instant answers

Tried 32 phrasings of the time, date, help and identity questions, including smart quotes, "?!", "right now", a "hey loon" prefix, "tell me the time", "today's date", "what can u do" and "help me!".

As a user, the biggest annoyance was that many natural phrasings missed the instant code answers and went to the language model. The model cannot know the time, so it could guess or stall. The worst case was the curly apostrophe that macOS autocorrect types in "what's the time?".

Fixed: the instant answers now match on a cleaned key (smart quotes, trailing punctuation, "right now", "please" and a leading "hey loon" removed). Added "tell me the time", "today's date", "date", "what can u do" and "help me". Test added in test/brain.test.js.

Left for later: small talk such as "hi", "thanks" and "what's up" still goes to the model. A short canned reply could save a model call.

Note for the next run: `npm test` shows 2 failures on main in this sandbox (WordNet and demo tests) because `npm install --ignore-scripts` skips building the wordnet data. They are not caused by the fixes.

## 2026-10-25 — reminders, calendar and focus commands

Tried 34 phrasings such as "please remind me…", "can you remind me to stretch at 4", "remind me tomorrow to buy milk", "remind me to", "set a timer for 10 minutes", "focus 90", "wake me at 7" and "book a table for 2 tonight at 8".

As a user, the worst problems were that a polite prefix ("please", "can you", "could you") made every command fall through to the model, and that "remind me tomorrow to buy milk" produced a reminder titled "to buy milk". A bare "remind me to" made a reminder titled "to".

Fixed: parseCommand now drops polite prefixes and a trailing "please" or "thanks" before matching, strips the leftover "to" from reminder titles, and returns null for an empty reminder. Tests added in test/assistant.test.js.

Left for later: "set a reminder for 3pm to call bob", "reminder: dentist friday 2pm", "set an alarm" and "wake me at 7" are not matched. "focus 90" and "focus mode" are not matched either. "remind me … every day" creates a one-time reminder with "every day" in the title, which is quietly dishonest and should either ask or say it is not recurring.

## 2026-10-26 — memory and privacy, redaction

Tried 27 snippets a person might select or paste, such as passwords in several shapes, card numbers with dashes, SSNs, API keys, connection strings, IBANs, bearer headers and .env lines.

As a user, the worst miss was .env style lines. `DB_PASSWORD=supersecret`, `AWS_SECRET_ACCESS_KEY=...` and `GEMINI_API_KEY=...` went to the model untouched, because the secret rule needed a word boundary before the name and an underscore is a word character. `Authorization: Bearer <token>` was also left alone.

Fixed: the secret rule now accepts prefixes and suffixes around the name (`DB_PASSWORD`, `api_key_prod`), and a new rule redacts bearer tokens. Test added in test/browser.test.js. Other failures in `npm test` are the same ones as on main in this sandbox (missing built data and dependencies).

Left for later: prose like "my password is swordfish", quoted values with spaces, "pw:", "passphrase:", SSNs written with spaces, and "cvv 123" are still not redacted. They need a looser rule that risks hiding normal sentences, so they should be decided deliberately.

## 2026-10-26 — translation and definitions

Tried 30 phrasings such as "define ephemeral", "define: ephemeral", "what does ephemeral mean?", "meaning of the word ephemeral", "what's the definition of serendipity", "translate this to spanish", "how do you say thank you in french" and "define mice".

As a user, the dictionary only worked when I highlighted a word or said "define X" out loud. Typing the same thing, or asking "what does X mean", went to the language model, which is slower and can invent senses. The offline WordNet lookup already handled these words.

Fixed: typed dictionary questions on the first turn of a thread now use the WordNet lookup through a shared `dictionaryTerm` in brain/define.js. Pronouns and phrases like "what does this error mean" still go to the model, and so does "what is python", so tech terms do not get an animal definition. Test added in test/brain.test.js. The two failures noted in earlier entries went away once I built the wordpos index locally, so they come from the sandbox install.

Left for later: "translate this to spanish" and "translate hello to spanish" are not parsed, so they go to the model, and the offline translator only ever goes to English (or Spanish from English). "define the word X" by voice passes "the word X" to WordNet and finds nothing. "define: x" with a colon is not matched.

## 2026-10-26 — developer help, error table

Tried 26 pasted errors such as Node stack traces, Python tracebacks, Java exceptions, Rust borrow errors, npm failures, git errors, shell "command not found" and bare HTTP codes.

As a user, the worst problem was a wrong answer given with confidence. Any error containing a number like 404 or 500 in a line reference (`app.js:404:3`, "at line 500") was explained as an HTTP 404 or 500. `Permission denied (publickey)` from git was explained as a file permission problem. `AttributeError: 'NoneType' ...`, the most common Python error, was not recognized.

Fixed: the 401, 403, 404 and 500 rules now use a shared `status` helper that skips line numbers. The permission rule skips SSH key failures. The NoneType rule also matches AttributeError. Tests added in test/modes.test.js and checked to fail before the change.

Left for later: no table entries for ValueError, ZeroDivisionError, Rust borrow errors, segfaults, npm ELIFECYCLE, React key warnings, 429 and 503, "Cannot set properties of null" and "command not found". The 3 failing tests in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — shopping and unit price

Tried 34 size strings and 11 price strings such as "16 oz (1 lb)", "Total 1kg (2 x 500g)", "8 oz x 3", "500 grams", "1 liter", "1 gallon", "1.299,99 €" and "1 299,00 €".

As a user, the worst problem was wrong numbers stated with confidence. "16 oz (1 lb)" was read as 907 g because both sizes were added. "1kg (2 x 500g)" became 2 kg. "8 oz x 3" ignored the 3. Spelled-out units like "grams", "kilograms", "liter" and "ounces" were not read at all, so those products dropped out of the unit price ranking. A European price like "1.299,99 €" was read as 1.29.

Fixed: parseQuantity now adds two sizes only when they sit side by side ("2 lb 4 oz"), takes the size after the x in a multipack, reads a trailing "x 3", and knows spelled-out units plus gallon and quart. parsePrice handles a thousands separator before a decimal comma. Tests added in test/modes.test.js and checked to fail before the change.

Left for later: "1 pint", "1 dozen", "100 sheets" and "500 gr" are not parsed. A price range ("$5.00 - $7.00") uses the low end and "Was $20 Now $15" uses the old price, which should be decided deliberately. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — food and menu

Tried a 14 item menu with euro prices, prices without a symbol, "Hamburger", "Cheeseburger", stock-based dishes and "free of" wording.

As a user, the worst problems were a euro price like "€11,50" turning into an item called "Margherita Pizza ,50" costing 11, and "Hamburger" and "Cheeseburger" being listed as likely vegetarian because only the word "burger" on its own was treated as meat.

Fixed: the menu price reader accepts a decimal comma, and the meat list knows hamburger, cheeseburger, hot dogs, brisket, pastrami and ribs. Test added in test/modes.test.js.

Left for later: lines with a price but no currency symbol ("Grilled Chicken Wrap - 13.50") are dropped. Promo lines like "$5 off today" become menu items. "Chicken-free" and "no beef" count as meat, which errs on the safe side. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — writing tools, fix grammar

Tried 25 texts such as "i has a apple", "their going to the store tomorow", "can u send me teh report asap", "Hola, como estas?", a letter with a doubled word, "ok", "alot of people" and "Could of been worse".

As a user, the worst problem was a wrong edit on text that was not English. "Hola, como estas?" became "Hold, coco etas?" and the cat would offer to replace my selection with that. Chat shorthand also broke. "can u send me teh report" became "can send me the report", because the checker turned "u" into "uh" and then dropped it.

Fixed: fixGrammar leaves a text of three or more words alone when it has no common English word, and the bubble says the checker only knows English. Lone "u" is skipped. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Me and him goes to school", "you're" used for "your" and "your welcome" are not caught. "ok" is changed to "okay" and "asap" is spelled out, which some people will not want. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — selection chips and classification

Tried 33 selections such as single words, short phrases, URLs, emails, prices, stack traces, shell commands, SQL, numbered lists, abbreviations like "Mr." and "p.m.", Japanese, Chinese, Russian and emoji.

As a user, the worst problem was that Chinese and Japanese selections were always a "word", because the classifier counted words by spaces. A whole sentence in Chinese got the Define chip instead of Explain, Summarize and Translate.

Fixed: classifySelection counts about one word per two CJK characters and knows the full-width sentence marks 。！？. Test added in test/browser.test.js and checked to fail before the change.

Left for later: abbreviations such as "Mr. Jones ... 5 p.m." count as several sentences, so a short sentence is offered paragraph chips. Shell commands like "git commit -m 'fix'" and SQL are not seen as code. Each needs care to avoid misclassifying plain prose. The `npm test` run here was limited to the browser tests because dependencies are not installed.

## 2026-10-26 — follow-up conversations and reply feedback

Tried 25 follow-up and feedback messages such as "no more emoji", "talk less", "less words", "can you be shorter next time", "ELI5", "simpler" and "too long didnt read", plus odd conversation histories (empty answers, a very long first answer, an answer that contains a closing conversation tag).

As a user, the worst problem was that style feedback phrased slightly differently was not understood. "No more emoji" and "can you be shorter next time" went to the language model, which may say it will remember while Loon changes nothing.

Fixed: the feedback parser accepts "no more emoji", "talk less", "less words" and ignores "next time". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "simpler", "ELI5" and "explain it simply" are not style settings, so they go to the model as a follow-up, which is fine. An answer that contains the text of a closing conversation tag can end the history block early in the prompt, which is low impact since the model wrote it. Inside a thread, a short follow-up such as "date" or "help" returns the instant answer instead of continuing the thread. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — routines

Tried 32 routine phrasings such as "every weekday at 8:30 summarize my calendar", "everyday at 8 remind me to take meds", "every 2 hours remind me to stand up", "every mon, wed, fri at 6:30am tell me to run", "twice a day remind me to take pills" and "every day at 9 remind me to".

As a user, the worst problem was that "everyday" as one word, a very common spelling, was not read as a schedule, so the request fell through to the language model instead of making a routine card. A bare "remind me to" made a reminder named "To" that looked valid and would fire with the text "to".

Fixed: parseSchedule reads "everyday" like "every day". A reminder with no text after "to" now keeps an empty message and is marked not understood, so the confirm card asks what to say. Tests added in test/routines.test.js and checked to fail before the change.

Left for later: "twice a day" is not parsed. "every 1st of the month" gives a card with no time. "stop the gym reminder" and "cancel my routines" are not routine commands, only pause, delete and remove are. "delete all routines" looks for a routine named "all". The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — page kinds

Tried menu, shop and bank pages such as a euro menu with "11,50 €", a euro shop with "9,99 €" and an Add to cart button, and the home pages of HSBC, TD Bank, Ally, login.gov, a hospital MyChart and Anthem.

As a user, the worst problem was that Loon did not look away on several bank, identity and health sites, so it would offer to read them. Prices written with the symbol after the number, common in Europe, were not counted, so menus and shops there were never recognized.

Fixed: more sensitive domains, and any host with a mychart, myhealth or patientportal label, are treated as sensitive. The price pattern accepts "11,50 €" and "9,99 €". Test added in test/browser.test.js. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

Left for later: the sensitive list is still a short fixed list, so a local bank not on it is only caught by a password field. Pages in other languages score low on food words, so non-English menus stay "other".
