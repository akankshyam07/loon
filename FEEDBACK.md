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

## 2026-10-26 — developer help, JSON to DTO

Tried 16 JSON inputs such as an empty object, a top-level array of objects, plain numbers and strings, trailing commas, single quotes, keys like "first-name" and "2fa", nested objects, dates, nulls, and JSON inside a markdown fence.

As a user, the worst problem was that pasting an API response (a top-level array) and asking for a Java DTO gave an empty code block, as did a plain value. That looks like a broken answer. Java with nested objects also left `// Item.java` headers followed by `package io.quicktype;` lines in the middle of the code. JSON copied from a README with a ``` fence was refused as invalid.

Fixed: top-level arrays are typed from their elements and say so, plain values get an honest "no fields" message, all package lines are removed, and a code fence around the JSON is ignored. Test added in test/modes.test.js and checked to fail before the change.

Left for later: trailing commas, single quotes and comments are rejected as invalid JSON, which is correct but unhelpful. The Kotlin entry in DTO_LANGUAGES uses an option value quicktype rejects, but no chip reaches it. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-26 — history

Tried 25 phrasings such as "what did I ask yesterday", "what did I search for last week", "what did I ask you about the laptop", "show my history", "did I look up kubernetes" and "clear my history".

As a user, the worst problem was that time words became the search term. "What did I ask yesterday" searched the history for the word "yesterday" and said it had nothing, even with a full history. "What did I ask you about the laptop" searched for "you about the laptop". "show my history" and "history" were not understood.

Fixed: history questions now drop time words and the leading "you", and "show my history" lists recent items. History search has no date filter, so a time-only question shows the most recent items instead. Test added in test/assistant.test.js.

Left for later: a real date filter for "yesterday" and "last week". "Did I look up X", "have I looked up X before" and "what was my last question" are not matched. There is no spoken command to clear history, only Settings. "forget everything" goes to the memory forget action, which looks for a fact named "everything" and finds nothing, which may surprise a user who expects a wipe.

## 2026-10-27 — memory commands, remember and forget

Tried 19 phrasings such as "forget it", "forget about it", "forget everything", "forget everything you know about me", "forget me not", "Remember: my name is Sam", a bare "remember" and "remember my wifi password is hunter2".

As a user, the worst problem was that "Remember: my name is Sam" with a colon was not understood and went to the language model, which may claim it saved something. "forget it" and "forget about it" were treated as a request to delete memories. "forget everything" searched for a fact named "everything" and said it had nothing saved, which is untrue to what the user wanted.

Fixed: remember and forget accept a colon or comma after the verb, the idioms "forget it", "forget about it" and "forget that" fall through to normal chat, and "forget everything" or "forget all" now says to use Settings → Memory instead of word matching. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remember my wifi password is hunter2" stores the secret as plain text in memory, because prose passwords are not redacted (see the 2026-10-26 redaction entry). "remember to buy milk" saves a fact "to buy milk" where a reminder is more likely meant. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — onboarding, "Get to know you"

Tried 22 answers such as names with accents, emoji, CJK and punctuation, allergies typed as "none", "No", "n/a" and "idk", a typed "I'm allergic to peanuts", interests with "rock and roll", and a long interest list, plus 15 style feedback phrases.

As a user, the worst problem was that answering "none" to the allergy question saved a pinned fact "I'm allergic to none" (same for "No" and "n/a"). That fact goes to the model with every food question. Typing "I'm allergic to peanuts" saved "I'm allergic to I'm allergic to peanuts".

Fixed: the shared list reader in brain/personal.js drops empty answers and a leading "allergic to" or "interested in". Test added in test/conversations.test.js and checked to fail before the change.

Left for later: "rock and roll" splits on "and" into two interests. A list of more than six items is cut silently. "speak french", "make it longer", "be casual" and "respond in hinglish" are not understood as style feedback. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — voice intents

Tried 40 spoken phrasings such as "yes, do it", "no thanks", "not now", "turn off focus", "go to sleep, Loon", "define: ephemeral", "define the word ephemeral", "explain this to me", "make this shorter" and "translate this to spanish".

As a user, the worst problem was that a natural spoken yes did not count as a yes. "Yes, do it" while a confirm card was waiting went to the language model as a question, so the action never ran. "No thanks" and "not now" had the same problem. "Turn off focus" and a trailing "Loon" ("go to sleep, Loon") also missed, and "define the word X" looked up "the word X".

Fixed: the yes and no lists accept "yes do it", "yes please", "no thanks" and "not now". Focus on and off accept "focus" without "mode". A trailing "Loon" is ignored, and define accepts a colon and "the word". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "explain this to me", "explain it", "make this shorter", "simplify it" and "translate this to spanish" are not templates, so they go to the model as plain questions. "Which one is the cheapest one" is missed too. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — typed questions, math and conversions

Tried 24 inputs such as "2+2", "what is 15% of 80?", "what's 12 x 12", "(3+4)*2", "2^10", "5 miles in km", "100 f to c", "convert 3 cups to ml", "555-1234", "1/0" and "what is 3 in".

As a user, the worst problem was that arithmetic and unit conversions went to the local model. That breaks the house rule that code handles numbers, and a small model can get "15% of 80" or a Fahrenheit conversion wrong while sounding sure.

Fixed: a new brain/calc.js answers plain arithmetic, "X% of Y" and length, mass, volume and temperature conversions, and the resolver tries it before the dictionary and the model. It uses a small parser, not eval. Phone-like "555-1234", division by zero and unknown units still fall through. Test added in test/brain.test.js.

Left for later: tip splitting, "sqrt(4)", currency conversion (needs live rates), "1 pint" style mixed units like "5 ft 3 in", and small talk such as "hi" still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — voice intents, edits on a selection

Tried 26 spoken phrasings such as "explain this to me", "explain it", "make this shorter", "shorten it", "simplify it", "make it easier", "rewrite this", "make this more professional", "make it warmer", "summarize this" and "translate this to spanish".

As a user, the worst problem was that the same edits that exist as chips did not work by voice. Saying "make this shorter" or "explain this to me" with text selected went to the language model as a plain question with no selection attached, so the answer had nothing to work on.

Fixed: new voice templates route shorter, rewrite, professional, warmer, summarize and the "it" and "to me" forms of explain and simplify to the matching selection tasks. They say "Select some text first" when nothing is selected. "Summarize this page" still goes to the page summary. Test added in test/voice.test.js.

Left for later: "translate this to spanish" still goes to the model, because the translate task only targets English and a template would promise more than it does. "eli5", "tl;dr" and "give me examples" are not templates. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — reminders, timers and focus (second pass)

Tried 30 phrasings such as "set a timer for 1 hour 30 minutes", "timer 10 min", "set an alarm for 7am", "wake me at 7", "set a reminder for 3pm to call bob", "reminder: dentist friday 2pm", "focus 90" and "remind me tmrw to pay rent".

As a user, the worst problem was that timers and alarms matched nothing, so they went to the language model, which cannot start a timer and may say it did. "Reminder: …" and "set a reminder for 3pm to …" also fell through, and "focus 90" did nothing.

Fixed in parseCommand. Timers and alarms become a timed Reminder ("Timer is up", "Wake up") that shows the usual confirm card, so the user sees exactly what will happen. "reminder …" and "set a reminder …" reuse the "remind me" path. "focus 90" now means 90 minutes. Tests added in test/assistant.test.js.

Left for later. "cancel my timer" and "what timers do I have" are not matched, since timers are plain Reminders. "start a 25 minute focus" and "remindme to…" are not matched. Three WordNet tests fail in this cloud sandbox because `npm install --ignore-scripts` skips the wordnet-db index step. They fail the same way on main.

## 2026-10-27 — developer help, error table (second pass)

Tried 27 pasted errors such as "ValueError: invalid literal for int()", ZeroDivisionError, "zsh: command not found: nvm", 429 and 503 responses, "Cannot set properties of null", ELIFECYCLE, RecursionError, FileNotFoundError, ETIMEDOUT and Rust or React warnings.

As a user, most of the common beginner errors missed the table and waited on the language model. "command not found" and "Too Many Requests" are the kind of thing I want answered at once.

Fixed: added table entries for non-numeric text conversions, division by zero, infinite recursion, file not found, setting a property of null, command not found, ELIFECYCLE, network timeout or reset, 429 and 503. Tests added in test/modes.test.js.

Left for later: segfaults, Rust borrow errors, React key warnings, ClassCastException, UnicodeDecodeError, "x is not iterable", EMFILE and certificate errors still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — typed questions, small talk

Tried 24 openers and closers such as "hi", "Hello!", "hey loon", "yo", "what's up", "good morning", "thanks!", "thank you so much", "thx" and "cheers".

As a user, saying hi or thanks to a cat on my screen made it spin up the language model for a greeting, which is slow and sometimes brings a long, chatty answer.

Fixed: greetings and thanks now get a short instant reply from code. The test in test/brain.test.js covers them. I replaced "hello" with "banana" in the existing list of inputs that must reach the model, because "hello" is now an instant answer and the list only needs a non-math word.

Left for later: "bye" and "good night" still go to the model. "hello there" is left alone because an existing CLI test uses it as an arbitrary prompt. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — memory and privacy, redaction

Tried 25 inputs such as "my password is hunter2", "PIN: 4829", "passcode 884213", a card with CVV, a bare SSN, an AWS secret key, an "Authorization: Basic" header, a Mongo connection string and "the password reset link is fine".

As a user, the worst problem was that a sentence like "my password is hunter2" went through unredacted. Redaction only matched "password:" or "password=", but people type and speak "is". PINs, CVVs and Basic auth headers also passed through to the model.

Fixed: redaction now covers password, passcode, passphrase, PIN, CVV and CVC followed by "is", a colon or an equals sign, and "Basic" auth credentials. "password reset link" is left alone. Test added in test/browser.test.js.

Left for later: a bare nine digit SSN, "pw: …", short values like "token: abc", cookie values such as "sessionid=…", bank account numbers, passport numbers and dates of birth are not redacted. Email addresses and phone numbers are also kept on purpose, which may need a decision. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — translation, spoken commands

Tried 10 spoken and typed phrasings such as "translate it", "translate this for me", "translate that into French", "translate hello to spanish" and "translate this page".

As a user, "translate it" and "Loon, translate this for me" went to the language model as a plain question with no selection attached, even though "translate this" worked.

Fixed: the voice template now accepts "it", a trailing "for me" and "into english". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "translate this to spanish" and "translate hello to spanish" still go to the model, because the translate task only targets English, so routing them there would promise something Loon cannot do. A target language slot would need the offline translator to take one. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-27 — food and menu (second pass)

Tried a 13 line menu with promos, fees, add-ons, a bare price ("Grilled Chicken Wrap - 13.50"), a trailing euro sign ("Pad Thai 14.00 €") and dot leaders.

As a user, the worst problems were that "$5 off any entree today", "Free delivery over $25" and "Add bacon +$2" showed up as dishes, and one promo swallowed the next real dish as its description. Dishes priced without a leading symbol were dropped, so the cat recommended from a partial menu.

Fixed: extractMenu now reads a bare price at the end of a line and a currency sign after the number, and skips promo, fee and add-on lines. Test added in test/modes.test.js.

Left for later: two prices on one line ("$15.99 / $18.99") keep a slash in the name, "Soup $6 | Bowl $8" is one item, and a bare whole number without a symbol is still ignored.

## 2026-10-27 — shopping and unit price (second pass)

Tried 31 size strings and 12 price strings such as "32-oz", "1 pint", "500 gr", "12 fl. oz.", "2-pack 16 oz", "12-pack of 12 oz cans", "Was $20 Now $15", "5 for $10" and "$5.00 - $7.00".

As a user, the worst problems were that "32-oz bottle" was not read at all, so that product dropped out of the unit price ranking, and that "Was $20 Now $15" used the old price, which makes a sale item look more expensive than it is. Pints and "gr" were also unknown.

Fixed: parseQuantity accepts a hyphen between number and unit, and knows pints and "gr". parsePrice takes the price after "Now". Test added in test/modes.test.js.

Left for later: "12 cans x 12 fl oz" ignores the 12 cans, "1 dozen" and "100 sheets" are not parsed, and "5 for $10" reads as 5. A price range uses the low end. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — history (second pass)

Tried 14 phrasings such as "did I look up kubernetes", "have I looked up docker before", "what did I ask last", "what did I search for", "clear my history", "wipe history" and "what was my last question".

As a user, the worst problem was that "what did I search for" searched the history for the word "for" and "what did I ask last" searched for "last", so both said nothing was found. "Did I look up X" and "have I looked up X before" were not understood at all.

Fixed: both yes/no forms now search for X, and a stray "for" or "last" is dropped so the question lists recent items. Tests added in test/assistant.test.js. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

Left for later: no spoken "clear my history" or "wipe history", "what was my last question" is not matched, and there is still no real date filter.

## 2026-10-28 — routines (second pass)

Tried 29 routine phrasings such as "each morning remind me to stretch", "every other day…", "hourly remind me to stand", "every 2 weeks on friday remind me to submit timesheet", "biweekly…", "every first monday of the month…", "delete all routines" and "cancel my routines".

As a user, the worst problem was that "every 2 weeks on friday remind me to submit timesheet" became a weekly Friday routine with the message "2 weeks remind me to submit timesheet". The card looked valid and would have fired twice as often as asked.

Fixed: parseSchedule now reads "every N weeks", "every other week", "biweekly" and "fortnightly" for a single weekday, starting on the next such day, and describes it as "every other Friday". Two weekdays with a multi-week cycle are not understood, so the card asks instead of drifting. Test added in test/routines.test.js.

Left for later: "twice a day", "every first monday of the month", "stop the gym reminder" and "cancel my routines" are not routine commands. "delete all routines" answers that no routine is named "all routines", which is honest but not helpful. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — selection chips and classification (second pass)

Tried 28 selections such as "npm install express", "git commit -m 'fix'", "sudo apt-get update", "ls -la /tmp", SQL queries, "git is great", "Mr. Jones arrived at 5 p.m. today.", URLs, emails, prices and emoji.

As a user, the worst problem was that shell commands and SQL were treated as plain words or sentences. Selecting "npm install express" offered Define, and a SQL query got prose chips instead of the code ones. A short sentence with "Mr." and "p.m." was offered paragraph chips.

Fixed: classifySelection now treats SQL statements and lines that start with a known tool plus a flag, path or subcommand as code. Common abbreviations no longer count as sentence ends. Tests added in test/browser.test.js.

Left for later: a lone "x = 5" is still a word. Spanish questions starting with "¿" count as a word when short. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — writing tools, fix grammar (second pass)

Tried 23 texts such as "Dear Sam, I hope your well.", "They're going to there house", "Ill be there at 5 and im bringing cake", "Wich one is better?", "lol thx 4 the help", "I recieved the package" and "He dont know".

As a user, the worst problems were wrong edits on good text. A name like Sam was changed to SAM and later to something else. "im bringing cake" lost its "am" because the checker offered the single letter "i". "They're going to there house" cycled through 40 changes before it stopped.

Fixed: fixGrammar tries each span once, skips turning a capitalized word into all caps, and skips cutting a word to one letter. Test added in test/modes.test.js and checked to fail before the change.

Left for later: the first suggestion is sometimes wrong ("Wich" becomes "Wish", "adress" becomes "a dress", "untill" becomes "distill", "thx" becomes "the"). "your welcome" and "Ill" are not flagged. These need a better way to pick among suggestions. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — follow-up conversations (second pass)

Tried 17 typed messages inside a bubble thread, such as "thanks", "help", "ok", "yes", "date", "2+2", "what is 15% of 80", "shorter", "explain more" and "cheers", with and without a selection as context.

As a user, the worst problem was that typing "help" or "help me!" after an answer returned the list of Loon features instead of helping with the conversation. With a selection every message correctly went to the model with the thread.

Fixed: a bare "help" or "help me" only gets the feature list on the first turn of a thread. Later it goes to the model with the history. "what can you do" still shows the list. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "yes" and "no" mid-thread cost a full model call. Time, date, sums and greetings still answer instantly mid-thread, which seems right. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — developer help, JSON to DTO (second pass)

Tried 8 JSON inputs such as keys like "first-name", "created_at", "2fa" and "userId", nested arrays with optional fields, mixed types, nulls only, empty arrays, empty objects and large ids, as Java and TypeScript.

As a user, the worst problem was that a Java DTO from an API response with snake_case keys had no way to bind them. `created_at` became `createdAt` with plain getters, so in Spring Boot the field would stay null with no error. The same went for `userId`, whose getter is `getUserID`.

Fixed: when any key is not a plain lowercase word, Java output uses Jackson `@JsonProperty` names and the generated Converter class is dropped. Simple keys still give the short plain classes. Test added in test/modes.test.js and checked to fail before the change.

Left for later: the `// Address.java` separators stay between classes, "2fa" becomes `the2Fa`, and mixed-type arrays give an odd class in Java. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — page kinds (second pass)

Tried 19 pages such as a look-alike host (chase.com.evil.com), citibank.com, wellsfargo.com.au, a checkout with a card field, an uppercase password type, and login forms that hide the password behind a text input with autocomplete hints.

As a user, the worst problem was that Loon did not look away on a login form whose password box is a plain text input marked `current-password` or `one-time-code`, and on citibank.com. The look-alike host was correctly not treated as the bank.

Fixed: password detection also matches `type="PASSWORD"`, `autocomplete=*-password` and `one-time-code`, and a few more banks are on the sensitive list. Test added in test/browser.test.js and checked to fail before the change.

Left for later: country variants such as wellsfargo.com.au and login.gov.uk are still not on the list, and non-English menus stay "other". The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — CI repair, sign-up pages were treated as private

CI on the PR failed four screen-control checks because the Tea Club sign-up fixture was treated as a private page. An earlier change made any `autocomplete="...-password"` field mark the whole page sensitive, which also caught `new-password` on sign-up forms. The page-kind rule now only looks at `current-password` (a login form) next to `type="password"` and one-time codes. A test now keeps sign-up pages non-sensitive.

## 2026-10-28 — translation and definitions (third pass)

Tried 25 dictionary phrasings such as "define: ennui", "define ephemeral please", "ephemeral meaning", "ephemeral definition", "DEFINE Ephemeral!", "what does 'ephemeral' mean in this context" and "what do you mean".

As a user, "define ephemeral please" looked up the term "ephemeral please" and found nothing, and the one-word forms "X meaning" and "X definition" went to the model although WordNet answers them offline.

Fixed: dictionaryTerm in brain/define.js now drops a trailing "please", "pls" or "for me", accepts "define:" with a colon, and matches "X meaning" and "X definition". Pronoun forms such as "this meaning" still go to the model. Test added in test/brain.test.js.

Left for later: "pls define X" with a leading polite word, "what does X mean in english" and "synonym for X" still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — settings UI (custom instructions and API settings)

Tried 20 inputs on the Settings validators in plain Node, such as a long "About you" with newlines, a reply language typed as "Español 🇪🇸", "pt-BR", "Brazilian   Portuguese", non-string values, model names with spaces or a leading dash, and custom base URLs with and without a scheme.

As a user, typing a region code like "pt-BR" in the reply language box saved "ptBR", and an emoji after the language left a trailing space so the prompt read "Reply in Español .".

Fixed: cleanPersonal in brain/personal.js now keeps hyphens, collapses spaces and trims the language. Test added in test/personal.test.js.

Left for later: a base URL typed without a scheme such as "localhost:11434/v1" gets an https:// message that does not suggest adding http://. A corrupted settings file with an object in "about" would save "[object Object]". The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — reminders, timers and focus (third pass)

Tried 32 phrasings such as "remind me every day at 9 to take meds", "remind me in half an hour", "remind me on friday", "remindme to call bob", "timer 1h30", "start a 25 minute focus", "focus for an hour" and "cancel my timer". I also ran the recurring ones through the routine parser.

As a user, recurring reminders are handled well by routines, so the earlier worry about "every day" was already solved. The annoyances were that "remind me on friday" made a reminder titled "on friday", and that "start a 25 minute focus" and "focus for an hour" did nothing.

Fixed in parseCommand. A reminder with a time but no task is titled "Reminder", and focus accepts the length before the word or "an hour". Test added in test/assistant.test.js.

Left for later. "remindme to…", "timer 1h30", "set timer 5" and "cancel my timer" are not matched. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-28 — memory and privacy, redaction (third pass)

Tried 31 snippets such as "password: 'my secret phrase'", "my password is: hunter2", "pw: hunter22", "pin 4829", "cvv 123", "Cookie: sessionid=…", "passport number: X1234567" and "enter your password to continue".

As a user, the worst problem was that a quoted password with spaces went through whole, because the value stopped at the first space. "password is: x", "pw: x" and a PIN or CVV typed without a colon were also left in place, and so was a session cookie value.

Fixed: the password, PIN and CVV rule now reads quoted values with spaces, accepts "is:" and "pw", and a second rule covers "pin 4829" and "cvv 123". The secret-name rule also knows sessionid. Test added in test/browser.test.js. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

Left for later: a bare nine digit SSN, SSNs with spaces, "token: abc" and other short values, Set-Cookie with "session=", bank account and routing numbers, and passport numbers are still not redacted.

## 2026-10-28 — food and menu (third pass)

Tried a 16 line menu with "Soup $6 | Bowl $8", a veggie burger, a hamburger, pound and euro prices, "Chicken-free Pad Thai", "MP" prices and a price with a note after it.

As a user, the worst problems were that the Veggie Burger was left out of the vegetarian picks because "burger" counts as meat, that a euro or pound price was shown with a dollar sign, and that "Soup $6 | Bowl $8" became one dish named "Soup | Bowl $8".

Fixed: meat-free qualifiers such as veggie, vegan, plant-based and meatless before burger, sausage and similar words no longer count as meat. Menu items keep their currency sign and the recommendation shows it. A line with two prices names the dish from the text before the first price. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Soup $6 | Bowl $8" should really be two dishes, "Margherita 12 / 16" is dropped, and "MP" lines are taken as the description of the dish above. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — shopping and unit price (third pass)

Tried 37 size strings and 13 price strings such as "1/2 gallon", "12 cans x 12 fl oz", "12-ct", "Pack of 12, 8 oz each", "2.5 kg / 5.5 lb", "5 for $10", "Save $5 $20" and "From $9.99".

As a user, the worst problems were wrong numbers stated with confidence. "1/2 gallon" was read as 2 gallons, so a half gallon looked four times bigger and won the unit price ranking. "12 cans x 12 fl oz" ignored the 12 cans. "12-ct" was not read. "5 for $10" was priced at $5 instead of $2 each.

Fixed: parseQuantity reads simple fractions before a unit, a count noun before the x in a multipack, and a hyphen in "12-ct". parsePrice divides "N for $P". Test added in test/modes.test.js.

Left for later: "1 dozen", "half gallon", "Set of 4" and "100 sheets" are not parsed. "Save $5 $20" takes the saving, "$5.00 - $7.00" takes the low end, and Indian lakh grouping ("₹1,29,999") reads as 1.29. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — developer help, error table (third pass)

Tried 30 pasted errors such as segfaults, Rust borrow errors, React key and hydration warnings, ClassCastException, UnicodeDecodeError, "x is not iterable", EMFILE, ENOSPC, certificate failures, ERESOLVE, rejected git pushes and "cannot find symbol".

As a user, the errors I hit most in a normal week still waited on the language model. An npm ERESOLVE wall of text, a full disk and a rejected push are all quick lookups.

Fixed: added table entries for ERESOLVE, disk full, too many open files, segmentation fault, untrusted certificates, rejected git push and Java "cannot find symbol". Test added in test/modes.test.js and checked to fail before the change.

Left for later: Rust borrow errors, React key and hydration warnings, ClassCastException, UnicodeDecodeError and "x is not iterable" still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — onboarding and style feedback (second pass)

Tried 15 allergy answers such as "no allergies", "I have no allergies", "nothing really", "not that I know of", "rock and roll", "R&B, jazz" and a list of eight items, plus 25 style feedback phrases such as "make it longer", "be casual", "less detail", "answer in more detail" and "explain like I'm five".

As a user, the worst problem was that a natural "no" answer to the allergy question saved a pinned fact such as "I'm allergic to no allergies" or "I'm allergic to not that I know of". That fact goes to the model with every food question. Telling Loon "make it longer", "answer in more detail" or "be casual" did nothing and went to the model as a normal question.

Fixed: the no-answer check in brain/personal.js now accepts the longer phrasings, and the feedback rules accept "make it longer", "answer in more detail" and plain "be casual". Tests added in test/conversations.test.js and test/personal.test.js and checked to fail before the change.

Left for later: "rock and roll" and "R&B, jazz" style names still split on "and". A list of more than six items is cut silently. "less detail", "respond in hinglish" and "explain like I'm five" are not understood as style feedback. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — typed questions, math in words

Tried 39 inputs such as "15 percent of 80", "what's 8 times 9", "100 minus 37", "100 divided by 4", "what is 2 to the power of 10", "what's 7 squared", "how many cups in a gallon", "tip on 45 at 18%" and "20% off 80".

As a user, the worst problem was that people type and say math in words. "What's 8 times 9" and "15 percent of 80" went to the language model, which is slower and can get arithmetic wrong.

Fixed: calc now reads percent, times, plus, minus, divided by, to the power of and squared between numbers. Cases added in test/brain.test.js. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

Left for later: "how many cups in a gallon" and "how many ounces in a pound" are not parsed, "3 ft 2 in to cm" is not supported, and sqrt, "half of 50", "20% off 80", tip questions and "$20 - $5.50" with currency signs still go to the model.

## 2026-10-29 — routines (third pass)

Tried 29 routine phrasings such as "every weekday at 8:30am open github", "remind me every monday to water plants", "every 30 minutes remind me to stand", "on the 15th of every month remind me to pay bills", "twice a day remind me to drink water", "every day at 9am and 5pm remind me to stretch" and "every last friday remind me to x".

As a user, most phrasings gave the right card. The worst problem was "every day at 9am and 5pm remind me to stretch". The card showed a daily 9:00 AM routine with the message "5pm remind me to stretch", so the 5pm run was silently lost and the text was garbled.

Fixed: parseSchedule now refuses a schedule with a second time of day, so the card asks for the missing piece instead of showing a wrong one. Test added in test/routines.test.js and checked to fail before the change.

Left for later: a routine holds one time of day, so "twice a day" and "9am and 5pm" need either two routines or multi-time support. "every last friday" is not understood. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — writing tools by voice

Tried 36 spoken edit phrasings such as "make this a bit shorter", "tighten this up", "make it sound professional", "rewrite this more professionally", "fix the grammar", "proofread this", "rephrase this", "say this differently", "make it concise" and "fix typos".

As a user, the worst problem was that Fix grammar exists as a chip but could not be asked for by voice. "Fix the grammar" and "proofread this" went to the model as plain questions with no selection attached. Small variations of the edits that did work ("a bit shorter", "sound professional", "more professionally") missed their templates for the same reason.

Fixed: new voice templates send grammar, spelling and proofread requests to the fix grammar task, and the shorter, rewrite and professional templates accept the common variations. Test added in test/voice.test.js.

Left for later: "eli5", "tl;dr", "give me examples", "make this longer", "make this more polite" and "less formal" have no task behind them, so they still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — page kinds (third pass)

Tried 26 hosts such as wellsfargo.com.au, chase.co.uk, hsbc.co.uk, barclays.com, login.gov.uk, medicare.gov, rabobank.nl, hdfcbank.com, signin.aws.amazon.com, a look-alike (bankofamerica.com.evil.com) and github.com/login.

As a user, the worst problem was that the cat did not look away on the country sites of banks it already knew. wellsfargo.com.au, chase.co.uk, hsbc.co.uk and barclays.com were all treated as ordinary pages. The same went for medicare.gov and a few Google and AWS sign-in hosts.

Fixed: a brand pattern now matches the big banks and payment sites with any two or three letter country suffix, and a few more sensitive hosts are on the list. The look-alike host still does not match. Test added in test/browser.test.js and checked to fail before the change.

Left for later: smaller national banks outside the list stay "other" unless they show a password field, and a plain page on github.com/login is classed as code, which is fine while the password field makes it private. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — selection chips and classification (third pass)

Tried 42 selections such as "ephemeral", "x = 5", "¿Cómo estás?", URLs, emails, prices, emoji, JSON, stack frames, Windows paths, CJK and Korean sentences, quoted text, SQL, shell commands and one-line imports.

As a user, the worst problem was that a selected "import React from "react"" got sentence chips and "#include <stdio.h>" got word chips. One-line imports have too few symbols to pass the code density check.

Fixed: classifySelection now treats one-line import, include, using and package statements as code. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a lone "x = 5" and "x => x*2" are still words, a bare stack frame line such as "at Object.<anonymous> (/a/b.js:1:1)" is a word, and URLs, emails and Windows paths get word chips with no link or copy action.

## 2026-10-29 — history (third pass)

Tried 22 phrasings such as "what was my last question", "show me my history", "what have I asked", "recent searches", "my recent questions", "what did I ask earlier about spring boot" and "what did I ask about".

As a user, the worst problem was that several natural ways to ask for recent history were not understood and went to the language model, which cannot see my history. "what did I ask earlier about spring boot" also searched for "about spring boot", and a bare "what did I ask about" searched for the word "about".

Fixed: more recent-history phrasings now open the history list, and a leading "about" or "on" is dropped from the search words. Tests added in test/assistant.test.js.

Left for later: "clear my history" and "wipe history" are still not spoken commands, since deleting needs a confirm card. "what did we talk about" is not matched.

## 2026-10-29 — memory commands (second pass)

Tried 32 phrasings such as "remember to buy milk", "remember to", "remember me", "remember my wifi password is hunter2", "clear your memory", "delete my memories", "wipe memory" and "don't forget I'm vegan".

As a user, the worst problem was that "remember my wifi password is hunter2" saved the password as a memory, and memories go into later prompts. "remember to" and "remember me" saved a fact called "to" or "me". "clear your memory" and "delete my memories" went to the language model, which may say it cleared them when it did nothing.

Fixed: the remember action refuses text the redactor flags as a secret. "remember to buy milk" becomes a reminder. Bare "remember to", "remember me" and "remember:" save nothing. "clear your memory", "delete my memories" and "wipe memory" now point to Settings → Memory, like "forget everything". Tests added in test/assistant.test.js.

Left for later: "don't forget I'm vegan", "I'm vegetarian, remember that", "call me Sam" and "what did I tell you about food" are not parsed and go to the model, which may claim it saved something. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — settings UI (second pass)

Tried 18 inputs on the Settings validators in plain Node, such as base URLs typed as "localhost:11434/v1", "127.0.0.1:1234", "openrouter.ai/api/v1", "[::1]" with a port and "localhost.evil.com", plus damaged settings values (an object or array in "about", an object in the reply language, control characters).

As a user, pasting "localhost:11434/v1" for a local model server was rejected with a message about https, and "127.0.0.1:1234" said the URL did not look right. Both are the most common way to type a local address. A damaged settings file turned an object into "[object Object]" in the prompt, and an object in the language box saved "object Object".

Fixed: checkBaseUrl in brain/api-provider.js now assumes http for this Mac and https for any other host when no scheme is typed. cleanPersonal in brain/personal.js keeps only strings. Tests added in test/api-provider.test.js and test/personal.test.js.

Left for later: a base URL with a query string such as "?key=abc" is accepted and the key would sit in a stored setting outside the key store. Control characters and bidi marks in "About you" are kept. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-29 — translation and definitions (fourth pass)

Tried 30 dictionary phrasings such as "pls define ephemeral", "could you define ephemeral", "hey loon define ennui", "whats ephemeral mean", "what does ephemeral mean in english", "define ephemeral 🤔", "definition: ephemeral" and "ephemeral means?".

As a user, a polite opener, a greeting, an emoji or an "in english" tail made the instant WordNet lookup miss, so a one-word question went to the language model.

Fixed: dictionaryTerm in brain/define.js now drops leading "please", "pls", "can you", "hey loon" and similar, trailing emoji and tails such as "in english", "exactly" and "lol". It also accepts "whats X mean", "X means" and "definition:". Pronoun forms such as "what does it mean" still go to the model. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "what's X" and "what is X" alone are ambiguous with general questions, so they still go to the model. "wat does X mean" with a typo and "synonym for X" are not handled. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — follow-up conversations (third pass)

Tried 60 messages inside and outside a bubble thread, such as "ok thanks", "Thanks, that helps", "hello again", "lol", "half of that", "and 10% of it", "shorter", "tl;dr" and a single emoji.

As a user, the most common annoyance was a thank-you with a small extra word. "ok thanks" or "Thanks, that helps" cost a full model call and came back as a wordy answer, while plain "thanks" got the instant purr.

Fixed: the thanks reply also matches a leading "ok", "great" or "perfect" and trailing "that helps", "so much" or "loon". Thanks followed by a real request ("thanks, now translate it") still goes to the model. Tests added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "yes", "no" and "lol" mid-thread still cost a model call. "half of that" and "and 10% of it" need the previous number, so they go to the model, which is right but means arithmetic on an earlier answer is not done by code. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — developer help, JSON to DTO (third pass)

Tried 10 JSON inputs as Java and TypeScript, such as plain objects, nested objects, empty arrays and objects, trailing commas, single quotes, reserved words like "class" and "new", dates, nulls and arrays of differing objects.

As a user, the worst problem was that JSON copied from JavaScript code with a trailing comma (`{"a": 1,}`) was refused as "not valid JSON". That is a common shape when copying from a config file or a log line. Reserved words and dates already came out fine.

Fixed: a shared `parseJson` in brain/devtools.js strips the code fence and retries once without trailing commas. Both the validity check in skills.js and jsonToDto use it. Test added in test/modes.test.js and checked to fail before the change.

Left for later: single quoted keys and unquoted keys (JS object literals) are still refused. A null-only field becomes `Object`, "2fa" becomes `the2Fa`, and arrays of differing objects give an odd class. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — reminders, timers and focus (fourth pass)

Tried 31 phrasings such as "timer 1h30", "set a timer for 5", "set timer 5", "remindme to call bob", "remind me to pay rent on the 1st", "remind me in 10 to check oven", calendar bookings with a weekday and time, and shouted text like "REMIND ME TO CALL BOB AT 5".

As a user, the worst problem was "remind me to pay rent on the 1st". The date was not read, so I got a reminder with no time and "on the 1st" stuck in the title. Timers with a bare number or "1h30" matched nothing and went to the model, which cannot start a timer.

Fixed: extractWhen now reads "on the 1st" and "the 15th" as the next such day, and timers read "1h30" and a bare number as minutes. The confirm card still shows the exact time. Tests added in test/assistant.test.js.

Left for later. "remindme to…", "cancel my timer" and "remind me in 10 to check oven" (a bare number with no unit) are not handled. A date with no time of day lands at noon. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — food and menu (fourth pass)

Tried 40 menu lines such as "Egg-free Mayo Wrap $9", "Gluten-free Pasta $14", "Chicken-free Pad Thai $12", "Margherita Pizza $14 (V)", "Caesar Salad $9.50 GF", wing sizes with two prices and a full 20 dish menu for the three goals.

As a user, the worst problem was that any dish with "-free" in its name was thrown away as a promo, so "Gluten-free Pasta $14" never showed up. "Chicken-free Pad Thai" also counted as meat. Notes after the price left a double space in the dish name.

Fixed: "free" only counts as a promo when it is not part of a "-free" word, "-free" words no longer count as meat, and extra spaces in dish names are collapsed. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "(V)" and "VEGAN" tags are kept in the name but not used to judge vegetarian. Prices written as a bare whole number ("Burger — 13") and "Fish & Chips 12.5" are not read. "Wings 6pc $8 | 12pc $14" is one dish. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — memory and privacy, redaction (fourth pass)

Tried 32 snippets such as "SSN 123 45 6789", "ssn: 123456789", "Set-Cookie: session=…", "my api key is …", "token: abc", "routing number …", "mot de passe: …", "password: p@ss word" and ordinary sentences like "the password must be at least 8 characters".

As a user, the worst problem was a labelled SSN being sent to the model when it was typed with spaces or without dashes, and a session cookie named `session` or a spoken "my api key is …" passing through untouched.

Fixed: labelled SSNs ("ssn", "social security number") are redacted in any digit grouping, "api key is/: X" is redacted, and every name=value pair in a Cookie or Set-Cookie header is redacted while attributes like Path stay. Test added in test/browser.test.js. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

Left for later: a bare nine digit number with no label, bank account and routing numbers, passport numbers, passwords labelled in other languages ("mot de passe", "contraseña"), unquoted passwords with spaces (the part after the first space leaks), and one time codes.

## 2026-10-30 — writing tools by voice (second pass)

Tried 42 spoken phrasings such as "fix my grammar", "check my spelling", "proofread", "summarize this for me", "sum this up", "give me examples", "rewrite this warmer", "make it short", "make it more polite" and "tldr this".

As a user, the worst problem was that natural short forms of tasks Loon already has went to the model as plain questions with no selection attached. "Fix my grammar" and "proofread" did nothing useful, and "give me examples" had a chip but no voice route.

Fixed: the voice templates now accept "my" grammar and spelling, a bare "proofread", "sum this up" and "for me" tails, "rewrite this warmer", "make it short" and "give me examples". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "make this longer", "more polite", "less formal", "eli5" and "tl;dr" have no task behind them. "Translate this to Spanish" only has an English target. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — typed questions and instant answers (third pass)

Tried 42 typed questions such as "what year is it", "what month is it", "what day is tomorrow", "what's the day", "current date", "thanks 🙏", "what time is it? 🕐", "bye", "good night", "what's your name" and "what time is it in tokyo".

As a user, the worst problem was date questions going to the language model. A model cannot know today's date, so "what year is it" or "what day is tomorrow" could come back stale or invented. A trailing emoji also broke the instant answers for thanks and the time.

Fixed: year, month, tomorrow, yesterday, "what's the day", "current date" and "what is today" are now answered by code. Trailing emoji are ignored when matching instant answers. Test added in test/brain.test.js and checked to fail before the change.

Left for later: time in another city ("what time is it in tokyo") goes to the model, which cannot know it, and needs a timezone lookup in code. "bye", "good night", "what's your name", "who made you" and "how do i use loon" still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — shopping and unit price (fourth pass)

Tried 27 size strings and 13 price strings such as "1 dozen", "half gallon", "Set of 4", "100 sheets", "500 gr", "Pack of 3 (6 oz each)", "₹1,29,999", "$.99" and "$5.00 - $7.00".

As a user, the worst problem was a price off by a factor of 100000. "₹1,29,999" read as 1.29, so a laptop looked almost free and won every ranking. "$.99" read as 99. "1 dozen" and "half gallon" were not read, so those products dropped out of the unit price ranking.

Fixed: parsePrice removes Indian grouping commas and reads a bare ".99". parseQuantity reads dozen, "a dozen", "half dozen" and "half gallon" style sizes. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Set of 4", "100 sheets", "$5.00 - $7.00" (takes the low end) and "Save $5 $20" are still not handled. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — routines (fourth pass)

Tried 27 routine phrasings, including "every mon wed fri at 7am remind me to run", "every day at 7.30pm remind me to read", "every other day remind me to floss", "every month on the 1st", "every day at noon", emoji messages, and Spanish.

As a user, two things were wrong. "every mon wed fri" kept only Monday and turned the rest into the reminder text. "7.30pm" was read as 7:00 with ".30pm" in the message.

Fixed: day lists may be separated by spaces, and a dotted time before am/pm is read as a colon time. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "0730" style times, "mornings at 7", and non-English routines are not understood. The 3 WordNet and demo failures in `npm test` are the usual sandbox ones.

## 2026-10-30 — developer help, error table (fourth pass)

Tried 40 error lines such as "Cannot read property 'length' of undefined", "Module not found: Can't resolve 'react'", "java.net.BindException: Address already in use", "Port 8080 was already in use", ClassCastException, Rust borrow errors, Go nil pointer panics, TypeScript TS2345, Docker daemon errors and 502 and 504 responses.

As a user, the worst problem was the old Node wording "Cannot read property 'x' of undefined", still very common in logs, missing the table and going to the model. Webpack "Can't resolve" errors and Spring Boot "port already in use" messages also missed. The table also held a second npm conflict entry that could never match.

Fixed: the read and set property entries accept the quoted property name, the module entry accepts webpack's wording, and the port entry accepts BindException and Spring Boot messages. The dead duplicate npm entry is removed. Test added in test/modes.test.js and checked to fail before the change.

Left for later: ClassCastException, ImportError, AttributeError for types other than NoneType, Rust, Go and TypeScript errors, Docker daemon errors, SQL constraint errors, and 502 and 504 responses are not in the table. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — onboarding and style feedback (third pass)

Tried 32 style feedback phrases such as "less detail", "stop being so wordy", "answers too long", "stop the emojis", "no emoji please 🙏", "you're too chatty", "go back to english" and "respond in hinglish", plus 20 "remember this" statements.

As a user, the worst problem was that common ways of asking for shorter answers did nothing and went to the model as a normal question. "less detail", "stop being so wordy", "answers too long" and "you're too chatty" all missed. "stop the emojis" missed, and so did any emoji request that ended with an emoji character. "go back to english" did not undo a reply language.

Fixed: the feedback rules in brain/personal.js now accept these phrasings, and emoji characters are ignored while matching. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "im vegetarian" without the apostrophe is saved as "Im vegetarian". "I have a peanut allergy", "I'm on a keto diet" and "I'm trying to lose weight" are not offered as memories. "respond in hinglish", "explain like I'm five" and "keep it simple" are not understood as style feedback. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-30 — voice intents (third pass)

Tried 47 spoken phrasings such as "turn focus off", "turn on private mode", "go private", "what's the cheapest", "uh yes", "yeah sure", "um, make this shorter please", "tl;dr", "eli5" and "what does serendipity mean".

As a user, the worst problem was that "turn focus off" went to the model while "stop focus mode" worked. The same happened with "private mode". A filler like "um," or "uh" in front of a command or a yes also broke the match, and "what's the cheapest" missed the shopping answer.

Fixed: leading fillers are dropped, "turn focus off" and "private mode" on and off are accepted, "go private" turns privacy on, "what's the cheapest" routes to the value answer and "yeah sure" counts as a yes. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "tl;dr", "eli5", "explain this page", "what does X mean" and "translate this to french" still go to the model. "do not disturb" and "quiet mode" are not mapped to focus. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — selection chips and classification (fourth pass)

Tried 32 selections such as a bare "Error: ENOENT…" line, prose that starts with "select", "x => x * 2", Windows and Unix paths, bullet lists, "Dr. Smith…" sentences, "5 p.m." and "U.S." sentences, SQL, shell commands and a Rust one-liner.

As a user, the worst problem was that a plain sentence like "select a nice option from the list below please" got code chips, because the SQL rule matched any text starting with "select" and containing "from". A plain "Error: ENOENT: no such file or directory" line only got sentence chips, so no error help was offered.

Fixed: the SQL rule now needs a column list (a star or comma separated names) between select and from. A line starting with "Error:" or "Exception:" now counts as an error. Tests added in test/browser.test.js and checked to fail before the change.

Left for later: "fn main() { println!(…) }" and "x => x * 2" are called sentences, "Segmentation fault" and "npm ERR! code ELIFECYCLE" get sentence chips, and a bullet list of four short items is a sentence. A one-column "select name from users" still counts as SQL, which is fine. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — memory commands (third pass)

Tried 22 phrasings such as "don't forget I'm vegan", "I'm vegetarian, remember that", "keep in mind I'm allergic to nuts", "remember this: I prefer short answers", "dont forget that i like oat milk" and "forget that I said vegan".

As a user, the worst problem was that the most natural ways to ask Loon to remember a fact fell to the language model, which may say it saved something when it did not. "remember this: X" also saved the text "this: X".

Fixed: "don't forget X", "keep in mind X", "X, remember that" and "remember this: X" now save the fact. "don't forget to call mom at 5" becomes a reminder, and a bare "don't forget" saves nothing. Test added in test/assistant.test.js.

Left for later: "call me Sam", "my name is Sam", "you should know I'm vegan" and "what did I tell you about food" still go to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — typed questions, money and "how many" conversions

Tried 46 inputs such as "15% of $80", "$45 * 1.08", "20% off 80", "tip on 45 at 18%", "how many cups in a gallon", "how many oz in a lb", "what's 3 cubed", "sqrt(16)", "half of 50", "5'10 in cm" and "100 km/h in mph".

As a user, the worst problem was that anything with a price went to the language model. A currency symbol broke "15% of $80" and "$45 * 1.08", which are the most common sums while shopping. "20% off 80" and "how many cups in a gallon" were missed too.

Fixed: calc ignores a currency symbol while calculating and puts it back on the answer with two decimals, answers "N% off M", and reads "how many X in a Y". Cases added in test/brain.test.js and checked to fail before the change.

Left for later: "tip on 45 at 18%", "what's 3 cubed", "sqrt(16)", "half of 50", "7 mod 3", "5'10 in cm" and speed units are not parsed. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — page kinds (fourth pass)

Tried 27 hosts such as mail.proton.me, app.hey.com, icloud.com/mail, tiaa.org, ameriprise.com, login.yahoo.com, dashboard.stripe.com, nerdwallet.com, gist.github.com and docs.google.com, plus a few small pages with prices, menu words and many form fields.

As a user, the worst problem was that the cat did not look away on retirement and brokerage sites like tiaa.org and ameriprise.com, on Yahoo sign-in and on the Stripe dashboard. Proton Mail and HEY were also treated as ordinary pages, so I got no email actions there.

Fixed: those hosts are now on the sensitive list, and Proton, HEY, AOL and Zoho mail are on the email list. Test added in test/browser.test.js and checked to fail before the change.

Left for later: iCloud Mail lives at icloud.com/mail, so it needs a path check. Small national banks outside the list still rely on a password field. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — translation and definitions (fifth pass)

Tried 33 dictionary and translation phrasings such as "wat does ephemeral mean", "whats the meaning of ennui", "what does ephemeral even mean", "what does ephemeral mean again", "what does ephemeral mean thanks", "translate this to spanish" and "translate hello to spanish".

As a user, small typos and filler words in a dictionary question made the instant WordNet lookup miss, so a one-word question went to the language model. "what does ephemeral even mean" was read as the two word term "ephemeral even".

Fixed: dictionaryTerm in brain/define.js accepts "wat", "wut" and "whats the meaning of", drops "even", "actually", "really" and "exactly" before "mean", and drops "again", "thanks", "thx", "btw" and "tho" at the end. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "translate this to spanish" and "translate hello to spanish" still go to the model, since the translate task only targets English. "synonym for X", "opposite of X" and "what does X stand for" are not handled. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — writing tools by voice (third pass)

Tried 40 spoken edit phrasings such as "make it way shorter", "cut this down", "make it more polite", "rewrite this to be more polite", "rewrite it in a friendlier tone", "proofread this for me", "check this for typos", "make this longer" and "eli5".

As a user, ordinary variations of the edit commands missed the templates and went to the language model as a question, so nothing was offered to replace my selection. "proofread this for me" and "make it way shorter" were the most annoying.

Fixed: the shorter, professional, warmer and fix grammar templates in brain/intents.js accept "way" and "much", "cut this down", "polite", "friendly", "in a friendlier tone", "proofread this for me" and "check this for typos". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "make this longer", "expand this", "make it more casual", "make this clearer", "improve this", "polish this", "reply to this" and "eli5" still go to the model because there is no task for them. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — history (fourth pass)

Tried 25 phrasings such as "what did I ask", "what have I asked you", "what's my history", "what are my recent questions", "recent history", "what did we talk about yesterday", "find my question about redis" and "show me what I looked up".

As a user, the worst problem was that the plainest forms, "what did I ask" and "what have I asked you", were not understood and went to the language model, which cannot see my history. "find my question about redis" searched my files instead of my history.

Fixed: those forms and "what's my history", "what did we talk about" now open the recent history list, and "find my question/search about X" searches the history. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "show me what I looked up" is still not matched, and "remind me what I asked" becomes a reminder. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — reminders, timers and focus (fourth pass)

Tried 40 phrasings such as "wake me up at 6:45 tomorrow", "set a timer for 1 hour 30 minutes", "10 minute timer", "set a 5 minute timer for tea", "remind me next friday about the dentist", "reminder: dentist friday 2pm", "focus mode", "snooze 10 minutes" and "remind me end of day to submit report".

As a user, the worst problem was a wrong time stated with confidence. "Wake me up at 6:45 tomorrow" made a reminder for 6:45 PM, because the rule that reads a bare small hour as the afternoon also applied to alarms. A labeled timer such as "set a 5 minute timer for tea" was not understood, and "remind me next friday about the dentist" got the title "about the dentist".

Fixed: alarms and "wake me" no longer move a bare hour to the afternoon, a timer can carry a "for …" label that shows in the reminder title, and a leading "about" is dropped from reminder titles. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "end of day" is not a time and stays in the title with no time set. "snooze 10 minutes", "cancel my timer", "focus mode" and a bare "set a timer" are not matched. "Every day" in a one-time reminder is still not flagged. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — settings UI (third pass)

Tried 11 base URLs on the custom provider check in plain Node, such as a query string with a key, a fragment, a bare "?", a trailing slash, a full chat completions path, an upper case scheme, a private network address, an IPv6 localhost and a bad port.

As a user, pasting a URL like "https://x.ai/v1?key=abc" was accepted. The key would sit in a stored setting outside the key store, and requests append paths after the base, so the call would also break in a confusing way.

Fixed: checkBaseUrl in brain/api-provider.js now rejects anything after a "?" or "#" and says to use the key field. Test added in test/api-provider.test.js and checked to fail before the change.

Left for later: a pasted full endpoint such as ".../v1/chat/completions" is kept as the base, so requests go to a doubled path. A private network address like 192.168.1.5 is refused with the https message, which is correct but does not say why. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — onboarding and style feedback (second pass)

Tried 28 style feedback phrases and 8 allergy and interest answers, including "speak french", "stop being so formal", "respond in hinglish", "rock and roll", "R&B, hip-hop", "none" and a name with HTML tags.

As a user, "speak french" and "stop being so formal" did nothing and went to the model as a normal question. The list answers held up, since "rock and roll" is joined back together when saved.

Fixed: parseFeedback accepts "speak <language>" and "stop being (so) formal, serious or stiff". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "Call me" names keep the letters of HTML tags ("José <b>María</b>" becomes "José bMaríab"). "simpler words", "less jargon", "be nicer" and "respond in hinglish" have no setting to map to. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — developer help, JSON to DTO (fourth pass)

Tried 15 inputs such as JS object literals with single quotes and bare keys, comments, a string that contains ",}", a fenced block, NaN, two JSON documents on separate lines, an empty array, an empty object and text around the JSON.

As a user, the worst problem was that an object copied from JavaScript source (`{name: 'Ann', age: 3}`) was refused as "not valid JSON". That is what most code snippets look like.

Fixed: the retry in `parseJson` now rewrites single quotes, bare keys, comments and trailing commas outside of strings. It replaces the old comma regex, which could also have changed a string such as "a,}". The old test that expected single quotes to be rejected now checks a truly broken input, and a new test covers the literal case.

Left for later: JSON lines (one object per line), NaN, Python-style True/None, and JSON with text around it are still refused. A null-only field becomes `Object`. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-10-31 — developer help, error table (fifth pass)

Tried 38 pasted errors such as Python ImportError and ValueError, Rust "borrow of moved value", Go nil pointer panics, TypeScript TS2345, a Docker daemon error, Node "heap out of memory", ClassCastException, 502 and 504 responses, React key and hydration warnings and SQL duplicate key errors.

As a user, the common production errors were still going to the model. The Node heap out of memory crash, a 502 or 504 from a proxy, "Cannot connect to the Docker daemon", Java ClassCastException, Go nil pointer panics and the Rust moved value error all missed the table, so a simple lookup cost a model call.

Fixed: added seven table entries for these. The 502 and 504 entries skip line numbers like the other status codes. Tests added in test/modes.test.js.

Left for later: TypeScript errors, AttributeError for types other than NoneType, "TypeError: 'int' object is not subscriptable", React key and hydration warnings, SQL constraint errors, NoSuchMethodError and UnsupportedClassVersionError are still not in the table. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — memory and privacy, redaction (fifth pass)

Tried 26 snippets such as "routing number 021000021", "account #: 00123456789", "passport no. X1234567", "my verification code is 482913", "your OTP: 554433", "mot de passe: …", "contraseña: …", "Passwort: …", a quoted DB_PASSWORD with spaces and ordinary sentences about accounts and passports.

As a user, labelled bank, routing and passport numbers and one-time codes went to the model untouched, and so did a password labelled in French, Spanish or German.

Fixed: a new rule redacts a value that has a digit after labels such as account, routing, sort code, passport, verification code and OTP. The password rule also knows mot de passe, mdp, contraseña, clave, passwort and kennwort. Test added in test/browser.test.js and checked to fail before the change.

Left for later: three digit codes in groups ("2FA code 123 456"), recovery codes without digits, `DB_PASSWORD="correct horse"` (quoted with spaces), bare "token: abc" and "bearer token eyJ…" without the word Bearer in front. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — food and menu (fifth pass)

Tried three menus with 30 lines such as "Side salad $4.5", "Cheese pizza $9.5 (vegetarian)", "Tofu Stir-fry — $13", "Veg Burger $12", dot leaders, a euro price with a comma, kids items and tax and tip lines.

As a user, the worst problem was a one-digit cent price. "Side salad $4.5" became a dish called "Side salad .5" at $4.00, so the price and the name were both wrong. "Veg Burger" counted as meat and could be shown with protein from the next line. An em dash before the price stayed in the dish name.

Fixed: prices accept one or two decimals, em dashes are trimmed from names, and "veg" counts as a meat-free word like "veggie". Test added in test/modes.test.js and checked to fail before the change.

Left for later: a bare whole number price ("Soup of the Day 6") is still ignored, and the dish line is then used as the description of the dish above it, which can give a wrong protein. A range such as "$11 - 14" keeps the dash in the name. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — follow-up conversations (fourth pass)

Tried 30 short messages typed mid-thread or alone, such as "thanks a ton", "tysm", "got it thanks", "many thanks", "thanks again", "hi again", "ok", "yes", "lol", "perfect", "good night" and "what time is it in tokyo".

As a user, the annoying part was that ordinary ways of saying thanks still cost a full model call and came back wordy, while "thanks" got the instant purr. "tysm", "thanks a ton", "got it thanks" and "hi again" were the common ones.

Fixed: the thanks reply now also matches "tysm", "many thanks", "a ton", "again", "kindly", "mate" and a leading "got it", "gotcha" or "makes sense". The greeting also takes "again". Test cases added in test/brain.test.js and checked to fail before the change. One test in test/cli-provider.test.js used "hello again" as a stand-in for a model question, so I changed that input to "tell me a story" and kept the assertion.

Left for later: "ok", "yes", "lol", "gm" and "good night" still go to the model. "what time is it in tokyo" goes to the model, which cannot know the time, so it may guess. "tip on 45 at 18%" and "how many km is 10 miles" are not handled by the calculator. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — routines (fifth pass)

Tried 30 routine phrasings such as "every day at 0:15", "every hour on the hour remind me to drink", "every first monday of the month", "every weekday at 9am and 5pm", "twice a day", "every day except sunday", "every 1st of the month" and "every other friday at 4".

As a user, two things were wrong. "every day at 0:15" was scheduled for 12:15 PM, noon instead of just after midnight. "every hour on the hour remind me to drink" became a plain message reading "The hour remind me to drink".

Fixed: hour 0 is no longer pushed to the afternoon, and "on the hour" is dropped with the interval. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every day except sunday" quietly becomes every day, which is dishonest. "every first monday of the month", "every 1st of the month", "every other friday at 4" and "twice a day" are not understood, though the first three at least show a card to fix. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — shopping and unit price (fifth pass)

Tried 39 size strings and 22 price strings such as "1,000 g", "6x330ml", "12 x 12 fl oz", "Net wt 12 oz", "Pack of 2", "1/2 lb", "CA$ 12.50", "Rs. 1,299", "1 299,00 €" and "Was $20 Now $15".

As a user, the worst problem was a size with a thousands comma. "1,000 g" was read as 1 g, so that product looked a thousand times too expensive per gram and fell to the bottom of the ranking.

Fixed: parseQuantity drops a thousands comma when exactly three digits follow it, and leaves "0,125 l" and "1,5 l" as decimals. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Set of 4", "three pack", "a pound", lengths such as "25 ft", "Save $5 $20" (takes 5) and "$5.00 - $7.00" (takes the low end) are still not handled.

## 2026-11-01 — typed questions, tips and quick maths (fourth pass)

Tried 35 inputs such as "tip on 45 at 18%", "15% tip on $80", "half of 50", "sqrt(16)", "square root of 144", "what's 3 cubed", "7 mod 3", "5'10 in cm", "100 usd to eur" and "1,5 + 2".

As a user, the worst problem was that tip questions, which come up at every restaurant, went to the language model. Roots, "half of" and "cubed" did too.

Fixed: calc answers "tip on N at P%", "P% tip on N" (with the currency symbol kept), "half / a third / a quarter of N", sqrt and "square root of N", and "N cubed". Cases added in test/brain.test.js and checked to fail before the change.

Left for later: "7 mod 3", "5'10 in cm", speed units, "5 factorial", "how many days in a year" and currency conversion (needs live rates, so it should say so). "10 / 0" falls through to the model. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — writing tools by voice (fourth pass)

Tried 41 spoken phrasings on a selection such as "make this less formal", "make it casual", "make this longer", "expand this", "tldr", "tl;dr this", "summarize", "eli5", "translate this to spanish", "draft a reply", "make this clearer" and "improve my writing".

As a user, the plain word "summarize" and "tldr" are what I would say after selecting a paragraph, and both went down the slow question path instead of the summarize task.

Fixed: "summarize", "tldr" and "tl;dr this" now route to the summarize task. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: there is no task for "make it more casual", "make this longer", "make it clearer" or "improve this", so they reach the model as free questions. "Translate this to spanish" ignores the language because the translate task only goes to English. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — voice intents (fourth pass)

Tried 45 spoken phrasings such as "explain this page", "tell me what this page is about", "what's the cheapest one", "which one is cheaper", "eli5", "explain like I'm five", "dumb it down", "do not disturb", "translate this to french" and "what does this word mean".

As a user, the worst problem was that page questions like "explain this page" went to the model, which has no page text unless the page task fetches it. "what's the cheapest one" and "which one is cheaper" also missed the shopping answer. "eli5" and "dumb it down" are common ways to ask for a simpler version and all went to the model.

Fixed: those phrasings now route to the page summary, shopping value and simplify tasks. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "translate this to french" still ends up as a plain question because the translate task only targets English. "do not disturb", "quiet mode" and "stop listening" are not mapped to anything. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — selection chips and classification (fifth pass)

Tried 38 selections such as "Segmentation fault (core dumped)", "npm ERR! code ELIFECYCLE", "bash: foo: command not found", `console.log("hi")`, `print("hello")`, `x => x * 2`, `fn main() { println!("hi"); }`, a bullet list, bare URLs, emails, prices, a shebang script and Japanese and German sentences.

As a user, the worst problem was that a one-line code snippet with three words or fewer got the word chips, so selecting `console.log("hi")` offered Define. Short arrow functions and Rust `fn` lines were called sentences. Common crash lines such as a segfault, an npm error and "command not found" got sentence chips, so no error help was offered.

Fixed: a single line that is a function call, an arrow function or an `fn` definition now counts as code. The npm, segfault and "command not found" lines now count as errors. Tests added in test/browser.test.js and checked to fail before the change.

Left for later: a bullet list of four short items is still a word, a shebang script with two lines is a word, and `mvn clean install` or `cargo run` are words because the shell rule only knows a fixed tool list. The 3 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-01 — translation and definitions (sixth pass)

Tried 33 phrasings such as "define the word ephemeral", "whats ephemeral mean", "what does 'ephemeral' mean", "synonym for happy", "another word for big", "opposite of happy", "what does NASA stand for", "pronounce ephemeral" and "what does break a leg mean".

As a user, the dictionary phrasings were already solid. The gap was "synonym for X" and "another word for X", which went to the language model even though WordNet already holds the answer. That is slow and the model can list words that do not fit.

Fixed: a new `synonymTerm` and `synonyms` in brain/define.js answer those questions from WordNet in code, before the model, on the first turn of a thread. Tests added in test/brain.test.js, including the resolver ladder.

Left for later: antonyms ("opposite of happy") need the WordNet pointer chase. "what does NASA stand for", idioms like "break a leg", "pronounce X" and typos such as "definiton" still go to the model. "translate hello to spanish" is still not parsed.

## 2026-11-01 — memory commands (fourth pass)

Tried 32 phrasings such as "don't remember this", "remember i'm vegan pls", "pls forget everything", "what's in your memory", "show my memories", "stop remembering things" and "can you remember that I'm vegan?".

As a user, the worst problem was "don't remember this" saving a memory that said "don't", the opposite of what I asked. "pls" was not treated as polite, so "pls forget everything" and "remember i'm vegan pls" went wrong or saved the "pls". Asking "what's in your memory" went to the language model, which can invent a list.

Fixed: a leading "don't", "never" or "stop" before a trailing "remember this" saves nothing. "pls" and "plz" count as polite words. "what's in your memory", "show my memories" and "what have you saved about me" now show the real list of facts. Test added in test/assistant.test.js.

Left for later: "call me Sam", "my name is Sam" and "you should know I'm vegan" still go to the model. "delete memory about food" and "list what you know" are not matched. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install and fail the same way without this change.

## 2026-11-01 — page kinds (fifth pass)

Tried 31 hosts such as icloud.com/mail, outlook.com, mail.live.com, mail.yandex.com, td.com, rbc.com, santander.co.uk, onlinesbi.sbi, zerodha.com, hmrc.gov.uk, cigna.com, aetna.com and healthequity.com.

As a user, the worst problem was that the cat did not look away on Canadian, Indian and UK banks, the UK tax site and big health insurers, so it would offer to read an account page. iCloud Mail, outlook.com and Yandex Mail were treated as ordinary pages, so no email actions showed up.

Fixed: those hosts are now on the sensitive list, the common webmail hosts are on the email list, and iCloud Mail is detected by its /mail path so iCloud Photos stays an ordinary page. Test added in test/browser.test.js and checked to fail before the change.

Left for later: many smaller national banks (ing.nl, other regional banks) still rely on a password field. Insurer marketing pages now go quiet too, which errs on the safe side. The failures in `npm test` here are the WordNet and demo ones from the sandbox install (4 this run).

## 2026-11-02 — developer help, JSON to DTO (fifth pass)

Tried 16 inputs such as a Python dict with True, False and None, JSON lines from a log, a response with a sentence before and after it, a fenced block with prose around it, two objects on separate lines and plain prose with two lines.

As a user, the worst problem was that anything copied from a terminal or a chat was refused as "not valid JSON". A Python dict, a log with one object per line and "Here is the response: {...}" all failed, though the data was fine.

Fixed: parseJson now reads True, False and None, cuts prose before the first and after the last bracket, and turns JSON lines into an array. Plain prose is still refused. Test added in test/modes.test.js and checked to fail before the change.

Left for later: NaN and Infinity are still refused. A null-only field becomes `Object`. The failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — reminders, timers and focus (fifth pass)

Tried 33 phrasings such as "remind me at midnight", "remind me in 90 minutes", "remind me tmrw to buy milk", "set a reminder for 3pm to call bob", "timer for 45 seconds", "wake me at 7", "focus", "focus mode", "snooze 10 minutes" and "remind me end of day to submit report".

As a user, the worst problem was a wrong time stated with confidence. "Remind me at midnight" made a reminder for 12 noon, because the rule that moves a bare small hour to the afternoon also hit midnight. A plain "focus" or "focus mode" went to the model instead of starting a session.

Fixed: midnight now means the next 00:00, and "focus", "focus mode" and "start focus" start the default 25 minute session. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "snooze 10 minutes", "cancel my timer", "stop timer" and a bare "set a timer" are not matched. "End of day" stays in the title with no time. "Remind me to drink water every hour" is still a one-time reminder with "every hour" in the title. The 4 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — history (fifth pass)

Tried 30 phrasings such as "what did I look up", "show me what I looked up", "what was the last thing I asked", "my last search", "what did I google", "open my history", "search my history for docker" and "what did I ask you earlier about docker".

As a user, the worst problem was that "open my history" tried to open an app called "my history". "Search my history for docker" was not understood, and "find in my history redis" searched my files. "What did I look up" and "what was the last thing I asked" went to the language model, which cannot see my history. "What did I ask you earlier about docker" searched for "about docker".

Fixed: "open my history" now lists recent history, "search my history for X" searches it, more recent-history phrasings are understood, and the leftover "about" after a time word is dropped. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remind me what I asked" still becomes a reminder, "what have I been looking at" is not matched, and typos such as "wat did i ask" go to the model. There is still no spoken "clear my history". The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — developer help, error table (sixth pass)

Tried 38 pasted errors such as TypeScript TS2345 and TS2304, Python "'int' object is not subscriptable" and AttributeError on a str, the React missing key warning, a Postgres duplicate key error, NoSuchMethodError, UnsupportedClassVersionError, git "local changes would be overwritten" and LazyInitializationException.

As a user, everyday TypeScript, Python type and SQL errors still cost a model call, and the model can drift on them. Git refusing to merge over local edits is a daily annoyance and was not covered.

Fixed: seven new table entries for these (TypeScript mismatch and unknown name, Python wrong type, React key, SQL duplicate value, Java class version, git local changes). Test added in test/modes.test.js, it fails without the entries.

Left for later: NoSuchMethodError, "refusing to merge unrelated histories", LazyInitializationException, UnicodeDecodeError and the React hydration warning are still not in the table. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — onboarding name and settings base URL (sixth pass)

Tried the "Call me" name with markup ("José <b>María</b>", "Ada <script>") and base URLs pasted from provider docs, including a full ".../v1/chat/completions" endpoint with and without a trailing slash.

As a user, a name with a tag kept the tag's letters ("José bMaríab"). That fact is pinned and sent to the model with every question. A pasted full endpoint was accepted as the base, so every request went to a doubled path and failed with a confusing error.

Fixed: onboardingResult drops whole tags before it filters characters. checkBaseUrl trims a trailing "/chat/completions". Tests added in test/personal.test.js and test/api-provider.test.js. The existing onboarding test expected "Call me Ada script" for "Ada <script>", so I changed it to "Call me Ada", since the tag is now removed as a whole.

Left for later: "simpler words", "less jargon" and "be nicer" still have no setting to map to. A private network address in the base URL is refused without saying why. The 4 other failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — writing tools, fix grammar (third pass)

Tried 40 texts and messages such as "omg that was fun", "thx for the help", "lol that is funny", "ok see you", "brb in a sec", "ty so much", links and email addresses, backtick code, mixed German and English, and tabs and doubled spaces.

As a user, the worst problem was chat shorthand rewritten into other words and offered as a replacement. "thx" became "the", "omg" became "om", "lol" became "loll", "ok" became "okay", "pls" became "plus" and "brb in a sec" became "barb in a second".

Fixed: the shorthand skip in fixGrammar was only for "u". It is now a small list (u, ur, ok, k, lol, omg, ty, thx, pls, plz, idk, imo, brb, sec, ya). Test extended in test/modes.test.js, it fails without the list.

Left for later: a text that mixes one English clause into another language still passes the English check and gets mangled ("Ich habe einen Hund und it is nice"). Doubled spaces and "I seen it" are not flagged. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — food and menu (sixth pass)

Tried a 24 line menu with a price range ("Pizza $11 - 14"), "Margherita 12 / 16", "Soup of the Day 6", a vegan burger, a fish and chips with "beer-battered cod", kids items and a long description under a salad.

As a user, the worst problem was the protein ranking. Fish and Chips came out on top because "fish" and "cod" counted as two proteins for one piece of fish, ahead of the grilled salmon. A price range also left the dish named "Pizza - 14".

Fixed: a range such as "$11 - 14" is read as one price (the lower one) and no longer leaks into the name. "fish" is dropped when a specific fish (salmon, tuna, cod) is named. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Margherita 12 / 16" and "Soup of the Day 6" are still ignored because a bare whole number is too risky to read as a price. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install and fail the same way on main.

## 2026-11-02 — memory and privacy, redaction (sixth pass)

Tried 24 snippets such as `DB_PASSWORD="correct horse battery"`, `client_secret: "abc def ghi"`, "authorization: bearer …", "2FA code 123 456", "recovery code: abcd-efgh-ijkl", a Chinese password label and plain sentences about accounts and passports.

As a user, a quoted secret with spaces in an env-style line only lost nothing, because the rule stopped at the first space or never matched the quoted form. A lowercase "bearer" header went to the model untouched.

Fixed: the name=value secret rule now reads a quoted value with spaces as one value, and the Bearer rule ignores case. Test added in test/browser.test.js and checked to fail before the change.

Left for later: spaced digit codes ("2FA code 123 456", "login code 12 34 56"), recovery codes without digits, "my pass is …", the Chinese label 密码 and a bare "Your code is 482913". An unquoted password with spaces still keeps everything after the first word. This sandbox still shows 29 failures in `npm test` from missing install steps (WordNet, quicktype, Harper and others), and the same ones fail without my change.

## 2026-11-02 — settings UI, reply language (fourth pass)

Tried 12 reply language names in plain Node, such as "हिन्दी", "தமிழ்", "ଓଡ଼ିଆ", "العربية", "日本語", "中文 (简体)", "Español 🇪🇸", "Português (Brasil)" and "tiếng Việt". Also confirmed that the pasted full endpoint case from the last pass is already handled.

As a user, typing Hindi, Tamil or Odia in the reply language box saved a broken word ("हनद" for "हिन्दी"), so the prompt told the model to reply in a language that does not exist. All three are on Loon's own language list. The cause is that vowel signs in these scripts are combining marks, not letters.

Fixed: cleanPersonal in brain/personal.js now keeps combining marks. Test added in test/personal.test.js and checked to fail before the change.

Left for later: parentheses are dropped, so "Português (Brasil)" becomes "Português Brasil". It still reads fine. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — typed questions, time units and divide by zero (fifth pass)

Tried 30 inputs such as "how many days in a year", "how many minutes in a day", "how many seconds in an hour", "7 mod 3", "5 factorial", "10/0", "80 with 20% off", "percent change from 50 to 75" and "1e3 + 5".

As a user, "how many days in a year" is an everyday question and it went to the language model, as did every other time conversion. "1/0" also went to the model, which can invent an answer for something that has none.

Fixed: calc now knows seconds, minutes, hours, days, weeks and years (a year is 365 days), and "how many X in N Y" accepts a number, not only "a" or "one". A divide by zero gets a plain answer from code. The old test expected "1/0" to fall through to the model, so I moved it to the answered cases. Tests added in test/brain.test.js and checked to fail before the change.

Left for later: "7 mod 3", "5 factorial", "80 with 20% off", "percent change from 50 to 75", number words ("twelve plus five") and "1e3". Month conversions are skipped because a month has no fixed length. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-02 — routines (sixth pass)

Tried 26 routine phrasings such as "every day except sunday", "every weekday except friday at 9am", "every monday wednesday and friday at 7", "twice a day", "every other friday at 4", "every day at 9am and 5pm", "evry day at 7" and "everyday at 6".

As a user, the worst problem was that "every day except sunday remind me to stretch" got a card that said every day, with the reminder titled "Except sunday remind me to stretch". The exception was kept in the text and not in the schedule.

Fixed: "except", "but not", "excluding" and "other than" followed by day names now remove those days from the schedule. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every other friday", "every 1st of the month", "twice a day", "every day at 9am and 5pm" and a typo like "evry day" are still not understood. The 4 failures in `npm test` are the same WordNet and demo ones that fail on main in this sandbox.

## 2026-11-02 — shopping and unit price (sixth pass)

Tried 29 size strings and 24 price strings such as "Save $5 $20", "$20 (save $5)", "$15 off $60", "$20.00 $15.00", "Sale $12 reg $18", "Set of 4", "a pound", "1 Kilo", "12 ct (2 x 6)" and "$5.00 - $7.00".

As a user, the worst problem was a saving read as the price. "Save $5 $20" and "You save 25%" next to a price gave 5, so a $20 item looked almost free and won the ranking.

Fixed: parsePrice removes "save N", "you save N" and "N off" phrases before reading the price. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "$20.00 $15.00" (struck-through price then sale price) takes the first number, "$5 - $7" takes the low end, "12 ct (2 x 6)" reads as 24, and "Set of 4", "a pound", "1 Kilo", "25 ft" and "100 sheets" are not parsed. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — follow-up conversations and typed questions, time in another city (fifth pass)

Tried "what time is it in tokyo", "what's the time in London?", "time in NYC", "current time in new york right now" and an unknown place, as a first message and mid-thread.

As a user, asking for the time somewhere else cost a model call and the model cannot know the time, so it would guess. This was left open by the last run.

Fixed: a small city and country table in brain/worldtime.js answers these in code with the local time, and adds the weekday when it differs from today. Unknown places still go to the model. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "yes", "lol" and "good night" mid-thread still cost a model call. "time difference between X and Y" and zone names like "PST" are not handled. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — selection chips and classification (sixth pass)

Tried 50 selections such as `mvn clean install`, `cargo run`, `python3 script.py`, `go build ./...`, "Exception in thread "main" java.lang.NullPointerException", "fatal: not a git repository", "error: cannot find module", "FATAL: password authentication failed", URLs, emails, prices, emoji, lists and Windows paths.

As a user, the worst problem was that common build commands and crash lines were treated as plain words or sentences, so selecting them offered Define instead of the code and error help. Java "Exception in thread" lines, git and rustc style "fatal:" and "error:" lines and database "FATAL:" lines all got sentence chips.

Fixed: those error line shapes now count as stack traces, and mvn, gradle, cargo, go, make, python, node and java commands count as code when they have a flag, a path or a build subcommand. Prose such as "go home early today" and "make sure it works" stays a sentence. Tests added in test/browser.test.js and checked to fail before the change.

Left for later: a bullet list of four short items is still read as a sentence, a two-line shebang script is a word, and `{a:1}` and bare Windows or Unix paths are words. The 4 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — translation and definitions (seventh pass)

Tried 30 phrasings such as "define Ephemeral!", "synonyms for happy 😊", "words like happy", "a word for sad", "opposite of happy", "what is the opposite of hot", "antonym of big", "meaning of life" and "define dog's".

As a user, the dictionary and synonym phrasings held up. The visible gap was "opposite of X" and "antonym of X", which went to the language model even though WordNet has the answer. This was left open in the last two passes.

Fixed: new `antonymTerm` and `antonyms` in brain/define.js follow the WordNet antonym links from the matching word, and the resolver answers in code on the first turn of a thread. Test added in test/brain.test.js, including the resolver ladder.

Left for later: "words like happy", "a better word for good", "synonym angry" and "angry synonym" still go to the model. "translate hello to spanish" is still not parsed. "meaning of life" is defined as the word "life". `npm test` passes after building the wordpos index with its postinstall script.

## 2026-11-03 — voice intents (fifth pass)

Tried 50 spoken phrasings such as "stop talking", "shut up", "stop listening", "quiet mode", "mute", "cancel the timer", "what are my reminders", "repeat that", "louder", "read this to me", "thanks loon", "google cat food", "tell me a joke" and "where is the file menu".

As a user, the worst problem was that "stop talking", "shut up" and "stop speaking" did not stop Loon. They went to the model as a question, so Loon kept speaking and then answered with more text. Only "stop", "quiet" and "be quiet" worked. "where is the file menu" looks like a file search in the router but the teach check runs first in the companion, so it is fine.

Fixed: the stop words now include "stop talking", "stop speaking", "shut up", "that's enough", "okay stop" and "stop it". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "mute", "quiet mode", "do not disturb" and "stop listening" are not mapped to anything. "repeat that", "louder", "cancel the timer", "what are my reminders" and "thanks" have no handler and go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — memory commands (fifth pass)

Tried 37 phrasings such as "remember that", "never forget that I'm vegan", "delete memory about food", "remove the memory about dogs", "delete everything you know about me", "call me Sam" and "remembr that i like tea".

As a user, the worst problem was that a bare "remember that" saved a memory that said "that". "never forget that I'm vegan" and "delete memory about food" were not understood and went to the language model, which can claim it forgot something when nothing was deleted.

Fixed: a bare "remember that" or "remember this" saves nothing. "never forget" works like "don't forget". "delete", "remove", "erase" or "clear" followed by "memory about X" forgets X, and "delete everything you know about me" points to the wipe-all path. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "call me Sam", "my name is Sam", "you should know I'm vegan" and "from now on call me Boss" still go to the model. "forget me" tries to forget the word "me". Typos such as "remembr" are not matched. The failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — page kinds (sixth pass)

Tried 22 pages such as a card form with a plain `name="cardnumber"` field, a CVV box, eBay and Shopify product pages, mail hosts with www, look-alike bank domains, 3-price pages with "Buy it now" and menus with euro prices.

As a user, the worst problem was privacy. A checkout form whose card field has no `autocomplete` or `inputmode` attribute was treated as an ordinary page, so the cat would offer to read it. Pages that mark their products as `ProductGroup` in JSON-LD (eBay, Shopify variants) were not seen as shopping pages.

Fixed: card number and CVV/CVC field names make a page sensitive, and `ProductGroup` counts as a product. Test added in test/browser.test.js and checked to fail before the change. I tried making `autocomplete="new-password"` sensitive too, but an earlier run kept sign-up pages open on purpose, so I left that alone.

Left for later: "Buy it now" alone is not a buy signal. A password field shown as plain text after a "show password" toggle is only caught if it keeps an autocomplete hint. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — spoken answers (sentence splitting)

Tried 10 answers read aloud, such as "It costs $3.50 per lb.", "Version 3.2 is out.", "The U.S. price is lower.", "Use e.g. the 24-pack.", a markdown link followed by a full stop, and streamed chunks that split a price in the middle.

As a user, the spoken answer cut off at the decimal point. "It costs $3.50 per lb." was spoken as "It costs $3." and a version number or star rating was chopped the same way. Abbreviations such as "Dr." and "e.g." ended the sentence too, and the streaming splitter spoke "Dr." on its own. Shopping answers are full of prices, so this hit the main use case.

Fixed: speakable and the streaming splitter in brain/intents.js now end a sentence only at punctuation followed by a space, and skip common abbreviations and single letters. Links are removed before brackets are stripped, so no stray parenthesis is left. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "..." is treated as one sentence end, which is fine. Numbered list prose such as "1. Do this" in a paragraph is not handled.

## 2026-11-03 — developer help, error table (seventh pass)

Tried 24 pasted errors such as NoSuchMethodError, LazyInitializationException, "refusing to merge unrelated histories", UnicodeDecodeError, the React hydration warning, EADDRINUSE, CORS, ERESOLVE and an SSH publickey failure.

As a user, the five leftovers from the last pass still cost a model call. These are everyday errors and the model can drift on them. Most other common errors already answered from the table.

Fixed: five new table entries for NoSuchMethodError, Hibernate lazy loading, unrelated histories, UnicodeDecodeError and hydration mismatch. Test added in test/modes.test.js. The tests fail without the entries.

Left for later: "Permission denied (publickey)" is still not in the table on purpose, an older test says it must not match the file permission entry, and a dedicated SSH entry would need that test rethought. "Failed to load ApplicationContext" in Spring Boot also goes to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — writing tools, fix grammar (fourth pass)

Tried 22 texts such as a formal letter, "i dont know whether its going to work", a name in a sign-off, a phone number, a list with a doubled word, "me and him goes", a link containing "teh", and an empty string.

As a user, the worst problem was a name swapped for another word. "my name is akankshya" became "My name is Changsha" and a sign-off of "Akankshya" became "Changsha", offered as a replacement of my selection. A phone number "555-1234" got an en dash.

Fixed: fixGrammar now skips spelling suggestions that are far from the original word (an unknown name has no near match) and skips Harper's formatting lints. Real typos such as "recieve" still get fixed. Test added in test/modes.test.js, it fails without the change.

Left for later: "cancelled" is changed to the American "canceled" without asking. "Me and him goes" and doubled spaces are not flagged. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — history (sixth pass)

Tried 30 phrasings such as "what did i ask u", "show me my last question", "pull up my history", "history for docker", "clear my history", "wat did i ask", "my last 5 searches" and "remind me what I asked".

As a user, the worst problem was that "what did i ask u" searched my history for the word "u". "Show me my last question" and "pull up my history" were not understood and went to the language model, which cannot see my history.

Fixed: "u" is dropped like "you" in a history search, and "show me my last question", "pull up my history" and "pull up history for X" now work. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "history for docker" without a verb, "my last 5 searches", "what have I been looking at", typos such as "wat did i ask" and "remind me what I asked" (still becomes a reminder) are not handled. There is still no spoken "clear my history". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — reminders and routines, monthly wording (sixth pass)

Tried 31 reminder, timer and alarm phrasings, then 15 recurring ones such as "every hour", "every weekday at 8", "every other day", "every 2 weeks", "yearly" and "monthly".

As a user, routines already handled hourly, daily, weekday, weekly and every-N-days wording well. The problem was "remind me monthly to pay rent" and "every month remind me to pay rent". Routines did not read them, so the first became a one-time reminder titled "monthly to pay rent" with no time, and the second matched nothing.

Fixed: "monthly" and "every month" with no day now mean today's date each month, the same way a bare "weekly" means today's weekday. The confirm card shows the day so it can be changed. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "yearly" and "every year on March 3" still fall through to a one-time reminder with the recurrence words in the title. Routines have no yearly schedule. "Snooze 10 minutes", "cancel my timer" and a bare "set a timer" are still not matched. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-03 — food and menu (seventh pass)

Tried a 24 dish menu with burgers, bowls, dumplings, tempura, pho, poke, a Caesar salad and a chicken-fried steak, and asked for the lightest, highest protein and vegetarian picks.

As a user, the worst problem was that "Chicken-fried Steak" was listed as protein from chicken and steak, and it ranked first for protein. There is no chicken in that dish.

Fixed: score no longer counts "chicken-fried" or "country-fried" as a protein word. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Caesar Salad" is called likely vegetarian though the classic dressing has anchovy. "Cobb Salad" is also called vegetarian though it usually has bacon and chicken. Both need a deliberate list of dishes with hidden meat. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install and fail the same way on main.

## 2026-11-04 — typed questions, math and conversions (sixth pass)

Tried 40 phrasings such as percentages, tips, temperatures, length and mass conversions, "how many" questions, "percent change from 50 to 75", "20 degrees c in f" and "18% of 250 dollars".

As a user, three things annoyed me. "Percent change from 50 to 75" went to the language model, which is bad because it is a numbers question. "20 degrees c in f" was not understood because of the word "degrees". "18% of 250 dollars" answered "45." with no money sign.

Fixed: percent change (up or down, with a clear answer when starting from zero), the word "degrees" before a temperature unit, and a trailing "dollars", "bucks" or "euros" now formats the answer as money. Tests added in test/brain.test.js.

Left for later: currency conversion ("100 usd to eur") needs rates and still goes to the model. "5'10 in cm", "7 mod 3", "double 45" and "3 dozen" are not handled. `npm test` still shows the 5 WordNet and demo failures that come from skipping the native build in this sandbox.

## 2026-11-04 — shopping and unit price (seventh pass)

Tried 32 size strings and 16 price strings such as "12 ct (2 x 6)", "Set of 4", "1 Kilo", "250gm", "a pound", "25 ft", "Pack of 6, 8 oz each", "$20.00 $15.00", "$5 - $7" and "5 for $10".

As a user, the worst problem was a wrong count stated with confidence. "12 ct (2 x 6)" was read as 24 items, so its unit price looked half as good as it is. "1 Kilo", "250gm" and "Set of 4" were not read at all, so those products dropped out of the ranking.

Fixed: a count that is spelled out again as a grid ("12 ct (2 x 6)") is no longer multiplied, while "12 count (pack of 2)" still is. Added kilo, gm and "set of N". Test added in test/modes.test.js.

Left for later: "a pound", "25 ft" and "100 sheets" are not parsed. "$20.00 $15.00" takes the first number and "$5 - $7" takes the low end. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.
