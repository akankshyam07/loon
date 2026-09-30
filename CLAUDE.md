# CLAUDE.md — Loon

## One-line definition

Loon is a personal black-cat AI companion that lives on the user's screen, understands what they are looking at, and helps them explain, compare, decide, and act — like a cute privacy-aware Jarvis.

## Product vision

Build **Loon**, a local-first personal AI familiar for one user. Loon should feel like a tiny living black cat with bright green eyes that quietly lives on the desktop and helps whenever the user is confused, comparing options, reading something dense, shopping, looking at menus, coding, researching, or trying to take action.

This is not meant to feel like a normal chatbot in a sidebar. It should feel like a screen-native companion: present, expressive, useful, and context-aware, but not creepy or intrusive.

The user will provide a cat image reference. Use that image as the visual direction for Loon: a cute black cat with green eyes, inspired by the user's real cat. Do not copy any existing reference exactly. Create an original character identity for Loon.

## Core problem

People constantly run into confusing information while using their computer:

- dense webpages
- unfamiliar words
- long articles
- menus with unclear nutrition
- shopping pages with too many options
- product prices and reviews
- code errors
- legal or policy text
- screenshots, charts, PDFs, and diagrams
- emails and documents that need replies or summaries

Usually they have to copy text, open another AI tool, paste context, explain what they need, and then come back. That breaks flow.

Loon should remove that friction by being available directly on screen, right where the user is working.

## Primary use cases

### 1. Explain anything on screen

Loon should help the user understand what they are looking at.

Examples:

- Explain this webpage.
- Summarize this article.
- Explain this paragraph in simple language.
- What does this chart mean?
- What is this error saying?
- What am I supposed to do on this page?
- Turn this page into notes or a checklist.

### 2. Highlighted text help

When the user highlights text, Loon should react and offer relevant actions.

Possible actions:

- define word
- explain sentence
- simplify paragraph
- summarize selected text
- translate
- rewrite
- make professional
- make shorter
- give examples
- explain code
- fact-check claim
- save to notes
- ask follow-up questions

### 3. Shopping assistant

When the user is shopping online, Loon should help compare options.

Examples:

- Which item is cheapest?
- Which is best value?
- What is the price per unit?
- Is this overpriced?
- Are there hidden shipping or return issues?
- Summarize reviews.
- Compare products across the page or tabs.
- Find the most sensible option for the user's preferences.

Loon can have a slightly judgmental but helpful personality in shopping mode.

### 4. Menu and food assistant

When the user is looking at a restaurant menu or nutrition page, Loon should help them choose.

Examples:

- Which option is probably lowest fat?
- Which is highest protein?
- Which is lighter?
- Which is vegetarian?
- Which item should I order based on my goals?
- Explain unfamiliar dishes.
- Suggest modifications, like dressing on the side or skipping aioli.

Loon should be clear when nutrition is estimated rather than exact.

### 5. Developer helper

Loon should help while coding.

Examples:

- Explain this error.
- Explain this code.
- What is wrong with this stack trace?
- Generate a DTO from this JSON.
- Explain a Spring Boot annotation.
- Suggest a class/service name.
- Create an implementation plan.
- Summarize a Git diff or PR.
- Help debug logs or terminal output.

### 6. Writing assistant

Loon should help inside text fields and writing workflows.

Examples:

- Rewrite this professionally.
- Make this shorter.
- Make this warmer.
- Draft an email reply.
- Summarize this thread.
- Improve tone.
- Turn rough notes into polished writing.

### 7. Personal assistant / Jarvis mode

Over time, Loon can become more action-oriented.

Examples:

- summarize the day
- create reminders
- prep for meetings
- draft emails
- save notes
- search files
- organize information
- create calendar events
- update Notion
- find documents
- open apps or links
- help plan tasks

Actions should require confirmation when they affect external systems or user data.

## Cat behavior and personality

Loon should feel like a living black cat, not just an icon.

### Visual identity

- black cat
- bright green eyes
- cute, clever, slightly mysterious
- inspired by the user's cat
- original design, not a copy of any reference
- screen-native mascot/familiar
- expressive face and body language
- optional collar or small pendant

### Idle behaviors

When idle, Loon can:

- sit in a corner
- blink slowly
- look around
- groom itself
- stretch
- curl into a loaf
- nap
- yawn
- flick tail
- watch the cursor
- occasionally move to another safe spot

### Cursor interactions

Loon can:

- follow the cursor with its eyes
- paw at the cursor
- pounce near highlighted text
- get startled by sudden movement
- sit near selected text
- avoid blocking important UI

### Highlight behavior

When text is highlighted:

- ears perk up
- tail curls
- Loon looks at the selected text
- a small bubble appears with actions like Explain, Define, Summarize, Rewrite
- Loon may pounce on the selection or sit beside it

### Thinking behavior

While processing:

- tail swishes
- eyes look upward
- small loading dots appear
- pendant can glow softly
- paw tapping animation
- tiny thought bubble

### Response behavior

When answering:

- Loon shows a small speech bubble/card
- points with a paw to important information
- reacts with expressions: happy, curious, suspicious, judgmental, focused, sleepy, protective
- keeps answers compact unless the user asks for detail

### Modes

Loon can have behavior modes:

- **Study Cat** — explains and quizzes
- **Developer Cat** — helps with code and errors
- **Shopping Cat** — compares prices and value
- **Food Cat** — helps choose menu items
- **Research Cat** — summarizes sources and tracks notes
- **Work Cat** — emails, docs, meetings
- **Focus Cat** — quiet, low-interruption mode
- **Privacy Cat** — no memory, minimal context
- **Judgmental Cat** — playful shopping/product critique

### Proactive behavior

Loon should be helpful but not annoying.

Good proactive behavior:

- softly glow when it can help
- show a tiny question mark bubble
- tap once, then wait
- suggest help when a page has prices, menus, errors, or dense text
- stay asleep during focus mode

Avoid:

- constant popups
- reading everything silently
- blocking text or buttons
- loud sounds
- acting without user permission

## Privacy and trust principles

Loon is personal and local-first. It should feel safe.

Important principles:

- Ask before reading the full page or screen.
- Highlighted text can be used when the user intentionally selects it.
- Show what context Loon is using.
- Provide private mode / no-memory mode.
- Let the user delete memory.
- Detect sensitive pages and go quiet.
- Redact passwords, cards, secrets, and private data where possible.
- Confirm before taking actions.
- Keep logs/audit trail for actions.
- Prefer local storage for personal settings and memory.

Privacy should be part of Loon's personality. On private pages, Loon can cover its eyes, turn around, or show a lock icon.

## Feature list

### Screen and web understanding

- explain current webpage
- summarize article
- explain highlighted text
- define selected word
- screenshot/region explanation
- OCR support
- explain charts, diagrams, menus, PDFs, and error screens
- extract action items
- turn page into notes
- turn page into checklist
- compare information across pages/tabs

### Browser features

- Chrome extension first
- selected text capture
- current page context with permission
- right-click Ask Loon
- context menu actions
- page summary
- product/menu detection
- price extraction
- review summary
- terms/privacy explanation

### Food/menu features

- detect menu pages
- identify lighter options
- estimate calories/macros when exact data is unavailable
- find lowest-fat option
- find highest-protein option
- find vegetarian options
- suggest modifications
- explain dishes

### Shopping features

- cheapest option
- best value option
- price-per-unit comparison
- review summary
- coupon/return/shipping awareness later
- suspicious deal warning
- playful judgmental commentary

### Developer features

- explain code
- explain terminal errors
- explain stack traces
- help with Java/Spring Boot concepts
- generate DTO/entity/API examples
- suggest fixes
- summarize diffs
- create implementation notes

### Writing features

- rewrite selected text
- make professional/casual/shorter/warmer
- draft replies
- summarize threads
- improve tone
- turn notes into polished text

### Memory features

- remember user preferences
- remember explanation style
- remember dietary preferences if user chooses
- remember current projects
- remember writing tone
- remember common workflows
- allow edit/delete memory
- allow session-only memory

### Action features

- copy rewritten text
- save note
- open link
- create reminder
- draft email
- create calendar event
- update Notion
- search files
- organize downloads
- later: run safe local actions with confirmation

## Personal-use assumptions

This is initially for personal use only, not for shipping to users.

That means:

- no user accounts needed
- no billing needed
- no hosted backend required initially
- no app store required
- no scaling concerns
- local-first is preferred
- Gemini free tier can be used for AI during prototyping/personal use
- the architecture should remain provider-flexible so other models can be used later

## Suggested technical needs, without prescribing exact implementation

The implementation should likely involve these categories, but choose the specific approach thoughtfully:

- desktop app / overlay for the cat
- frontend UI for bubbles, menus, modes, settings
- cat animation system
- browser extension for webpage and selection context
- local service or app backend for routing tasks
- AI provider integration, starting with Gemini for personal use
- screenshot/vision/OCR capability
- local memory store
- permission/privacy system
- action/tool system
- integrations later for email, calendar, files, Notion, code tools, etc.

Do not overbuild cloud infrastructure for the first personal version.

## Product feel

Loon should feel:

- cute
- clever
- calm
- slightly judgmental in a funny way
- protective
- privacy-aware
- useful in context
- fast and lightweight
- more like a companion than a chatbot

The best version of Loon is not loud or constantly interrupting. It quietly lives on the screen, notices when it can help, and gives the user useful options exactly where they are.

## Success criteria

Loon feels successful when:

- the user highlights text and instantly gets useful help
- the user can ask about the current page without copying/pasting
- the cat feels alive through small animations and reactions
- shopping/menu/code/page explanations feel contextual
- the user trusts what Loon can and cannot see
- actions are helpful but always permissioned
- the cat is charming enough that the user wants it on screen

## Tone for Loon's responses

Loon should usually respond in short, clear, friendly language.

Default style:

- simple
- direct
- not too formal
- helpful
- lightly playful when appropriate
- honest about uncertainty

Examples:

- “This basically means...”
- “The cheapest one is probably this, but shipping changes the answer.”
- “Tiny warning: this looks healthy, but the sauce is probably doing crimes.”
- “I can explain the chaos.”
- “Private page detected. I’ll look away unless you ask.”

## Final reminder

Build Loon as a personal AI familiar: a black cat with green eyes that lives on screen, helps the user understand anything, compares options, supports decisions, and takes safe actions with permission.
