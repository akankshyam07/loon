# Feedback loop log

## 2026-10-25 — typed questions and instant answers

Tried 32 phrasings of the time, date, help and identity questions, including smart quotes, "?!", "right now", a "hey loon" prefix, "tell me the time", "today's date", "what can u do" and "help me!".

As a user, the biggest annoyance was that many natural phrasings missed the instant code answers and went to the language model. The model cannot know the time, so it could guess or stall. The worst case was the curly apostrophe that macOS autocorrect types in "what's the time?".

Fixed: the instant answers now match on a cleaned key (smart quotes, trailing punctuation, "right now", "please" and a leading "hey loon" removed). Added "tell me the time", "today's date", "date", "what can u do" and "help me". Test added in test/brain.test.js.

Left for later: small talk such as "hi", "thanks" and "what's up" still goes to the model. A short canned reply could save a model call.

Note for the next run: `npm test` shows 2 failures on main in this sandbox (WordNet and demo tests) because `npm install --ignore-scripts` skips building the wordnet data. They are not caused by the fixes.
