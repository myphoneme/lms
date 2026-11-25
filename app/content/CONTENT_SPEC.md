# Content specification — L1 Academy

You are writing lessons for fresh graduates (mostly non-CS) who have just joined a **datacenter and cloud solutions company** and work at L1 service desk / NOC. They have 4–5 hours a week for 8 weeks. Their manager's complaint: **too many tickets are escalated to L2/L3 that L1 should close.**

Write for that person, on that floor. Not for a certification exam.

## Non-negotiable quality rules

1. **Start from work, not from a definition.** The first section explains what goes wrong on a real shift and what it costs. Definitions come second, and only the ones needed to act.
2. **No filler.** Ban: "In today's digital world", "It is important to note", "Let's dive in", "As we all know", "In conclusion". If a sentence could be deleted without losing a fact or a decision, delete it.
3. **Be specific.** Real commands, real flags, real ports, real event IDs, RFC1918 addresses (10.x, 172.16–31.x, 192.168.x), hostnames like `dc01`, `web01`, `fw-edge-1`. No invented product features, prices, customer names or statistics.
4. **Accuracy over completeness.** Every command must be valid on the stated platform. If a command is destructive, say what to check first. If something is version-dependent, say which version.
5. **Explain the why, once.** After that, use the term. Do not re-define DNS in every paragraph.
6. **Reading level:** plain, short sentences. Explain jargon the first time (`CNAME — an alias record that points one name at another`).
7. **No emoji, no exclamation marks, no hype, no "simply/just/obviously".**
8. **American English.** "organization", "analyze", "behavior".
9. **Safety and law.** Offensive techniques are lab-only. Every such lesson states that written authorization is required and names the boundary.
10. **Never claim a video or resource says something you did not verify.** If you cannot verify a video, set `video: null`.

## Lesson schema (exact)

```json
{
  "id": "l1-1",
  "moduleId": "m1",
  "seq": 1,
  "title": "Why packets fail: the two network models you will actually use",
  "subtitle": "A packet's journey, layer by layer, and how to name the layer that broke.",
  "minutes": 14,
  "level": "Core",
  "objectives": ["three to four verbs: what they can DO after this lesson"],
  "ticket": {
    "from": "Service Desk / NOC / Customer name-free label",
    "subject": "one line, the user's words",
    "body": "2–4 sentences with the symptom, what was already tried, and the impact",
    "impact": "one line: who is blocked and since when"
  },
  "sections": [
    { "h": "Section heading", "body": "markdown" }
  ],
  "diagram": {
    "type": "layers|flow|sequence|compare|topology|timeline|tree|quadrant",
    "title": "short plate title",
    "caption": "one or two sentences: what to notice in the diagram",
    "data": { }
  },
  "video": {
    "title": "exact video title",
    "channel": "channel name",
    "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
    "start": 0,
    "length": "7:42",
    "why": "one sentence: why this clip for this lesson"
  },
  "commands": [
    { "cmd": "ipconfig /all", "what": "what it proves, in one line" }
  ],
  "pitfalls": ["three specific mistakes, each with the consequence"],
  "takeaways": ["three things they should be able to say to a colleague"],
  "drill": {
    "prompt": "a 5–10 minute action on their own machine or the lab",
    "minutes": 8,
    "checklist": ["four observable checkpoints"]
  },
  "sheetTopics": ["OSI Model", "TCP/IP Model"]
}
```

### Section rules

- **4 to 6 sections**, total **700–950 words** of body markdown.
- First section heading is a problem, not a noun phrase. Good: `Why "the network is down" is usually a name problem`. Bad: `Introduction to DNS`.
- Use markdown: `**bold**` for the term being defined, `` `code` `` inline, fenced blocks with a language tag for command output, tables for comparisons (a table counts as ~40 words).
- At least one **command block with real output** in every lesson.
- At least one **decision rule** the reader can apply on a call ("If ping by IP works and the browser fails, stop checking the cable").
- Last section: **"What you hand over"** — the exact note or checks that close the ticket or escalate it properly. Include a one-line escalation criterion.
- Do **not** put `#` H1 in the body. `sections[].h` renders the heading.
- Do not repeat the diagram's content in prose; the diagram is the visual, prose is the reasoning.

### Diagram data schemas (obey exactly — the renderer is strict)

Keep every label **≤ 26 characters** unless stated. 4–6 items is the sweet spot.

`layers` — a stack, top to bottom:
```json
{ "layers": [ { "n": "7", "name": "Application", "fn": "what the user's app speaks", "example": "HTTP, DNS, SMTP" } ], "footer": "optional one line", "highlight": 2 }
```

`flow` — ordered steps (3–6):
```json
{ "steps": [ { "label": "Check link", "detail": "cable, switch port, LED" } ], "footer": "optional" }
```

`sequence` — message exchange between 3–4 actors:
```json
{ "actors": [ { "id": "pc", "label": "Client PC" }, { "id": "dns", "label": "Resolver" } ],
  "messages": [ { "from": "pc", "to": "dns", "text": "A? intranet.example", "note": "UDP 53", "tone": "accent|ok|bad" } ] }
```
Max 8 messages.

`compare` — two columns:
```json
{ "left": { "title": "TCP", "items": ["reliable", "ordered", "slower start"] },
  "right": { "title": "UDP", "items": ["no delivery guarantee", "no ordering", "lower overhead"] },
  "verdict": "one line: how to choose" }
```
3–5 items per side.

`topology` — tiers 0 (top) to 3 (bottom):
```json
{ "nodes": [ { "id": "pc", "label": "Client", "tier": 0, "type": "host" } ],
  "links": [ { "from": "pc", "to": "sw", "label": "VLAN 20", "dashed": false, "tone": "accent|warn|bad" } ] }
```
4–7 nodes, every link references existing ids. `type` is cosmetic; keep `host`, `server`, `router`, `switch`, `firewall`, `cloud`, `user`.

`timeline` — 4–6 events:
```json
{ "events": [ { "t": "09:12", "title": "Phish opened", "detail": "macro enabled", "actor": "attacker|defender|system" } ] }
```

`tree` — one root, 3–5 branches:
```json
{ "root": "User cannot reach app", "branches": [ { "label": "Ping by IP?", "result": "DNS issue", "tone": "bad|warn|ok" } ] }
```

`quadrant` — x/y 0–100:
```json
{ "xLabel": "Likelihood", "yLabel": "Impact", "points": [ { "label": "Phishing", "x": 80, "y": 70, "tone": "bad" } ] }
```

### Video rules

- **You must verify the video exists before using it.** Run:
  `curl -s -o /dev/null -w "%{http_code}" "https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3DVIDEOID&format=json"`
  A `200` means the ID exists. If it is not 200, pick another and verify again. Never invent an ID.
- Prefer 3–15 minutes, accurate in 2025, from vendor channels (Microsoft, Cisco, Fortinet, Splunk, Elastic, Wireshark, AWS, Google Cloud), or established educators.
- Avoid: certification-mill "top 10", reaction videos, hour-long full courses (unless you set `start` to the exact relevant minute), anything with a sponsor read in the first minute.
- `start` is an integer number of seconds where the relevant explanation begins.
- `why` must say what the clip adds that the text does not (e.g. "shows the actual TLS handshake in Wireshark, which the text can only describe").
- If you cannot verify a good clip, set `"video": null`. Do not fabricate.

### Quiz schema (one per module)

```json
{
  "id": "q1",
  "moduleId": "m1",
  "title": "Networking foundations — module test",
  "passPct": 70,
  "minutes": 12,
  "questions": [
    {
      "id": "q1-1",
      "q": "Question text, scenario first",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explain": "one or two sentences: why the right answer is right and the tempting wrong one is wrong",
      "tag": "networking"
    }
  ]
}
```

- Exactly **10 questions**. 6 understand/recall, 3 apply to a scenario, 1 analyze/diagnose.
- Four options, exactly one correct. Distractors must be the misconceptions a fresher actually holds, not nonsense.
- No "All of the above", no "None of the above", no joke options.
- Correct answers spread across A–D (aim 2–3 each). Do not make the longest option always correct.
- `explain` teaches in 1–2 sentences; mention why the most tempting distractor is wrong.
- Tags: `networking`, `linux`, `windows`, `security`, `soc`, `ir`, `automation`.

### Assignment schema (five per module)

```json
{
  "id": "a1",
  "day": 1,
  "moduleId": "m1",
  "title": "Read a customer's address plan before you touch it",
  "level": 1,
  "minutes": 25,
  "scenario": "2–4 sentences of workplace context with concrete numbers.",
  "task": "markdown: numbered steps with the exact commands or checks",
  "deliverable": "one line: what evidence proves it is done",
  "tools": ["ipconfig", "notepad"],
  "rubric": [
    { "criterion": "Correct diagnosis", "weight": 40, "lookFor": "names the failing layer and the evidence for it" }
  ],
  "hints": ["hint 1", "hint 2", "hint 3"]
}
```

- Weights sum to 100 across **exactly 3 criteria**.
- `lookFor` must be observable in the submitted text, not a feeling.
- Every task must be **completable without paid tools**, on a laptop, in the stated minutes.
- Include a real safety/ethics line where relevant (no production scans, no real customer data, redact IPs).
- `level` rises with the day: days 1–10 = 1, 11–20 = 2, 21–30 = 3, 31–40 = 4.
- Escalate complexity across the module: day 1 guided, day 5 open-ended.
- `task` uses markdown with numbered steps and code fences.

## Voice sample (match this)

> The ticket says the internet is down. The user can ping 8.8.8.8, so the cable, the switch port, the gateway and the route are all doing their jobs. What is missing is the step before the browser connects: turning `intranet.example` into an address.
>
> Run `nslookup intranet.example` on the user's machine. If it returns `NXDOMAIN`, the name does not exist in the zone you are asking. If it times out, the resolver is unreachable. Those are different tickets.
>
> ```
> C:\> nslookup intranet.example
> Server:  UnKnown
> Address:  10.20.0.10
> *** UnKnown can't find intranet.example: Non-existent domain
> ```
>
> The `Server` line tells you which resolver answered. A resolver you do not recognize is the finding, not the noise.

## Output

Write **one JSON file** with the exact shape:

```json
{ "moduleId": "m1", "lessons": [ ... ] }
```
or, for the quiz/assignment file:
```json
{ "moduleId": "m1", "quiz": { ... }, "assignments": [ ... ] }
```

Validate before finishing:
`node -e "JSON.parse(require('fs').readFileSync('PATH','utf8')); console.log('ok')"`

Do not wrap JSON in markdown fences inside the file. Do not include commentary in the file.
