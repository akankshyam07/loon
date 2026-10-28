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
