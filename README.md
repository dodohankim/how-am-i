# howami

**English** · [한국어](README.ko.md)

> "How am I today?"

When your body hurts, you can say where and how. The mind is different. By the end of a day,
all that's left is "it was just a rough one" — where it got rough, and why, is gone. So the same
thing keeps happening without being noticed, and the good days pass without anyone learning
what made them good.

howami exists to unpack that "just". You lay the day out in your own words, it splits the day
open with you, looks into the one thing that snagged, and keeps only the interpretation you
yourself confirmed. The records never leave your computer.

## What this project puts first

Three things come before any feature or technology. Everything else follows from them.

### 1. See my state as it is

"How many points today?" flattens the morning with your family, the afternoon at work, and the
night alone into a single number. howami asks about **family, work, time alone, people, and
body** separately, and looks at how they connected — whether the tension from work followed you
to the dinner table, whether the morning argument lingered into the afternoon.

Use it as many times a day as you like. A short check-in in the morning and a long session at
night know about each other. It never grades you, and never compares you to anyone. The goal is
to record today's you, as is.

Every interpretation is a hypothesis. It is always handed back for you to confirm, and if you
correct it, your correction wins. If it was about to write "self-blame" and you say "no, it was
embarrassment", embarrassment is what goes on record.

### 2. As careful as the subject demands

No question is thrown in on a hunch. It only uses procedures validated in counseling practice
and research — thought records, affect labeling, evidence checks, exception questions, splitting
what you can control from what you can't, implementation intentions — and each one is annotated
with where it comes from and how strong the evidence is. Only what was actually used in a
conversation goes on record. On a day when everything is fine it doesn't dig; it just keeps
what made the day fine.

At the same time, howami is **not a medical device and not psychotherapy.** It doesn't diagnose
and doesn't prescribe treatment. If low scores persist for two weeks or more, or anything feels
like a crisis, see a professional. You can find a local crisis line at
[findahelpline.com](https://findahelpline.com); in South Korea, the suicide-prevention hotline
**109** answers 24/7. This is repeated in the [Disclaimer](#disclaimer) below.

### 3. These records are mine alone

Feelings and mental states are the most private information there is. So howami's records live
only as **plain text files on your computer.** Nothing is uploaded to any server, there are no
accounts, and nobody counts how much you use it. The files open in any editor, and if you want
it all gone, deleting the folder is the end of it.

One thing is stated honestly: the conversation itself runs through whatever AI agent you use
(currently Claude Code), so what you say during a conversation reaches that agent's provider.
What howami promises is that **storage and retrieval never leave your machine**; how far the
conversation travels follows the policy of the agent you chose. If that worries you, pair it
with an agent that runs a local model. How this is enforced technically is described in
[How privacy is enforced in code](#how-privacy-is-enforced-in-code).

## What it feels like

Fixed questionnaires are mechanical — after three days you stop, and they only pile up records
without ever asking "why?". howami is a conversation instead. You lay the day out in your own
words; the agent splits it into areas with you, digs into one spot with a validated technique,
hands its reading back for your confirmation, and then you pick one next step. The result is a
single text file, and the next conversation starts by reading it, so nothing is asked twice.

```
> /howami

How did today go? No need to put it in order - just tell it the way it comes.
< Morning got tense with my wife over daycare prep, then at work I walked into
< a planning meeting unprepared, which was rough. At night I read alone for a bit.

Let me lay that out. Morning: friction with family over daycare prep. Midday: the
planning meeting you entered unprepared stuck with you. Night: some time reading
alone. Is that right?
< Yes - though the morning thing got resolved on an evening walk together.

Then let's include that too. Shall we score the areas? Family, 1 to 5?
< A 4. Morning was a 2, but the evening made up for it.

...

Work (2) and family (4) stand apart. Which one do you want to look into?
< Work.

...

Putting together what came up: the meeting was moved up, you didn't know that in
the morning, so you walked in unprepared, and the self-blame from that stayed all
afternoon. Is that how you'd put it?
< Not self-blame exactly - I think I was just embarrassed.

Then I'll write embarrassment. It also looked like the morning family friction may
have carried into midday - did it feel that way?
< No, those were separate.

...

Today we spread the day into morning, midday, and evening, scored each area
separately, and the gap between work and family stood out first. On the work side
we followed "why" three steps down to "I don't check the calendar in the morning",
you confirmed that reading, and only the changeable part became the next step.
Saved. (~/howami/data/2026-08-27--2210.md)
```

## How it works

There are two kinds of conversation.

| Kind | When | Length |
|---|---|---|
| **session** | Reviewing the whole day (usually evening) | 10–15 min |
| **checkin** | Just this moment | 2–3 min |

The long one walks eight stages.

| Stage | What happens |
|---|---|
| **Open** | Starts with "how did today go", not a score. Your words come first |
| **Day map** | Splits your account into morning/midday/evening and life areas, hands it back, gets confirmation |
| **Area scan** | Family, work, time alone, people, body — each scored 1–5 |
| **State scan** | The axes running through the day: energy, mood, sleep, execution |
| **Focus** | If several things snagged, **you** pick one |
| **Probe** | Digs into that one thing with a chosen technique |
| **Validate** | Hands the interpretation back for confirmation. Cross-area spillover is asked here too |
| **Next step** | You pick exactly one thing to change. The next session checks whether it happened |

On a day when everything is fine, the probe is skipped; what's kept instead is what made the
day fine. There is no reason to dig into a good day.

### The techniques go on record

Each conversation records which techniques it actually used, by their ids in
[`questions/methods.yaml`](questions/methods.yaml). 32 come built in.

| Branch | Techniques |
|---|---|
| Opening | Open question, Reflective listening |
| Laying out | Day mapping, Domain scaling, Spillover check, Baseline delta, Prescription follow-up, Agenda setting |
| Digging | Trigger mapping, Thought record, Affect labeling, Distortion check, Evidence check, Five Whys, Exception question, Values check, Dichotomy of control, Decatastrophizing, Cognitive defusion |
| Validating | Summary validation, Alternative hypothesis |
| Next step | Behavioral activation, Tiny habit, Implementation intention, Problem solving, Behavioral experiment, Obstacle plan |
| Caring | Three good things, Self-compassion |
| Reviewing | Pattern review, Within-day shift, Early warning signs |

Each entry carries its origin (`origin`), the nature of its evidence
(`evidence`: `clinical` / `applied` / `local`), and how to explain it back to the user
(`say_it_as`).

Inside a file they appear under that session's `## 참고한 기법` (techniques used) and
`## 확인받은 것` (validated readings); in statistics, as technique frequencies in `stats`.

Some entries borrow the names of clinical scales or therapeutic techniques, but all of them are
rewritten into everyday language for reference only. None of this replaces treatment.

## What gets saved

```
~/howami/
├── data/
│   ├── 2026-08-27--0940.md   # morning check-in
│   ├── 2026-08-27--1830.md   # commute check-in
│   └── 2026-08-27--2210.md   # night session (whole day)
└── insights/                 # weekly/monthly pattern reports (generated on request)
```

**One file is one conversation.** There was never a one-per-day limit to begin with.
The files are ordinary text — read them directly, edit them in any editor, move them to another
machine. Edits are picked up automatically at the next conversation.

Each file keeps that day's area scores with one-line notes, the topic dug into and the
confirmed interpretation, the next step, and the counseling techniques actually used. Which
means later you can ask:

- Through what path did this conclusion come about?
- Which of my interpretations turned out wrong?
- What kinds of questions am I mostly being asked?

## What it doesn't do

This list follows from the [three principles](#what-this-project-puts-first) above.

- Servers, accounts, cloud sync (if you need it, use git or Dropbox yourself)
- Ads, telemetry, data collection
- Medical diagnosis or treatment suggestions
- Rankings or comparisons with other people

## Disclaimer

> howami is not a medical device or a psychotherapy tool.
> If low scores persist for two weeks or more, or anything feels like a crisis, see a
> professional. A local crisis line is at [findahelpline.com](https://findahelpline.com);
> in South Korea, the suicide-prevention hotline **109** answers 24/7.

---

## Install and run

From here on it's technical. The sections above are enough to use it; read on only if you're
installing it or curious how the principles are enforced in code.

### Install

Python 3.8+ is all you need. No external packages. The same code runs on macOS, Linux, and
Windows.

```bash
git clone https://github.com/dodohankim/how-am-i.git
cd how-am-i
./install.sh          # macOS · Linux: symlinks the repo to ~/.claude/skills/howami
install.cmd           # Windows (PowerShell/cmd): symlink, falling back to a junction (mklink /J)
```

Both wrappers delegate to `install.py`, so `python3 install.py` works directly too.
On Windows, if `python3` is missing, use `python` or `py -3` (the wrapper picks one itself).

Restart Claude Code, then say `/howami` or "how am I today" to begin.

To move the data location, set the `HOWAMI_HOME` environment variable.

```bash
export HOWAMI_HOME=~/Dropbox/howami          # macOS · Linux — your own sync setup, if you want one
$env:HOWAMI_HOME = "$HOME\Dropbox\howami"    # Windows PowerShell
```

### Using the CLI directly

The data is usable without any agent.

```bash
python3 scripts/howami.py context --days 14   # recent summary (the agent calls this before a conversation)
python3 scripts/howami.py day --date 2026-08-27  # all of that day's sessions, bodies included
python3 scripts/howami.py stats --days 30     # area/weekday averages, time-of-day trends, follow-through
python3 scripts/howami.py sync --rebuild      # rebuild the DB entirely from the md files
python3 scripts/howami.py where               # paths and DB status

python3 scripts/howami.py query --sql "
  SELECT d.domain, e.weekday, ROUND(AVG(d.score),2) AS mean
  FROM domains d JOIN entries e ON e.id = d.entry_id
  WHERE d.score IS NOT NULL
  GROUP BY d.domain, e.weekday ORDER BY mean"
```

`query` lets only `SELECT` and `WITH` through. Writes, schema changes, and multiple statements
are rejected.

### The web view

A built-in screen lets you browse the records in a browser. A button at the top right switches
the screen between English and Korean; on first open it follows the browser language. A small server running only on your
machine reads `~/howami` and shows it — nothing goes out (it binds to `127.0.0.1` only).

| Tab | What it shows |
|---|---|
| **Today** | State axes (energy/mood/sleep/execution) next to their 7-day averages, area scores with one-line notes, open prescriptions, today's session bodies. Each session has a speech-bubble button that opens just the actual exchange as a chat view (howami's questions on the left, what you typed on the right) |
| **Trends** | Axis and area trends over 14/30/90 days or all time, weekday averages, time-of-day averages, prescription follow-through, most-used techniques |
| **Records** | Sessions by date, with bodies. The raw md is viewable as-is |
| **Techniques** | The technique catalog used in conversations: where each comes from, what to expect from it, and further reading (Wikipedia, WHO, NHS, APA, …) |
| **Struggles** | A map of the mental struggles adults commonly face worldwide: what shows up everywhere (worry, anxiety, depression, loneliness, burnout, …), the local names cultures gave the same pressure (karoshi, involution, tang ping, …), and everyday struggles counselors hear most — with multi-country figures, sources, and chips linking each to the day map's areas. Each item carries "what helped in trials": interventions confirmed in clinical trials and meta-analyses, with effect sizes, evidence grades, and caveats; where one matches a technique in the Techniques tab, it links across |
| **Settings** | Locations, file counts, and sizes for the data root, raw md folder, SQLite DB, and insights folder — each with copy-path and "open folder" buttons (macOS Finder · Windows Explorer · Linux xdg-open) |

#### Running it

Node.js 18+ is needed only to build the screen; running it needs Python alone.

```bash
# 1) Build the screen — once at first, and whenever web/ changes
cd web
npm install
npm run build          # produces web/dist
cd ..

# 2) Run the server
python3 scripts/serve.py --open      # opens http://127.0.0.1:7788 in the browser
```

Change the port with `--port 9000` or `HOWAMI_WEB_PORT=9000`. The data location follows
`HOWAMI_HOME`, same as every other command. Stop with `Ctrl+C`.

While editing code, run both from the root with one command.

```bash
./dev.sh                 # macOS · Linux: API http://127.0.0.1:7788 + screen http://127.0.0.1:5173
dev.cmd                  # Windows
python3 dev.py --open    # any OS; --open also opens the browser
```

Editing `scripts/*.py` restarts the Python server (same supervision as `serve.py --reload`);
editing `web/src` hot-reloads through vite. One `Ctrl+C` stops both. If `node_modules` is
missing, run `npm install` first. To run them separately: `python3 scripts/serve.py --reload`
and `cd web && npm run dev`.

> If you edited `scripts/serve.py` while a server was already up, a server started without
> `--reload` won't know the new code. If the screen shows "unknown API" errors, restart the
> server or use `./dev.sh`.

The API the server exposes is read-only: `/api/context`, `/api/stats?days=30`,
`/api/day/2026-08-27`, `/api/entries/2026-08-27--2130`, `/api/questions`, `/api/methods`,
`/api/struggles`, `/api/settings`. The one exception is `POST /api/open` behind the Settings
tab's "open folder" buttons — it can open only four predefined places (`home`/`data`/`db`/
`insights`) in the OS file explorer, takes no arbitrary paths, and modifies nothing. No chart
libraries, no external fonts — for the same reason the records never leave the machine.

Expected effects and further-reading links for each technique live in
[`questions/references.yaml`](questions/references.yaml); to add a technique or a source, that
file is the only thing to edit. The Struggles tab's items, figures, and sources live in
[`questions/struggles.yaml`](questions/struggles.yaml). The audience is adults worldwide, not
any single country, so it leans on multi-country surveys — WHO, Gallup (144 countries), Ipsos
(31), Wellcome (113), GBD — and uses single-country data only as examples under "local names".

### How privacy is enforced in code

- The source of truth is the **markdown files** in `~/howami/data/`. The `howami.db` (SQLite)
  next to them is just a query index that can be rebuilt from those files at any time.
- The web view is a standard-library HTTP server bound to `127.0.0.1` only, reading that
  folder. It loads no external fonts, chart libraries, or analytics. The **Settings** tab
  shows where everything is stored and opens the folders.
- The only write-shaped API is the Settings tab's "open folder" (`POST /api/open`), limited to
  four predefined places, opening them in the OS file explorer without touching any file.
- What the conversation transmits: at the start of a conversation the agent runs
  `howami.py context` and puts a 14-day summary (scores, notes, open prescriptions) into its
  context. So what you say during the conversation, plus that summary, goes to your agent
  provider's API. howami itself makes no network requests at all.

### Source of truth and the DB

**md is the source; the DB is a cache.** Delete the DB entirely and one `sync --rebuild`
restores it fully from md. The reverse does not hold. Edit the md in an editor or pull it onto
another machine with git — the next call notices the mtime and re-reads automatically. So grep
it, version it with git, whatever you like.

The DB exists for queries: "is there a weekday when family scores dip", "are evening sessions
in a better mood than mornings" — one line of SQL, and it stays fast even with years of
records. Writes are blocked, because no data should ever exist only in the DB, bypassing the
source files. The file format and table structure are in
[`schema/session.md`](schema/session.md).

### Repository layout

```
howami/
├── SKILL.md            # conversation logic (the prompt the agent reads)
├── questions/          # question sets and technique catalog = data
│   ├── core.ko.yaml    # flow, life areas, question wording
│   ├── core.en.yaml
│   ├── methods.yaml    # 32 counseling techniques (id, origin, evidence, wording)
│   ├── references.yaml # expected effects and further reading per technique
│   └── struggles.yaml  # struggles map (common mental struggles worldwide, figures, sources)
├── scripts/howami.py   # storage layer. Reads and writes only; never converses
├── scripts/serve.py    # local web server (127.0.0.1 only)
├── web/                # web view source (React + Vite)
└── schema/session.md
```

**Separating the questions (data) from the conversation logic (prompt) is the backbone of this
project.** To adapt the life areas to your own life, edit `domains` in `core.ko.yaml` (or
`core.en.yaml`) — study, money, and personal-work areas are already there, just off by
default. The logic never needs touching.

### Roadmap

- **v0.1** — Claude Code skill + base question sets (ko/en) + technique catalog + md storage + SQLite index
- **v0.2** — per-session storage (multiple per day), multi-angle area analysis, technique
  catalog (now 32), interpretation validation stage, `day` command ← now
- **v0.3** — weekly insight reports, question expansion-pack format, contribution guide
- **v0.4+** — other agents, a `howami` CLI wrapper (the local web view arrived early via `scripts/serve.py` + `web/`)

### License

MIT
