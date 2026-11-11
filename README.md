# CCDV-F Exam Prep Portal

A local web app for practicing multiple-choice questions for the **Claude Certified
Developer – Foundations (CCDV-F)** exam, generated from the course slide deck in
[`context/slides.pdf`](context/slides.pdf).

## What's here

```
context/
  slides.pdf          Source course slides (1,286 pages / 122 decks, from certmasterclass.com)

portal/
  server.js            Plain Node.js server — serves the app and a small JSON-file API
  public/
    index.html          App shell / view templates
    app.js               All client-side logic (quiz flow, scoring, dashboard)
    styles.css           Styling
  data/
    questions.json       The generated question bank (see below)
    progress.json        Your quiz history and stats — written to by the app
  data.zip              Backup/export of the data/ folder (optional, for restoring progress)
```

No frameworks, no build step, no `npm install` — just Node's built-in `http` module and
vanilla JS.

## Running it

```bash
cd portal
node server.js
```

Then open **http://localhost:4173**.

## How the question bank was built

The slides are image-based (almost no extractable text layer), so the bank wasn't scraped
from text — each slide deck's page range was identified from the PDF footer labels
("Deck NN | S NN — Topic"), sample pages were rendered to images, read visually, and used
to draft questions grounded in the actual slide content.

- **122 decks** in the source deck; **6 are marked `[DEPRECATED]`** in the slides and were
  excluded, leaving **116 active topics** in the bank.
- **1,044 questions total** — exactly **9 per topic** (3 Beginner / 3 Medium / 3 Hard),
  covering the full syllabus from agent architecture and the Agent SDK through the Messages
  API, prompt engineering, security/guardrails, tool design, and MCP.
- Each question: 4 options, one correct answer, and a short explanation shown after you
  answer.

### Regenerating or extending the bank

`portal/data/questions.json` is a flat JSON array. Each entry looks like:

```json
{
  "id": "d012-med-2",
  "deck": 12,
  "topic": "PreToolUse and PostToolUse Hooks",
  "difficulty": "medium",
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "answer": 1,
  "explanation": "..."
}
```

To add more questions for a topic (or a new source deck), append more objects following
this schema — `id` just needs to stay unique, `answer` is the 0-based index into `options`.
The frontend shuffles option order per quiz automatically, so new entries don't need to be
pre-randomized.

## Using the portal

- **Home** — pick a difficulty (Beginner / Medium / Hard / Mixed), optionally filter to one
  topic, choose how many questions, and start.
- **Quiz** — answer, check, see the explanation, move on. Option order is randomized each
  time a question is shown.
- **Results** — score, breakdown by difficulty, full review of every question with your
  answer vs. the correct one, and a "retry missed questions" shortcut.
- **Progress** — overall accuracy, accuracy by difficulty and by topic (so you can see your
  weakest areas), and your recent quiz history.

## Data persistence

Progress is stored server-side in `portal/data/progress.json`, updated after every quiz —
it's a real file on disk, not browser storage, so it survives across browsers/devices as
long as you're pointing at the same server.

`portal/data.zip` is a zip of the `data/` folder (questions + progress) you can use as a
backup or to move your progress to another copy of this project — unzip it into `portal/`
and it'll overwrite `portal/data/questions.json` and `portal/data/progress.json`:

```bash
cd portal
unzip -o data.zip -d .
```

To wipe progress and start over instead, use the **Reset All Progress** button on the
Progress page (or `POST http://localhost:4173/api/progress/reset`).

## Deploying elsewhere

This is built as a local tool (persistent server + a local JSON file for progress), which
doesn't map cleanly onto a serverless host like Vercel without changes — see the chat
history for the tradeoffs if that comes up later (static site + `localStorage` progress is
the low-effort option; a hosted database is the faithful one).
