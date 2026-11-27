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

## 2026-11-13 — history (twelfth pass)

Tried 25 phrasings such as "recall docker", "what did we say about react", "find what I asked about python", "what did I ask 🐱", "last thing we talked about", "wat did i ask" and "clear my history".

As a user, the worst problem was "find what I asked about python", which started a file search for the words "what I asked about python". "What did we say/discuss/talk about react" went to the language model, which cannot see history. An emoji after the topic became the search word.

Fixed: parseCommand in brain/commands.js sends these to history with the topic, and recallQuery drops emoji. Test extended in test/assistant.test.js and checked to fail before the change.

Left for later: "recall docker", "what was that thing I asked about docker", "last thing we talked about", typos like "wat did i ask", and "clear my history" (no command, it should point at Settings) are not handled.

## 2026-11-13 — food and menu (fourteenth pass)

Tried a menu with vegan chicken wings, a Beyond burger, plant-based beef tacos, plant-based ribs, grilled chicken salad and an Impossible sausage pasta, then ran the protein pick.

As a user, "Vegan Chicken Wings" was listed as "protein from chicken", which is wrong for a plant-based dish. The vegetarian check already knew these names but the protein check did not.

Fixed: the protein check now removes the same meat-free phrases (vegan chicken, plant-based ribs and so on) before matching. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Plant-based Beef Tacos" still says protein from beef because tacos is not in the list of meat-free dish words. Egg fried rice and nasi goreng are still called likely vegetarian. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-14 — open and launch commands (fifth pass)

Tried 44 phrasings such as "open report.pdf", "open notes.txt", "open /tmp", "open ~", "open ~/Desktop/a.txt", "open https://x.com?a=b", "open Spotify!", "open vs code", "open the trash" and "open terminal and run ls".

As a user, file names and paths got a confirm card to launch an app called "report.pdf" or "/tmp", and macOS then failed. A link with a query string and no slash, like "https://x.com?a=b", was also treated as an app.

Fixed: names ending in a common file extension and anything starting with "/" or "~" now go to the chat, and "?" or "#" count as part of a link. Test added in test/assistant.test.js. One older assertion expected "open notes.txt" to launch an app, and I changed it to expect the chat since that card could only fail.

Left for later: "open the trash", "open home folder" and "open 192.168.1.1" (opened as https) are still off. Opening a file by name could be a separate confirmed action. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-14 — onboarding first run, diet wording and emoji (twelfth pass)

Tried 25 answers for the "Get to know you" boxes, such as "dairy-free", "gluten free", "none 🙂", "no allergies!", "Peanuts (severe)", "only mild to cats", "call me Ada", "Dr. Strange" and "chess 🎲, hiking".

As a user, the worst problem was that "dairy-free" and "gluten free" were saved as "I'm allergic to dairy-free", and "none 🙂" was saved as an allergy to "none 🙂". Loon would then give wrong food advice from a wrong fact.

Fixed: the allergy box now turns "X-free" into "I avoid X", and emoji are dropped from list answers before the "none" check. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "nothing really, just dislike cilantro" and "only mild to cats" are still saved as allergies, and a name with a trailing sentence ("Bob and I like pizza") is kept whole. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-14 — routines (thirteenth pass)

Tried 26 phrasings such as "daily at 6 remind me to stretch", "every night at 10 …", "remind me every friday at 5pm to …", "every tues at 3 …", "every 15 min …", "hourly …", "twice a day …", "every last friday of the month …" and "every week day at 9 …".

As a user, nearly everything parsed well. The worst problem was "every week day at 9 remind me to check mail". It became a Saturday routine with the label "Day remind me to check mail", which is wrong and looks confident.

Fixed: the weekday rule now accepts "week day" with a space. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every day at 9am and 9pm" and "every last friday of the month" correctly ask instead of guessing, but could be supported. "daily at 6" is still read as 6pm.

## 2026-11-14 — memory and privacy, redaction (thirteenth pass)

Tried 34 snippets such as spoken passwords, .env lines, curl headers and users, connection strings, cvv and SSN variants, Wi-Fi passwords, placeholders like `${SECRET_KEY}` and error messages that mention passwords.

As a user, the annoying case was over-redaction. "Error: password is required" and "the password is incorrect" became "password is [redacted:secret]", so the model lost the actual error I wanted explained.

Fixed: the spoken "password is X" rule skips common error words (incorrect, required, invalid, missing, expired and similar). Real values like "my password is swordfish" are still hidden. Test added in test/browser.test.js.

Left for later: an unquoted multi-word password ("password: correct horse battery staple") still leaks the later words. Phone numbers and emails are not hidden.

## 2026-11-14 — developer help, error table (thirteenth pass)

Tried 50 pasted errors from Node, React, Python, Java, Rust, Go, git, npm, SQL, Docker, Kubernetes and PowerShell.

As a user, the worst problem was a wrong answer. "ENOSPC: System limit for number of file watchers reached" was explained as a full disk, which sent people to clean files when the fix is an inotify limit. An npm "code E404" for a missing package was explained as a web page 404. PowerShell's "is not recognized as the name of a cmdlet" was not recognized as a missing command.

Fixed: added table entries for the file watcher limit and for npm package not found, and the command not found entry now matches the PowerShell wording. Test added in test/modes.test.js and checked to fail before the change.

Left for later: pip "Could not find a version", Rust E0502, TypeScript TS2339, Invalid hook call and Maximum update depth in React, exit code 137, CrashLoopBackOff, ImagePullBackOff and Spring HttpRequestMethodNotSupportedException have no entry. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-14 — page kinds, shops priced in kr, zł and yen (twelfth pass)

Tried 14 shop pages with three prices and an add to cart button, priced as 199 kr, 99,99 zł, 199 Kč, 1,980円, 99 PLN, BRL 49,90, 19.99 $ and also $199 MXN, A$, C$, ₹ and € 19,99.

As a user, a Scandinavian, Polish, Czech, Japanese or Brazilian shop in local format was seen as an ordinary page. The shopping chips and the price offer never showed up.

Fixed: the price pattern in extension/lib/page-kind.js now accepts kr, zł, Kč, 円, a trailing $ and the SEK, NOK, DKK, PLN, CZK, BRL and JPY codes before or after the number. Test added in test/browser.test.js and checked to fail before the change.

Left for later: Codeberg is not a code host, Google Docs is "other", and a bank on an unknown domain is not caught by words in its title. Prices in shopping.js (PRICE_TEXT) still only know $, €, £, ¥ and ₹ symbols, so comparing on those shops may still fail. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-14 — follow-up conversations, laughs and acknowledgements (twelfth pass)

Tried 40 short replies inside an open thread such as "lol", "LOLLL", "haha", "lmao", "got it", "ok got it", "makes sense", "i see", "understood", "noted", plus near misses such as "got it, now udp" and "lol what about ports".

As a user, the worst problem was that laughing at an answer or saying "got it" cost a full local model call. The model replies slowly and sometimes with a new explanation nobody asked for.

Fixed: laughs and plain acknowledgements now get an instant reply from code. The same words followed by a request still go to the model. Test added in test/brain.test.js and checked to fail before the change.

Left for later: emoji-only replies are cleaned to an empty key and still go to the model. "cool", "ok", "yes" and "no" are left alone on purpose because they can answer a question from the cat. The failures in `npm test` are the same ones as on main in this sandbox (missing built data and dependencies).

## 2026-11-14 — settings UI, reply style feedback (tenth pass)

Tried 48 style and language requests such as "switch back to english", "way shorter", "a lot shorter", "spanish please", "explain more", "be funnier", "ELI5", "shorter and no emoji" and "reply in japanese only".

As a user, the most annoying miss was "switch back to english" after asking for Spanish. It went to the model as a question and the setting stayed on Spanish. "way shorter" and "a lot shorter" also did nothing.

Fixed: parseFeedback in brain/personal.js now reads "switch back to", "change back to" and "go back to" a language, and ignores "a lot", "way" and "far" as intensity words. Test added in test/personal.test.js and checked to fail before the change.

Left for later: bare "spanish please" and "in spanish" are ambiguous with a translate request, so they stay with the model. Combined requests like "shorter and no emoji" only change nothing. "ELI5" and "simpler" have no matching setting. The 5 failing tests in `npm test` are the usual sandbox ones.

## 2026-11-14 — translation and definitions (fourteenth pass)

Tried 24 typed synonym and antonym asks such as "a better word for said", "other ways to say happy", "words that mean happy", "a word meaning happy", "opposite word for hot", "contrary of hot" and "antonyms for good and bad".

As a user, the natural "other ways to say X" and "a better word for X" forms skipped the offline lookup and went to the language model, even though "another word for X" worked.

Fixed: synonymTerm accepts "better/other/different/another word(s) or way(s) for or to say", "words that mean" and "a word meaning". antonymTerm accepts "opposite word for" and "contrary of". Assertions added in test/brain.test.js. They fail before the change.

Left for later: "reverse of X" is ambiguous (it is also a code ask) so it still goes to the model. "hot opposite", "opposite hot" and lists like "antonyms for good and bad" are not parsed. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-14 — food and menu (fifteenth pass)

Tried a 22 item menu with starters and mains in the usual price formats, and asked for lightest, highest protein and vegetarian picks.

As a user, "Poached Eggs Benedict with hollandaise" showed up as a light and high protein pick because "poached" counts as light and hollandaise (a butter sauce) was unknown. Tempura, gratin and korma had the same blind spot.

Fixed: added hollandaise, tempura, gratin and korma to the heavy words in brain/food.js. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: Eggs Benedict still counts as vegetarian, which is right, but "Chicken Tikka Masala" has no cream signal. Protein ranking only counts distinct protein words, so a large steak and a small egg side tie. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-14 — shopping and unit price (fifteenth pass)

Tried 21 price strings and 30 size strings such as "Regular price $20.00 Sale price $15.00", "List Price: $29.99 Price: $19.99", "MSRP $60 Our price $45", "$5.00 - $7.00", "€12,50", "₹1,499", "pack of 6", "32 oz (2 lb)" and "half gallon". Sizes all came out right.

As a user, the worst problem was Shopify style labels. "Regular price $20.00 Sale price $15.00" gave $20, so the unit price and the cheapest pick were wrong for any item on sale.

Fixed: parsePrice in brain/shopping.js now treats "sale price", "sale", "current price" and "our price" like "now" and takes the number after the last one. It only does so when a number follows, so "Was $20 (sale ends soon)" still gives 20. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a price range ("$5.00 - $7.00") uses the low end, "$1,299.00 $999.00" with no label takes the first number, and "List Price: $29.99 Price: $19.99" takes the list price. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-14 — developer help, error table (fourteenth pass)

Tried 36 pasted errors from pip, Rust, TypeScript, React, Kubernetes, Docker, git, Go, Python and Node, picking the gaps named in the last pass.

As a user, eight common errors got no instant answer and went to the slow local model, such as pip "No matching distribution found", React "Invalid hook call" and "Too many re-renders", TypeScript TS2339, Rust E0502, CrashLoopBackOff, ImagePullBackOff and exit code 137.

Fixed: added table entries for those, in brain/errors.js. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a git "Permission denied (publickey)" entry. An existing test says that error must not match, so I did not touch it, and it still goes to the model. Rust "linker cc not found" and Docker "failed to solve" also have no entry. The 38 failures in `npm test` are the same as on main in this sandbox (missing dependencies and built data).

## 2026-11-15 — typed questions and instant answers, math and units (twelfth pass)

Tried 50 typed math and unit questions such as "what's 15% of 80", "how many cups in a gallon", "100 f to c", "what's 1/3 + 1/4", "3(4+5)", "cube root of 27", "15 is what percent of 60" and "what is the square root of 2". Most came out right.

As a user, "15 is what percent of 60" and "what percent is 15 of 60" got no instant answer and went to the language model, which is bad at arithmetic. "what's the square root of 2" missed because of the word "the".

Fixed: calc in brain/calc.js answers the three "what percent" phrasings ("15 is what percent of 60", "what percent is 15 of 60", "15 out of 60 as a percent") and accepts "the square root of". Cases added in test/brain.test.js and checked to fail before the change.

Left for later: "cube root of 27", "pi * 2", "3(4+5)", "1e3 + 1", currency conversion ("100 usd in eur") and "2 dozen" are not handled. Temperature answers keep the typed unit letters ("37.7778 c"), which reads oddly. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-15 — selection chips and classification (thirteenth pass)

Tried 45 selected terminal, database, Kubernetes, git and browser error lines next to plain prose.

As a user, the worst problem was that common terminal and browser failures read as words or sentences, so Loon offered Define instead of error help. This hit "zsh: permission denied: ./run.sh", "net::ERR_CONNECTION_REFUSED", "Permission denied (publickey).", "Access denied for user", git "[rejected]" and "CONFLICT" lines, certificate errors, "CrashLoopBackOff", "OOMKilled" and "Failed to fetch".

Fixed: the error line check in extension/lib/classify.js now covers these shapes. Plain prose such as "The quick brown fox" and "Your branch is ahead of 'origin/main'" stays prose. Cases added in test/browser.test.js and checked to fail before the change.

Left for later: a bare "Traceback", "CORS error", "Connection refused", "Out of memory", "Killed: 9", "No such file or directory" and "ssh: connect to host ... timed out" are still not treated as errors, because short phrases like these are also ordinary words. The 38 failures in `npm test` here come from the sandbox install having no node_modules and are the same on main.

## 2026-11-15 — writing tools by voice (tenth pass)

Tried 40 spoken edit phrases on a selection, such as "make this more casual", "make it less formal", "write this more casually", "make it longer", "turn this into bullet points" and "make this sound more confident".

As a user, "make it casual" and its variants were not recognized as an edit. They went to the model as a plain question, so the answer had no Replace or Copy actions, even though Professional and Warmer work that way.

Fixed: added a Casual task (brain/tasks.js, brain/router.js) and the spoken phrases for it (brain/intents.js). It is replaceable like Warmer. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "expand this", "turn this into bullet points", "make it punchier" and "make this sound more confident" still go to the model as questions. "make this shorter and friendlier" combines two edits and is not split. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-15 — history (thirteenth pass)

Tried 23 history phrasings such as "recall docker", "last thing we talked about", "clear my history", "forget my history", "erase my history" and "what did you tell me about docker".

As a user, the worst problem was clearing history by voice or text. "forget my history" searched memories for the words "my history", and "clear my history" and "erase my history" went to the language model, which could claim it had cleared them.

Fixed: parseCommand in brain/commands.js now reads these as a history wipe, and main/actions.js answers that it is done in Settings → History, the same way a blanket memory wipe is handled. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "recall docker", "what was that thing I asked about docker", "last thing we talked about", "recent questions about css", the typo "wat did i ask" and "what did you tell me about docker" are still not handled. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-15 — memory commands (sixth pass)

Tried 32 phrasings such as "from now on call me Sam", "call me Sam", "you can forget the peanut thing", "stop remembering things", "save this to memory", "rembmer I like tea", "remember me" and "forget what I said about pork".

As a user, the worst problem was that "call me Sam" and "from now on call me Sam" went to the language model, which cannot store a name and may say it will. "You can forget the peanut thing" also went to the model.

Fixed: parseCommand now saves "call me X" (one or two plain words, so "call me back" and "call me when you land" are left alone) and accepts "you can / feel free to forget …". Test added in test/assistant.test.js.

Left for later: "stop remembering things", "save this to memory" with nothing after it, "do you remember what I told you", "what's my name" and typos like "rembmer" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-15 — developer help, JSON to DTO (eleventh pass)

Tried 12 inputs for the DTO generator, among them keys like `first-name`, `2fa` and `user id`, mixed ISO dates, a top-level array with differing keys, JSON lines, nested arrays, an empty key, upper case keys like `URL` and a UUID value.

As a user, nothing broke on the paths a person can reach. Java output uses `@JsonProperty` where a plain getter would not bind, TypeScript quotes odd keys, and an array of objects merges into one type with the missing field made nullable.

Fixed: nothing, no code change.

Left for later: the Kotlin entry in `DTO_LANGUAGES` fails with "Unknown value just-types for option framework" because `just-types` is a separate Kotlin option. No chip or command uses Kotlin, so a user cannot hit it, but it will break the day one is added. Two objects pasted back to back (`{"a":1}{"b":2}`) are reported as invalid JSON. There is also no typed way to ask for a DTO, only the chips on a selection. Typing "make a typescript interface from this json" goes to the model.

## 2026-11-15 — voice intents (eleventh pass)

Tried 90 spoken phrasings such as "um hey loon explain this", "can you like explain this", "so like make it shorter", "just summarize this", and at a confirm card "yeah go for it", "yes yes", "absolutely", "of course", "no no no", "oh no", "actually no" and "nope don't".

As a user, the worst problem was that natural answers to a confirm card were not understood. "No no no" and "nope don't" were read as new questions, so the card stayed open and the model was called. "Absolutely" and "yeah go for it" did the same for yes. A filler before the wake phrase ("um hey loon ...") or a "like" or "just" in the lead-in sent a plain command to the model with no selection attached.

Fixed: the spoken lead-in strip now removes fillers, "like", "just", "actually" and the wake phrase in any order, for templates, commands and questions alike. The yes and no lists accept repeated words and common extras. Tests added in test/voice.test.js and checked to fail before the change.

Left for later: "read this to me", "make it funnier", "make it longer", "expand this", "save this", "copy that", "translate this into french" and "fact check this" have no voice template and go to the model. "I said no" at a card is still a question. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-15 — reminders, timers and focus (fifteenth pass)

Tried 30 inputs such as "remind me at quarter past 3 to call mom", "remind me at half past 4", "egg timer 5 minutes", "start a 25 minute pomodoro", "wake me at 7", "timer 45 sec", "remind me tmrw to buy milk" and "cancel my timer".

As a user, the worst problem was "at quarter past 3". It made a reminder with no time at all and the words "at quarter past 3" left in the title. "egg timer 5 minutes" was not understood.

Fixed: extractWhen in brain/commands.js now reads "quarter past", "half past" and "quarter to" as clock times, and parseCommand reads a named timer with the length after it ("egg timer 5 minutes", "pasta timer for 10 min"). Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "start a 25 minute pomodoro" is not matched, and "cancel my timer" and "what are my reminders" go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-15 — memory and privacy, redaction (fourteenth pass)

Tried 28 snippets such as spoken passwords, "wifi password - blueberry99", "password for the wifi is hunter22", card and SSN variants, verification codes, IBANs, connection strings and a 12 word recovery phrase.

As a user, the worst leak was a crypto recovery phrase, which went to the model untouched. Passwords written with a dash, or as "password for the wifi is X", were also left readable.

Fixed: a new rule hides 12 to 24 word seed or recovery phrases after a lead-in such as "recovery phrase" or "mnemonic". Another rule hides "password - X" and "password for the wifi is X" when the value has a digit, so "password - a quick guide" stays readable. Test added in test/browser.test.js.

Left for later: an unquoted multi-word password still leaks the later words, and a seed phrase pasted with no lead-in is not detected. Emails and phone numbers are not hidden. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-15 — routines (fourteenth pass)

Tried 50 phrasings such as "every mon wed fri at 7am …", "every other day …", "every hour from 9 to 5 …", "every 90 minutes …", "every night at midnight …", "everyday at 7 …", "every fortnight …", "pause all routines", "stop the vitamins routine" and "stop reminding me to stretch".

As a user, creating routines worked well. The worst problem was stopping them. "stop the vitamins routine", "stop reminding me to stretch" and "cancel the stretch reminder" were not recognised, so they went to the language model, which could say it stopped something when it did not.

Fixed: "stop" with a routine or reminder word, or "stop reminding me to X", now pauses the matching routine. "cancel" works like delete and asks for confirmation. "stop the music" is left alone. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every day at 9 and 5 …" makes a card with the message "5 remind me to stretch", which the user must fix. "every first monday" and "every quarter" ask instead of guessing. "run my stretch routine now" is not a typed command. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-15 — onboarding first run, typed sentences in the boxes (thirteenth pass)

Tried 56 answers for the "Get to know you" boxes, such as "I'm lactose intolerant", "shellfish allergy", "allergies: peanuts", "nothing, thanks", "hobbies: chess", "I go by Ada", "call me Ada pls" and "Ada here".

As a user, the worst problem was that "I'm lactose intolerant" was saved as "I'm intolerant to I'm lactose", and "shellfish allergy" as "I'm allergic to shellfish allergy". "allergies: peanuts" kept the label. "nothing, thanks" became an allergy to "thanks". "I go by Ada" and "Ada here" were saved as the name. These wrong facts are pinned and sent with every question.

Fixed: the shared list reader drops "I'm", "allergies:", "interests:" and "hobbies:" lead-ins and treats "thanks" as no answer. The allergy box drops a trailing "allergy". The name box understands "I go by", and drops "pls" and "here". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "no nuts" is saved as an allergy to "no nuts", "celiac" and "lactose" alone are saved as allergies, "mild: dairy" keeps the severity word, and "but only mildly" becomes a second allergy. They need a decision on how far to interpret. The 5 other failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-15 — page kinds, banks and vaults outside the US (thirteenth pass)

Tried 36 sites and forms, such as chase.com, a look-alike bankofamerica.com.evil.com, Canadian, Australian and European banks, robo-advisers, password vaults on .eu domains and a few login forms.

As a user, the worst problem was that logged-in pages of bmo.com, scotiabank.com, cibc.com, westpac.com.au, anz.com, nab.com.au, n26.com, wealthfront.com, synchrony.com and bitwarden.eu counted as ordinary pages. Once the login form is gone there is no password field, so Loon would offer to read an account balance page.

Fixed: these hosts, plus a few other lenders and a health booking site, are now in the sensitive list. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a fixed list will always lag behind real banks. A page text check for "account balance" or "routing number" could catch the rest, but it needs a decision on false positives. login.salesforce.com and console.aws.amazon.com are still treated as ordinary pages. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-16 — translation and definitions (fifteenth pass)

Tried 55 typed and spoken asks such as "give me a definition of ephemeral", "meaning ephemeral", "what is the definition of X", "synonyms for big and small", "translate to english", "translate this into spanish", "how do you say hello in spanish" and "hola in english".

As a user, most dictionary, synonym and antonym asks worked. Two misses stood out. "give me a definition of X" and "meaning X" skipped the offline dictionary. "translate to english" and a bare "translate" with text selected were treated as a question by voice, so the model was called.

Fixed: dictionaryTerm accepts "give/show me a definition of" and a bare "meaning X". The voice translate template accepts a missing "this" and a bare "translate". Tests added in test/brain.test.js and test/voice.test.js. The dictionary one fails before the change.

Left for later: "translate this into french" and "how do you say hello in spanish" go to the model, since the offline translator only targets English and Spanish by default. "what do you mean by X" and "ephemeral means what" are not read as dictionary asks. "define run as a verb" goes to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — follow-up conversations, emoji reactions and stretched thanks (thirteenth pass)

Tried 42 short replies inside an open thread such as "👍", "🙏", "😂😂", "ok", "k", "tyyy", "thankss", "lol thanks", "ok thanks bye", "ah I see now", "np", "best cat ever" and "good kitty".

As a user, the worst problem was that a thumbs up, a prayer hands or a laughing emoji alone cost a full local model call, and the model answers a plain 👍 with a fresh explanation. Stretched thanks such as "tyyy" and "thankss" did the same.

Fixed: an emoji-only warm reaction now gets an instant reply from code, and the thanks rule accepts stretched "thanks" and "ty". The instant key keeps a message that is only emoji instead of cleaning it to nothing. "❓" and "🤔" still go to the model because they ask for more. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "k", "cool", "no problem", "np", "you too", "lol thanks", "ok thanks bye" and "haha nice" still go to the model. Plain "ok" and "cool" can answer a question from the cat, so they need a look at the last answer first. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-16 — open and launch commands (sixth pass)

Tried 44 phrasings such as "open the trash", "open home folder", "open 192.168.1.1", "open mailto:a@b.com", "open file:///tmp/a", "open my downloads", "open system settings", "OPEN SLACK" and "open 10.0.0.1:3000".

As a user, "open mailto:a@b.com" and "open file:///tmp/a" got a confirm card to launch an app with that name, and "open the trash" and "open home folder" did the same. All of these could only fail after I pressed confirm. "open 192.168.1.1" opened https, which most router pages do not serve.

Fixed: bare IP addresses now open as http, and URL schemes other than http and https, plus "trash" and "home folder", go to the chat. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "open chrome 🙂" keeps the emoji in the app name. Opening the trash or home folder could become real folder targets. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-16 — writing tools, typed edits of a selection (eleventh pass)

Tried 45 typed asks such as "make it shorter", "fix my grammar", "proofread this", "make it more polite", "rewrite this professionally", "make it 50% shorter", "expand this", "turn this into bullet points" and "improve my writing".

As a user, the templates for these edits only ran for voice. Typing "fix my grammar" or "make it shorter" next to a selection went to the model as a free question, so the grammar code tier and the cache were skipped and the answer could differ from the chip.

Fixed: a typed ask that is a fixed edit or explain of the selection, at the start of a thread, now runs as the matching chip. The shared check is `selectionTask` in brain/intents.js, used by main/companion.js. Test added in test/voice.test.js. Inside a thread the ask still goes to the model as a follow-up.

Left for later: "make it 50% shorter", "shorten" alone, "make it longer", "expand this", "make it more direct", "make it funnier", "rewrite in a friendlier tone" and "turn this into bullet points" still go to the model. Longer and bullets have no chip yet. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install. The companion change itself could not be run here because it needs Electron.

## 2026-11-16 — history (fourteenth pass)

Tried 32 history phrasings such as "recall docker", "what did you tell me about docker", "what was that thing I asked about docker", "recent questions about css", "remember what we discussed about react" and "wat did i ask".

As a user, the worst problem was that "what did you tell me about docker" and "what did you say about docker" went to the language model, which cannot see past chats and may invent an answer. "remember what we discussed about react" saved a junk memory instead of searching history.

Fixed: parseCommand in brain/commands.js now reads these wordings, plus "recall docker", "that thing I asked about docker" and "recent questions about css", as a history search. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: bare "recall", "last thing we talked about", "what was that thing about css" and typos such as "wat did i ask" still reach the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — food and menu (sixteenth pass)

Tried a 30 item menu with Indian, Japanese, Italian and pub dishes and asked for lightest, highest protein and vegetarian picks.

As a user, the vegetarian list put "Steamed Dumplings" first, and "Buffalo Wings" and "Lasagna" were also marked vegetarian. Those usually hold meat, so Loon was telling a vegetarian something wrong.

Fixed: brain/food.js now treats wings, dumplings, gyoza, potstickers, wontons, siu mai and lasagna as meat dishes unless the name says vegetable, veggie, vegan, cauliflower, spinach or mushroom. Test added in test/modes.test.js and checked to fail before the change.

Left for later: Chicken Tikka Masala has no heavy signal, Poutine (beef gravy) still counts as vegetarian, and bao and empanadas are not covered. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — shopping and unit price (sixteenth pass)

Tried 19 price strings such as "List Price: $29.99 Price: $19.99", "Typical price $30 Price $25", "RRP £50 Price £35", "Reg. $10 Sale $8", "Save $5 $20" and "Price $19.99 /ea".

As a user, the worst problem was Amazon style labels. "List Price: $29.99 Price: $19.99" gave the list price, so the unit price and the cheapest pick were wrong for any discounted item.

Fixed: parsePrice in brain/shopping.js now drops a "list price", "typical price", "original price", "MSRP" or "RRP" amount when another number follows it. A lone "List Price: $29.99" still gives 29.99. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a price range ("$5.00 - $7.00") uses the low end, and "$1,299.00 $999.00" with no label takes the first number. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — developer help, error table (fifteenth pass)

Tried 30 pasted errors such as "zsh: command not found: pnpm", "Permission denied (publickey).", "EADDRINUSE", "ERESOLVE", "Cannot read properties of undefined", a Rust move error, a Go nil panic, a Postgres refusal, a CORS error and a hydration mismatch.

As a user, the table covered most of them. Two common ones went to the local model. "Permission denied (publickey)" on a git push had no answer, and the Windows wording "'pnpm' is not recognized as an internal or external command" was not read as a missing command.

Fixed: brain/errors.js now has an SSH key entry with steps (ssh-add, add the public key to the host, test with ssh -T, check the remote URL) and the command not found entry accepts the cmd.exe wording. Tests added in test/modes.test.js and checked to fail before the change. An older assertion that publickey gave no answer now checks that it does not get the file permission answer.

Left for later: Oracle "ORA-00942" and AWS "Unable to locate credentials" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — typed questions and instant answers, date questions (thirteenth pass)

Tried 38 typed questions such as "how many days until friday", "what day is it in 10 days", "what week is it", "is it a leap year", "how long until 5pm", "flip a coin", "what's my timezone", "days until july 4th" and "what time is it in pst". Time in a named city and the day, date and month answers were fine.

As a user, the worst problem was that questions about days from today went to the language model, which has no clock and would guess a date. "How many days until Friday" and "what day is it in 10 days" are plain date maths.

Fixed: new dateMath in brain/worldtime.js answers "how many days until <weekday>" and "what day or date is it in N days or weeks", and the resolver tries it before the model. Tests added in test/brain.test.js and checked to fail before the change.

Left for later: "what week is it", "how long until 5pm", "days until july 4th" and "thanksgiving", "what's my timezone", "what time is it in pst", "flip a coin" and "roll a dice" still go to the model. Coin and dice need randomness, so they should be decided deliberately. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-16 — settings UI, reply style feedback (eleventh pass)

Tried 56 style requests such as "too long lol", "emojis please", "stop the sass", "be blunt", "just the answer", "too detailed", "no emojis in answers", "normal length" and "reset style".

As a user, the most annoying misses were "too detailed", "too much detail" and "too many words". They are clear complaints about length but went to the model, which then answered at the same length. "no emojis in answers" also did nothing.

Fixed: parseFeedback in brain/personal.js now reads those three as shorter, and accepts "in answers" or "in replies" after the emoji phrases. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "normal length", "reset style", "just the answer", "stop the sass" and "be blunt" have no matching setting or rule. "emojis please" is ambiguous. The 5 failing tests in `npm test` are the usual sandbox ones.

## 2026-11-16 — developer help, JSON to DTO (twelfth pass)

Tried 29 pasted inputs such as single quotes, unquoted keys, trailing commas, comments, Python `True` and `None`, curly quotes, a BOM, a code fence, an HTTP response with headers, a `curl -d` line, `NaN`, JSON lines and cut off JSON.

As a user, almost everything already worked. The one real miss was two objects pasted back to back (`{"a":1}{"b":2}`), or two pretty-printed objects with a blank line between them, which came back as invalid JSON. That happens when copying two log entries or two API responses.

Fixed: parseJson now splits several top-level values and treats them as an array, like it already does for JSON lines. Braces inside strings are respected, and a stray extra `}` still fails. Tests added in test/modes.test.js and checked to fail before the change.

Left for later: the Kotlin entry in `DTO_LANGUAGES` still uses an invalid option. No chip uses it. There is still no typed way to ask for a DTO. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-16 — routines (fifteenth pass)

Tried 24 phrasings such as "every morning at 8 …", "every sunday evening …", "twice a day …", "every day @ 7:30 …", "every wednesday and saturday at 10 …", "every other tuesday …", "every quarter …" and "at 9 every day …".

As a user, nearly all of them worked. The one wrong result was "every day at 9 and 5 remind me to stretch". It made a daily 9:00 routine with the message "5 remind me to stretch" and no warning. "9am and 5pm" was already caught, only the bare hours were not.

Fixed: a second bare hour after "at 9 and" or "at 9," now makes the card ask for the schedule, the same as the am/pm case. "at 9 take 2 pills" and "at 9 and 15 minutes" style wording is left alone. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every other tuesday", "every first monday", "every last friday" and "every quarter" still ask instead of guessing. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-17 — selection chips and classification (fourteenth pass)

Tried 46 selections such as single words, questions, prices, emails, URLs, paths, accented and CJK sentences, bullet lists, short error phrases and long prose.

As a user, nearly all of them worked. The two wrong results were "cat: notes.txt: No such file or directory" and "ssh: connect to host 10.0.0.5 port 22: Connection timed out". Both read as plain sentences, so Loon offered Explain and Define instead of the error help.

Fixed: the error line check in extension/lib/classify.js now recognizes "No such file or directory" and ssh connect failures. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a bare "Traceback", "Connection refused", "Out of memory" and "Killed: 9" are still words. A short dash bullet list reads as one sentence. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — memory commands (seventh pass)

Tried 75 phrasings such as "remember I'm allergic to peanuts", "pls remember I hate cilantro", "forget what I just said", "forget the last thing", "forget my dentist appointment", "don't forget my dentist appointment", "do you know my name" and "remember my password is hunter2".

As a user, the worst problem was in forget. "Forget what I just said" and "forget the last thing" were matched word by word against saved facts, so any fact containing "just", "said", "last" or "thing" was a candidate. A two word request such as "forget my dentist appointment" also removed any fact that held only "appointment", so an unrelated appointment went with it. The confirm card does not show which facts will go.

Fixed: Memory.forget now ignores those conversational words and needs about 60 percent of the remaining words to match, so two word requests need both. Vague references now answer "I didn't have anything like that saved". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remember me?", "remember what I said" and "remember the milk" save junk facts such as "me". "Forget it" and "forget that" go to the model, which may promise to forget. "What's my name", "who am I" and typos like "remmeber" also go to the model. The confirm card for forget should list the facts it would remove. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — page kinds, payment and cloud console hosts (fourteenth pass)

Tried 25 sites such as Salesforce and AWS console logins, Amazon cart and pay, Stripe hosted checkout, Google Pay, Microsoft account, student aid, Gmail, iCloud mail, a hospital portal and an Etsy listing.

As a user, the worst problem was that checkout.stripe.com, pay.google.com, pay.amazon.com, account.microsoft.com, console.aws.amazon.com, login.salesforce.com and studentaid.gov counted as ordinary pages. Loon would offer to read a payment or account page.

Fixed: these hosts are now in the sensitive list. Test added in test/browser.test.js and checked to fail before the change.

Left for later: Shopify style checkouts (`/checkouts/...` with a `credit_card` field name) and card fields inside iframes are still not seen. Kaiser and other health portals on custom hosts are still ordinary pages. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — memory and privacy, redaction (fifteenth pass)

Tried 39 snippets such as card numbers, SSNs with spaces, .env lines, curl headers, OTP and PIN lines, IBANs, a private key and bare tokens from many services.

As a user, the worst leak was a bare token with no "key=" label in front of it. GitLab (`glpat-`), Hugging Face (`hf_`), SendGrid (`SG.`), Google OAuth (`ya29.`), PyPI, Shopify and Slack webhook URLs all went to the model untouched. Most other shapes were already hidden.

Fixed: new api-key rules for those prefixes. Test added in test/browser.test.js. The failures in `npm test` here are the same ones as on main in this sandbox (WordNet, quicktype, Harper and other missing data).

Left for later: `pwd=abc` and `client_secret: abc` with a value under 4 characters, "user bob pass hunter22", Discord bot tokens, and an unquoted multi-word password still leak the later words.

## 2026-11-17 — CI repair, offline translator switched itself off after one failed start

Tried the `packaged` job on 1c41dee. "Translate runs on the offline translator" failed about a second after the previous step, while the packaged smoke check for the same translator passed. The same step failed the same way on 7d790d5 and da41b2f and passed on re-run each time.

What went wrong is in `Translator.supports()`. It asks the translator process for its language list once and keeps the answer for the life of the app. If that first call failed, for example because the process was still starting, the empty answer was kept too, so every later translation said it was unsupported until Loon restarted. A real user would see "I can't translate that" for good after one unlucky start.

Fixed: a good language list is still kept, but a failed lookup is dropped so the next request asks again. The failed request itself still answers "no", so nothing hangs. Tests added in test/translate.test.js, and the two retry tests fail on the old code.

Left for later: this explains why the step recovers on a re-run, but I could not run the packaged app here, so CI on this commit is the real check. The duo click steps in test/selftest-features.js and the "?" nudge step in test/selftest-browser.js still fail now and then on the Mac runners and need a short settle wait or one retry. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — translation and definitions (sixteenth pass)

Tried 30 typed dictionary, synonym and antonym asks such as "what do you mean by ephemeral", "ephemeral means what", "hot opposite", "define ephemeral as a verb", "what does 'ubiquitous' mean?", "meaning of 'carpe diem'" and "wat does ephemeral mean".

As a user, most asks hit the offline dictionary. Three natural forms still went to the language model, "what do you mean by X", "X means what" and "X opposite".

Fixed: dictionaryTerm accepts "what do you mean by X" and "X means what". antonymTerm accepts "X opposite". "what do you mean by that" still goes to the model. Test added in test/brain.test.js and it fails before the change.

Left for later: "whats serendipity", "what is X" and "explain X" stay with the model on purpose, since they are often not word questions. "define X as a verb" and "antonyms for good and bad" are not parsed. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install, and they are the same without this change.

## 2026-11-17 — typed questions and instant answers, days until a date (fourteenth pass)

Tried 26 typed questions such as "days until july 4th", "how many days until christmas", "how long until the 3rd of march", "days till jan 1", "how many days until feb 30", "days until thanksgiving" and "days until may".

As a user, "how many days until Christmas" and "days until July 4th" went to the language model, which has no clock and would guess. Only weekdays were answered by code.

Fixed: dateMath now answers days until a month and day ("july 4th", "25 december", "3rd of march") and a few fixed holidays (Christmas, Christmas Eve, Halloween, New Year, Valentine's Day). A date already passed this year counts to next year, today says so, and impossible dates like feb 30 fall through to the model. Test added in test/brain.test.js and it fails before the change.

Left for later: "what week is it", "how long until 5pm", moving holidays like Thanksgiving and Easter, "what time is it in pst" and "what's my timezone" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-17 — onboarding first run, allergy and interest wording (fourteenth pass)

Tried 54 answers for the "Get to know you" boxes, such as "I can't eat gluten", "I don't eat pork", "no gluten", "I have a peanut allergy", "nada", "celiac", "I like to read, bake and hike" and a range of names.

As a user, the worst problem was wrong allergy facts. "I can't eat gluten" was saved as "I'm allergic to I can't eat gluten", "no gluten" as an allergy to "no gluten", and "I have a peanut allergy" as an allergy to "I have a peanut". "nada" was saved as an allergy. These facts are pinned and sent with every question.

Fixed: the allergy box now reads "no X", "without X", "I can't eat X" and "I don't eat X" as avoided foods, drops "I have" and "I got" lead-ins, and treats "nada" as no answer. The interests box drops "I like to". Test added in test/personal.test.js.

Left for later: "celiac", "severe peanut allergy" (saved as "severe peanut") and "Nope :)" are still saved as allergy names. Names keep their case as typed ("ada lovelace"). The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — reminders, timers and focus (sixteenth pass)

Tried 40 phrasings such as "remind me in 10 to check oven", "remind me in 30 to move car", "timer 3 min", "set a timer for 1.5 hours", "remind me at midnight to sleep", "wake me up at 7 tomorrow", "book lunch with ana thursday noon" and "remind me in 1 hr 30 min to eat".

As a user, almost all of them were read correctly. The one real miss was a bare number after "in". "remind me in 10 to check oven" made a reminder titled "in 10 to check oven" with no time, so it would never fire. This was listed as left for later in two earlier passes.

Fixed: extractWhen now reads "in 10" before "to", "and", "so", "that" or the end as minutes. "in 2 and a half hours" and "in 3 days" are unchanged. Test added in test/assistant.test.js and it fails before the change.

Left for later: "remind me in a bit" and "remind me later" still give a reminder with no time and the phrase in the title. "set a 10 minute alarm" and "cancel my timer" are not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — voice intents, spoken forms of the developer, fact-check, page and review chips (twelfth pass)

Tried 37 spoken phrasings such as "fact check this", "is this true", "explain this code", "what does this error mean", "why am I getting this error", "what's wrong with this code", "how do I fix this error", "turn this page into notes", "make a checklist from this page", "summarize the reviews" and "what do people say in the reviews".

As a user, every one of these went to the model as a free question with no selection attached, even though each has a chip. The model then answered about nothing, and error questions skipped the code error table. "find the bug" was read as a file search.

Fixed: added voice templates for Fact-check, Explain code, Explain error, Find bug, Likely fix, Notes, Checklist and Reviews so they run the same task as the chip. Test added in test/voice.test.js and checked to fail before the change.

Left for later: a bare "find the bug" still means a file search. "read this to me", "make it funnier", "make it longer", "save this", "copy that" and "translate this into french" still have no voice template. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-17 — writing tools by voice and typed edits (eleventh pass)

Tried 78 edit phrases on a selection, such as "be more concise", "keep it short", "improve my writing", "rephrase", "clean this up", "make it sound more natural", "sound more professional", "sound friendlier", "fix my english" and "make it shorter 😊".

As a user, many ordinary phrasings went to the model as free questions, so the answer had no Replace or Copy actions. The worst were "be more concise", "shorten" on its own, "sound more professional" and a trailing emoji after a command that otherwise worked.

Fixed: the spoken and typed templates in brain/intents.js now cover those phrasings, and emoji are ignored when matching. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "expand this", "turn this into bullet points" and "make it punchier" still go to the model as questions. Combined edits such as "shorter and simpler" or "professional but friendly" and "tidy this up" are not split. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-17 — typed questions, tip phrasings (fifteenth pass)

Tried 42 calculator questions such as "15% of 80", "$45 minus 20%", "split 87.50 between 3", "10 km in miles", "tip 18% on 64.20", "tip of 15% on 40" and "what's the tip on a $50 bill at 20%".

As a user, the worst problem was tips. Natural orders like "tip 18% on 64.20" and "tip of 15% on 40" fell through to the model, which is bad at arithmetic. "What's the tip on a $50 bill at 20%" did the same.

Fixed: the tip rule in brain/calc.js now accepts the percent after "tip", "tip of", "a" before the amount and "bill", "check" or "meal" after it. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "10 % 3", "1.5k + 2k", "double 35", "cube root of 27", "pi * 2", "log 100" and "what should I tip on 64.20" (no percent given) still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-17 — food and menu (seventeenth pass)

Tried a 28 item menu with poutine, bao, empanadas, tikka masala, katsu, fish and chips, parmesan dishes and curries, and asked for lightest and vegetarian picks.

As a user, Poutine and Tonkatsu were listed as vegetarian, and Poutine, Fish and Chips, Chicken Tikka Masala and Tonkatsu all scored as light as a salad. That would send a vegetarian to beef gravy and a dieter to a fryer.

Fixed: brain/food.js now treats poutine and tonkatsu as meat dishes (a veggie or vegan poutine still counts as vegetarian) and adds poutine, katsu, tonkatsu, chips, masala and parmigiana to the heavy words. Test added in test/modes.test.js and checked to fail before the change.

Left for later: bao and empanadas have vegetarian versions, so they are not marked as meat and a plain "Pork Bao" only gets caught through "pork". Breaded "Chicken Parmesan" still scores 0 because parmesan alone is just cheese. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — shopping and unit price (seventeenth pass)

Tried 34 size strings and 21 price strings such as "1 1/2 lb", "2-1/2 gal", "500 gr", "1 pint", "12 x 12 fl oz", "5 lb bag", "$5.00 - $7.00", "£3.50 each" and "$12.99/mo".

As a user, the worst problem was a mixed number. "1 1/2 lb" was read as half a pound (226 g) because only the fraction was converted and the whole number was dropped, so a bag priced per pound would look three times too expensive.

Fixed: the fraction rule in parseQuantity now adds a whole number in front of it ("1 1/2 lb", "2-1/2 gal"). Test added in test/modes.test.js and checked to fail before the change.

Left for later: "pk of 12 500 ml" ignores the 12. A price range still uses the low end, and prices written as "$5⁹⁹" or "$ 5 99" read as 5. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — settings UI, reply style feedback (twelfth pass)

Tried 36 style requests such as "normal length", "back to normal length", "not so long", "not so short", "bring back the emojis", "you can use emojis again", "emojis back", "tone it down", "be terse" and "explain more".

As a user, once I had told Loon to be shorter or to drop emoji there was no way to undo it by talking. "back to normal length" and "bring back the emojis" went to the model, which just chatted about it, and the setting stayed. "not so long" did nothing either.

Fixed: parseFeedback in brain/personal.js now reads "normal/default/regular length", "back to normal", "not so long", "not so short" and the ways of turning emoji back on. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "reset style", "tone it down", "be terse", "stop being so brief" and "explain more" have no rule. Resetting everything would also wipe custom instructions, so it should ask first. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — follow-up conversations, thanks with a goodbye (fourteenth pass)

Tried 70 short replies inside an open thread such as "ok thanks bye", "thanks, that is all", "ty bye", "gtg", "brb", "lol thanks", "ohh thanks", "thanks cat", "thanks a million", "much obliged", "thanku", "np", "sweet", "neat" and "oh I see".

As a user, the worst problem was that closing a chat politely, such as "ok thanks bye" or "gtg", cost a full local model call, and the model tends to answer with a fresh explanation when I am leaving.

Fixed: a thanks followed by a goodbye now gets the goodnight reply from code, "gtg", "gotta go" and "brb" count as goodbyes, and the thanks rule accepts "lol", "haha", "oh" and "ah" openers, "thanks cat", "thanks a million", "much obliged", "thanku" and "tnx". Thanks followed by a request still goes to the model. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "ok", "k", "np", "no problem", "you too", "sweet", "neat", "oh I see", "makes sense now" and "yep" still go to the model. Plain "ok" can answer a question from the cat, so it needs a look at the last answer first. The 5 failures in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-18 — developer help, JSON to DTO (thirteenth pass)

Tried 24 pasted inputs such as nested objects, null fields, empty arrays, mixed number arrays, objects in an array with different keys, big ids, Java keyword keys, dates, an HTTP request line before the body and cut off JSON.

As a user, nearly everything worked. The miss was an object whose keys look like data, for example a monthly series `{"2024-01": 10, "2024-02": 12}` or keys with spaces. quicktype read it as a map, so the TypeScript answer was an empty code block and the Java answer was a page of converter boilerplate with no class.

Fixed: jsonToDto checks that the output holds a real class or interface and otherwise generates again with map inference off, so the fields are shown. Test added in test/modes.test.js and checked to fail before the change.

Left for later: the Kotlin entry in `DTO_LANGUAGES` still uses an invalid option, and Kotlin throws. A top-level array of arrays says "no fields" without explaining. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — history (fifteenth pass)

Tried 31 history phrasings such as "show my past chats", "look up docker in history", "last thing we talked about", "what was that thing about css", "wat did i ask" and "history of my questions".

As a user, the worst problem was that "show my past chats", "look up docker in history" and "last thing we talked about" went to the language model, which cannot see past chats and may invent an answer.

Fixed: parseCommand in brain/commands.js now reads these as a history search ("look up X in history" with the word, the others as the plain history list). Test added in test/assistant.test.js and checked to fail before the change.

Left for later: bare "recall", "what was that thing about css", typos such as "wat did i ask", "history of my questions" and "what did you tell me earlier" still reach the model. "find that thing about css" is read as a file search. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — routines, dotted and four-digit times (sixteenth pass)

Tried 30 phrasings such as "every weekday at 8:30am …", "every day at noon …", "every mon wed fri at 6pm …", "every hour …", "monthly on the 1st …", "every other day at 9 …", "every day at 7.30 …" and "every day at 0730 …".

As a user, nearly all of them worked. The miss was the way many people write a time. "every day at 7.30 walk" made a 7:00 routine with the message ".30 walk", and "every day at 0730 walk" fell back to 9:00 with the message "0730 walk". Neither gave a warning.

Fixed: the shared time pattern in brain/routines.js now reads "7.30" and "0730" or "1900" as clock times. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "tous les jours à 8h" and "every day at 9 am and 5 pm" are refused, which is fine. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-18 — page kinds, more banks, health and cloud consoles (fifteenth pass)

Tried 48 hosts such as UK, Canadian, German and Colombian banks, health portals, cloud consoles, password vaults, look-alike domains and Gmail.

As a user, the worst problem was that logged-in pages of nationwide.co.uk, halifax.co.uk, tsb.co.uk, rbcroyalbank.com, tdcanadatrust.com, commerzbank.de, dkb.de, postbank.de, deutsche-bank.de, comdirect.de, bancolombia.com, kaiserpermanente.org, 23andme.com, portal.azure.com and console.cloud.google.com counted as ordinary pages. Loon would offer to read a balance or a health result.

Fixed: these hosts are now in the sensitive list. The existing host test in test/browser.test.js covers a sample and was checked to fail before the change.

Left for later: the list is still a hand-kept list, so other banks will keep slipping through. A generic "bank" or "banking" label rule (banking.example.com) would catch more but could hit news sites. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — developer help, error table (sixteenth pass)

Tried 52 pasted errors across JavaScript, TypeScript, Python, Java, Rust, Go, git, npm and shell, such as "Cannot use import statement outside a module", "Unexpected end of JSON input", `error TS2307` and a Go deadlock.

As a user, the worst problem was a wrong answer. A TypeScript `Cannot find module './foo' or its corresponding type declarations` was explained as a Node module problem, with advice to run `npm install` for a relative path. Two very common errors had no answer at all, the ESM versus CommonJS mix-up ("Cannot use import statement outside a module", "require is not defined in ES module scope") and "Unexpected end of JSON input" from an empty response body.

Fixed: new entries for TypeScript module errors and for the ESM/CommonJS mix-up, placed before the Node module entry, and the Invalid JSON entry now matches "Unexpected end of JSON input". Test added in test/modes.test.js and checked to fail before the change.

Left for later: no entries for Go deadlocks, linker errors ("undefined reference", "linker cc not found"), Java IllegalStateException, UnsupportedOperationException, Python "too many values to unpack", "module has no attribute" and unhandled promise rejections. `npm test` shows 39 failures both before and after my change because this sandbox has no node_modules.

## 2026-11-18 — memory and privacy, redaction (sixteenth pass)

Tried 33 pasted snippets such as passwords in env files, spoken passwords, API keys in headers and URLs, JDBC strings, card numbers with CVV, Stripe and Anthropic keys, and Azure connection strings.

As a user, almost everything was hidden. The miss was an Azure storage connection string, where `AccountKey=…` went to the model in plain text.

Fixed: the secret-name rule in brain/redact.js now also matches `AccountKey`. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "login with user bob and pass hunter2", a spoken multi-word password ("correct horse battery staple" keeps its last words) and `api_key = "abc"` with a very short value are not hidden. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-18 — open and launch commands (seventh pass)

Tried 32 phrasings such as "open chrome 🙂", "open slack for me", "open Slack now", "open music app", "open the Photos app", "open spotfy", "open apple.com.", "open slack and" and "open google.com/search?q=a b".

As a user, "open slack for me" and "open Slack now" showed a confirm card to launch an app called "slack for me", which macOS cannot find. An emoji at the end did the same. "open music app" offered to open the Music folder instead of the Music app.

Fixed: trailing emoji and filler such as "for me", "now" and "real quick" are dropped from the target, and the folder shortcut only applies when the user did not say "app". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: a link with a space in the query is treated as an app name. Typos like "spotfy" go to a confirm card and fail in macOS. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-18 — writing tools, fix grammar (ninth pass)

Tried 26 texts such as "The file is config.yaml and main.js", "Hey @john check #todo and $HOME", links, an email address, "He dont know what to do", "Their going to the park tommorow", a letter with "writting" and "My name is akankshya and i live in nyc".

As a user, the worst problem was file names. "config.yaml" became "configuration.Yam". "#todo" became "#to-do".

Fixed: fixGrammar now skips words that touch a dot, slash, #, @ or $ with no space, so file names, paths, hashtags, handles and variables stay as typed. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "nyc" becomes "nag", because a three letter word allows an edit distance of 2. "The results was good", "1 dogs" and "Teh" at the start of a text are not flagged. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-18 — typed questions and instant answers, percent wording (seventeenth pass)

Tried 40 phrasings such as "15% of 80", "what's 20% off 49.99", "increase 80 by 20%", "20 percent increase on 80", "1.5k * 3", "double 45", "pi * 2", "2 hours 30 minutes in minutes" and "5 stone in kg".

As a user, the worst problems were two. "20% off 49.99" answered "39.992 after 20% off", which is not a price. "increase 80 by 20%" and "20 percent increase on 80" were not understood by the calculator, so they would go on to the model, which is the wrong place for arithmetic.

Fixed: "% off" now rounds to cents, and brain/calc.js reads "increase/raise/decrease/reduce N by P%" and "P% increase/decrease on N", with a currency symbol kept. Cases added to the ladder test in test/brain.test.js and checked to fail before the change.

Left for later: "1.5k", "double 45", "pi", "log", "2 hours 30 minutes in minutes", "5 stone in kg" and "100 usd to eur" are not handled by code. `npm test` shows 40 failures both before and after because this sandbox has no node_modules.

## 2026-11-19 — onboarding first run, allergy box (fifteenth pass)

Tried 23 answers for the allergy box, such as "celiac", "severe peanut allergy", "Nope :)", "no allergies :)", "not allergic to anything", "mild lactose intolerance", "peanuts (severe)" and "nothing, thanks!".

As a user, the worst problem was a wrong allergy fact for a person with no allergies. "not allergic to anything" was saved as "I'm allergic to not allergic to anything", "Nope :)" as an allergy to "Nope :)" and "no allergies :)" as "I avoid allergies :)". Severity words leaked into the name, so "severe peanut allergy" became an allergy to "severe peanut".

Fixed: smileys are dropped before the answer is read, "not allergic to anything" counts as no answer, and a leading severe, serious, mild, slight or bad is removed. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "celiac disease" is saved as an allergy to "celiac disease", and "peanuts (severe)" keeps the brackets. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-19 — food and menu (eighteenth pass)

Tried a 29 item menu with bao, empanadas, parmesan dishes, club sandwiches, salads, tempura, pad thai and dumplings, and asked for lightest and vegetarian picks.

As a user, "Club Sandwich" and "Chef's Salad" were listed as likely vegetarian, and the chef's salad was one of the lightest picks. Both carry ham, turkey or bacon. "Chicken Parmesan" scored as only a little heavy.

Fixed: brain/food.js now treats club sandwich and chef's salad (straight or curly apostrophe) as meat dishes, and adds chicken and veal parmesan to the heavy words. Test added in test/modes.test.js and checked to fail before the change.

Left for later: plain "Pad Thai", "Nachos Supreme" and "Quesadilla" count as vegetarian, though they often hide fish sauce or meat. "Tom Yum" is caught but "Mapo Tofu" style dishes depend on the word list. The 4 WordNet failures and 1 demo failure in `npm test` are the usual ones from the sandbox install.

## 2026-11-19 — memory commands (eighth pass)

Tried 36 phrasings such as "remember me?", "remember what I said", "remember the milk", "always remember that I use vim", "memorize that I like jazz", "forget it", "what's my name" and "turn off memory".

As a user, the worst problems were junk facts and misses. "Remember me?" saved the fact "me" and "remember what I said" saved "what I said". "Always remember that I use vim" and "memorize that I like jazz" were not recognized, so the model answered and might promise to remember without saving anything.

Fixed: the remember rule accepts "always remember" and "memorize", and skips texts that are only "me", "us", "you", "what I said" or "the last thing I told you", with or without a question mark. Test added in test/assistant.test.js.

Left for later: "remember the milk" still saves "the milk". "Fyi I'm vegetarian", "you should know I'm allergic to nuts", "turn off memory", "what's my name" and typos like "remmeber" go to the model. The 5 failures in `npm test` are the WordNet ones from the sandbox install.

## 2026-11-19 — translation and definitions (seventeenth pass)

Tried 32 typed dictionary, synonym and antonym asks such as "define the word ephemeral", "synonyms of big", "what's the antonym of love", "define ephemeral as a verb", "antonyms for good and bad", "word meaning of ephemeral" and "sinonimo de feliz".

As a user, nearly all of them hit the offline dictionary. One was wrong. "word meaning of ephemeral" was read as a request for synonyms, so I got a list of words instead of a definition.

Fixed: the synonym rule only takes the plural "words meaning X", and the definition rule accepts "word meaning of X". Test added in test/brain.test.js and it fails before the change.

Left for later: "hot's opposite", "what's another word for very big", "what's a better word than good", "antonyms for good and bad" and "define X as a verb" are not parsed. The 5 failures in `npm test` are the usual sandbox ones and are the same without this change.

## 2026-11-19 — developer help, error table (seventeenth pass)

Tried 65 pasted errors such as Python ValueError and KeyError, Rust borrow errors, npm ELIFECYCLE, React hook and key warnings, TypeScript errors, git and Docker failures, Go panics and Hibernate exceptions. Most hit the table with a sensible answer.

As a user, the misses were common ones. `getaddrinfo ENOTFOUND api.example.com` is the usual Node network failure and went to the model. `sh: 1: vite: not found`, which npm scripts print when dependencies are not installed, was not seen as a missing command. Python's `can only concatenate str (not "int") to str` was not seen as a type problem.

Fixed: a new entry for DNS lookup failures (ENOTFOUND, EAI_AGAIN and the Linux and macOS wordings), the command-not-found rule now accepts `sh: 1: name: not found`, and the Python type rule accepts "can only concatenate". Tests added in test/modes.test.js.

Left for later: Rust `unwrap()` on None, a missing C linker, Node unhandled promise rejections, Spring's Whitelabel Error Page and "HEAD detached" are not in the table. A Docker "permission denied while trying to connect to the Docker daemon socket" gets the generic permission answer instead of the docker group fix. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-19 — selection chips and classification (fifteenth pass)

Tried 40 selections such as bare error words, Python and Node errors, shell commands, SQL, emails, URLs, paths, emoji and a short bullet list.

As a user, the problem was short error messages copied on their own. "Connection refused", "Out of memory", "Killed: 9", "Permission denied", "No module named numpy", a bare "Traceback" and "FAIL src/a.test.js" read as one to three words, so Loon offered Define instead of the error help.

Fixed: a new whole-selection check in extension/lib/classify.js treats these known messages as errors. A longer sentence that only contains the phrase stays a sentence. Test added in test/browser.test.js.

Left for later: a short dash bullet list reads as one sentence. "npm WARN deprecated ..." is a sentence. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-19 — reminders, timers and focus (seventeenth pass)

Tried 34 phrasings such as "set timer 2h", "timer for an hour", "set a 25 minute pomodoro", "start a pomodoro", "remind me at noon to eat", "snooze 10 minutes", "alarm for 7am" and "what are my reminders".

As a user, "set timer 2h" made a reminder called "Timer is up for set", because the word "set" was read as the name of the timer. "set a 25 minute pomodoro" and "start a pomodoro" were not understood and went to the model.

Fixed: the named timer rule no longer takes "set" or "start" as a name, and pomodoro phrasings start a focus session. Tests added in test/assistant.test.js.

Left for later: "cancel my timer", "show reminders", "delete all reminders", "alarm for 7am", "snooze 10 minutes" and "quiet mode for an hour" are not matched. "remind me to drink water every hour" still makes a one-time reminder with no time.

## 2026-11-19 — writing tools, fix grammar (tenth pass)

Tried 29 texts such as "Teh meeting is tommorow", "i think we should of gone", "Wich one is better?", "writting to enquire about the the job", "hey can u send me the doc asap", "He is more taller than me" and "a apple a day".

As a user, three results were wrong. "enquire" became "esquire". "Wich one is better?" became "Wish one is better?". A lowercase "asap" was expanded to "as soon as possible", which is a style change nobody asked for.

Fixed: fixGrammar leaves "enquire" and its forms alone, prefers the suggestion that only adds a missing letter ("which" before "wish"), and skips expanding abbreviations in lowercase too. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "your welcome", "There going to be late", "The results was good", "I seen him", "Please advice me", "an university" and "hows" are not flagged. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-19 — history (sixteenth pass)

Tried 28 history phrasings such as "chat history", "show chat history", "history of my questions", "recall", "wat did i ask", "history docker" and "what did you tell me earlier".

As a user, "chat history" and "show chat history" were the most natural way to ask and they went to the language model, which cannot see past chats. "history of my questions" had the same problem.

Fixed: parseCommand in brain/commands.js now reads "chat/conversation/search/question history" and "history of my questions/searches/chats" as the plain history list. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: bare "recall", "wat did i ask", "history docker", "what was that thing about css" and "what did you tell me earlier" still reach the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-19 — memory commands (second pass)

Tried 34 phrasings such as "remember that i'm vegetarian", "pls remember…", "can you remember that…", "I'm allergic to peanuts, remember that", "forget my name", "forget about my dog", "keep in mind…", "save to memory: …", "recuerda que…" and several redaction checks on prose passwords, PINs, CVVs and cards.

As a user, saving worked well and secrets are now refused. The worst problem was on the way out. "forget" matched words as substrings, so "forget my age" would delete "I work as a manager" and "forget my cat" would delete anything with "location". Names in other scripts (for example "café") were ignored by the matcher because it only read a-z.

Fixed: Memory.forget now compares whole words (with a trailing s ignored) and reads letters in any script. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "for the record I'm 30" and "recuerda que…" are not understood as remember. "forget my name" still removes every fact that mentions a name, including a pet's. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-19 — shopping and unit price (eighteenth pass)

Tried 34 size strings and 15 price strings such as "12 pack of 500ml", "pk of 12 500 ml", "Pack of 6, 330 ml each", "24 count 12 oz", "2 lbs 3 oz", "half gallon", "$5⁹⁹" and "Was $20 Now $15".

As a user, the worst problem was a wildly wrong number. "12 pack of 500ml" was read as 250,000 ml because the 500 after "of" was taken as the pack count. That would make a 12 pack look absurdly cheap per ml and win every ranking. "pk of 12 500 ml" ignored the 12.

Fixed: parseQuantity now reads "12 pack" before looking at "pack of N", and "pk of N" counts as a pack. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "24 count 12 oz" ignores the 24. Prices like "$5⁹⁹" and "$5 - $7" still read as 5. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-19 — voice intents (thirteenth pass)

Tried 46 spoken phrasings such as "explain this in plain english", "break this down", "help me understand this", "i don't get this", "give me a summary", "which one is the best deal", "make it longer", "read this to me", "translate this into french", "repeat that" and "wait".

As a user, the plain-language asks went to the model as free questions with no selection attached, so it answered about nothing. "which one is the best deal" skipped the unit price code that "which one is the cheapest" already used.

Fixed: "in plain english", "in simple words" and "in easy terms" now mean Simplify. "break this down", "help me understand this" and "i don't get this" run Explain. "give me a summary" runs Summarize, and "best deal" joins "best value". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "make it funnier", "read this to me", "translate this into french", "repeat that", "say that again" and "louder" still have no voice template. "what is this" is ambiguous between a selection and the page. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-20 — routines (seventeenth pass)

Tried 30 phrasings such as "every morning at 8 remind me to take vitamins", "twice a day remind me…", "every 90 minutes…", "every other friday at 9 remind me to…", "every first monday of the month…" and "every year on march 3…".

As a user, nearly everything was read correctly. The worst miss was "every other friday at 9 remind me to submit timesheet", which was not understood at all, while the longer "every other week on friday" worked. The cat would then ask me to fill in the When field by hand.

Fixed: parseSchedule in brain/routines.js now rewrites "every other/second <weekday>" to the existing 14-day cycle. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every first monday of the month" and "every year on march 3" are not understood (the card asks for a When). "every weekday … summarize my calendar and email me" quietly drops the "email me" part. A bare "remind me every day" makes a routine with no message. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — follow-up conversations, greetings and "how are you" (fifteenth pass)

Tried 53 short openers such as "heyyy", "hellooo", "hi there", "morning", "gm", "hola", "how are you", "how r u", "whats ur name", "tell me a joke", "meow" and "are you an ai".

As a user, the most common opener of all, "how are you", went to the language model, and so did stretched greetings like "heyyy" and "hellooo" and "hi there". That costs a model call and a wait for a hello.

Fixed: the greeting rule accepts stretched letters, "there", "morning", "gm" and a few other languages, "how are you" and its short forms get a quick reply from code, and "whats ur name" gets the identity answer. A greeting followed by a request ("hey what is a mutex", "how are you doing with this error") still goes to the model. Test added in test/brain.test.js and checked to fail before the change. One test in test/cli-provider.test.js used "hello there" as a stand-in question, so I changed it to "explain mutexes" because it is now answered in code.

Left for later: "tell me a joke", "who made you", "are you an ai", "meow" and a lone wave emoji still go to the model. "who made you" and "are you an ai" deserve a fixed honest answer. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — page kinds, secrets typed into text areas (sixteenth pass)

Tried 17 pages such as a password reset form, a sign-up form, look-alike bank hosts, German and euro-comma shops, a two-price shop, Gmail, Google Docs, a hospital portal, an OTP field, and a text area for a private key.

As a user, the worst miss was privacy. The sensitive-field check only looked at input tags, so a page with a text area named "private_key" or "seed_phrase" was read as an ordinary page and the cat would not look away.

Fixed: the identity and bank field check in extension/lib/page-kind.js now covers text areas too. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a shop with only two prices and an add to cart button is "other". A login field named "login_pass" is not caught. Google Docs pages are "other" rather than a document kind. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — typed questions and instant answers, shorthand maths (eighteenth pass)

Tried 53 phrasings such as "1.5k * 3", "double 45", "half of 45", "what's 7 x 8", "2 hours 30 minutes in minutes", "5 stone in kg", "3 for $10, how much for 1", "cube root of 27", "$49.99 * 3" and several unit conversions.

As a user, most plain maths and conversions were answered in code. The worst misses were everyday shorthand. "1.5k * 3" and "double 45" were not understood by the calculator, so they would go to the model, which is the wrong place for arithmetic.

Fixed: brain/calc.js reads "double", "twice" and "triple" before a number, and a k after a number inside an expression means thousand. The k rule stays out of unit conversions because "5 k to f" is kelvin. Cases added to the ladder test in test/brain.test.js. The old code returned nothing for them.

Left for later: "5k to f" reads as kelvin, which is surprising. "2 hours 30 minutes in minutes", "5 stone in kg", "cube root of 27", "3 for $10, how much for 1", "100 usd to eur" and "20% of 50 + 10" are not handled by code. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — open and launch commands (eighth pass)

Tried 47 phrasings such as "open gmail", "open youtube", "open vs code", "open .env", "open http://localhost:3000/a b", "open slack!", "open Slack, please", "open www.google.com" and "open ~/Downloads".

As a user, "open gmail" and "open youtube" showed a confirm card to launch an app with that name, which does not exist on a Mac, so they failed only after I pressed confirm. A localhost link with a space and a dotfile like ".env" did the same.

Fixed: gmail, youtube, netflix and the main Google web apps now open as links. Spaced links and dotfiles go to the chat. Test added in test/assistant.test.js.

Left for later: "open wifi settings", "open settings" and "open email" still offer an app with that exact name. They need a map to System Settings panes and the default mail app. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-20 — developer help, JSON to DTO, Kotlin (fourteenth pass)

Tried 7 odd top-level values (nested arrays, empty array, empty object, numbers, strings, null, objects with a null field) and every language in the DTO table.

As a user, the plain cases all worked. The Kotlin entry left over from the last pass threw "Unknown value just-types for option framework" on every call, so any caller that offered Kotlin would have shown an error.

Fixed: the Kotlin option is now `just-types`, and the quicktype `package quicktype` line is stripped from the output like the Java one. Test added in test/modes.test.js. Before the change the new test threw.

Left for later: a top-level array of arrays still says "no fields" without saying why. No chip offers Kotlin yet. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — settings UI, reply style feedback (thirteenth pass)

Tried 40 style requests such as "be terse", "tone it down", "use more emojis", "answer in english again", "english only", "answer in spanish again", "reset style", "explain more" and "stop with the bullets".

As a user, the worst problem was getting stuck in another language. After "reply in Spanish", saying "answer in english again" did nothing and went to the model, so the setting stayed. "be terse" and "use more emojis" also missed.

Fixed: parseFeedback in brain/personal.js now accepts "again" after a language, a bare "english only" style form, "terse" as a short-answer request and "use more emojis". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "tone it down", "reset style", "explain more", "be funnier", "talk like a pirate" and bullet point requests have no rule. "explain more" looks like a follow-up, so it should stay out. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — selection chips and classification (sixteenth pass)

Tried 31 selections such as a bullet list, a price, a bare number, a date, a URL, an email address, a Windows path, emoji, SQL, shell commands, JSON and a short question.

As a user, the problem was selections that are not words. "$19.99", "42", "12/05/2026", a link, an email address, a file path and a pair of emoji were all treated as a word to look up, so Loon ran Define on them straight away and showed a dictionary miss.

Fixed: classifySelection in extension/lib/classify.js now keeps a short selection as a word only when it has a letter and is not a URL, email address or path. Everything else short is a sentence, so the bubble offers Explain. Test added in test/browser.test.js.

Left for later: a dash bullet list still reads as one sentence, and two links selected together still read as a word. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — writing tools by voice and typed edits (twelfth pass)

Tried 42 edit phrases on a selection, such as "tidy this up", "write this better", "polish my text", "less wordy", "simplify this for me", "make it easier to read", "rewrite in a professional tone", "make it shorter and simpler" and "translate this to spanish".

As a user, most phrasings already worked. Seven ordinary ones still went to the model as free questions, so the answer had no Replace or Copy actions. The worst were "simplify this for me", "tidy this up" and "rewrite in a professional tone".

Fixed: the templates in brain/intents.js now cover those phrasings. Cases added in test/voice.test.js.

Left for later: "make it shorter and simpler" and "summarize this in one sentence" are combined edits and still go to the model. "translate this to spanish" is not parsed. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — memory and privacy, redaction (seventeenth pass)

Tried 33 pasted snippets such as spoken logins, env files, AWS keys, connection strings, card numbers in other languages, headers, cookies, JWTs and short secrets.

As a user, almost everything was hidden. Two misses went to the model in plain text, "login with user bob and pass hunter2" and "api key abcdEFGH12345678" without an "is" or a colon.

Fixed: brain/redact.js now hides the word after "pass", "password" or "pw" when it follows "user <name>", and accepts a bare space after "api key" when the value has a digit. Plain talk like "api key management" is untouched. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "password hunter2" with nothing around it, one-word spoken passwords after "my password" and values under 4 characters are not hidden, since they read like normal prose. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-20 — food and menu (nineteenth pass)

Tried 55 dishes such as "Rogan Josh", "Veggie Pho", "Paneer Kebab", "Chana Masala", "Crab Rangoon", "Ceasar Salad", "Gyoza (veg)" and "Impossible Burger".

As a user, the worst problem was "Rogan Josh" (a lamb curry) listed as likely vegetarian, and "Veggie Pho" listed as meat because pho was on the meat list with no way to opt out.

Fixed: brain/food.js now treats rogan josh, keema and kebabs as meat, and lets veggie, mushroom, paneer, halloumi and tofu cancel pho and kebab. Test added in test/modes.test.js.

Left for later: "Gyoza (veg)" with the marker in brackets is still read as meat, and misspellings like "Ceasar Salad" are not matched. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-20 — shopping and unit price (nineteenth pass)

Tried 24 size strings and 9 price strings such as "24 ct, 12 oz each", "24 count 12 fl oz", "Pack of 2, 16 oz each", "12 fl oz (pack of 24)", "1 pint", "500 gr", "$5 - $7" and "R$ 1.299,90".

As a user, the worst problem was a wrong number again. "24 ct, 12 oz each" was read as one 12 oz item, so a case of 24 looked 24 times pricier per ounce than it is.

Fixed: parseQuantity now multiplies a count by the size listed right after it when the size is a liquid measure or is followed by "each" or "per". "100 count, 8 oz" stays one size on purpose. Test added in test/modes.test.js.

Left for later: "24 count 12 oz" (dry ounces, no "each") is still read as one item because it could be the total weight. Prices like "$5⁹⁹" and "$5 - $7" still read as 5. The failures in `npm test` here are the usual missing-dependency ones from the sandbox install.

## 2026-11-21 — routines (eighteenth pass)

Tried 30 phrasings such as "every 3rd thursday at 4 meeting", "every first monday of the month", "twice a day at 9 and 5", "every other day at 7", "every weekday except friday", "every hour remind me to stand" and "every quarter at 9".

As a user, the worst problem was that "every 3rd thursday at 4 meeting" became the 3rd of every month and the message turned into "Thursday meeting". The confirm card would show a schedule I never asked for.

Fixed: parseSchedule now declines an ordinal followed by a weekday, so the cat says it did not understand instead of guessing. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "every day" alone makes a routine with an empty message. "watch price of this daily" without a page makes a price watch with an empty url. Nth weekday of the month is not supported. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-21 — developer help, error table (eighteenth pass)

Tried 41 pasted errors such as Python ValueError and AttributeError, Rust borrow errors, npm ELIFECYCLE, Java exceptions, "x is not iterable", git https login failures, EADDRINUSE and Spring errors.

As a user, most common errors were answered, but three everyday ones went to the model. `AttributeError: module 'numpy' has no attribute 'int'` (any AttributeError except NoneType), the JavaScript `TypeError: x is not iterable`, and `fatal: could not read Username for 'https://github.com': terminal prompts disabled`, which every person pushing over https meets.

Fixed: three new entries in brain/errors.js. The JavaScript one skips the Python wording "'int' object is not iterable", which keeps its own entry. Test added in test/modes.test.js.

Left for later: AssertionError, SQLAlchemy and psycopg2 connection errors, `Cannot GET /api/...`, HTTP 400 on its own, Spring IllegalStateException wrappers, Gradle dependency resolution and UnhandledPromiseRejectionWarning still go to the model. `npm test` shows the same 42 failures with and without this change in this sandbox, because node_modules and the built data are missing.

## 2026-11-21 — translation and definitions (eighteenth pass)

Tried 31 typed dictionary, synonym and antonym asks such as "hot's opposite", "whats the opposite of hot", "what's a better word than good", "define: ephemeral", "what does 'ubiquitous' mean 😅", "wat does ephemeral mean" and "another word for ephemeral thanks".

As a user, almost all of them hit the offline dictionary. Two natural phrasings fell through to the language model. "hot's opposite" and "what's a better word than good" are both things I would type.

Fixed: the antonym rule accepts "X's opposite" and the synonym rule accepts "better word than X". Assertions added to the existing tests in test/brain.test.js. They fail before the change.

Left for later: "another word for very big", "define love and hate", "define x as a verb" and "synonyms for big and small" still go to the model, since they need more than one term. The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data) and are the same without this change.

## 2026-11-21 — history (seventeenth pass)

Tried 45 history phrasings such as "remember when I asked about kafka", "chat history for docker", "wat did i ask", "what was that thing about css", "whats in my history", "did i ask about react" and "show me old questions".

As a user, the worst case was "remember when I asked about kafka". It was read as a memory command and quietly saved "when i asked about kafka" as a memory, when I wanted to look up the past question. "chat history for docker" also missed the history search.

Fixed: parseCommand in brain/commands.js now reads "remember when I/we asked/talked about X" as a history search, and "chat/conversation/search history for X" as a search for X. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: bare "recall", "wat did i ask", "history docker", "what did i google about cats", "whats in my history", "what did you tell me earlier" and "old questions" still reach the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-21 — voice intents (fourteenth pass)

Tried 43 spoken phrasings such as "make it longer", "translate this into french", "repeat that", "louder", "give me the gist", "what's the gist", "mute", "go quiet", "no more talking", "put this in bullet points" and "tell me more".

As a user, the worst miss was asking Loon to be quiet while it spoke. "mute", "go quiet" and "no more talking" went to the model as questions, so the cat kept talking and then answered about muting. "give me the gist" also went to the model with no selection attached.

Fixed: the stop words in brain/intents.js now include "mute", "go quiet", "silence" and "no more talking". "give me the gist", "what's the gist" and "gist" run Summarize. Tests added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "translate this into french", "read this to me", "repeat that", "louder", "turn this into bullet points" and "check this for errors" still have no voice template. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-21 — reminders, timers and focus (eighteenth pass)

Tried 34 phrasings such as "remind me in an hour and a half", "remind me tmrw at 9", "remind me on the 25th", "set a reminder for 3pm to call bob", "reminder: dentist friday 2pm", "wake me up at 6:30 tomorrow", "focus 90" and "remind me to pay bill on the 1st of next month".

As a user, almost everything worked. The one wrong result was "remind me to pay bill on the 1st of next month", which made a reminder titled "pay bill of next month". The date was right but the leftover words made the title look sloppy.

Fixed: "the Nth of this month" and "the Nth of next month" are now read as one date in the shared day-of-month step. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remind me to take meds at 8am and 8pm" keeps only 8am and puts "and 8pm" in the title, so the second time is dropped quietly. "snooze 10 minutes" and "cancel my timer" are not matched. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-21 — onboarding first run, name and allergy sentences (sixteenth pass)

Tried 36 answers such as "I'm Ada, nice to meet you", "my name is Ada and I like cats", "Ada & Bob", "peanuts (severe)", "Peanut allergy, severe", "none lol", "celiac disease" and interests like "AI/ML" and "i'm into f1".

As a user, the worst problem was that a friendly sentence in the name box became the name, so the cat would call me "Ada nice to meet you" or "Ada and I like cats". Severity written after the allergy ("peanuts (severe)", "peanut allergy, severe") was saved as part of the fact or as a second allergy to "severe".

Fixed: the name stops at a comma or at "and", "but", "nice", "pleased" or "glad". A trailing severity in brackets or as its own item is dropped from allergies. Test added in test/personal.test.js.

Left for later: "celiac disease" is still saved as an allergy to "celiac disease", "none lol" is saved as an allergy, "Ada & Bob" becomes "Ada  Bob" with two spaces, and "i'm into f1" lowercases nothing but keeps odd wording like "interested in hike".

## 2026-11-21 — memory commands (third pass)

Tried 35 phrasings such as "for the record I'm 30", "FYI I use a Mac", "I want you to remember that I'm vegan", "from now on remember I like tea", "also remember…", "remember about me that…", "forget what I said about my age", "stop remembering my location" and "update my name to Sam".

As a user, the plain forms worked. Natural lead-ins did not. "I want you to remember…", "from now on remember…" and "for the record I'm 30" all fell through to the model, which cannot save anything and may claim it did. "remember about me that I'm 30" saved the text "about me that I'm 30".

Fixed: stripPoliteness drops "I want you to", "I'd like you to", "from now on", "also", "and" and "btw" before remember, forget and memorize. "for the record", "FYI" and "just so you know" save the fact only when it is about the user (starts with I, my, we or our), so "fyi the meeting moved" is not saved. "remember about me that" keeps only the fact. Test added in test/assistant.test.js.

Left for later: "stop remembering my location" and "update my name to Sam" still go to the model. Spanish "recuerda que…" is not understood. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install and are identical on main.

## 2026-11-21 — follow-up conversations, small talk about Loon itself (sixteenth pass)

Tried 28 openers such as "are you an ai", "are you a bot?", "are you chatgpt", "who made you", "what model are you", "are you real", "tell me a joke", "meow" and a lone wave emoji.

As a user, I asked the questions people ask a new assistant first. These went to the language model, which can say it is ChatGPT or invent a maker. A companion that gets its own identity wrong in the first minute loses trust.

Fixed: a fixed honest answer in the instant rules says Loon is an AI, not a real cat, and that answers come from a model on the Mac unless Smarter answers is on. Questions about other things ("who made the first computer") still go to the model. Test added in test/brain.test.js.

Left for later: "tell me a joke", "meow" and a lone wave emoji still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-21 — page kinds, sensitive field names (seventeenth pass)

Tried 14 pages such as fields named login_pass, user_pass, passphrase, secret_key, access_token, cardnum, a sign-up form, a two-price shop, a one-price product page and a Google Docs page.

As a user, the worst miss was privacy. A login form whose password box is a plain text field named "login_pass" or "user_pass" was read as an ordinary page, and so were fields for a passphrase, secret key, access token or "cardnum". The cat would not look away on those pages.

Fixed: the identity and bank field check in extension/lib/page-kind.js now knows those names. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a shop with only two prices and an add to cart button is still "other". A card holder or expiry field alone is not caught. Google Docs pages are "other" rather than a document kind. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-21 — developer help, JSON to DTO (fifteenth pass)

Tried 15 pastes such as a huge integer, null-only fields, mixed arrays, dates, nested arrays, a BOM, a trailing semicolon, `const x = {...}`, a curl prompt line, an empty string, a Kotlin key like `first-name`, line-numbered JSON, HTML-escaped quotes and JSON copied from a log as an escaped string.

As a user, the annoying case was a response copied from a log or console. It shows up as `"{\"a\":1}"` or as `{\"a\":1}`. The first said "no fields (just plain values)", which is wrong, and the second failed with a JSON syntax error.

Fixed: parseJson in brain/devtools.js now unwraps a string that holds an object or array, and accepts the same text without the outer quotes. Test added in test/modes.test.js and checked to fail before the change.

Left for later: Kotlin keys such as `first-name` become `firstName` with no `@JsonProperty`, so Jackson would leave them null (Java already switches to Jackson for this). The Jackson Kotlin output carries a lot of mapper boilerplate, so it needs a decision. Line-numbered JSON and HTML-escaped quotes (`&quot;`) still fail. A 20-digit integer becomes a double. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-21 — selection chips and classification (seventeenth pass)

Tried 70 selections such as single words, contractions, CJK, prices, URLs, one-line errors, SQL, shell commands, hashtags, "x = 5", "x += 1", "{{ name }}" and "E = mc²".

As a user, the clear miss was a short assignment like "x = 5" or "count += 1". It was classed as a word, so the bubble offered Define instead of Explain code.

Fixed: the snippet check in extension/lib/classify.js now treats a one-line assignment that starts with a lowercase name as code. "E = mc²" stays a word. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "{{ name }}" and "Error 404" are classed as words, "Mon, Jan 5" gets Define, and a lone "404" gets Explain only. In this sandbox `npm test` shows 43 failures with and without the change because node_modules is not installed.

## 2026-11-22 — typed questions and instant answers, compound units (nineteenth pass)

Tried 36 phrasings such as "2 hours 30 minutes in minutes", "5 lb 8 oz to kg", "5 stone in kg", "cube root of 27", "half of 90", "100 usd to eur", "abs(-4)", "pi" and "how much is 3 dozen".

As a user, plain maths, percentages and single-unit conversions were answered in code. The worst misses were a time or weight written in two parts ("2 hours 30 minutes in minutes"), British stones, and cube roots. They went on to the model, which is the wrong place for numbers.

Fixed: brain/calc.js now adds two sizes of one kind side by side before converting (the old feet and inches rule stays), knows stones, and reads "cube root of N". Cases added to the ladder test in test/brain.test.js and checked to fail before the change.

Left for later: "20% of 50 + 10", "100 usd to eur", "abs(-4)", "pi" and "3 dozen" are not handled by code. Answers like "half of 90" come back as a bare "45." which reads a little cryptic. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — writing tools, fix grammar (eleventh pass)

Tried 26 texts such as "Thankyou for you're help", "i cant belive its already friday", "your welcome", "The results was good", "I seen him", "an university", "alot of it", "infront of me" and "definately going to recieve it tomorow".

As a user, two results were wrong. "belive" became "be live", which changes the meaning. "Thankyou" became "Thank", which drops a word the person meant to write.

Fixed: fixGrammar skips a spelling suggestion that splits one word into two, or that cuts the word down to a short prefix. Real boundary fixes such as "alot" to "a lot" still work. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "your welcome", "There going to be late", "The results was good", "I seen him", "Please advice me", "an university", "hows" and "sent" after "please" are still not flagged, and "belive" is now left as is instead of becoming "believe". The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — memory and privacy, redaction (eighteenth pass)

Tried 31 lines such as "the pin number is 4921", "my password was hunter2", "set my password to hunter2", "wifi password is correct horse battery", env exports, connection strings, Spanish and German password sentences, card numbers and cookies.

As a user, most lines were already covered. Three ways of saying a password or PIN still leaked the value. "pin number is 4921", "my password was hunter2" and "set my password to hunter2" went through unredacted.

Fixed: a new rule redacts a value with a digit after pin, passcode or password, with an optional "number" or "code", followed by "is", "was" or "to". "password to log in" stays readable. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "password: p@ss w0rd" leaks the second word, "passphrase hunter2" and "token is abc123def456" without a colon are not redacted, and a bare "secret=abc" is too short to match. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — food and menu (twentieth pass)

Tried 43 dish names such as "Gyoza (veg)", "Wonton Soup (veg)", "Spring Rolls (GF, VG)", "Egg Fried Rice", "Caesar Salad (no anchovies)", "Chicken-less Nuggets" and "Meatless Monday Wrap".

As a user, the worst problem was that a menu's own vegetarian marker was ignored. "Gyoza (veg)" and "Wonton Soup (veg)" were listed as meat because gyoza and wonton are on the meat list, so the vegetarian filter hid dishes the menu had labelled for me.

Fixed: brain/food.js now trusts a bracketed marker made only of veg, vegan, vegetarian, v, vg or ve (optionally with gf, df or n, like "(GF, VG)"). "(no veg)", "(with veg)" and "(pork)" do not count. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Beef-free Burger" and "Chicken-less Nuggets" are still read as meat, and "Ceasar Salad" misspellings are not matched. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — open and launch commands (ninth pass)

Tried 36 phrasings such as "open settings", "open wifi settings", "open email", "open system preferences", "open vscode", "open calc", "open bluetooth settings", "open task manager" and "open google calendar".

As a user, "open settings" and "open system preferences" showed a confirm card to launch an app called "settings", which macOS cannot find, so it failed only after I pressed confirm. "open wifi settings" and similar pane names did the same. "open vs code" and "open email" had the same problem.

Fixed: settings, system preferences, vs code, email and calc now map to the real app names (System Settings, Visual Studio Code, Mail, Calculator). Names ending in "settings" go to the chat because Loon cannot open a single pane. Test added in test/assistant.test.js.

Left for later: "open vscode" without a space, "open code", "open task manager" and "open cmd" still offer an app with that exact name. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-22 — shopping and unit price (twentieth pass)

Tried 48 size strings and 23 price strings such as "2 x 6 pack", "pack of 12 x 330ml", "1 lb 8 oz", "half gallon", "$5 - $10", "1 299 kr" and "R$ 12,50".

As a user, almost everything parsed correctly. The one wrong answer was a multipack of packs. "2 x 6 pack" was read as 2 items and "3 x 12 pack" as 3, so the unit price would be several times too high.

Fixed: parseQuantity now multiplies "N x M pack" (or "pk") into 12 and 36. "2 x 12 ct" and measures such as "2 x 12 pack 330ml" give the right totals. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "30 servings" and "1 each" return nothing, so they drop out of the ranking. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — page kinds, card fields found by id (thirteenth pass)

Tried 40 pages such as lookalike bank hosts, country bank sites, mail hosts, sign-in forms, OTP and card fields, euro and kr shops, blog posts that mention prices, menus, wiki and video sites.

As a user, the worst miss was a checkout form whose card box is only named by its id (`id="card-number"`, `id="credit-card-number"`) or called `creditcard`. The cat did not go private, so a card form could be read as a normal page.

Fixed: the card field check in extension/lib/page-kind.js now also looks at ids and at the name `creditcard`. Test added in test/browser.test.js and checked to fail before the change.

Left for later: lab and patient portals (labcorp, questdiagnostics) and `pay.stripe.com` are not on the sensitive list, and a field named `expiry` alone is not caught. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — routines (third pass)

Tried 30 routine phrasings such as "every night at 10pm remind me to lock up", "twice a day…", "every weekday except friday…", "every day at 9am and 5pm…", "every year on march 3…", and 13 routine commands such as "delete all routines", "cancel my routines" and "turn off the stretch routine".

As a user, creating routines worked well. The one annoying answer was "delete all routines". Loon said it had no routine like "all routines", which sounds like a bug.

Fixed: a pause or delete command that starts with "all", "every" or "each" and mentions routines now explains that Loon changes one routine at a time and points to "show my routines". Other phrases such as "turn off all notifications" still fall through. Test added in test/routines.test.js.

Left for later: "every first monday of the month", "every last friday", "every year on march 3" and "9am and 5pm" are not understood, so they get a card to fix by hand. That is honest but slow. Five WordNet and demo tests fail in `npm test` here because the sandbox install skips the built data.

## 2026-11-22 — settings UI, reply style feedback (fourteenth pass)

Tried 45 style requests such as "tone it down", "less sassy", "be funnier", "more sass", "be chill", "talk normally", "reset style", "reply in español", "bullet points" and "explain in more detail".

As a user, the most annoying misses were the tone requests that mention sass. "tone it down" and "less sassy" went to the model, which chatted about it while the setting stayed. "be funnier", "sassier" and "more sass" also did nothing, so there was no spoken way back to the playful tone.

Fixed: parseFeedback in brain/personal.js now reads "tone it down" and "less sassy, snarky or sarcastic" as the plain tone, and "funnier", "sassier", "snarkier", "cuter" and "more sass" as the playful tone. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "reset style", "be chill", "talk normally", "reply in español" (language names in other languages), and bullet point requests have no rule. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — history (eighteenth pass)

Tried 36 history phrasings such as "whats in my history", "what's in my history", "wat did i ask", "history docker", "old questions", "show me old questions", "what did i google about cats", "recall", "did we talk about spring" and "what was my last question".

As a user, the most common asks failed. "whats in my history" and "show me old questions" went to the model, which can only guess. "what did i google about cats" did the same.

Fixed: parseCommand in brain/commands.js now reads "what's in my history" and "old questions" as the history list, and "what did I google about X" as a search for X. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "wat did i ask", "history docker", bare "recall", "what did you tell me earlier", "what did I say earlier" and "repeat my last question" still reach the model, and "find my chat about docker" is read as a file search. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — writing tools by voice and typed edits (thirteenth pass)

Tried 44 edit phrases on a selection, such as "spell check this", "fix any mistakes", "proofread my text", "say it better", "paraphrase", "shorten it a bit", "give me the tl;dr", "make it more direct", "expand this" and "hazlo más formal".

As a user, common proofreading and rewrite phrasings still went to the model as free questions, so the answer had no Replace or Copy actions. The worst were "spell check this" and "fix any mistakes".

Fixed: the templates in brain/intents.js now cover those phrasings. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: tone edits with no task today ("make it more direct", "soften the tone", "make it funny"), length edits ("expand this", "make it longer"), "turn this into bullet points" and non-English edits still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-22 — translation by voice and typed (fifth pass)

Tried 38 translate asks on a selection, such as "in english", "say this in english", "make this english", "translate this word", "how do you say this in english", "can u translate that", "english version", "translate this to spanish" and "traduce al inglés".

As a user, the short natural phrasings ("in english", "say this in english", "translate this word") went to the model as free questions, so I got no offline translation and no Replace or Copy actions. "can u" was not treated as a polite prefix.

Fixed: the translate template in brain/intents.js now covers those phrasings and "can u" and "could u" are dropped as polite prefixes. Cases added in test/voice.test.js and checked to fail before the change.

Left for later: "translate this to spanish", "what language is this", "tell me what this says", "translate this into plain english", typos like "trnaslate" and non-English asks still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — developer help, JSON to DTO (sixteenth pass)

Tried 15 pastes including HTML-escaped quotes, a line-number gutter ("1 {" and "1| {"), non-breaking spaces, smart quotes, comments, a curl line, JSONP, NDJSON, an XSSI prefix, a BOM, NaN, an HTTP response with headers, Python literals and a trailing comma.

As a user, JSON copied from a docs site or a code viewer failed with a syntax error. Three cases broke: `&quot;` quotes, line numbers on the left, and non-breaking spaces from web pages. These are common when copying from a browser.

Fixed: parseJson in brain/devtools.js now retries after removing those three kinds of clutter, only when the plain parse fails, so valid input is never changed. Test added in test/modes.test.js and checked to fail before the change.

Left for later: Kotlin keys such as `first-name` still lose their JSON name. A 20-digit integer becomes a double. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — reminders, timers and focus (nineteenth pass)

Tried 75 phrasings such as "remind me on the weekend to clean", "remind me at 1730", "remind me at quarter to 5", "timer 90 seconds", "10 minute timer for pasta", "remind me in a couple hours", "schedule a meeting with sam tomorrow at 2pm" and "stop focus". Recurring phrasings go through routines first, so I checked those only in the real order.

As a user, almost everything worked. "remind me on the weekend to clean" made a reminder titled "the to clean", and "remind me at 1730" got no time at all.

Fixed: extractWhen now reads "on the weekend" as "this weekend" and reads "at 1730" as a 24-hour time. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remind me to take meds at 8am and 8pm" still keeps only 8am and leaves "and 8pm" in the title. "snooze 10 minutes" is not matched. "cancel my timer" goes to the routine delete path and then the model, and timers are one-shot reminders, so the answer may promise something Loon cannot do. "remind me later" and "in a bit" give a reminder with no time. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-23 — onboarding first run, long allergy lists and name leads (seventeenth pass)

Tried 48 answers for the name, allergy and interest boxes, such as "Mary-Jane O'Brien", "my friends call me Dizzy", "name: Tom", "peanuts and also shellfish", a seven item allergy list, "celiac", "Nuts (anaphylaxis)" and "I'm into F1 racing".

As a user, the worst problem was a silent loss. Typing seven allergies saved only six, and "fish" was dropped without a word. Smaller problems were "name: Tom" saved as "Call me name Tom", "my friends call me Dizzy" saved as "Call me my friends call me Dizzy", and "peanuts and also shellfish" saved as an allergy to "also shellfish".

Fixed: the list reader in brain/personal.js now keeps up to 12 items, treats "and also" as "and", and the name reader drops "name:" and "my friends/family/mom/dad call me". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "it's me, Kai" saves "Call me me". "Lactose", "celiac" and "Peanut allergy" are stored as allergies with odd wording ("allergic to celiac"). Notes such as "nuts - severe" keep the note in the text. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-23 — follow-up conversations, acknowledgements (seventeenth pass)

Tried 47 short replies inside a thread, such as "ok", "cool", "wow", "ok cool thanks", "alright thanks", "yes", "no", "go on", "shorter", "why", "tell me a joke" and a few emoji.

As a user, "ok cool thanks" and a bare "cool" or "wow" after an answer went to the language model for a wait and a wordy reply, while "thanks" and "nice" were instant.

Fixed: the thanks rule in brain/resolve.js accepts up to two acknowledgement words before it ("ok cool thanks", "alright thanks"), and "cool", "neat", "sweet" and "wow" count as praise. Test added in test/brain.test.js and checked to fail before the change.

Left for later: a bare "ok" or "okay" still goes to the model on purpose, because it may be the answer to "want me to go on?". "tell me a joke" and "meow" still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — developer help, error table (nineteenth pass)

Tried 45 pasted errors across git, Node, Python, Java, SQL, Rust, React and Kubernetes. Almost all got a fitting entry.

As a user, three common errors had no instant answer and went to the model. "The current branch has no upstream branch" is the first thing every new branch hits. The Node 17 "digital envelope routines::unsupported" error is a classic after a Node upgrade. Mongo "E11000 duplicate key" was not recognized as a duplicate value.

Fixed: added entries for the first two with the exact command to run, and the duplicate rule now covers E11000. Tests added in test/modes.test.js.

Left for later: "linker cc not found" (Rust), "Killed: 9" on macOS and the Windows "cannot find the path specified" message still go to the model. The 5 failing tests in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-23 — selection chips and classification (eighteenth pass)

Tried 41 selections such as "Error 404", "Mon, Jan 5", "{{ name }}", "TL;DR", "e.g.", "192.168.1.1", "a/b/c.txt", "</div>", "import os", Cyrillic, emoji and a Spanish question.

As a user, the clear misses were a relative file path like "src/app/main.js" and a lone HTML tag like "</div>". Both were classed as a word, so the bubble offered Define.

Fixed: a relative path whose last part has an extension now counts as not a word to look up, and a whole-selection HTML tag counts as code. "and/or" stays a word. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "import os" is still a word, because "import taxes" is plain prose and the two look alike. "{{ name }}", "Error 404" and "Mon, Jan 5" still get Define. In this sandbox `npm test` shows 44 failures with and without the change because node_modules is not installed.

## 2026-11-23 — memory commands, privacy switches (fourth pass)

Tried 38 phrasings such as "stop remembering my location", "update my name to Sam", "turn off memory", "pause memory", "go private", "private mode on", "don't remember anything about me", "save this: …" and "rembember that…".

As a user, the worst problem was that every way of asking Loon to stop remembering fell through to the model. The model cannot change a setting, so it could say it had stopped when it had not.

Fixed: "stop remembering…", "don't remember anything", "turn off memory", "pause memory", "go private" and "private mode on" now answer in code and point to Settings → Privacy mode, the same way "clear my history" points to Settings. Test added in test/assistant.test.js.

Left for later: "update my name to Sam", "stop remembering my location", "save this: …" and typos such as "rembember" still go to the model. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install and are identical on main.

## 2026-11-23 — shopping and unit price (twenty-first pass)

Tried 34 size strings and 18 price strings such as "6 x 8.45 fl oz", "Net Wt 14.5 oz (411g)", "1 qt 14 fl oz", "Pack of 2 (2 x 500ml)", "$12.99 ($0.54/oz)", "Was $20.00, now $15.00" and "¥1,200".

As a user, nearly everything was right. The one wrong answer was "3 bottles of 500 ml", which was read as 500 ml, so the unit price came out three times too high.

Fixed: parseQuantity now reads "N cans/bottles/bags of M" as a count of N. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "30 servings" and "1 each" still return nothing. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — voice intents, interrupting Loon (fifteenth pass)

Tried 48 spoken phrasings such as "hush now", "that's enough thanks", "I said stop", "thanks stop", "cancel that", "forget it", "wait", "hold on", "not yet", "no wait", "repeat that" and "sounds good", plain and at a confirm card.

As a user, the worst problem was that natural ways to interrupt were read as new questions. "hush now" or "cancel that" at a confirm card left the card open and sent the words to the model.

Fixed: the stop list now includes "hush now", "I said stop", "thanks stop", "that's enough thanks", "cancel that", "forget it" and "okay that's enough". "wait", "hold on", "not yet" and "no wait" stop Loon only while it is speaking or asking, so a plain "wait" stays a normal utterance. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "repeat that", "say that again", "slower" and "louder" still go to the model, since there is no replay or speed control yet. "what has the most protein" and "is this a good deal" are free questions without a food or shopping task. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — food and menu (twenty-first pass)

Tried 42 dish names such as "Black Bean Burger", "Garden Burger", "Beef-free Burger", "Chicken-less Nuggets", "Jackfruit Carnitas", "Lentil Bolognese", "Tofu Banh Mi", "Pho Chay" and "Fish Tacos".

As a user, the worst problem was that obvious vegetarian dishes were hidden from the vegetarian filter. "Black Bean Burger" and "Garden Burger" were read as meat because "burger" is on the meat list, and "Beef-free Burger" and "Chicken-less Nuggets" were still meat (the leftover from the last run). "Chicken-less Nuggets" also listed chicken as its protein.

Fixed: brain/food.js now treats bean, garden, lentil, chickpea, jackfruit and soy prefixes, and "meat/beef/pork/chicken/fish/lamb/turkey" followed by "-free" or "-less", as meat-free for burgers, carnitas, bolognese, ragu, banh mi and nuggets. "Gluten-free Chicken Wrap" is still meat. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Vegan Bacon Cheeseburger", "Pho Chay" and "Caesar-style Kale Salad" are still read as meat. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-23 — translation and definitions (nineteenth pass)

Tried 39 typed dictionary, synonym and antonym asks such as "do you know what ephemeral means", "what is happy's opposite", "DEFINE EPHEMERAL", "define café", "what does \"carpe diem\" mean", "ephemeral definition please" and "what the heck does ephemeral mean".

As a user, nearly everything hit the offline dictionary. Two ordinary phrasings still went to the language model, "do you know what X means" and "what is X's opposite".

Fixed: the dictionary rule drops a leading "do you know" before "what", and the antonym rule accepts a "what is" lead-in on "X's opposite". Assertions added to the existing tests in test/brain.test.js.

Left for later: "what the heck does X mean", "another word for very big" and "how do you spell X" still go to the model. The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data).

## 2026-11-23 — routines (fourth pass)

Tried 56 routine inputs such as "every day at 9am, remind me to stretch.", "every 90 minutes…", "every day at 1930…", "remind me weekly to clean", "every monday at 9am and every thursday at 3pm…", plus 25 routine commands such as "turn the stretch routine back on", "stop telling me to stretch" and "never remind me to stretch again".

As a user, creating routines held up. Commands were the weak spot. "Turn the stretch routine back on" and "stop telling me to stretch again" were not recognised, so they went to the language model instead of pausing or resuming the routine.

Fixed: brain/routines.js now reads "turn <routine or reminder> on/off" with an optional "back", and "stop telling me to X" with an optional "again". "Turn the music off" is still left alone. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "9am and 5pm" and "every first of the month" still get a card to fix by hand. "Never remind me…", "unschedule X", "clear routines" and "delete routine 2" are not understood. The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data).

## 2026-11-24 — typed questions and instant answers, big numbers and minus sign (twentieth pass)

Tried 85 maths and conversion phrasings such as "whats 15 percent of 80?", "80 + 15%", "a third of 90", "30% of 150 dollars", "split 120 between 3", "1000000 * 1000000", "2^100", "−5 + 8", "10k + 5k" and "5 ft 10 in cm".

As a user, nearly all of them were answered in code. The worst result was a plain product like "1000000 * 1000000", which came back as "1.00000e+12". A minus sign typed by macOS or pasted from a document ("−5 + 8") was not recognised and went to the model.

Fixed: whole numbers below one quadrillion are now written in full with commas, and the typographic minus is read as a normal minus. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "10k + 5k", "5 million / 3", "3/4 of 100", "cube of 3", "pi * 2", "2(3+4)", "10% of 250 plus 5" and "how much is 3 dozen" still go to the model. "7 into 21" and "0.5 as a fraction" too. The 5 failing tests in `npm test` here are the WordNet and demo ones from the sandbox install.

## 2026-11-24 — memory and privacy, redaction (nineteenth pass)

Tried 31 lines such as wifi and gmail passwords in prose, cards with expiry and CVV, SSNs, IBANs, API keys, connection strings, env lines, reset links with tokens, French and German passwords and a private key block.

As a user, most lines were already covered. The one common phrasing that leaked was a password for a named service. "the new password for gmail: Tr0ub4dor&3", "pw for wifi: abc123xyz" and "Passwort für Netflix: Geheim123" went through unredacted, because the "password for X" rule only accepted a dash or "is" and not a colon.

Fixed: that rule now accepts a colon, the names "pw" and "passwort", and "für". It still needs a digit in the value, so "passwords for new accounts: must be 12 characters" stays readable. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "my wifi password is correct horse battery" (a passphrase of plain words) is not redacted, and neither is "password: p@ss w0rd" past the first word. Both risk hiding normal sentences. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — typed questions, math and conversions (second pass)

Tried 80 inputs such as "sqrt(16)", "20% tip on 45", "5 ft 3 in in cm", "how many oz in a pound", "what is 15% of 80 please", "can you calculate 2+2", "hey loon what's 2+2, thanks!" and "convert 5 miles to kilometers please".

As a user, the calculator was solid on the sums themselves. The annoying part was manners. Adding "please", "can you", "hey loon" or ", thanks" to a sum sent it to the language model, which is slower and can get the number wrong.

Fixed: calc now uses the shared `stripPoliteness` from brain/commands.js before matching. Test added in test/brain.test.js.

Left for later: "thx" and "tell me 5 times 5" still miss. Spelled-out numbers ("five plus five", "1 million times 3"), implicit multiplication like "3(4+1)", "1 ton to kg", area units and currency are not handled. "1,000 + 2,500" echoes the expression as "1000 + 2500". Exact results such as "12 inches is about 1 feet" say "about". The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install and fail the same way without this change.

## 2026-11-24 — history (nineteenth pass)

Tried 30 phrasings such as "history docker", "find my chat about docker", "wat did i ask", "recall", "repeat my last question", "what did you tell me earlier", "last conversation" and "hisotry".

As a user, "find my chat about docker" was read as a file search, so Loon offered to look for files named "chat about docker". "history docker" went to the model, which cannot see my history.

Fixed: parseCommand now reads "find/search for/pull up my (or our) chats, conversations, questions or searches about X" and "history X" as a history search. "history of rome" and "find my chat app" keep their old meaning. Tests added in test/assistant.test.js and checked to fail before the change.

Left for later: "wat did i ask", bare "recall", "what did you tell me earlier", "what did I say earlier", "repeat my last question", "continue our chat about X" and "last conversation" still reach the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — writing tools, typed edits with a closing thanks (fourteenth pass)

Tried 64 typed edit asks such as "make it shorter thanks", "fix my grammar thx", "shorter please!", "make it professional lol", "mke it shorter", "soften the tone", "make it longer", "draft a reply to this email" and "friendlier tone".

As a user, the fixed edits worked until I added a closing "thanks", "thank you", "thx" or "lol". They then went to the language model as free questions, which is slower and skips the cached edit. "shorter please!" failed the same way because the exclamation mark left a space before "please". "define this thx" tried to define the words "this thx".

Fixed: the shared normalize in brain/intents.js now trims first and then drops any run of trailing please, pls, plz, loon, thanks, thank you, thx and lol. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "friendlier tone", "warmer tone" and "a more professional tone" still reach the model. So do "make it longer", "expand this", "soften the tone", "make it more confident", "make it punchier", "mke it shorter" and "too long, cut it down". Reply drafting asks pass as questions. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — page kinds, lab portals and payment pages (fourteenth pass)

Tried the gaps left by the last page kinds pass, with lab and patient portals, Stripe pay and billing pages, and card forms that only have an expiry box.

As a user, the worst miss was a lab results portal (labcorp, Quest) being read as an ordinary page, and a card form where the only recognizable field is `expiry` or `exp_date`.

Fixed: pay.stripe.com, billing.stripe.com, labcorp.com and questdiagnostics.com are on the sensitive list, and the card field check accepts the names expiry, exp_date and expiration. Test added in test/browser.test.js and checked to fail before the change.

Left for later: other health portals (for example regional hospital systems) are only caught by a password field. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — settings UI, reply style feedback (fifteenth pass)

Tried 27 style requests such as "reset style", "be chill", "talk normally", "chill out", "go back to playful", "normal tone", "too wordy tbh", "reply in español" and "ELI5".

As a user, once I had turned the cat plain and short there was no spoken way back. "reset style", "go back to playful", "talk normally" and "be chill" all went to the model, which chatted about it while the setting stayed. A trailing "tbh" also broke "too wordy tbh".

Fixed: parseFeedback in brain/personal.js now reads "reset style", "reset replies" and similar as a reset of length, tone and emoji. It reads "be chill", "chill out", "talk normally", "normal tone" and "go back to playful" as the playful tone, and ignores "tbh", "honestly" and "lol". A bare "reset" is left alone on purpose. Test added in test/personal.test.js and checked to fail before the change.

Left for later: "reply in español" (language names in other languages), "ELI5" and bullet point requests have no rule. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — developer help, error table (twentieth pass)

Tried 90 pasted errors across JavaScript, Python, Java and Spring, Git, Rust, Go, Docker, Kubernetes, TLS and macOS tooling.

As a user, most were answered from the table. The common misses were the plain `! [rejected] main -> main (non-fast-forward)` line from a push (only the "failed to push some refs" line matched), Go's `x509: certificate signed by unknown authority` and Chrome's `ERR_CERT_AUTHORITY_INVALID`, Rust's `called Option::unwrap() on a None value`, React's "Objects are not valid as a React child", and macOS `xcrun: error: invalid active developer path`, which every Mac user hits after an update.

Fixed: the push rule and the certificate rule now match those lines, and there are new entries for the Rust unwrap panic, the React object child and the missing Xcode tools. Tests added in test/modes.test.js and checked to fail before the change.

Left for later: Spring's HikariPool timeout and the Whitelabel error page, SQL "Unknown column", detached HEAD, TS7006 implicit any, Go deadlock, C++ "undefined reference" and "not declared in this scope", `Invalid or unexpected token`, the GitHub password authentication removal, gyp build errors and Puppeteer launch failures still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — open and launch commands (tenth pass)

Tried 66 phrasings such as "open vscode", "open task manager", "open cmd", "open reddit", "open twitter", "open amazon", "open notepad", "open control panel", "open teams" and "open the app store".

As a user, "open reddit", "open twitter" and "open amazon" showed a confirm card to launch an app with that name, which does not exist on a Mac, so it failed only after I pressed confirm. Windows habits such as "open task manager", "open cmd", "open notepad" and "open control panel" did the same.

Fixed: reddit, twitter, instagram, facebook, linkedin, amazon and wikipedia now open their website. Task manager, cmd, command prompt, explorer, control panel and notepad map to Activity Monitor, Terminal, Finder, System Settings and TextEdit. Test added in test/assistant.test.js.

Left for later: "open music" opens the Music folder, where most Mac users mean the Music app. "open vscode" style names such as "open code" and "open vs" still offer an app with that exact name. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-24 — food and menu (twenty-second pass)

Tried 48 dish names such as "Vegan Bacon Cheeseburger", "Vegan Caesar Salad", "Plant Based Chicken Sandwich", "Vegan BLT", "Vegan Mapo Tofu", "Eel Roll", "Falafel Wrap", "Egg Fried Rice" and "Beyond Burger".

As a user, the worst problem was that dishes the menu itself calls vegan were hidden from the vegetarian filter because a classic meat word sits in the name. "Plant Based Chicken Sandwich" also listed chicken as its protein. "Eel Roll" was counted as vegetarian.

Fixed: brain/food.js now treats a name containing "vegan" or "plant based" as vegetarian and drops meat and fish from its protein list. Eel is on the meat list. Test added in test/modes.test.js.

Left for later: "Pho Chay", "Caesar-style Kale Salad" and "Tempeh Reuben" are still read as meat. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-24 — routines (fifth pass)

Tried 26 routine inputs such as "every weekday at 8:30 am remind me to take meds", "every 2 weeks on friday…", "EVERY DAY AT 9AM…", "every day at 25:00…", "on the first of every month remind me to pay rent", plus 15 routine commands such as "clear routines", "unschedule stretch" and "skip stretch today".

As a user, most phrasings worked. The bad one was "on the first of every month remind me to pay rent". Loon scheduled it for today's date (the 24th) and put "The first of remind me to…" in the message. "Every month on the fifteenth" did the same, and "every first of the month" got no schedule at all.

Fixed: brain/routines.js now reads day-of-month words ("first" to "thirty-first") in "the first of every month", "every first of the month" and "every month on the fifteenth" as that day. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "9am and 5pm", "every last friday", "clear routines", "unschedule X", "never remind me to X" and "skip X today" are still not understood. "Every day remind me" makes a routine whose message is "Remind me". The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data).

## 2026-11-24 — follow-up conversations, short replies inside a thread (eighteenth pass)

Tried 58 short follow-ups after an answer, such as "shorter", "why", "go on", "yes", "tl;dr", "eli5", "in spanish", "copy that", "save that", "stop" and "remind me about this tomorrow".

As a user, almost all of them correctly go to the model with the thread as context, and "thanks" and "never mind" are instant. The one clear failure was "remind me about this tomorrow", which made a reminder titled "this". When it fires the reminder says nothing.

Fixed: a reminder whose task is only "this", "that" or "it" is now titled "Reminder", the same as "remind me on friday". Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "copy that", "save that", "read that out loud" and "stop" are not commands, so they reach the model, which cannot copy, save or speak. Loon should offer the Copy and Save buttons from the answer instead. A reminder about "this" cannot yet carry the text of the last answer. A bare "later" mid-thread gets the goodnight reply.

## 2026-11-25 — translation and definitions (twentieth pass)

Tried 37 typed dictionary questions such as "define ephemeral", "whats the meaning of ephemeral", "ephemeral meaning?", "what does 'ephemeral' mean in english", "dEfInE EPHEMERAL!!", "define machine learning" and "explain the word ephemeral", then 20 inflected words through the WordNet lookup.

As a user, the question parsing held up. The lookup failed on plural forms. "tomatoes" and "knives" found nothing and went on to the model, because the rules never tried dropping "es" after "o" and turned "ves" only into "f", so "knives" became "knif".

Fixed: the word forms tried by the dictionary now include "-oes" to the base, "-ves" to both "f" and "fe", and a trailing 's. Test added in test/brain.test.js and checked to fail before the change.

Left for later: "dogs'" still finds nothing. "ran" shows the baseball noun before the verb. "what's ephemeral" and "what does ASAP stand for" go to the model, which is fine. `npm test` passes fully here once the wordpos index is built with `node tools/stat.js --no-stats index.adv index.adj index.verb index.noun` inside node_modules/wordpos.

## 2026-11-25 — reminders, timers and focus (twentieth pass)

Tried 57 phrasings such as "remind me at midnight to sleep", "set alarm for 6:30am", "timer for half an hour", "remind me in a couple of hours to stretch", "remind me on feb 30", "remind me the day after tomorrow", "focus 90" and "remind me on the 3rd of march to renew".

As a user, nearly everything worked. "remind me on the 3rd of march to renew" made a reminder titled "the to renew", and "the 15th of December" did the same. The date was right but the title was wrong on the confirm card.

Fixed: dayOfMonth now drops "the" in front of "3rd of march" and lets the date reader take the rest. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "remind me to take meds at 8am and 8pm" keeps only 8am and leaves "and 8pm" in the title. "snooze 10 minutes" and "cancel my timer" are not matched. "remind me later" and "in a bit" give a reminder with no time, and "remind me in 20 to call" guesses minutes. An emoji prefix such as "⏰ remind me at 3" is not parsed. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-25 — shopping and unit price (twenty-second pass)

Tried 31 size strings, 14 price strings and four small product lists through analyze and verdict. Sizes such as pint, dozen, sheets, "500 gr", "half gallon" and "Pack of 6" all read correctly now.

As a user, the worst problem was a confident claim with no data behind it. When no size could be read (two "Widget" products) the cat said the cheapest one was "the cheapest and the best value. Easy choice", even for a 2.1 star item with 3 reviews. When only one product had a readable size it said that product "wins per 100 g, but it's close", although nothing was compared.

Fixed: verdict now says it cannot rank value when fewer than two products have comparable sizes, and gives only the cheapest sticker price. Test added in test/modes.test.js and checked to fail before the change.

Left for later: price ranges ("$5.00 - $7.00" reads as 5), "Was $20 Now $15" is read correctly but "$19.99 $24.99" assumes the first is the sale price. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-25 — selection chips and classification (nineteenth pass)

Tried 80 selections such as "10:30 AM", "v1.2.3", "#ff0000", "README.md", "node.js", "Q3 2025", "O(n log n)", "git@github.com:a/b.git", Arabic and Cyrillic words, "¿Qué?" and single keywords like "return".

As a user, the clear misses were things that are not words but still offered Define. A clock time ("10:30 AM"), a version ("v1.2.3"), a colour code ("#ff0000") and a plain file name ("README.md") were all classed as a word.

Fixed: these four shapes now count as not a word to look up, so the bubble offers Explain. "node.js", "AM" and ordinary words stay words. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "Warning: unused variable" is a word while the lowercase form is a sentence. "@username", "#hashtag", "3 apples" and "Q3 2025" still get Define. "git@github.com:a/b.git" is a sentence, which is fine. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-25 — memory commands (ninth pass)

Tried 40 phrasings such as "remember that I'm vegetarian", "keep in mind I'm on a budget", "forget my name", "forget that you remembered that", "clear my memory", "remove my name from memory" and "remember everything I say".

As a user, "remember everything I say" saved a memory with that exact text, so Loon would confirm a promise it cannot keep. "remove my name from memory" and "delete everything from memory" were not understood and went to the model, which might claim it had done it.

Fixed: "remove or delete X from memory" now forgets X, "delete everything from memory" is a wipe request, and "remember everything I say" saves nothing. Test added in test/assistant.test.js.

Left for later: "remmeber" typos are not matched. "save this to memory" and "undo that" are not matched. "forget me" and "forget the last thing" search memories for those words, which finds nothing useful. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-25 — developer help, JSON to DTO, Kotlin names (seventeenth pass)

Tried 8 pastes with hyphen and snake_case keys, Kotlin and Java keywords as keys, a 20 digit integer, nested arrays with nulls and ISO dates, in Java, TypeScript and Kotlin.

As a user, the Kotlin output was the problem. `first-name` became `firstName` and `user_id` became `userID` with nothing linking them back to the JSON, so Spring Boot would leave those fields null. Keys such as `class` or `val` were renamed to `rootClass` and `rootVal` the same way. Java and TypeScript already handled this.

Fixed: when a Kotlin paste has a key that is not plain camelCase, or is a Kotlin keyword, brain/devtools.js now asks quicktype for Jackson annotations and trims its mapper and converter boilerplate, so the answer is the annotated data classes plus one import. Plain camelCase pastes are unchanged. Test added in test/modes.test.js.

Left for later: a 20 digit integer is still typed as a double (Java) or number (TypeScript), which loses precision. Kotlin Jackson output marks every field `required=true`. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-25 — onboarding first run, "not allergic" and condition names (eighteenth pass)

Tried 38 answers for the name, allergy and interest boxes, such as "it's me, Kai", "kai the cat", "Mr. Anderson", "celiac", "lactose", "coeliac disease", "not allergic", "tree nuts (anaphylaxis)" and "ML/AI".

As a user, the worst problem was a reversed meaning. Typing "not allergic" saved "I'm allergic to not allergic", and Loon would then act on a wrong medical fact. "it's me, Kai" saved "Call me me". "lactose" was saved as an allergy and "celiac" as "allergic to celiac".

Fixed: the no-answer rule in brain/personal.js now accepts "not allergic" and "I'm not allergic". The name reader drops "it's me", "this is me" and "that's me". A bare "lactose" is stored as an intolerance and "celiac" or "coeliac disease" as "I avoid gluten (celiac)". Test added in test/personal.test.js and checked to fail before the change.

Left for later: "nobody", "me" and "anonymous" are saved as names. "Peanut allergy" keeps the singular "Peanut". "tree nuts (anaphylaxis)" keeps the bracket note. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.

## 2026-11-25 — voice intents, stop, simple terms and stack traces (sixteenth pass)

Tried 46 spoken phrasings such as "tldr", "explain it like I'm five", "make it sound nicer", "stop listening", "explain in simple terms", "explain this stack trace", "what does this exception mean", "is this a good deal" and "make it longer".

As a user, the worst problem was that "stop listening" was sent to the model as a question. "explain in simple terms" and "explain this stack trace" also missed the templates, so they used a model call and had no selection check.

Fixed: "stop listening" is a stop word, "explain simply" (and so "explain in simple terms") maps to simplify, and the error template accepts stack trace, traceback and exception. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "expand this", "turn this into bullets", "what language is this", "read this out loud", "save this to notes", "which is the healthiest" and "is this a good deal" still go to the model as free questions. There is no longer or bullets edit chip yet.

## 2026-11-25 — writing tools, bare tone asks (fifteenth pass)

Tried 31 typed edit asks such as "friendlier tone", "a more professional tone", "make it longer", "expand this", "soften the tone", "make it punchier", "rewrite in a friendly tone", "shorten it a lot", "too long, cut it down" and "less stiff".

As a user, the short tone phrases I would type or say first ("friendlier tone", "warmer tone", "a more professional tone") went to the model as free questions with no selection check. "rewrite in a friendly tone" failed too because the warmer template needed "this", "that" or "it".

Fixed: the warmer, professional and casual templates in brain/intents.js accept a bare "tone" phrase, and the warmer rewrite template accepts a missing pronoun. Test added in test/voice.test.js and checked to fail before the change.

Left for later: "make it longer", "expand this", "soften the tone", "make it more confident", "make it punchier", "make it more direct", "less stiff", "shorten it a lot" and "too long, cut it down" still reach the model. They need new tasks (longer, direct) rather than regex changes. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-25 — memory and privacy, redaction (twentieth pass)

Tried 66 lines such as cards, SSNs, env lines, URLs with tokens, "pass is" and "password to the router is" phrasings, door and alarm codes, and login pairs.

As a user, two ordinary phrasings leaked. "the wifi pass is Sunshine99" went through unredacted because only "password" and "pin" were matched before "is". "the password to the router is admin1234" leaked too, since the "password for X" rule did not accept "to".

Fixed: the "pass is / was / to" rule accepts "pass", and the "password for X" rule accepts "to". Both still need a digit in the value, so "pass is the word" and "password to log in" stay readable. Test added in test/browser.test.js and checked to fail before the change.

Left for later: "my login is bob password Spring2024!" and "password Spring2024!" with no separator, "my passwords are abc123 and def456", and "Security code: 123" (three digits) are not redacted. Emails and phone numbers are not redacted by design. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-25 — typed questions and instant answers, logs (twenty-first pass)

Tried 30 maths phrasings such as "what is 15% of 240", "240 + 15%", "half of 15", "7!", "$20 * 1.08", "how many ml in a cup", "10 mph to kph", "log 100" and "pi * 2". I also ran 30 recurring-routine phrasings ("every weekday at 9am summarize my notes", "twice a day remind me to stretch", "every monday and thursday at 7:30") and found them all parsed correctly or refused on purpose.

As a user, the one gap was "log 100" and "ln 10". They went to the language model, which is poor at numbers.

Fixed: brain/calc.js answers log (base 10) and ln, and says plainly that zero has no log. Test added in test/brain.test.js.

Left for later: "pi * 2", "1e3 * 2", "20% of 50% of 100" and "3 dozen eggs times 4" still reach the model. "every morning and evening take pills" keeps one time and asks on the confirm card. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-25 — history (twentieth pass)

Tried 30 phrasings such as "wat did i ask", "recall", "what did you tell me earlier", "what did I say earlier", "repeat my last question", "last conversation", "show me my chats", "my previous conversation" and "pull up my last chat".

As a user, the loose ways of asking for my history went to the model, which cannot see it and might pretend to remember. Seven of the eight phrasings left over from the last history pass still missed.

Fixed: parseCommand now reads "wat/what did I ask", bare "recall", "what did I say / you tell me (earlier)", "repeat/show my last question, chat or conversation", "last conversation" and "show me my chats" as a history list. Test added in test/assistant.test.js and checked to fail before the change.

Left for later: "my previous conversation" and "what was the last thing you told me" still reach the model, and "continue our chat about X" has no continue action from typed text. "find that thing I asked about earlier" is treated as a file search. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — routines, day ranges (sixth pass)

Tried 24 routine inputs such as "every monday to friday at 8 remind me to commute", "mon-fri at 9 remind me to log hours", "every monday through thursday…", "every day at 9am for 5 days…", "twice a day…" and "every weekend…", plus 10 routine commands.

As a user, "every monday to friday at 8" was the bad one. Loon made a routine for Monday only and put "Friday remind me to commute" in the message. "mon-fri at 9 remind me…" was not recognised at all.

Fixed: brain/routines.js now reads day ranges ("mon-fri", "monday to friday", "monday through thursday", also across the weekend like "friday to monday") as every day between the two ends. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "for 5 days" and "until friday" limits are not supported, so the card shows the whole phrase as the message and is marked as not understood. "show reminders", "clear routines", "unschedule X", "never remind me to X" and "skip X today" are still not understood. The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data).

## 2026-11-26 — page kinds, sensitive hosts (eighteenth pass)

Tried 55 hostnames through detectPage with a plain page body, mixing banks, brokers, password managers, health sites, HR tools, crypto sites and ordinary sites.

As a user, the worst misses were private sites treated as ordinary pages, so Loon would be willing to read them. Crypto exchanges and wallets (crypto.com, gemini.com, metamask.io, ledger.com), Workday and ADP payroll portals, Doctolib, eToro, BNP Paribas, Mercury and Gusto all came back as "other".

Fixed: those hosts are now in the sensitive domain list in extension/lib/page-kind.js. Test added in test/browser.test.js and checked to fail before the change.

Left for later: a general rule for hosts that start with "login", "secure" or "my" is not added, because it would catch shops. Hospital and pharmacy sites (walgreens.com, cvs.com) stay ordinary pages because most visits are shopping. The 5 failures in `npm test` are the usual sandbox ones (missing WordNet data).

## 2026-11-26 — open and launch commands (eleventh pass)

Tried 75 phrasings such as "open system settings", "open code", "open vs", "open github", "open chatgpt", "open google", "open yt", "open insta", "open stackoverflow", "open chrome browser" and "open wifi settings".

As a user, "open system settings" did nothing and went to the chat, because the rule for panes like "wifi settings" also caught the real app name. "open code" and "open vs" offered an app with that exact name. Web-only names such as github, chatgpt, google, twitch, tiktok and ebay showed a confirm card for an app that does not exist.

Fixed: "system settings" opens System Settings, "code" and "vs" open Visual Studio Code, and the web-only names above (plus yt, fb, ig, insta and wiki) open their website. Test added in test/assistant.test.js.

Left for later: "open chrome browser", "open the browser", "open google meet" and "open drive" still offer an app with that exact name. "open music" still opens the Music folder. `npm test` shows the same 5 WordNet and demo failures as main in this sandbox.

## 2026-11-26 — follow-up conversations, thanks and praise wording (nineteenth pass)

Tried 43 short replies inside a thread, such as "thank u so much!!", "ty loon!", "thanks man", "ur the best", "i love you", "ok that makes sense", "sry", "kthxbye", "meow" and "thanks! bye".

As a user, most were instant, but "thanks man", "thanks buddy", "ur the best", "i love you", "ok that makes sense" and "sry" went to the language model for a slow, wordy reply to a simple kind word.

Fixed: the thanks rule accepts man, buddy, bro, friend and pal at the end, the praise rule accepts "ur" and "i love you", the acknowledgement rule accepts "that makes sense", and the apology rule accepts "sry". Test added in test/brain.test.js and checked to fail before the change.

Left for later: "kthxbye", "my b", "meow", "purr" and a thanks with a mid-sentence goodbye ("thanks! bye") still go to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — food and menu (twenty-third pass)

Tried 50 dish names such as "Pho Chay", "Tempeh Reuben", "Ramen", "Miso Ramen", "Steamed Dumplings", "Saag Paneer", "Egg Drop Soup" and "Fish Tacos".

As a user, the worst problem was a wrong vegetarian answer. Plain "Ramen" and "Miso Ramen" were listed as likely vegetarian although ramen broth and toppings usually hold pork. "Pho Chay" (vegetarian pho) and "Tempeh Reuben" were hidden from the vegetarian list.

Fixed: brain/food.js treats ramen as a meat dish unless a veggie word comes before it, reads "chay" as a vegan marker, and lets tempeh, seitan and reuben count as meat-free wording. Test added in test/modes.test.js and checked to fail before the change.

Left for later: "Hot and Sour Soup" and "Kimchi Fried Rice" are listed as vegetarian although the broth or the kimchi often has pork or fish sauce. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — developer help, error table (twenty-first pass)

Tried 51 real error messages from Node, Python, Java and Spring, Rust, Go, git, Docker, npm, ssh and databases.

As a user, 44 were answered from the table. The ones I would hit on my own Mac and Spring projects were missed. The standard Spring Boot "APPLICATION FAILED TO START ... required a bean of type" report, "password authentication failed" from Postgres, and "xcode-select: error: command line tools are not installed" all went to the model.

Fixed: brain/errors.js reads the Spring startup report as a missing bean, treats Postgres password failures as a database login problem (the Postgres connection rule no longer grabs them first), and the Xcode rule also covers the xcode-select wording. Test added in test/modes.test.js and checked to fail before the change.

Left for later: C++ "'iostream' file not found" and "undefined reference to", "Could not build wheels for", "Unable to locate package" and "Could not find or load main class" are still not in the table. Other "APPLICATION FAILED TO START" causes (datasource, port) rely on their own rules. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — settings UI, reply style feedback (sixteenth pass)

Tried 36 style requests such as "ELI5", "use bullet points", "stop being so playful", "don't be so wordy", "answers in german pls", "reply in español", "be nicer" and "english only".

As a user, three natural phrasings went to the model and left the setting unchanged. "stop being so playful" and "don't be so wordy" are the obvious way to say what the settings already offer. "answers in german pls" missed because only "reply in" and "answer in" were known.

Fixed: parseFeedback in brain/personal.js now reads "stop being so playful, silly or cute" as the plain tone, "don't be so wordy, chatty or verbose" as short replies, and "answers in X" or "replies in X" as a reply language. Test added in test/personal.test.js.

Left for later: "reply in español" (language names in other languages), "ELI5", bullet point requests and "be nicer" have no rule. The 5 failing tests in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — writing and edit asks by voice and typed, find bugs (seventeenth pass)

Tried 61 short asks about a selection such as "fix grammer", "tldr", "ELI5", "make it a bit shorter", "could you please proofread this for me", "say it nicer", "clean this up", "make it polite", "find bugs" and "any bugs?".

As a user, nearly every edit phrasing already reached the right chip task. The one wrong result was "find bugs" and "find bugs in this code". They were read as a file search for the word "bugs", so a developer who selected code got a file search card instead of a review.

Fixed: the find_bug template in brain/intents.js accepts "find bugs" with or without "in this (code)", and "any bugs" or "are there any bugs". Test added in test/voice.test.js and checked to fail before the change.

Left for later: "summary", "sum up", "clearer", "summarize in one sentence", "simplify this for a child" and "why is this broken" still go to the model as free questions, which is fine but slower. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — translation and definitions, synonyms (twenty-first pass)

Tried 39 typed asks such as "define serendipity", "another word for big", "opposite of hot", "synonyms for angry", "defin ephemeral", "what does bonjour mean", "translate hello to spanish", "how do you say thank you in french" and "what rhymes with orange".

As a user, definitions and antonyms were instant and sensible. Synonym lists were the weak spot. "another word for big" started with "boastfully, vauntingly" because WordNet lists adverb senses first.

Fixed: brain/define.js now puts adverb senses after the other senses in a synonym list. Test updated in test/brain.test.js and checked to fail before the change.

Left for later: "another word for fast" still starts with "fasting, debauched" because the noun and satellite senses come first and WordNet has no useful frequency counts for them. "defin ephemeral" (typo), spelling, plurals, rhymes, pronunciation and "what does bonjour mean" go to the model. `npm test` passes fully here once the wordpos index is built.

## 2026-11-26 — onboarding first run, name, allergy and interest boxes (nineteenth pass)

Tried 30 names ("im ada", "Ada 🐱", "Ada (she/her)", "ada_99", "Ada & Bob"), 30 allergy answers ("eggs, dairy, & soy", "mild peanut allergy", "I don't have any", "nope") and 12 interest answers.

As a user, most of it worked. The one wrong result was a list with an ampersand after a comma. "eggs, dairy, & soy" was saved as "I'm allergic to eggs, dairy and & soy", with a stray "&" in a pinned fact.

Fixed: the list splitter in brain/personal.js now treats "," or ";" followed by "&" as one separator, for allergies and for interests. Test added in test/conversations.test.js and checked to fail before the change.

Left for later: "Ada & Bob" keeps a double space in the name, "Ada Lovelace Jr." loses its final period, "名前は李雷です" is kept whole, and "ninguna" is saved as an allergy. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — reminders, timers and focus (twenty-first pass)

Tried 47 asks such as "remind me in half an hour", "timer 1:30", "wake me up at 7am", "remind me every weekday at 9 to standup", "turn off focus mode", "focus mode off" and "stop the focus timer".

As a user, reminders, timers and recurring routines were solid. The weak spot was getting out of focus mode. "turn off focus mode", "focus off", "disable focus mode", "exit focus mode" and "stop the focus timer" all went to the model, which could only talk about it while the cat stayed quiet. "enable focus mode" and "turn on focus mode" missed too.

Fixed: brain/commands.js reads those on and off phrasings as the focus command. The stop rule now runs before the timer rules, because "stop the focus timer" was read as a timer and dropped. Test added in test/hub.test.js.

Left for later: "remind me at 25:00 to x" makes a reminder titled "at 25:00 to x" with no time, "cancel timer", "list reminders" and "snooze 10 min" have no command, and "focus until 3pm" goes to the model. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-26 — routines, monthly and wording checks (seventh pass)

Tried 31 routine inputs such as "every morning remind me to stretch", "every 2 weeks on friday submit timesheet", "first monday of every month at 10 call mom", "every day at 9am and 9pm take pills", "every wknd at 10 laundry" and "every day at 9 until friday stretch".

As a user, most phrasings gave a sensible schedule. The bad one was "first monday of every month at 10 call mom". Loon made a routine for the 26th of every month (today's date) with the message "First monday of call mom", and the card looked fine.

Fixed: brain/routines.js now declines "first monday of every month", "last friday of each month" and similar, the same way it already declines "every 3rd thursday". The card then shows the routine as not understood. Test added in test/routines.test.js and checked to fail before the change.

Left for later: "all weekdays at 9 standup" keeps "All" in the message, "evry monday" (typo), "every wknd" and "every day at 9am and 9pm" are not understood at all, and "for 5 days" or "until friday" limits are still part of the message. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-27 — memory commands (tenth pass)

Tried 36 phrasings such as "remember that my wifi password is hunter22", "forget me", "forget the last thing", "forget everything about me", "save this to memory: I hate cilantro", "rememeber I like tea" and "memorize that my cat is called Loon".

As a user, "forget everything about me" searched memories for the word "me", found nothing and said "I didn't have anything like that saved". It sounds like Loon forgot me and kept nothing, which is not what happened. Secrets in "remember" are already refused by the action, which I checked.

Fixed: "forget everything about me" and "forget all about myself" are now a wipe request, so Loon points to Settings → Memory. Test added in test/assistant.test.js.

Left for later: "rememeber" typos, "save that", "forget me" and "forget the last thing" are still not understood and search memories for those words. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-27 — developer help, JSON to DTO, Kotlin required fields (eighteenth pass)

Tried 20 pastes in Java, Kotlin and TypeScript, including nested objects, arrays of objects with optional keys, keys named list, object and date, snake_case and hyphen keys, empty arrays, nulls and long numbers.

As a user, the Kotlin answer for keys such as `first-name` marked every field `required=true`. The paste is only one sample, so a real payload that leaves a field out would fail to deserialize with a Jackson error. Java and TypeScript outputs looked right.

Fixed: brain/devtools.js now drops `required=true` from the Kotlin Jackson annotations. Test extended in test/modes.test.js.

Left for later: a 20 digit integer is still typed as double or number. A key named `date` makes a class called Date with no import note. The 5 failures in `npm test` are the usual WordNet and demo ones from the sandbox install.

## 2026-11-27 — shopping and unit price (twenty-third pass)

Tried 40 size strings and 20 price strings, including "500g x 2", "1,5 l", "8.5 oz/241 g", "Net Wt 1 lb 2 oz (510g)", "½ lb", "$5.00 - $7.00" and "2 for $5".

As a user, the one clear miss was a size written with a fraction character. "½ lb" gave no size at all, so that product dropped out of the unit price ranking, and "1½ lb" would have been read as a pound at best.

Fixed: parseQuantity now turns ½, ¼, ¾, ⅓ and ⅔ into numbers, with an optional whole number in front. Test added in test/modes.test.js and checked to fail before the change.

Left for later: a price range ("$5.00 - $7.00") reads as 5, "$0.00" becomes a price of 0 that would win every value ranking, "Buy 2 get 1 free $6" reads as 2, and "20 count 1.5 oz bars" counts one bar. The 5 failures in `npm test` are the WordNet and demo ones from the sandbox install.
