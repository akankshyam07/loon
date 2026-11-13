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

## 2026-11-04 — memory and privacy, redaction (seventh pass)

Tried 31 snippets such as card numbers in several shapes, connection strings, .env lines, bearer headers, curl commands with credentials, and passwords written in French, Spanish and German.

As a user, the worst problem was a password left in plain text in a curl command. `curl -u admin:hunter2 https://x.com` went to the model untouched. "Mon mot de passe est azerty123" was also left alone, because only the English "is" was accepted after the label.

Fixed: curl `-u` and `--user` credentials are redacted, and "est", "es" and "ist" now work like "is" after a password label. Test added in test/browser.test.js.

Left for later: an unquoted password with a space ("password: p@ss w0rd") leaks the second word. "pass:" and "login with username bob password bob123" are not matched. Emails and phone numbers are not redacted, which may be intended. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — developer help, JSON to DTO (sixth pass)

Tried 18 inputs such as NaN, Infinity, undefined, a 20-digit id, duplicate keys, hyphenated and reserved-word keys, an empty array, an empty object, nested arrays with mixed types, single-quoted strings with escapes and pretty-printed objects one after another.

As a user, the worst problem was that a JS or Python dump with NaN, Infinity or undefined in one field was refused as "not valid JSON", though every other field was fine.

Fixed: those values now read as null, so the rest of the object converts. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a number written as 10.0 loses its decimal when the sample is re-serialized, so a price field can become `long` and break on 10.5 later. Pretty-printed objects pasted one after another (not one per line) are still refused. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — settings UI and reply feedback (fifth pass)

Tried 27 feedback phrases such as "be nicer", "simpler words", "no more jokes", "respond in spanish", "back to English" and "lol too formal", and 18 personal statements such as "im vegetarian", "I'm not vegetarian" and "I live in Berlin and I like hiking".

As a user, "no more jokes" did nothing, although "no jokes" works. Typing "im vegetarian" without the apostrophe offered to remember "Im vegetarian", which then sits in the pinned facts with the typo.

Fixed: the tone rule accepts "no more jokes", and a remembered fact starting with "im" is written as "I'm". Test added in test/personal.test.js.

Left for later: "be nicer", "simpler words", "less jargon", "explain like I'm five" and "use bullet points" have no setting to map to. Feedback in other languages ("más corto") is not understood. The 5 failures in `npm test` are the same ones as without my change (sandbox install).

## 2026-11-04 — onboarding first run, name and lists (seventh pass)

Tried 22 answers for the "Get to know you" form, such as "my name is Ada", "I'm Ada", "call me Ada", an emoji in a name, a Chinese name, a name with a line break, allergies with "&" and "/", "none" and "N/A", repeated items, a 300 character interest and "rock and roll".

As a user, typing "my name is Ada" into the name box saved "Call me my name is Ada". That fact is pinned and sent with every question. Repeating an allergy in a different case saved "Peanuts and peanuts".

Fixed: onboardingResult strips a leading "my name is", "call me", "I'm" and similar from the name. The list answers drop repeats ignoring case. Test added in test/personal.test.js, it fails without the change.

Left for later: "rock and roll" is split into "rock, roll" because "and" separates list items. "peanuts & shellfish" is kept as one allergy. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — routines (seventh pass)

Tried 34 routine phrasings such as "every 2 hours until 6pm remind me to drink water", "every fortnight on monday", "each night at 11:30pm", "every other day at 8", "twice a day take pills", "every year on march 3" and "every thursday morning".

As a user, the worst problem was "every 2 hours until 6pm remind me to drink water". The card showed an all-day schedule titled "Until remind me to drink water", so the reminders would also fire overnight. "every fortnight on monday" quietly became a weekly routine.

Fixed: an interval with "until" or "till" and no start time is no longer turned into an all-day schedule, so the model path asks instead. "fortnight" and "every fortnight" now mean every 14 days. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "until 6pm" could start at the current time. "twice a day", "every year on march 3" and "every first monday of the month" are still not understood. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — selection chips and classification (seventh pass)

Tried 41 selections such as a bare word, a price, a URL, an email, "ReferenceError", "ECONNREFUSED 127.0.0.1:3000", "500 Internal Server Error", "HTTP 500", SQL, shell lines, a bullet list, CJK text and a sentence with "error" in prose.

As a user, the worst problem was that short error lines got the wrong chips. "ECONNREFUSED 127.0.0.1:3000" was a word and offered Define. "500 Internal Server Error" was a sentence. These are the lines people select most often from a terminal or browser.

Fixed: Node system error codes (ECONNREFUSED, ENOENT, EADDRINUSE and similar) and a lone HTTP 4xx or 5xx status line now count as stack traces, so the error help chips appear. Prose like "the file was not found yesterday" stays a sentence. Tests added in test/browser.test.js and checked to fail before the change.

Left for later: "ReferenceError" and "HTTP 500" alone are still words. "What is this?" is a word because it has three words, so it offers Define. "x = 5" is a word. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — writing tools by voice (fifth pass)

Tried 43 spoken edit phrasings such as "simplify this paragraph", "rewrite this email", "explain this sentence", "make this a lot shorter", "rewrite this in a professional tone", "explain this in simple terms", "fix grammer" and "summarize in 3 bullets".

As a user, naming the thing I selected is natural ("this paragraph", "this email"). Every one of those went to the slow question path with no selection attached, so nothing was offered to replace my text.

Fixed: route in brain/intents.js now reads "this paragraph", "this email" and similar as "this" before matching templates, and also accepts "a lot shorter", "in a professional tone" and "in simple terms". Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "make it less wordy", "fix grammer" (typo), "make it shorter and more professional", "summarize this in one sentence" and "summarize in 3 bullets" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — follow-up conversations, goodbyes and short greetings (sixth pass)

Tried 45 short messages typed alone or mid-thread, such as "good night", "gn", "bye", "see ya", "tyvm", "thnx", "thankyou", "hiya", "howdy", "wassup", "ok", "yes", "lol", "nice", "how are you" and "are you there".

As a user, ending a session with "good night" or "bye" cost a full model call and came back as a paragraph. Common spellings of thanks and hello ("thnx", "thankyou", "tyvm", "hiya", "howdy") did too.

Fixed: goodbyes get an instant sleepy reply, and the thanks and greeting patterns take those spellings. Cases added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "yes", "lol" and "nice" still go to the model on purpose, since "yes" can answer a question Loon just asked. "how are you", "are you there" and "who made you" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — developer help, Spring Boot errors (eighth pass)

Tried 22 Java and Spring errors such as UnsatisfiedDependencyException, DataIntegrityViolationException, MismatchedInputException, HttpMediaTypeNotSupportedException, the Whitelabel error page, OutOfMemoryError, ClassCastException and a few JavaScript, Python and HTTP ones.

As a user, the worst miss was the most common Spring startup failure. A "Error creating bean" stack trace went to the model, as did a Jackson 400 body error and a database constraint exception.

Fixed: three new table entries for bean creation failures, database constraint exceptions and unreadable request bodies. The constraint entry sits after the SQL duplicate entry so that one keeps its own answer. Tests added in test/modes.test.js.

Left for later: HttpMediaTypeNotSupportedException and the Whitelabel error page are still not in the table. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-04 — translation by voice (eighth pass)

Tried 20 spoken phrasings such as "translate the selection", "what does this say in english", "what's this in english", "translate this to spanish", "translate hello to spanish", "how do you say hello in french", "traduce esto" and "what language is this".

As a user, asking what a selected foreign sentence says is natural. "What does this say in English" and "translate the selection" both went to the slow question path with no selection attached.

Fixed: the translate template in brain/intents.js now also accepts "the selection", "what does this say in english", "what's this in english" and "this in english". Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "translate this to spanish", "translate hello to spanish" and "how do you say hello in french" still go to the model, since the on-device translator only goes into English. "what language is this" also goes to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — food and menu (eighth pass)

Tried 12 dishes whose names hide meat or fish, such as Caesar Salad, Cobb Salad, Spaghetti Carbonara, Ragù Pappardelle, Pasta Bolognese, Pancetta Flatbread and French Onion Soup, and asked which ones are vegetarian.

As a user, every one of them came back as likely vegetarian. A vegetarian following that advice would have eaten anchovy, bacon, guanciale or beef stock.

Fixed: the meat check now knows caesar, cobb, carbonara, bolognese, ragu, pancetta, guanciale, mortadella, bresaola, fish sauce and french onion, and it ignores accents so "Ragù" matches. Test added in test/modes.test.js and checked to fail before the change.

Left for later: Pad Thai (fish sauce is common but tofu versions exist), risotto (often made with chicken stock) and Worcestershire sauce are still called vegetarian when the menu text does not say otherwise. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — memory and privacy, redaction (first pass)

Tried 30 messy snippets such as passwords in prose and in Spanish, card numbers with dashes, AWS and OpenAI env lines, SSNs, bearer tokens, connection strings, private keys, PINs and verification codes.

As a user, the redactor held up well. The gap was keys with an underscore prefix. A Stripe key like sk_live_... and an npm token went through to the model untouched.

Fixed: two rules in brain/redact.js for Stripe style keys and npm tokens. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "passcode 8842" without "is" or a colon is not hidden. SSH public key lines and dates of birth are not hidden. A bare "the code is 482913" is left alone because it is too ambiguous. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — reminders, timers and focus (seventh pass)

Tried 33 phrasings such as "set a timer for 2 and a half minutes", "remind me in an hour and a half to eat", "remind me tonight to lock up", "remind me on dec 25", calendar bookings with weekdays and dates, "remind me in 2h", "remind me after lunch to call" and "cancel my reminder".

As a user, the worst problem was a wrong time stated with confidence. "2 and a half minutes" became a 30 second timer, "2 and a half hours" became 30 minutes, and "an hour and a half" gave one hour with "and a half to eat" as the title.

Fixed: extractWhen now rewrites "N and a half <unit>" and "an hour and a half" to a decimal amount before parsing, so every caller benefits. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remind me after lunch to call" makes a reminder with no time and "after lunch to call" as the title. "cancel my reminder" and "snooze 10 minutes" are not understood. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — page kinds (seventh pass)

Tried 22 pages such as login forms with odd field names, bank and health hosts, a Social Security number form, a routing and account number form, a one-time-code field, German shop pages and mail hosts.

As a user, the worst problem was privacy. A government or payment form asking for an SSN, or for a bank routing and account number, was treated as an ordinary page, so the cat would offer to read it.

Fixed: input names such as ssn, social security, iban, routing number and account number now make a page sensitive. The short names must match exactly, so a field called classname stays ordinary. Test added in test/browser.test.js.

Left for later: a field called passcode is not caught. German "In den Warenkorb" pages are not seen as shopping because the buy signal is English only. Hosts such as web.whatsapp.com and walgreens.com/pharmacy are not treated as sensitive. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — history (seventh pass)

Tried 30 phrasings such as "history for docker", "my last 5 searches", "show last 10 searches", "remind me what I asked", "wat did i ask", "clear my history", "history of docker" and "what were we talking about".

As a user, the worst problem was that "remind me what I asked" created a reminder titled "what I asked". "History for docker" and "my last 5 searches" were not understood and went to the language model, which cannot see my history.

Fixed: "history for/on/about X" searches history, a number in "my last 5 searches" is accepted, and "remind me what I asked" shows history. Bare words such as "searches" still do nothing. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: typos such as "wat did i ask", "what have I been looking at", "history of docker" and "what were we talking about" are not matched. There is still no spoken "clear my history". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — reminders, calendar, timers, focus (eighth pass)

Tried 35 typed and spoken-style inputs. Earlier passes had already fixed polite prefixes, stray "to" in titles, timers and most focus phrasings.

As a user, "create a reminder to email bob on friday" still made a calendar event, not a reminder. "add a reminder…" did the same.

Fixed: the reminder pattern now accepts "create", "add" and "make" before "a reminder". Test added in test/assistant.test.js.

Left for later: "remind me about the 5pm meeting at 4:30" uses 5pm instead of 4:30. "focus 1.5 hours" and "remindme to…" are not matched.

## 2026-11-05 — writing tools, fix grammar (fifth pass)

Tried 17 texts such as "i has a apple", "Thx for ur help, i'll send it tmrw", "LOL that was sooo funny", "using useState hook in react", "I would of gone", "he dont know" and a short email with a sign-off.

As a user, the worst problem was informal words and code names rewritten into other words. "tmrw" became "thaw", "sooo" became "solo" and "useState" became "use State", each offered as a replacement of my selection.

Fixed: fixGrammar now skips spelling suggestions for camelCase identifiers, words with a letter repeated three times and words with no vowel. Real typos such as "recieve" still get fixed. Test added in test/modes.test.js, it fails without the change.

Left for later: "I seen him" and "Their going home" are not flagged, "bring you're laptop" is not caught, and "cancelled" still becomes "canceled". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — developer help, error table (eighth pass)

Tried 50 errors from Java, Python, JavaScript, TypeScript, Rust, Go, git, Docker and SQL, pasted as a user would copy them from a terminal or console.

As a user, the worst misses were the most common beginner errors. A Python NameError, a Python SyntaxError, an ImportError "cannot import name" and the browser's "Unexpected token '<'" all went to the language model.

Fixed: four new table entries. The "Unexpected token '<'" entry skips the "in JSON" wording so the Invalid JSON entry keeps its own answer. Tests added in test/modes.test.js.

Left for later: Maven compilation failures, Rust borrow errors, Go "imported and not used", Docker name conflicts, exit code 137 and SSL handshake failures are still not in the table. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — shopping and unit price (eighth pass)

Tried 35 size strings and 16 price strings such as "a pound", "25 ft", "100 sheets", "Case of 24", "3 pairs", "12 x 1 L", "500 g (17.6 oz)", "half gallon", "US $12.99", "From $5" and "$.99".

As a user, the worst problem was products dropping out of the unit price ranking without a word. "Case of 24", "a pound", "3 pairs" and "100 sheets" were not read, so those items never got a price per unit. The other sizes and prices I tried came out right.

Fixed: "case of", "box of" and "bundle of" count like "pack of". "A pound", "one gallon" and similar spelled-out single units read as one. Pairs, sheets and wipes count as pieces. Test added in test/modes.test.js and checked to fail before the change.

Left for later: lengths such as "25 ft" have no base unit yet. "$20.00 $15.00" takes the first number and "$5 - $7" takes the low end. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — memory commands (sixth pass)

Tried 55 phrasings such as "forget what you know about me", "delete everything you remember", "wipe everything you know about me", "forget it all", "erase everything", "remember 🍕 is my favourite", "please forget that I like tea" and "remembr that i like tea".

As a user, the worst problem was that "forget what you know about me" was read as forgetting facts that contain the word "know". "forget it all" did nothing and "delete everything you remember" went to the language model, which can claim it wiped memory when nothing was deleted.

Fixed: "what" and "wipe" join "everything" and "all" in the wipe-all phrasing, the "about me" tail is optional, and "forget it all" counts as wipe-all. All of them now point to Settings → Memory. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: bare "erase everything" and "delete all my data" are ambiguous, so they still go to the model. "call me Sam", "you should know I'm vegan", "stop remembering things" and the typo "remembr" are still not matched. "note that I prefer metric" keeps the word "that" in the saved note. `npm test` shows 5 failures here, all WordNet and demo tests from the sandbox install.

## 2026-11-05 — voice intents (sixth pass)

Tried 40 spoken phrasings such as "summarise this article", "tell me what this says", "what's cheapest", "what is the cheapest one", "turn private mode off", "stop listening", "turn on do not disturb", "un-focus", "Loon, make it more casual" and "translate this to spanish".

As a user, the worst problem was "turn private mode off" going to the language model as a question. The cat could answer that privacy is off while nothing changed. "summarise this article" and "what's cheapest" also missed their instant tasks.

Fixed: "turn private mode off" and "turn privacy mode off" now switch privacy off. The page summary template also takes article, webpage and site. The shopping template accepts "what's cheapest" without "the" and "what is the cheapest one". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "stop listening", "do not disturb", "un-focus", "make it more casual" and "translate this to spanish" have no template and go to the model. "what does this word mean" and "explain this code" also go to the model without using the selection. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-05 — translation and definitions (ninth pass)

Tried 40 typed phrasings such as "definition for ephemeral", "meaning for ephemeral", "what does ephemeral mean in english", "def ephemeral", "happy synonym", "happy antonyms", "wat does ephmeral mean" and "what does carpe diem mean".

As a user, "definition for ephemeral" was read as the two-word term "for ephemeral", so the lookup failed and the question went to the model. "meaning for X", "X synonym" and "X antonym" were not recognised at all.

Fixed: dictionaryTerm accepts "definition for" and "meaning for", and synonymTerm and antonymTerm accept the short "X synonym(s)" and "X antonym(s)" forms in brain/define.js. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "what is ennui", "def ephemeral" and "tell me what ephemeral means" still go to the model. "meaning of life" is defined as the word "life". "what does ephemeral mean in spanish" has no translate-out path. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — typed questions, math and bill splitting (seventh pass)

Tried 42 inputs such as "7 mod 3", "5 factorial", "double 45", "3 dozen", "$50 split 3 ways", "5 squared plus 3", "2 ** 3", "60 mph in kph" and a spread of conversions and percentages.

As a user, the worst problem was bill splitting, which comes up at every group dinner. "$50 split 3 ways" went to the language model. "5 squared plus 3" and "2 ** 3" also fell through, and "7 mod 3" was not understood.

Fixed: calc answers "N split K ways" and "split N between K" (keeping the money symbol), "A mod B", "**" as a power, and "squared plus". Cases added in test/brain.test.js.

Left for later: "5 factorial", "double 45", "3 dozen", speed units such as mph and kph, and "split the bill" wording with a tip. `npm test` still shows the 5 WordNet and demo failures that come from skipping the native build in this sandbox.

## 2026-11-06 — routines (eighth pass)

Tried 28 routine phrasings such as "every weekday at 9am summarize my notes", "every day @ 9pm journal", "every month on the 1st pay rent", "evry day at 9am drink water", "every day at 9am and 5pm take pills", "nightly at 10 remind me to lock up" and "every other week on friday report".

As a user, the worst problem was "@" as a time marker. "every day @ 9pm journal" got the right time but the card message read "@ journal". Most other phrasings were read correctly.

Fixed: "@ 9pm" is now read like "at 9pm" in parseSchedule. Tests added in test/routines.test.js and checked to fail before the change.

Left for later: "every last friday of the month" and the typo "evry day" are not understood and go to the model. "every day at 9am and 5pm" is refused on purpose, but the card could say why. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — selection chips and classification (eighth pass)

Tried 41 selections such as bare exception names, "Cannot read properties of undefined", TypeScript compiler errors, "zsh: command not found", Windows and Unix paths, prices, emails, URLs, SQL, HTML and a Python traceback line.

As a user, the worst problem was that a selected exception name like "NullPointerException" or "java.lang.IllegalStateException" got the Define chip. The browser console message "Cannot read properties of undefined" and TypeScript lines starting with "error TS2322:" were treated as plain sentences, so no error help was offered.

Fixed: bare exception and error class names, the browser console messages for undefined, null and "is not a function", and TypeScript compiler lines now count as errors. A lone word "Error" stays a word. Tests added in test/browser.test.js and checked to fail before the change.

Left for later: file paths, "exit code 1", "BUILD FAILURE" and "FAILED tests/test_a.py::test_b" are still words or sentences. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — follow-up conversations (seventh pass)

Tried instant answers both as the first message and mid-thread after "explain big o", with "time", "date", "2+2", "and times 3", "20% of 80", "hi", "who are you", "help" and "what can you do".

As a user, typing just "time" in a thread about complexity got the clock ("It's 6:08 AM") instead of a follow-up about time complexity. "date" did the same.

Fixed: a bare "time" or "date" only answers the clock as the first message of a thread, like bare "help" already did. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "and times 3" after a calculation goes to the model, since Loon keeps no running result for code answers. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — onboarding first run, name box (eighth pass)

Tried 20 things a person types into the "Call me" box, such as "Hi, I'm Ada", "Hi! My name is Ada", "hey its Ada", "My name’s Ada" with a curly apostrophe, "you can call me Ada", "everyone calls me Ada", "call me Ada please", a bare "my name is", and names like Imani and Itsuki. I also reran allergy answers such as "none", "nope" and "peanuts, ,shellfish.".

As a user, a greeting in front of the intro defeated the earlier fix. "Hi, I'm Ada" was saved as "Call me Hi I'm Ada", and that fact is pinned and sent with every question. "you can call me Ada", "my name's Ada" and "hey its Ada" had the same problem, and a bare "my name is" saved a fact made of those words.

Fixed: onboardingResult now strips greetings and intro phrases before it filters characters, understands the curly apostrophe, drops a trailing "please" or "thanks", and saves nothing when no name is left. Names that start like an intro (Imani, Itsuki) are kept. Test added in test/personal.test.js, it fails without the change.

Left for later: "peanuts & shellfish" and "dairy/gluten" are still kept as one allergy. "Ada Lovelace (Ada)" becomes "Ada Lovelace Ada". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — developer help, JSON to DTO (seventh pass)

Tried 16 inputs such as JSON with comments, a BOM, a fenced block, text before the object, JS and Python literals, a curl command, a scalar, an empty string, a 20-digit id and JSON with curly quotes.

As a user, the worst problem was JSON pasted from Notes, Slack or a word processor. Curly quotes (“id”: 1) were refused with a raw parser message, though the content was fine.

Fixed: the loose reader now treats curly double quotes as string delimiters, opening and closing with either glyph. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a number written as 10.0 still becomes `long` (the decimal is lost when the sample is parsed), and a 20-digit id becomes `double`. An empty paste shows a raw "Unexpected end of JSON input". The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — settings UI, reply style feedback (sixth pass)

Tried 34 style requests such as "be serious", "stop the jokes", "be funny", "be more brief", "reply only in spanish", "answer me in french" and "in spanish please", and 10 custom base URLs.

As a user, the base URL checks held up. Plenty of natural style requests did nothing and went to the model as a normal question, so the setting never changed. "be serious", "stop the jokes", "be more brief" and "reply only in Spanish" were the common ones.

Fixed: parseFeedback in brain/personal.js now accepts those wordings, plus "be funny" and "answer me in X". A bare "serious?" is still left alone. Test added in test/personal.test.js.

Left for later: "in spanish please" with no verb and "explain more" are not matched. "be nicer" and "simpler words" still have no setting to map to. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — memory and privacy, redaction (eighth pass)

Tried 30 snippets such as `"password": "hunter2"`, `{"apiKey":"..."}`, URLs with `?api_key=` and `?access_token=`, "passcode 8842", "pass: abc12345", "login code 123 456", an ssh public key line and plain sentences about passwords.

As a user, the worst problem was pasted JSON. A config like `{"password": "hunter2"}` went to the model untouched, because the closing quote of the key sat between the name and the colon. This is the most common way people paste settings.

Fixed: the name=value secret rule in brain/redact.js accepts a closing quote after the name. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "passcode 8842" with no verb, "pass: x", "my pass is x", the Chinese label 密码, "Your code is 482913", spaced codes and recovery codes. An unquoted password with a space still leaks the second word. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — shopping and unit price (ninth pass)

Tried 48 size strings and 15 price strings such as "six pack", "Dozen eggs", "1 pt", "Pack of 2, 16 oz each", "8 oz (Pack of 3)", "1 kg 200 g", "454g/16oz", "$5 – $7" and "Save $5! $15".

As a user, most sizes came out right. The misses were products dropping out of the unit price ranking without a word. "six pack", "ten pack", "Dozen eggs" and "1 pt" were not read.

Fixed: spelled-out pack counts (two to ten and twelve) read like digits, a bare "dozen" counts as twelve, and "pt" is a pint. Test added in test/modes.test.js, it fails without the change.

Left for later: lengths such as "25 ft" still have no base unit. "$20.00 $15.00" takes the first number and "$5 – $7" takes the low end. "$0.99/oz" is returned as a plain price. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — history (eighth pass)

Tried 38 phrasings such as "find docker in my history", "show me history for docker", "what did i ask loon", "what was the last thing I asked you", "clear my history", "history of docker" and "what did we discuss".

As a user, the worst problem was that "find docker in my history" started a file search for "docker in my history". "What did i ask loon" searched history for the word "loon", and "show me history for docker" went to the language model, which cannot see my history.

Fixed: "find X in history", "show me history for X" and "what was the last thing I asked you" now open history, and "loon" is dropped from the search words like "you". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "history of docker", "what did we discuss" and "wat did i ask" are still not matched. "Clear my history" has no spoken command. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-06 — food and menu (ninth pass)

Tried about 85 dish names and asked which ones are vegetarian, including gyro, doner, schnitzel, Nicoise, tonkotsu ramen, Philly cheesesteak, BLT, meat lovers pizza, paella, surf and turf, sloppy joe, pho, banh mi, carnitas, poke and lox.

As a user, 30 of them came back as likely vegetarian. A vegetarian would have been steered to meat, fish or shellfish dishes that do not name the animal.

Fixed: the meat check now knows those dishes and the word "meat" itself ("Meat-free Chili" stays vegetarian). Test added in test/modes.test.js and checked to fail before the change.

Left for later: dishes that are often meat but have common vegetarian versions (fajitas, tikka masala, dim sum, gyoza, katsu curry, eggs benedict) and dishes with hidden stock (Pad Thai, risotto, Tom Yum, miso soup) are still called vegetarian when the menu text is silent. A "Vegetarian Pho" is now wrongly called meat. The other `npm test` failures are from the sandbox install without dependencies.

## 2026-11-06 — developer help, error table (ninth pass)

Tried 30 terminal errors such as "command not found: pnpm", EADDRINUSE, ERESOLVE, KeyError, "Permission denied (publickey)", a docker container name conflict, a git pathspec error and an ssh connection timeout.

As a user, the table covered nearly everything. The git "pathspec 'main' did not match any file(s)" error fell through to the model, though it is a common one after cloning or switching branches.

Fixed: added a table entry for the pathspec error with a fetch and branch check. Test added in test/modes.test.js.

Left for later: the docker "container name already in use" error and "ssh ... Connection timed out" still go to the model. The SSH publickey error stays with the model on purpose, an earlier test requires it. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — writing tools, fix grammar (sixth pass)

Tried 20 texts such as a formal email with "cancelled", "meet at 3pm on friday", "send me the report by EOD? thx", "an apple and a orange", "Their going to the store", "colour and favourite", emails, URLs and file names.

As a user, the worst problem was that fix grammar changed things that were not mistakes. "by EOD" became "by End", and British spellings such as "cancelled", "colour" and "favourite" were switched to American ones without asking. Both change my meaning or voice and show up as a replacement of my selection.

Fixed: fixGrammar now skips spelling suggestions for all-caps abbreviations, skips spelling suggestions that only differ by regional convention, and skips expanding initialisms such as ASAP. Real fixes such as "friday" to "Friday" and "a orange" to "an orange" still work. Test added in test/modes.test.js, it fails without the change.

Left for later: "Me and him goes to school" and "I don't no what to do" are not flagged.

## 2026-11-07 — translation and definitions (tenth pass)

Tried 38 typed phrasings such as "def ephemeral", "look up ephemeral", "tell me what ephemeral means", "tell me the meaning of ephemeral", "what ephemeral means", "define: serendipity", "what does ephemeral mean 🤔", "what does it mean" and "what does e.g. mean".

As a user, "def ephemeral", "look up ephemeral" and the "tell me ..." forms skipped the WordNet lookup and went to the model, which is slower and can invent a definition. This was already listed as left for later.

Fixed: dictionaryTerm in brain/define.js accepts "def" and "look up", a "tell me" or "give me" lead-in, "the meaning of X" and "what X means". Pronouns such as "what this means" still go to the model. Test added in test/brain.test.js.

Left for later: "what is ennui", "explain the word X", "what does X mean in simple terms", "how do you spell X" and "meaning of life" (read as the word "life") are unchanged. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-07 — page kinds (eighth pass)

Tried 17 pages such as passcode, pin, pwd and security code fields, web.whatsapp.com, a pharmacy path, German, French and Spanish shop buttons, a look-alike mail host and German and Indian bank hosts.

As a user, the worst problem was privacy. A form with a passcode, pin or plain text "pwd" field, or a card form whose field is called security code, was treated as an ordinary page. WhatsApp Web, which shows private chats, was also ordinary. Shops with "In den Warenkorb" or "Ajouter au panier" buttons were not seen as shopping.

Fixed: those field names now make a page sensitive (short names match exactly), WhatsApp Web, Telegram Web, Signal, Sparkasse and Axis Bank hosts are sensitive, and the buy signal knows German, French, Spanish and Italian cart buttons. Test added in test/browser.test.js and checked to fail before the change.

Left for later: walgreens.com/pharmacy paths, a field called routing or ssn4, and api_secret fields are still not caught. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — memory commands and notes (seventh pass)

Tried 38 phrasings such as "note that I prefer metric", "note to self: call mom", "make a note that the meeting moved", "write this down: ping Bob", "note taking tips", "remember my wifi password is hunter2", "call me Sam" and "stop remembering things".

As a user, the worst problem was that "note taking tips" was read as a command and saved "taking tips" as a note instead of answering my question. "note that I prefer metric" kept the word "that" in the saved note, and "make a note…" and "write this down…" were not understood at all. Saving a password with "remember" is already refused, which is good.

Fixed: the note command now accepts "make/add/save a note", "write (this) down" and "jot (this) down", drops "that", "this", "of" and "to self" from the saved text, and needs a cue after a bare "note". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "call me Sam", "my name is Sam", "stop remembering things" and "you should know I'm vegan" still go to the model, which may claim it saved something. "add to my notes: milk" is not matched. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-07 — reminders, timers and focus (ninth pass)

Tried 30 inputs such as "remind me about the 5pm meeting at 4:30", "remindme to call mom at 6pm", "focus 1.5 hours", "remind me in half an hour", "set an alarm for 6:30am", "remind me every day to take pills" and "remind me end of day to submit".

As a user, "remind me about the 5pm meeting at 4:30" set the reminder for 5pm and left "at 4:30" in the title. Reminding me at the time of the thing I asked to be reminded about is the wrong way round. "focus 1.5 hours" was ignored and went to the model.

Fixed: when a sentence holds two times, extractWhen now prefers the one introduced by at, on, by, in or for. Focus accepts decimal lengths and rounds to whole minutes. Test added in test/assistant.test.js.

Left for later: "remindme to…" and "cancel timer" are not matched. "remind me every day…" and "end of day" produce a reminder with no time and the phrase in the title, which should ask or say it is not recurring. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install and also fail on a clean checkout.

## 2026-11-07 — typed questions, math and conversions (eighth pass)

Tried 40 inputs such as "sqrt of 144", "$80 with 18% tip", "250 minus 10%", "60 mph in kph", "5 factorial", "3 dozen", "1 gb in mb" and "100 usd in eur".

As a user, the worst problems were everyday shop and road maths going to the language model. "250 minus 10%" and "$80 with 18% tip" fell through, as did speed units and "sqrt of 144" when "square root of 144" worked.

Fixed: calc now answers "N plus/minus P%", "N with P% tip", "sqrt of N" and speed conversions (mph, kph, kmh, mps, knots). Cases added to the ladder test in test/brain.test.js and checked to fail before the change.

Left for later: factorials, "3 dozen", data sizes such as gb and mb, and currency (needs live rates, so the cat should say it cannot know them). `npm test` still shows the 5 WordNet and demo failures from the sandbox install.

## 2026-11-07 — open and launch commands (first pass)

Tried 32 phrasings such as "open the calculator", "open the notes app", "launch chrome", "open Node.js", "open file.txt", "open v1.2", "open it", "open that link", "open localhost:3000" and "open reddit.com/r/cats".

As a user, "open the calculator" asked macOS for an app called "the calculator", which does not exist. "launch chrome" did nothing. "open file.txt" and "open Node.js" would have opened a made-up website, and "open it" tried to launch an app named "it".

Fixed: "the" and a trailing "app" are dropped from app names, "launch" works like "open", file names and version numbers are no longer treated as web addresses, and "open it" or "open that link" fall through to the chat. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "open youtube and search cats" still tries to open an app with that whole name, and "open localhost:3000" is treated as an app. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — voice intents (seventh pass)

Tried 50 spoken phrasings such as "turn private mode on", "enable privacy mode", "exit focus mode", "disable focus mode", "explain this page to me", "what's this page", "summarize page", "which one's the cheapest" and "what's the cheapest option".

As a user, the worst problem was that turning private mode on by voice only worked for a few exact words. "turn private mode on" and "enable privacy mode" went to the model, which could say privacy was on while nothing changed. "exit focus mode" and "disable focus mode" had the same problem.

Fixed: the privacy and focus toggle templates accept turn, switch, enable, disable and exit wordings. The page summary and shopping templates take "to me", "what's this page", "summarize page" and "which one's the cheapest". Test added in test/voice.test.js.

Left for later: "stop listening", "do not disturb", "un-focus", "make it more casual", "translate to spanish", "explain this code" and "what does this word mean" still go to the model. The 5 failures in `npm test` are the same ones as on main in this sandbox.

## 2026-11-07 — routines (ninth pass)

Tried 30 routine phrasings such as "every 1st of the month pay rent", "every day at half past 8 tea", "every sunday evening plan the week", "every 45 min take a break", "every mon wed fri at 7am gym", "every weekday at 9am except fridays standup" and "todos los días a las 9 beber agua".

As a user, the worst problem was that "every day at half past 8 tea" gave a card at 9:00 AM with the message "Half past 8 tea". The time was wrong and nothing warned about it. "every 1st of the month pay rent" was not understood at all.

Fixed: "half past 8" and "quarter to 9" are read as clock times in parseSchedule, and "every 1st" or "every 15th" now means that date of the month. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "evry day", "every last friday of the month" and Spanish phrasing are not understood. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — follow-up conversations (eighth pass)

Tried 60 inputs inside an open thread such as "ok", "why?", "double it", "thanks for that", "thanks a bunch", "much appreciated", "appreciate it", "that helped, thanks", "tell me more" and "what about udp?".

As a user, the worst problem was that polite closers went to the model. "thanks for the help" and "appreciate it" cost a full model call and came back as a long reply, while "thanks!" was instant.

Fixed: the thanks reply also matches "thanks for that/this/the help/helping", "a bunch", "appreciate it", "much appreciated" and a leading "that helped". Thanks followed by a real request still goes to the model. Cases added in test/brain.test.js and checked to fail before the change.

Left for later: "nice one", "good kitty", "love it" and "you are great" go to the model, and "10% of that" or "double it" depend on the model reading the previous answer. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — developer help, JSON to DTO (eighth pass)

Tried 17 inputs such as an empty paste, `{}`, `[]`, `{"price": 10.0}`, keys with dashes, spaces and digits, a 20-digit id, an empty array, null values, an ISO date, duplicate keys, truncated JSON and plain prose.

As a user, the worst problem was money. `{"price": 10.0}` produced `private long price`, so a Java class built from it would fail or truncate a real price like 10.99. Quicktype only sees the parsed value, and JSON.parse drops the `.0`.

Fixed: a decimal written with a zero fraction (10.0, -3.00) is now kept as a decimal before parsing, skipping anything inside quoted strings. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a 20-digit id still becomes `double`, and exponent numbers like 1e3 become `long`. Empty objects produce an empty class with no note. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-07 — food and menu (tenth pass)

Tried a 24 line menu with starters, bowls, a vegan burger, euro prices, a bare price, "Plant-based nuggets, $8", falafel, tom yum, beef pho and "Bacon Cheeseburger + fries", then ran the lightest, protein and vegetarian picks.

As a user, the picks were sensible. Small misses were a dish name that kept a trailing comma, falafel showing no protein, and tom yum (fish sauce, often shrimp) and lard being listed as likely vegetarian.

Fixed: the menu reader drops a trailing comma from the dish name, falafel counts as a protein, and tom yum, lard, Worcestershire and bone broth count as meat. Test added in test/modes.test.js. I tried adding pad thai too, but an existing test treats "Chicken-free Pad Thai" as vegetarian, so I left it.

Left for later: a bare whole-number price ("Caesar Salad 11") is dropped, and protein ranking only counts keywords, so a dish with two proteins beats a bigger single one. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — memory and privacy, redaction (ninth pass)

Tried 25 snippets such as "passcode 8842", "pass: abc12345", "my pass is hunter22", "密码：abc12345", "Your code is 482913", recovery codes, DB_PASSWORD=abc, wifi passwords, PINs, Basic auth headers, card plus cvv and German and Spanish labels.

As a user, the short labels were the gap. "pass: x", a bare "passcode 8842" and the Chinese label 密码 all went to the model untouched, even though "password: x" and "pin 4821" were hidden.

Fixed: brain/redact.js hides the value after "pass:" or "pass=" and after 密码 or 密碼 (full-width colon too), and "passcode" followed by digits. "bypass: allowed" is left alone. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "my pass is x" is not hidden because "the pass is closed" would be hurt. Recovery codes, SSH public key lines, dates of birth and "Your code is 482913" are not hidden. An unquoted password with a space still leaks the second word. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — selection chips and classification (ninth pass)

Tried 42 selections such as file paths, "exit code 1", "BUILD FAILURE", pytest "FAILED tests/test_a.py::test_b", a single Java stack frame, "HTTP 500", "Failed to compile.", "undefined reference to", shell lines, prices, emails and short questions.

As a user, the worst problem was that build and test failure lines got the Define chip or the sentence chips instead of error help. "Process finished with exit code 1", "BUILD FAILURE", a failed pytest line and a lone stack frame are what people select right after something breaks.

Fixed: non-zero exit codes, BUILD FAILURE or FAILED, pytest failure lines, "Failed to compile", "Compilation error", linker "undefined reference to", a lone stack frame and a bare "HTTP 4xx or 5xx" now count as errors. "exit code 0" stays a sentence. Test added in test/browser.test.js and checked to fail before the change.

Left for later: file paths, "What is this?", "x = 5" and a short bullet list are still words or sentences. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — shopping and unit price (tenth pass)

Tried 44 size strings such as "Pack of 12 x 355 ml cans", "1 lb 8 oz", "3 Count (Pack of 4)", "Pack of 2 - 32 fl oz each", "half dozen eggs" and "1/2 lb", plus 25 price strings in dollars, euros, krona, rupees and rubles.

As a user, sizes were solid. The price reader was not for Central European and Nordic shops, where thousands are grouped with a space. "1 000 Kč" was read as 1 and "12 500 Ft" as 12, so a unit price would come out a thousand times too small and a cheap-looking item would win.

Fixed: parsePrice joins digit groups separated by a space or a non-breaking space when each group after the first has three digits and no decimals follow. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "12 eggs" has no size, "x2 500ml" ignores the multiplier, and a price split as "$12 99" reads as 12. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — history (ninth pass)

Tried 36 phrasings such as "what did we discuss", "look up my past searches about rust", "show me everything I asked about python", "history of docker", "wat did I ask", "hisotry", "history docker" and "clear my history".

As a user, the worst problem was that "what did we discuss" and "look up my past searches about X" returned nothing from Loon's history and went to the language model, which cannot see it.

Fixed: "what did we discuss" now opens history like "what did we talk about", and "past/previous/recent searches/questions about X" and "everything I asked about X" search history for X. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "history of docker" is left alone on purpose, because "history of Rome" is a normal question. Typos like "wat did i ask" and "hisotry", and "clear my history" by typing, are still not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — writing tools by voice (sixth pass)

Tried 41 spoken edit phrasings such as "make it less wordy", "make it brief", "improve this", "polish this", "make this better", "fix grammer", "make it more casual", "expand this" and "summarize in 3 bullets".

As a user, the plain asks for a shorter or better version of my selection went to the slow question path, so nothing was offered to replace my text. "make it less wordy" and "fix grammer" are things people actually say.

Fixed: brain/intents.js now reads "less wordy", "less verbose", "brief" and "briefer" as shorter, "improve", "polish" and "make it better" as rewrite, and the "grammer" typo as fix grammar. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "make it more casual", "make it longer", "expand this" and "say it nicer" have no matching task or template. "make it shorter and more professional" and "summarize in 3 bullets" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — onboarding first run, allergies and name (ninth pass)

Tried 33 answers for the "Get to know you" boxes, such as "Ada.", "Ada Lovelace (Ada)", emoji only, a very long name, "lactose intolerant", "peanuts & shellfish", "dairy/gluten", "I'm allergic to peanuts", "AI/ML & cats" and a free-text role.

As a user, the worst problem was that "lactose intolerant" was saved as the pinned fact "I'm allergic to lactose intolerant", which is wrong and goes with every question. "peanuts & shellfish" and "dairy/gluten" were kept as one allergy. A name typed with a full stop, "Ada.", was saved with the stop.

Fixed: onboardingResult splits allergies on "/" and "&", words intolerances as "I'm intolerant to X", and trims a trailing full stop from the name. Interests only split on "&" so "AI/ML" stays whole. Test added in test/personal.test.js.

Left for later: "Ada Lovelace (Ada)" becomes "Ada Lovelace Ada". A free-text role is ignored without telling the user. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — settings UI, reply style feedback (seventh pass)

Tried 38 style requests such as "tone down the jokes", "less sass", "stop being so sassy", "be nicer", "simpler words", "in spanish please", "talk like a pirate", "answer in one sentence" and the length, emoji, formal and language wordings from earlier passes.

As a user, the length, emoji, formal and language requests all worked. Asking Loon to tone down the sass or the humor did nothing and went to the model as a normal question, so the setting never changed.

Fixed: parseFeedback in brain/personal.js now reads "tone down the jokes", "less sass", "no attitude" and "stop being so snarky" as the plain tone. Test added in test/personal.test.js.

Left for later: "in spanish please" with no verb is ambiguous with a translation request, so it is left alone. "be nicer", "simpler words" and "answer in one sentence" have no matching setting.

## 2026-11-08 — developer help, error table (tenth pass)

Tried 30 terminal errors such as Python ValueError and ZeroDivisionError, npm ELIFECYCLE, Rust borrow errors, segfaults, 429 and 503, React key warnings, git push rejections, a Postgres socket failure, a docker name conflict and an ssh timeout.

As a user, the table covered almost all of them. Three gaps were left. A psql "connection to server on socket ... failed: No such file or directory" was answered as a missing file, which sends me to check paths when the server is simply not running. The docker "container name is already in use" and "ssh: connect to host ... Connection timed out" errors went to the model.

Fixed: added table entries for the Postgres connection failure (placed before the file-not-found rule), the docker name conflict and the ssh timeout. Test added in test/modes.test.js, it fails without the change.

Left for later: the SSH publickey error still goes to the model on purpose. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — reminders, timers and focus (tenth pass)

Tried 22 inputs such as "remind me every monday to water plants", "remind me end of day to submit", "remindme to call mom at 6pm", "cancel timer", "remind me at 25:00 to x" and "remind me yesterday to x".

As a user, recurring wording is fine in the app because routines run before the reminder parser. The gaps were "remind me end of day to submit", which made a reminder with no time and the phrase in the title, and "remindme to…", which was not matched at all.

Fixed: extractWhen reads "end of day", "end of the work day", "eod", "close of business" and "cob" as 5pm. The reminder pattern accepts "remindme". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "cancel timer" and "stop the timer" are not matched. "remind me yesterday…" sets a time in the past and "at 25:00" leaves the phrase in the title. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — open and launch commands (second pass)

Tried 28 phrasings such as "open youtube and search cats", "launch safari and go to apple.com", "open WhatsApp and message mom", "open localhost:3000", "open 127.0.0.1:8080", "open "Visual Studio Code"", "open my downloads folder" and "open ~/Documents".

As a user, two-step requests tried to launch an app with the whole sentence as its name, so macOS would show an error instead of Loon helping. "open localhost:3000" was also treated as an app, which is the first thing a developer would type. Quotes around an app name were passed on to macOS.

Fixed: two-step requests now fall through to the chat, local addresses with a port or "localhost" open as http links, and quotes around an app name are dropped. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "open my downloads folder" and "open ~/Documents" are still treated as apps. "open chrome, then spotify" only splits on a known list of verbs. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — typed questions and instant answers (ninth pass)

Tried 39 typed questions such as "whats 2+2", "how many days until christmas", "days till new year", "what is 7 factorial", "average of 4, 8, 15", "1e3 * 5", "what day was it yesterday" and the usual maths, units, date and small talk ones.

As a user, "whats 2+2" without the apostrophe went to the model, and so did "whats 15% of 80". People skip the apostrophe all the time. "how many days until christmas" also went to the model, which does not know today's date and can only guess.

Fixed: the calculator lead-in now accepts "whats". A new instant answer in brain/resolve.js counts the days to Christmas, New Year's Day, Halloween and Valentine's Day from the clock. Cases added in test/brain.test.js and checked to fail before the change.

Left for later: factorials ("7 factorial", "5!"), "average of 4, 8, 15", "1e3 * 5", "what is 1/3 as a percent", "pi" and countdowns to a named weekday or date still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-08 — memory commands (second pass)

Tried 33 phrasings such as "remember my name is Sam", "can you remember my dog is called Rex", "what do u know about me", "what do you remember", "save to memory: I work at Acme", "add to memory I'm left handed", "forget what I said about pork", "wipe my memory" and "remember my wifi password is hunter2".

As a user, "what do you remember" and "what do u know about me" went to the language model, which can only guess what is saved. "save to memory" and "add to memory" were not understood, so the model might say it saved something when nothing was stored. Passwords in "remember" are already refused by the action, so that earlier note is closed.

Fixed: parseCommand reads "what do you/u remember" and "u know about me" as a memory listing, and "save/add/put/store (this) to/in memory" as remember. Test added in test/assistant.test.js.

Left for later: "private mode on", "go private" and "don't save this conversation" are not commands, so they go to the model. "remember nothing" saves a fact "nothing". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — routines (tenth pass)

Tried 45 phrasings such as "every morning at 8 remind me to take vitamins", "every weekday except friday at 9", "twice a day remind me to stretch", "every tuesday at 7 am y 7 pm", "can you remind me every monday at 9 to email bob", "please every day at 9 remind me to stretch" and a routine with an emoji after the schedule.

As a user, the worst problem was that a polite word broke routines. "Can you remind me every monday at 9 to email bob" was not read as a routine, so it fell through to the one-time reminder code and made a single reminder titled "every to email bob". "Please every day at 9 remind me to stretch" became a plain message reading "Please remind me to stretch".

Fixed: parseRoutine now removes the same politeness words as parseCommand, through one shared stripPoliteness in brain/commands.js, and the action part drops a leading "please". Test added in test/routines.test.js and checked to fail before the change.

Left for later: "twice a day" and "3 times a day" are not routines, so "remind me to stretch twice a day" makes a one-time reminder titled "stretch twice", which is quietly wrong. "Every quarter" and "every first monday of the month" give a card with no schedule, which is honest. An emoji right after the schedule ("every morning ☀️ remind me to stretch") makes the action a plain message. "At 7 am y 7 pm" in Spanish keeps only the first time. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — page kinds (ninth pass)

Tried 40 pages such as login forms with odd field names, shop pages in euros and pounds, mail and code hosts, look-alike bank hosts and several banks and finance sites.

As a user, the worst problem was privacy. Most login pages have a "show password" toggle, which turns the field into plain text, so the page looked ordinary while I was typing my password. A field called ssn4 was also missed, and USAA, Navy Federal, Credit Karma, Mint and Zelle were treated as normal sites.

Fixed: a visible input whose name or id contains "password" (or is "passwd") now makes the page sensitive, as does a field starting with "ssn". Checkboxes, buttons and hidden inputs are skipped so a "show password" checkbox does not trigger it. Five more finance hosts were added. Test added in test/browser.test.js and checked to fail before the change.

Left for later: walgreens and cvs pharmacy paths, a field called routing or api_secret, and one-time code fields named otp or verification_code are still not caught. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — CI repair, sign-up pages were private again

Tried the failing `e2e-browser` run on 61a2de9. Four screen-control steps said "This is a private page, so I won't act on it" on the sign-up fixture.

What went wrong was the password-name check added in the ninth pass. The fixture has a field named "password" with `autocomplete="new-password"`, so the sign-up page counted as private and Loon refused to click Sign up or Buy now. That is the same mistake as the one fixed earlier for the autocomplete selector.

Fixed: a field marked `autocomplete="new-password"` is skipped by the name check. Real login fields and show-password toggles on login forms still make the page sensitive. Test added in test/browser.test.js and checked to fail before the change.

Left for later: the sign-up page rule is only as good as the autocomplete attribute, so a sign-up form without it still reads as private, which errs on the safe side. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — developer help, JSON to DTO (ninth pass)

Tried 24 inputs such as an empty object, nested empty objects, null-only fields, mixed-type arrays, keys with spaces, reserved words and emoji, exponent numbers, a 20-digit id, dates, UUIDs, snake_case keys, a key named Root, nested arrays of objects, matrices and name-keyed maps.

As a user, the worst problems were small but wrong. `{"rate": 1e3}` became a `long`, so a decimal rate would fail to bind. An empty `{}` produced an empty class with no explanation.

Fixed: keepDecimals now also keeps exponent numbers as decimals, and an input with only empty objects says it is empty instead of showing an empty class. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a mixed-type array in Java produces a union class with public fields and an unused import. A map keyed by names (`{"alice": 1, "bob": 2}`) becomes a class rather than a Map. A 20-digit id still becomes `double`. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — follow-up conversations (ninth pass)

Tried 60 short replies inside an open thread such as "nice one", "good kitty", "love it", "you are great", "perfect", "that was helpful", "ok", "lol", "that's all", "never mind" and "take care".

As a user, the worst problem was that kind words cost a full model call. "nice one" or "love it" after an answer started the local model, which is slow and can reply with a long unrelated explanation.

Fixed: short praise now gets an instant reply from code. It covers "nice one", "good job", "good kitty", "love it", "you are great", "perfect", "that was helpful" and "well done". Praise followed by a request ("perfect but shorter", "nice, what about ports") still goes to the model. Test added in test/brain.test.js.

Left for later: "that's all", "never mind", "sorry", "thanks that was helpful", "night" and "take care" still go to the model. Plain "ok", "yes" and "no" are left alone on purpose because they can answer a question from the cat. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — translation and definitions (eleventh pass)

Tried 32 typed dictionary phrasings such as "what does ephemeral mean, loon", "explain the word ennui", "meaning of life", "what does ephemeral stand for", "what does it mean to be ephemeral" and "define ephemeral and ubiquitous".

As a user, "explain the word ennui" and a polite ", loon" tail skipped the offline WordNet lookup. "meaning of life" was read as a request to define the word "life", which is not what anyone asking that wants.

Fixed: dictionaryTerm accepts "explain the word X" and a ", loon" tail, and leaves the bare "meaning of life" to the model. Test added in test/brain.test.js.

Left for later: "what is ennui" still goes to the model, because it cannot be told apart from "what is python". "what does X stand for" and two-word lists also go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-09 — food and menu (eleventh pass)

Tried a 24 line menu with a bare "Caesar Salad 11", "Soup of the day 4 / 6", lamb kofta, dal makhani, chana masala, a "(v)" tag, "Table 5" and "Est. 1998", then ran the lightest, protein and vegetarian picks.

As a user, the picks were sensible, but any dish priced with a whole number and no currency symbol vanished from the menu, which is common on menus outside the US. Lamb, duck, paneer and lentil dishes never showed up in the protein pick.

Fixed: a trailing whole number of up to three digits counts as a price, except after words like table, page, serves or size, and a trailing slash is dropped from the dish name. Lamb, duck, paneer, dal and chana count as proteins. Test added in test/modes.test.js.

Left for later: protein ranking still counts keywords only, and a size list such as "Soup of the day 4 / 6" keeps the first size in the dish name. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — memory and privacy, redaction (tenth pass)

Tried 25 snippets such as an exported OpenAI key, a Wi-Fi password sentence, curl headers, connection strings, card numbers, ssh keys, JSON passwords, `mysql -p`, `--password=` and `--token` flags.

As a user, the gap was command lines pasted from a terminal. `deploy --token abc123def456` and `login --password "my pass"` went to the model untouched, and so did `private_key: "..."`.

Fixed: brain/redact.js hides the value after `--password`, `--token`, `--secret`, `--api-key` and similar flags written with a space, quoted or not, and treats `private_key` as a secret name. `--secret --verbose` is left alone. Test added in test/browser.test.js and checked to fail before the change.

Left for later: an unquoted password with spaces still leaks the words after the first ("password is: correct horse battery staple"). `mysql -p hunter22`, ssh public key lines and dates of birth are not hidden. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — writing tools, fix grammar (seventh pass)

Tried 21 texts such as "room 4B", "It's Dr. Smith's office", "Your the best", "Thanks for you're help", a French sentence, code in backticks, URLs and emails, "She dont like it" and "the the cat sat on on the mat".

As a user, the worst problem was edits that change what I meant. "room 4B" became "room 4 bytes", "It's Dr. Smith's office" became "Its Dr. Smith's office", and "Your the best" became "Your best".

Fixed: fixGrammar now skips word-choice suggestions that start with a space, skips repetition fixes where the two words differ, and skips the "it's" to "its" suggestion when a capitalized name follows. Real fixes such as "Its a nice day" still work. Test added in test/modes.test.js, it fails without the change.

Left for later: "writting" becomes "writhing" because Harper lists it first and it ties with "writing" on edit distance. "I seen him", "Me and him goes", "1 cats", "Lets meet" and "you're help" are not flagged. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-09 — shopping and unit price (eleventh pass)

Tried 28 size strings and 16 price strings such as "6 x 1.5L", "Case of 24 - 16.9 oz", "500g (17.6oz)", "x2 500ml", "99¢", "$5.00 - $7.00", "£1,000" and "C$10".

As a user, the worst problem was a wrong number stated with confidence. A price of "99¢" was read as 99 dollars, so a cheap item would look the most expensive on the page.

Fixed: parsePrice reads cents ("99¢", "75 cents") as a fraction of a dollar. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "24-pack 12 oz cans" counts oz as weight, so cans of drinks cannot compare with bottles in ml. "x2 500ml" ignores the multiplier, "12 eggs" has no size and "$12 99" reads as 12. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — voice intents (eighth pass)

Tried 36 spoken phrasings such as "stop listening", "do not disturb", "unfocus", "leave private mode", "end privacy mode", "go back to normal", "translate to spanish", "explain this code" and "shorter".

As a user, the worst problem was that natural ways to leave private mode ("leave private mode", "end privacy mode") and to ask for quiet ("do not disturb", "unfocus") went to the model, which could say it was done while nothing changed.

Fixed: the privacy and focus toggle templates accept leave, end and stop for private mode, leave and "unfocus" for focus off, and "do not disturb" for focus on. Test added in test/voice.test.js.

Left for later: "stop listening", "make it more casual", bare "shorter", "translate to spanish", "explain this code", "what does this word mean" and "go back to normal" still go to the model. The 5 failures in `npm test` are the same WordNet and demo ones as on main in this sandbox.

## 2026-11-09 — reminders, timers and focus (eleventh pass)

Tried 33 inputs such as "remind me yesterday to call bob", "remind me at 25:00 to x", "timer 5 min", "set a timer for 1 hour 30 minutes", "remind me on the 15th to pay rent", "remind me in a couple of hours", "pause focus", "list my reminders" and "schedule a meeting friday at 10am".

As a user, "remind me yesterday to call bob" made a reminder dated yesterday, which would never fire or fire at once, and the card looked normal.

Fixed: a reminder whose parsed time is not in the future now has no time, so the card says "(no time)" like any reminder without a time. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "cancel timer", "stop the timer", "start a pomodoro", "pause focus", "list my reminders" and "what timers do i have" are not matched. "remind me 10 minutes before the meeting to prep" gives the title "the meeting to prep". "at 25:00" still leaves the phrase in the title. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-09 — typed questions, math and conversions (ninth pass)

Tried 50 inputs such as "5 factorial", "3 dozen", "1 gb in mb", "100 usd in eur", "5 ft 10 in to cm", "100 mph in km/h", "5 - -3", "10 / -2" and "1.5k + 2k".

As a user, the worst problems were everyday questions going to the language model. Height in feet and inches was not understood, "km/h" and "m/s" were not units, factorials were missing, and a negative second number ("5 - -3", "10 / -2") was not read as maths.

Fixed: calc now reads feet and inches together, km/h and m/s, "N factorial" and "factorial of N", and a minus sign after an operator. Cases added to the ladder test in test/brain.test.js and checked to fail before the change.

Left for later: "5!" cannot work because trailing punctuation is stripped first. Data sizes (gb, mb) need a decision between 1000 and 1024. Also missing are "3 dozen", "1.5k", "1 ton", area units and currency (needs live rates, so the cat should say it cannot know them). `npm test` still shows the 5 WordNet and demo failures from the sandbox install.

## 2026-11-10 — onboarding first run, skipped boxes (tenth pass)

Tried 19 answers for the "Get to know you" boxes, such as "none", "N/A", "skip", "no allergies", "I have none", "peanuts, none", "Ada Lovelace (Ada)" and a name box left as "n/a".

As a user, the worst problem was that "N/A" in the allergy box was split on the slash and saved as "I'm allergic to N and A". "skip" in the interests box became "I'm interested in skip". A name of "none" or "n/a" was saved as "Call me none" and "Call me na". "Ada Lovelace (Ada)" became "Call me Ada Lovelace Ada".

Fixed: onboardingResult checks the whole answer for a "no answer" phrase before splitting, and the phrase list now knows "skip", "pass" and "prefer not to say". The name box uses the same check and drops a bracketed nickname. Test added in test/personal.test.js and checked to fail before the change.

Left for later: a free-text role is still ignored without telling the user.

## 2026-11-10 — selection chips and classification (tenth pass)

Tried 36 selections such as "What is this?", "¿Qué significa esto?", "x = 5", file paths, a short bullet list, prices, emails, URLs, dates, a lone "Traceback (most recent call last):" line, git and npm errors and single emoji.

As a user, the worst problem was that a short question like "What is this?" or "¿Qué significa esto?" got the Define chip, because it has three words or fewer. A copied "Traceback (most recent call last):" header on its own was treated as a sentence, so no error help was offered.

Fixed: classifySelection in extension/lib/classify.js now treats a multi-word selection that ends in a question mark (or starts with ¿) as a sentence, and counts a lone Traceback header as an error. A single word with a question mark stays a word. Test added in test/browser.test.js and checked to fail before the change.

Left for later: file paths, "x = 5" and a short bullet list are still words or sentences. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — history (tenth pass)

Tried 34 phrasings such as "what have I asked you about docker", "what have I looked up about react", "what did we talk about last week", "clear my history", "wat did i ask", "hisotry", "anything about rust in my history" and "show my recent questions" with an emoji.

As a user, the worst problem was that "what have I asked about docker" went to the language model, which cannot see Loon's history, while "what did I ask about docker" worked. "what did we talk about last week" had the same problem.

Fixed: "what have I asked/looked up/searched for/read about X" now searches history like the "did" form, and "last week" and "last month" are accepted after "what did we talk about".

Left for later: typos ("wat did i ask", "hisotry"), typed "clear my history", "what were we talking about", "anything about X in my history" and a trailing emoji are still not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — open and launch commands (third pass)

Tried 28 phrasings such as "open my downloads folder", "open ~/Documents", "open downloads", "open my calendar", "open Chrome please", "open the app store", "open a new tab", "open file:///etc/hosts" and "open Slack and Teams".

As a user, "open my downloads folder" and "open ~/Documents" tried to launch an app with that name, so macOS showed an error. "open my calendar" and "open my notes" asked for apps called "my calendar" and "my notes".

Fixed: Downloads, Documents, Desktop, Pictures, Movies, Music and Applications open as folders in Finder (still behind the confirm card), and a leading "my" is dropped from app names. Test added in test/assistant.test.js.

Left for later: "open a new tab", "open the file report.pdf" and "open Slack and Teams" still try to launch an app with that whole text. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — writing tools by voice (seventh pass)

Tried 41 spoken edit phrasings such as "make it sound more professional", "say it nicer", "make it more casual", "make it sound better", "make it clearer", "tone it down", "fix grammar and spelling" and "turn this into bullet points".

As a user, "make it sound better" and "make it clearer" are very natural asks, and they went to the slow question path with no selection attached. So did "say it nicer" and "fix grammar and spelling".

Fixed: brain/intents.js now reads "make it sound better" and "make it clearer" as rewrite, "say it nicer" as warmer, and "fix grammar and spelling" as fix grammar. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "make it more casual", "make this less formal", "tone it down", "make it longer", "expand this" and "turn this into bullet points" have no matching task. "make this shorter and more professional" still goes to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — developer help, error table (eleventh pass)

Tried 40 errors such as TypeError and ReferenceError from Node, Python import and type errors, Java memory errors, Rust moves, git conflicts, CORS, npm ERESOLVE, a Go index panic, a MySQL login failure, pip's externally-managed-environment message and a Python SSL certificate failure.

As a user, the table covered most of them. The gaps that would send me to the model were pip refusing to install on a system Python (very common on new Macs and Linux), the "Access denied for user" database login error, Python's SSL "certificate verify failed" in its lowercase form, and the Go "index out of range [3] with length 3" panic.

Fixed: added table entries for the pip message and the database login, widened the certificate rule to the lowercase wording and the index rule to the Go panic. Test added in test/modes.test.js, it fails without the change.

Left for later: "Unhandled Promise Rejection: fetch failed", an aborted request DOMException, Postgres `relation does not exist` and a bare "Connection refused" still go to the model. The 36 failures in `npm test` are the same ones as on main in this sandbox (missing built data and dependencies).

## 2026-11-10 — memory commands (third pass)

Tried 38 phrasings such as "forget everything about pork", "forget about pork", "remember nothing", "remember it", "remember everything", "stop remembering things", "do you remember my name?" and "forget I said that".

As a user, "forget everything about pork" was treated as a full wipe, so the cat told me to go to Settings instead of forgetting pork. "forget about pork" searched for the words "about pork". "remember nothing" and "remember it" saved a fact called "nothing" or "it".

Fixed: only a bare "forget everything" or "forget all" is a wipe, and "forget (everything/all) about X" forgets X. "remember nothing/it/everything" no longer save anything. Tests added in test/assistant.test.js.

Left for later: "stop remembering things", "don't remember that" and "do you remember my name?" go to the model, which may claim it did something. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-10 — settings UI, reply style feedback (eighth pass)

Tried 46 style requests such as "make answers shorter", "stop rambling", "answers too short", "remove the emojis", "emoji please", "switch to english", "be nicer", "just the answer" and "talk normally".

As a user, the plain wordings worked. A few natural ones did nothing and went to the model as normal questions, so the setting never changed. "Make answers shorter" missed because only "make it" and "make them" were read. "Remove the emojis" and "switch to english" were not read either.

Fixed: parseFeedback in brain/personal.js now reads "make answers/replies shorter", "stop rambling", "less rambling", "answers too short", "remove the emojis", "get rid of emojis" and "switch to / change to <language>". Test added in test/personal.test.js.

Left for later: "emoji please", "talk normally", "go back to normal" and "reset" have no clear meaning for a single setting. "Just the answer", "be nicer" and "use simple words" have no matching setting. The 5 failing tests in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — routines (eleventh pass)

Tried 23 phrasings such as "remind me to stretch twice a day", "3 times a day", "once a day", "every 2 hours", "every other day", "hourly remind me to stand", "every month on the 1st", an emoji after the schedule and "every friday at 5 say have a good weekend".

As a user, the worst problem was that "remind me to stretch twice a day" quietly made a one-time reminder titled "stretch twice". "Once a day" did the same. Also, a day word inside the message changed the schedule, so "every friday at 5 say have a good weekend" ran on Sunday and Saturday.

Fixed: parseSchedule reads "once/twice/N times a day" (once is daily at 9, more is spread between 9am and 9pm, which the confirm card shows). A named day now wins over the words weekday and weekend. Tests added in test/routines.test.js and checked to fail before the change.

Left for later: "say …" is not a routine action, so that card still asks. An emoji right after the schedule still turns the action into a plain message. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — typed questions, math (tenth pass)

Tried 32 typed questions such as "5!", "average of 4, 8, 15", "mean of 2 and 4", "1e3 * 5", "pi", "double 45", "cube of 3", "abs(-4)", "log of 100" and the usual percent, root and unit ones.

As a user, "5!" and "average of 4, 8, 15" went to the model. Both are plain arithmetic, and the model can get them wrong. The calculator also stripped the "!" from "5!" before it could match.

Fixed: brain/calc.js now answers "N!" and "average of" or "mean of" a list of numbers (commas, "and" or "&"). A trailing "!" is kept only when the whole question is a number followed by "!", so "2+2!" still works. Cases added in test/brain.test.js.

Left for later: "1e3 * 5", "pi", "double 45", "cube of 3", "abs(-4)", "log of 100" and "1/3 as a percent" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — page kinds (tenth pass)

Tried 40 pages with sign-in, verification and developer forms, such as fields named otp, verification_code, routing, api_secret and client-secret, plus look-alike names like route-notes and otpion.

As a user, the worst problem was privacy. A page asking for my one-time code or a bank routing number looked like an ordinary form, so Loon stayed active while I typed it. Developer consoles showing a client secret field were also treated as normal pages.

Fixed: the identity and bank field rule now also covers fields named otp, routing, verification code, api secret and client secret. Names are matched exactly or by a specific phrase so ordinary fields stay normal. Test added in test/browser.test.js and checked to fail before the change.

Left for later: walgreens and cvs pharmacy paths are still not caught, because cvs.com is also a normal shop and a host rule would silence it. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-10 — food and menu (twelfth pass)

Tried a 32 line menu with a size list ("Soup of the day 4 / 6"), a footnote star after a price, phone and opening hours lines, wraps, bowls, ramen and a set of dishes people often assume are vegetarian.

As a user, the picks were sensible. Two things annoyed me. The soup was listed as "Soup of the day 4" because the size list kept its first size in the name, and "Nachos Supreme *" kept the star. Mapo tofu, bibimbap, miso soup and tom kha were offered as likely vegetarian although they are usually made with pork, beef, dashi or fish sauce.

Fixed: a trailing "4 /" size is dropped from the dish name, footnote marks are trimmed, and those four dishes count as meat. Test added in test/modes.test.js. I changed one older expectation that had recorded the "Soup of the day 4" name as a known flaw.

Left for later: Pad Thai and mushroom risotto are still called vegetarian, since an existing test relies on Pad Thai and stock use varies. Protein ranking still counts keywords only. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-11 — shopping and unit price (twelfth pass)

Tried 28 size strings and 14 price strings such as "x2 500ml", "500 gr", "1 pint", "16 fl. oz.", "Pack of 6, 8 oz each", "1 lb 4 oz", "2-pack 16 oz", "1,5 kg", "$5.00 - $7.00" and "US$ 12.50".

As a user, almost everything read correctly. The one wrong number was "x2 500ml", which gave 500 ml instead of 1 litre, so a two-pack looked twice as expensive per unit.

Fixed: parseQuantity reads a leading "x2" multiplier. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "$12 99" (superscript cents flattened to text) reads as 12, a price range uses the low end, and "1.000 g" reads as 1 g. All three are ambiguous and need a deliberate decision. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — follow-up conversations, goodbyes (tenth pass)

Tried 30 short closers inside an open thread such as "take care", "night", "that's all", "that is all for now", "never mind", "nvm", "thanks, that was helpful", "ok bye loon" and "talk to you later", plus near misses such as "never mind, explain udp", "that's all wrong" and "night mode in chrome".

As a user, the worst problem was that ending a conversation politely still cost a full model call. "take care" or "that's all" started the local model, which is slow and can answer with a long unrelated reply. "thanks, that was helpful" missed the thanks reply for the same reason.

Fixed: the goodbye reply also matches "night", "take care", "talk to you later", "that's all (for now)", "never mind", "nvm" and a leading "ok" or "alright". The thanks reply accepts "that was helpful" after the thanks. Closers followed by a request still go to the model. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "sorry" and "my bad" still go to the model. "good morning" after a long thread gets the greeting reply. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-11 — writing tools, fix grammar (eighth pass)

Tried 28 texts such as "I am writting a report", "dont be late", "This is a very very good idea", "I should of called you", an email address, a phone-style line, "Thx for ur help", "npm i" and "Its John's book".

As a user, the worst problems were edits that change my wording. "writting" became "writhing" because Harper lists it first. "This is a very very good idea" became "This is an excellent idea", which is a rewrite and not a fix.

Fixed: fixGrammar skips Harper's Enhancement suggestions, and for a misspelling it prefers the word with the doubled letter collapsed. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "npm i" in running text becomes "npm I". Lowercase "asap" is still expanded to "as soon as possible". "I seen him", "1 cats" and "you're help" are not flagged. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — translation and definitions (twelfth pass)

Tried 32 typed dictionary, synonym and antonym phrasings such as "other word for sad", "words like happy", "synonym happy", "opposite of 'cold'", "what does 'ubiquitous' mean?" and "does ubiquitous mean everywhere".

As a user, "other word for sad" (singular) and "words like happy" skipped the offline synonym lookup and went to the language model, even though "other words for" worked.

Fixed: synonymTerm accepts "other word", "words like" and a bare "synonym X" without for or of. Assertions added in test/brain.test.js.

Left for later: "contrary of", "reverse of" and "antonyms of X and Y" still go to the model. "does X mean Y" is a yes or no question and stays with the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install, the same on main.

## 2026-11-11 — memory and privacy, redaction (eleventh pass)

Tried 26 snippets such as an email plus password line, Basic auth headers, `.env` exports, `PGPASSWORD=...`, URLs with `?access_token=`, connection strings, `mysql -phunter22`, card with cvv, ssh public keys, recovery codes and a date of birth.

As a user, the one clear leak in a pasted terminal line was `mysql -u root -phunter22 mydb`, where the password is glued to `-p`. It went to the model untouched.

Fixed: brain/redact.js hides the value attached to `-p` on mysql, mysqldump, mysqladmin and mariadb command lines. `mysql -u root -p mydb` (where mydb is the database) is left alone. Test added in test/browser.test.js and checked to fail before the change.

Left for later: an unquoted password with spaces still leaks the later words. Recovery codes without digits, ssh public keys and dates of birth are not hidden. `password=abc&user=bob` hides `&user=bob` too, which is over-cautious but harmless. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — voice intents (ninth pass)

Tried 40 spoken phrasings such as "turn on do not disturb", "which one is the cheapest option", "shorter please", "explain it to me like I'm five", "stop listening", "go back to normal", "make it more casual" and "thanks loon".

As a user, the worst problem was that "turn on do not disturb" went to the model, which could claim focus was on while nothing changed. "Which one is the cheapest option" and "explain it to me like I'm five" also missed their templates, and a bare "shorter" or "simpler" did nothing.

Fixed: the focus template accepts turn on, switch on and enable before "do not disturb" and an optional "mode". The cheapest template accepts "one" and "option" at the end. The simplify template accepts "to me" before "like I'm five", and bare "simpler" and "shorter" now route to their tasks. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "stop listening", "go back to normal", "make it more casual", "explain this code", "what does this word mean", "give me a quick summary" and "thanks loon" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-11 — page kinds (fifth pass)

Tried 32 pages such as Indian rupee and euro shops, CHF and "Rs." prices, lowercase and Spanish menus, Gmail and other mail hosts, bank look-alike domains, code hosts and plain articles.

As a user, the worst miss was privacy. ING and a few other banks were not treated as private pages, so Loon would read them. Fastmail, Tuta and the new outlook.cloud.microsoft address were not seen as mail, and shops priced in CHF or "Rs." were not seen as shops.

Fixed: extension/lib/page-kind.js lists ING, ABN AMRO, BBVA, Nubank and Itaú as sensitive, adds the three mail hosts, and reads CHF and Rs prices. Assertions added in test/browser.test.js and checked to fail before the change.

Left for later: Codeberg is not a code host, Google Docs and Wikipedia short pages are "other", and menus with only a Spanish word list and no known food words stay "other". The bank list will always be incomplete, so a generic check for banking words in the page title may be worth a look. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — developer help, JSON to DTO (tenth pass)

Tried 15 inputs such as a mixed-type array, a map keyed by names, a 20-digit id, ISO dates, null-only fields, snake_case keys in TypeScript, Java keywords as keys, keys starting with a digit, trailing commas, single quotes, bare keys, comments, `$ref` and `@type` keys, and a BOM.

As a user, the worst problem was a silent null. A key such as `class`, `default`, `new` or `enum` was renamed to `rootClass` by the generator, and because the key looks like a simple lowercase word the output had plain getters with no `@JsonProperty`. Spring Boot would leave the field empty without any error.

Fixed: Java keywords now count as keys that need `@JsonProperty`, the same as `first-name` or `userId`. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a mixed-type array still produces a union class with public fields. A 20-digit id still becomes `double`. A very large object with many keyword keys at once produced an empty code block, which I did not chase because it is an unlikely input. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-11 — reminders, timers and focus (twelfth pass)

Tried 80 inputs such as "remind me thursday at 3 to pay", "remind me in 90 seconds to flip", "timer 45s", "remind me at quarter past 3", "remind me later", "in 10 minutes remind me to stretch", "remind me to x by 5" and "timer 1:30".

As a user, the worst problem was a wrong date with no warning. On a Wednesday, "remind me thursday at 3 to pay" made a reminder for today at 3pm, so the card looked fine and the reminder would fire a day early. The cause was the rule that moves a bare "at 3" to the afternoon, which pulled the date back a day whenever only the weekday was certain.

Fixed: the pull-back now skips dates where the weekday is given. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "timer 1:30" is read as 1:30pm instead of one and a half minutes. "remind me at quarter past 3" and "remind me by 5" keep the phrase in the title with no time. "in 10 minutes remind me to stretch" and "hey loon remind me …" are not matched. "egg timer 5 minutes" is not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-11 — memory commands (fourth pass)

Tried 39 phrasings such as "stop remembering things", "don't remember that", "turn off memory", "do you remember my name?", "remember that I'm vegetarian", "forget the pork thing", "I'm vegan, remember that" and "wipe your memory".

As a user, the save and forget phrasings all worked. The gap was "stop remembering things", "don't remember that" and "turn off memory". They went to the language model, which cannot change any setting and could easily answer "okay, I'll stop remembering".

Fixed: these phrasings now get a short code answer that says Loon only keeps what you tell it, and that Privacy mode turns recall and learning off. Test added in test/brain.test.js, it fails without the change.

Left for later: "do you remember my name?" still goes to the model, which has no view of the memory list unless recall picks it up. "from now on call me Sam" and "call me Sam" are not parsed as name changes. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — typed questions and instant answers (tenth pass)

Tried 40 phrasings such as "what is the weekday", "what day of the week is it", "what's the date tomorrow", "what is tomorrow's date", "what's the time rn", "what's your name", "time in tokyo", "days till christmas" and "what year is it".

As a user, the worst problem was clock and calendar questions going to the language model, which cannot know today. "What is the weekday" and "what's the date tomorrow" are the kind of question where a guess looks believable and is wrong. "What's your name" also took a model call for a fixed answer.

Fixed: weekday questions and "tomorrow's date" or "the date yesterday" now get a code answer, "rn" counts like "right now", and "what's your name" gets the identity answer. Test extended in test/brain.test.js and checked to fail before the change.

Left for later: "what week is it", "how many days until easter" or "thanksgiving", "is it the weekend", "your name?" without a verb and "what month" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-11 — selection chips and classification (eleventh pass)

Tried 54 selections such as paths, prices, emails, URLs, dates, emoji, bullet lists, SQL, shell commands and a spread of error lines from JavaScript, Python, Rust, npm and git.

As a user, the worst problem was that real errors copied from the terminal were treated as plain sentences, so Loon offered Explain and Define instead of the error help. This hit "Cannot set properties of null", Rust's "thread 'main' panicked at ...", rustc's "error[E0382]: ..." and npm's "ERESOLVE unable to resolve dependency tree".

Fixed: the classifier in extension/lib/classify.js now recognizes these four shapes (and the ELIFECYCLE code) as errors. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "Module not found: Error: Can't resolve ..." and React key warnings still read as sentences. File paths, "x = 5" and a short bullet list are still words or sentences. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — history (eleventh pass)

Tried 32 phrasings such as "what were we talking about", "did we talk about react", "anything about rust in my history", "show me what i asked about css", "remind me what we discussed about docker", "last thing we talked about" and "recall docker".

As a user, the worst problem was that "remind me what we discussed about docker" created a reminder titled "what we discussed about docker". The others ("did we talk about react", "what were we talking about", "anything about X in my history", "show me what I asked about X") went to the language model, which cannot see Loon's history.

Fixed: these five forms now open history, with the topic as the search word when there is one. Test added in test/assistant.test.js.

Left for later: "recall docker", "what was that thing I asked about docker", "last thing we talked about", typos ("wat did i ask") and a trailing emoji ending up as the search word ("what did I ask 🐱").

## 2026-11-12 — routines (twelfth pass)

Tried 25 phrasings such as "every morning remind me to take vitamins", "every sunday evening …", "every monday and thursday at 7pm …", "every 1st of the month …", "every other week …", "every two hours remind me to drink water", "every day at 9am and 9pm …" and "evry day at 9 …".

As a user, most forms parsed well. The worst problem was "every two hours remind me to drink water". The schedule was not read at all, so the card fell back to asking instead of making a routine. The same happened with "every thirty minutes" and "in two hours".

Fixed: counts spelled as words (two to ten, twelve, fifteen, twenty, thirty) now work for "every N hours or minutes" and "in N hours or minutes". Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every day at 9am and 9pm" gives no schedule. A typo such as "evry day" gives no routine. "daily at 6" is read as 6pm. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — open and launch commands (fourth pass)

Tried 36 phrasings such as "open a new tab", "open an incognito window", "open the file report.pdf", "open Slack and Teams", "open chrome and slack", "open the link", "open the app", "open System Settings", "open www.apple.com" and "open /Applications/Safari.app".

As a user, the vague ones were the worst. Loon showed a confirm card to launch an app called "a new tab", "file report.pdf", "Slack and Teams" or "link", and macOS then failed.

Fixed: targets that start with "a" or "an", "file ...", or are just "link", "app", "page", "website" or "site", and targets joining two apps with "and" or "&", now go to the chat instead of a confirm card. Test added in test/assistant.test.js.

Left for later: opening a file by name ("open report.pdf") still tries to launch an app, and two apps in one request could be two confirm cards. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — developer help, error table (twelfth pass)

Tried 30 errors such as "fetch failed" rejections, an aborted request DOMException, Postgres "relation does not exist", curl and Chrome connection refused, Python ValueError and KeyError, npm ELIFECYCLE, EADDRINUSE and Spring bean errors.

As a user, most were answered instantly. The gaps were the leftovers from the last pass plus browser and curl wording for a refused connection, which only matched the Node ECONNREFUSED code.

Fixed: added table entries for failed fetches, aborted requests and missing SQL tables, and the connection refused entry now also matches the browser and curl wording. Test added in test/modes.test.js.

Left for later: more database dialect messages and Docker build errors. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — writing tools by voice (eighth pass)

Tried 30 spoken edit phrasings such as "say it shorter", "make this a bit more polite", "write it more formally", "tone it down", "make it punchier", "clean this up", "expand this" and "make this shorter and more professional".

As a user, small variations of asks Loon already handles fell through to the slow question path with no selection attached.

Fixed: brain/intents.js now reads "say it shorter" as shorter, "make this a bit more polite" as professional, and "write it more formally" or "say it politely" as professional. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: casual, longer and bullet-point edits have no task, so "make it more casual" and "expand this" still go to the model. "clean this up" and "make it punchier" are not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — food and menu (thirteenth pass)

Tried a 30 line menu with pizza, eggplant parmigiana, bacon-wrapped dates, tuna melt, bolognese, crab cakes, ceviche, shakshuka, ratatouille, "Chicken-free Nuggets", gnocchi in butter and lentil soup, then ran the lightest, protein and vegetarian picks.

As a user, the vegetarian and lightest picks were sensible. The protein pick listed "Chicken-free Nuggets" as "protein from chicken", which is plainly wrong. The vegetarian check already ignored "-free" words but the protein check did not.

Fixed: the protein check now skips "-free" words such as chicken-free and dairy-free. Test added in test/modes.test.js.

Left for later: plant-based dishes such as "vegan chicken wings" still say protein from chicken. Nasi goreng (often shrimp paste) and egg fried rice are still called likely vegetarian. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — follow-up conversations, apologies and thanks (eleventh pass)

Tried 45 short replies inside an open thread such as "sorry", "my bad", "oops sorry", "good morning", "ok thanks!", "thanks loon", "got it", "lol", "😂", "👍", "gracias", "merci", "danke" and "arigato".

As a user, the worst problem was that saying sorry to the cat cost a full model call, and so did thanks in another language. "sorry" or "my bad" started the local model, and "gracias" or "danke" got a model reply instead of the purr.

Fixed: an apology ("sorry", "my bad", "oops sorry", "I'm sorry loon") now gets an instant reply from code, and the thanks reply also knows gracias, merci, danke, grazie, obrigado and arigato. An apology followed by a request ("sorry, what about udp") still goes to the model. Test added in test/brain.test.js.

Left for later: "lol", "haha", "got it", "cool" and emoji-only replies still go to the model. "no thanks" and "yes" are left alone on purpose because they can answer a question from the cat. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-12 — page kinds (eleventh pass)

Tried 30 pages such as pharmacy and code hosts, shops priced in kr, zł, R$ and pesos, and forms with fields named cc_number, ccnum, card_no, cc-exp, totp, mfa_code, seed_phrase, private_key and tax_id.

As a user, the worst problem was privacy. A card form using common field names like cc_number or ccnum, an authenticator code box, a wallet seed phrase and a private key box all looked like ordinary pages, so Loon stayed active while I typed them.

Fixed: extension/lib/page-kind.js treats those field names as card or identity fields. Names are matched exactly or by a specific phrase so ordinary fields like private_note stay normal. Test added in test/browser.test.js and checked to fail before the change.

Left for later: shops priced in kr, zł and R$ or with a word like MXN are not seen as shops. Codeberg is not a code host, Google Docs is "other", and a bank on an unknown domain is not caught by words in its title. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-12 — memory and privacy, redaction (twelfth pass)

Tried 33 snippets such as card numbers with dashes, SSNs, AWS secret keys, IBANs, connection strings, curl headers, spoken passwords, OTP codes, a seed phrase, private key blocks, reset URLs and `docker login -p`, `sshpass -p` commands.

As a user, three things leaked. `docker login -u bob -p mysecretpw` and `sshpass -p mysecretpw ssh host` sent the password to the model, and so did a bare `Authorization: <value>` header with no Bearer or token word.

Fixed: brain/redact.js hides the value after `-p` on docker login, podman login and sshpass, and hides any long value in an Authorization header. `docker run -p 8080:80` is left alone. Test added in test/browser.test.js.

Left for later: wallet seed phrases, emails and phone numbers are not hidden. A spoken password with spaces ("hunter two") leaks the later words. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-12 — shopping and unit price (thirteenth pass)

Tried 45 size strings such as "Pack of 2 - 16 oz each", "6 Count (Pack of 4)", "12 fl oz (Pack of 24)", "1 qt 14 fl oz", "Value pack 3 x 150 g", "24 cans", "60 softgels", "100 tea bags" and "Pack of 100 count", plus 20 price strings.

As a user, almost everything parsed well. The worst case was "Pack of 100 count", which came out as 10,000 items, so the unit price looked a hundred times too cheap. Cans, bottles, tabs, softgels and gummies with no other size gave no quantity at all, so those items dropped out of the comparison.

Fixed: brain/shopping.js reads "pack of N count" as N and counts cans, bottles, tabs, softgels and gummies. "6 Count (Pack of 4)" is still 24. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "100 tea bags" and "1 stk" still give nothing. "2 × 6 × 330 ml" reads as 2 packs, and "$1 299.00" reads as 1. A price quoted per unit such as "$5.99/lb" is treated as the item price. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-12 — onboarding first run, interests and allergy lead-ins (eleventh pass)

Tried 28 answers for the "Get to know you" boxes, such as "peanuts, tree nuts", "Peanuts (severe)", "I like cooking", "my interests are chess", "dairy-free", "none 🙂", "Ada, but my friends say A" and "my name is Bob and I like pizza".

As a user, the worst problem was that natural sentences were saved word for word. "I like cooking" became "I'm interested in I like cooking" and "my interests are chess" became "I'm interested in my interests are chess".

Fixed: the shared list reader drops "I like", "I love", "I enjoy", "I'm into", "my interests are" and "my allergies are" before splitting. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "dairy-free" is saved as "allergic to dairy-free", "none 🙂" is saved as an allergy, "nothing really, just dislike cilantro" is saved as an allergy, and a name with a trailing sentence ("Bob and I like pizza") is kept whole. Allergies are safety facts, so these need a deliberate wording decision.

## 2026-11-12 — settings UI, reply style feedback (ninth pass)

Tried 43 style requests such as "shorter please", "tl;dr", "more detail", "less formal", "no more emoji", "stop being so chatty", "reply in spanish", "drop the jokes", "no puns", "serious mode", "you talk too much" and "more professional tone".

As a user, most wordings worked. Five natural ones did nothing and went to the model as questions, so the setting never changed. They were "you talk too much", "drop the jokes", "no puns", "serious mode" and "more professional tone".

Fixed: parseFeedback in brain/personal.js now reads those wordings, plus "drop the puns", "less cat puns" and "you're talking too much". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "explain more", "go deeper", "be funnier", "be warmer", "be direct", "stop the cat talk" and a Spanish request like "en español por favor" have no matching setting or are not read. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-13 — translation and definitions (thirteenth pass)

Tried 42 typed lookups such as "whats ephemeral", "define ephemeral 😅", "wat does serendipity mean lol", "what does café mean", "can u define nostalgia pls", "another word for big please", "opposite of 'up'" and "what does 'bite the bullet' mean".

As a user, nearly all wordings worked. The one clear miss was texting spelling. "can u define nostalgia pls" skipped the instant dictionary and went to the model, and the same happened for synonym and opposite asks.

Fixed: the shared politeness lead-in in brain/define.js now accepts "can u", "could u" and "would u" for definitions, synonyms and antonyms. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "what does 'bite the bullet' mean" (idioms of three words) and "whats ephemeral" with no verb go to the model on purpose, since WordNet has no idioms and the second could be about anything. "other ways to say hello" and "a better word for said" are not read as synonym asks. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-13 — reminders, timers and focus (thirteenth pass)

Tried 29 inputs such as "in 10 minutes remind me to stretch", "tomorrow at 9 remind me to email bob", "hey loon remind me to drink water in 20 min", "timer 1:30", "egg timer 5 minutes", "remind me every day to stretch" and "set a timer for 2 mins 30 secs".

As a user, the worst problem was putting the time first. "in 10 minutes remind me to stretch" is how people talk and it went to the model, which cannot create a reminder. "hey loon remind me …" missed for the same reason. "timer 1:30" set a reminder for 1:30pm instead of ninety seconds.

Fixed: parseCommand now handles a leading time phrase before "remind me", stripPoliteness drops a bare "hey loon" prefix, and a m:ss timer length is read as minutes and seconds. Test added in test/assistant.test.js.

Left for later: "remind me every day to stretch" and "stretch every morning" still make a one-time reminder with "every" in the title, which is dishonest and should be refused or sent to Routines. "set a timer for 2 mins 30 secs" drops the seconds. "egg timer 5 minutes" and "remind me at quarter past 3" are not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-13 — selection chips and classification (twelfth pass)

Tried 37 selected error and prose lines, covering webpack, React, CORS, browser console, Maven, pip and Node messages plus plain words, paths and commands.

As a user, the worst problem was that common web developer errors still read as plain sentences, so Loon offered Explain and Define instead of the error help. This hit "Module not found: Error: Can't resolve ...", the React "unique key prop" warning, CORS policy blocks, "Cannot find module 'x'", "Failed to load resource" and Maven "[ERROR] Failed to execute goal".

Fixed: the classifier in extension/lib/classify.js now treats these shapes (plus hydration failures, unhandled rejections and pip's "Could not find a version") as errors. Test added in test/browser.test.js.

Left for later: file paths, "x = 5", "CORS error" and a bare "Traceback" are still words. "zsh: permission denied: ./run.sh" reads as a sentence. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-13 — developer help, JSON to DTO and recurring reminders (fourteenth pass)

Tried 14 inputs, among them 19 and 20 digit ids, arrays of mixed numbers, empty arrays, null-only fields and ISO dates and times for the DTO generator. I also re-checked the recurring reminder wordings left open in the last reminders pass ("remind me every day to stretch", "remind me daily to take pills", "remind me every monday at 9 to submit report", "remind me to drink water every hour").

As a user, nothing broke. The recurring wordings look wrong when sent to the one-time reminder parser alone, but the app tries Routines first (main/companion.js), so each one becomes a proper routine card with the right schedule. The DTO output was correct for every input, including `getID` style getters, which Jackson maps back to `id`.

Fixed: nothing, no code change.

Left for later: a 20-digit id is still generated as `double`, which loses precision. `BigInteger` would be exact but is a rare input. The one-time parser still returns a garbled title for "every" wordings if it is ever called without Routines in front of it.

## 2026-11-13 — voice intents (tenth pass)

Tried 55 spoken phrasings such as "could you please summarize this", "can you please explain this", "no, don't", "tl;dr this page", "what should I get", "good night", "mute", "speak up", "is this overpriced" and "what does this error mean".

As a user, the worst problem was a double politeness lead-in. "Could you please summarize this" skipped the template because only one of "could you" or "please" was removed, so it went to the model with no selection attached. Saying "no, don't" to a confirm card was also not read as a no.

Fixed: the spoken lead-in strip now removes any run of "please", "can you", "could you", "would you" and "will you". The no list accepts "no don't", "no stop", "no cancel" and "don't do it". "tl;dr this page" now summarizes the page. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "repeat that", "say that again", "mute", "louder" and "good night" go to the model, since Loon has no replay or volume command. "is this overpriced", "which is lighter" and "highest protein" are plain questions. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-13 — typed questions and instant answers (eleventh pass)

Tried 40 clock and calendar phrasings such as "can you tell me the time", "do you know what time it is", "what time it is", "current date and time", "what day was yesterday", "what day is it tomorrow", "days till xmas", "what week is it" and "is it friday".

As a user, the worst problem was that the polite way of asking the time ("can you tell me the time", "do you know what time it is") went to the language model, which cannot know the time. "Current date and time" and "what day was yesterday" had the same problem.

Fixed: instantKey drops "can you tell me", "do you know", "i need to know" and a leading "tell me" before a question, and reads "xmas" as christmas. The time answer accepts "the time" and "what time it is". New code answers for "date and time" and for "what day was yesterday" or "what day is it tomorrow". Test extended in test/brain.test.js and checked to fail before the change.

Left for later: "what week is it", "is it the weekend", "is it friday", "how many days until thanksgiving" or "easter", "how many days left in the year" and "which day is it" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-13 — reminders, timers and focus (fourteenth pass)

Tried 12 timer wordings such as "set a timer for 2 mins 30 secs", "timer 2 min 30 sec", "timer 90 seconds", "timer 1h30m", "2 minute timer" and "timer for an hour and a half".

As a user, the worst problem was the short form "secs". "set a timer for 2 mins 30 secs" silently became a two minute timer, and "timer 90 secs" was not understood at all.

Fixed: extractWhen in brain/commands.js now reads "sec" and "secs" as seconds, since chrono-node only knows the long word. Test extended in test/assistant.test.js and checked to fail before the change.

Left for later: "egg timer 5 minutes" is still not matched. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-13 — writing tools, spoken and typed edits (ninth pass)

Tried 36 edit phrasings such as "pls shorten this", "plz proofread", "warmer", "more formal", "make it casual", "make this longer", "turn this into bullet points" and "tone it down".

As a user, the worst problem was that "pls" and "plz" were not treated like "please", so "pls shorten this" went to the model as a question. Bare tone words like "warmer", "friendlier" and "more formal" did the same.

Fixed: normalize in brain/intents.js now drops "pls" and "plz" like "please", and "warmer", "friendlier", "more formal", "more professional" and "more polite" map to the existing tasks. Test extended in test/voice.test.js and checked to fail before the change.

Left for later: there is no task for "make it casual", "make it longer", "turn into bullets" or "tone it down", so they still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones.

## 2026-11-13 — memory commands (fifth pass)

Tried 31 phrasings such as "keep that in mind: I'm lactose intolerant", "do you remember my name", "could you please remember my name is Sam", "forget my name", "forget everything about pork", "wipe your memory" and "remember I like cats" with an emoji.

As a user, the worst problem was that "keep that in mind" and "keep this in mind" saved nothing and went to the model, which cannot store anything. "Do you remember my name" also went to the model instead of looking at the saved facts.

Fixed: parseCommand in brain/commands.js accepts "keep that/this/it in mind" as a remember command and reads "do you remember/know my X" as a recall about X. Test extended in test/assistant.test.js and checked to fail before the change.

Left for later: "from now on call me Sam", "stop remembering things", "you can forget the peanut thing", "save this to memory" and "do you remember what I told you" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-13 — shopping and unit price (fourteenth pass)

Tried 19 price strings and 16 size strings such as "$5.99/lb", "Was $20.00 Now $15.00", "$1 299.00", "99¢", "1 pint", "2 × 6 × 330 ml", "100 tea bags", "1/2 gallon" and "half dozen".

As a user, the worst problem was "2 × 6 × 330 ml", which came out as 660 ml instead of twelve cans (3960 ml), so the unit price looked six times too high. "$1 299.00" was read as $1, and "100 tea bags" gave no quantity.

Fixed: brain/shopping.js multiplies the first two numbers in a "a x b x size" chain, counts tea bags, and joins a space grouped thousands part when a currency symbol and a decimal point follow. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a price range ("$5.00 - $7.00") still uses the low end, and "$5.99/lb" is taken as the item price. "$1,299.00 $999.00" with no "was" or "now" word takes the first number. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.
