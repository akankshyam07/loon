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
