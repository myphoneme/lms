#!/usr/bin/env python3
"""Build the curated resource library workbook from content/resources.json."""
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "content", "resources.json"), encoding="utf-8") as fh:
    DATA = json.load(fh)

items = DATA["items"]
generated = DATA.get("generatedAt", datetime.now(timezone.utc).isoformat())

INK = "12171A"
RAIL = "1B2226"
PAPER = "F6F7F6"
BAND = "F1F3F1"
LINE = "DDE1DD"
ACCENT = "1F4FD8"
MUTED = "5B676D"

thin = Side(style="thin", color=LINE)
border = Border(bottom=thin)
header_fill = PatternFill("solid", fgColor=INK)
band_fill = PatternFill("solid", fgColor=PAPER)
module_fill = PatternFill("solid", fgColor=BAND)

wb = Workbook()

# ---------------------------------------------------------------- resources
ws = wb.active
ws.title = "Resources"
headers = [
    ("Module", 26),
    ("Resource", 48),
    ("Creator", 26),
    ("Format", 11),
    ("Link", 56),
    ("Why this one", 70),
    ("Struggle it answers", 48),
    ("Topic", 24),
    ("Level", 10),
    ("Cost", 8),
]
for col, (name, width) in enumerate(headers, start=1):
    cell = ws.cell(row=1, column=col, value=name)
    cell.font = Font(bold=True, color="FFFFFF", size=10.5, name="Calibri")
    cell.fill = header_fill
    cell.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    cell.border = Border(bottom=Side(style="thin", color=RAIL))
    ws.column_dimensions[get_column_letter(col)].width = width
ws.row_dimensions[1].height = 30

ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:J{len(items) + 1}"

for r, it in enumerate(items, start=2):
    values = [
        it["module"],
        it["title"],
        it["creator"],
        it["format"],
        it["url"],
        it["why"],
        it.get("struggle", ""),
        it.get("topic", ""),
        it.get("level", ""),
        it.get("cost", ""),
    ]
    for c, v in enumerate(values, start=1):
        cell = ws.cell(row=r, column=c, value=v)
        cell.font = Font(size=10, color="1D2427", name="Calibri")
        cell.alignment = Alignment(vertical="top", wrap_text=c in (2, 3, 6, 7, 8), indent=1)
        cell.border = border
        if r % 2 == 0:
            cell.fill = band_fill
    ws.cell(row=r, column=1).font = Font(size=10, bold=True, color=INK, name="Calibri")
    ws.cell(row=r, column=1).fill = module_fill
    ws.cell(row=r, column=4).alignment = Alignment(vertical="top", horizontal="center")
    ws.cell(row=r, column=9).alignment = Alignment(vertical="top", horizontal="center")
    ws.cell(row=r, column=10).alignment = Alignment(vertical="top", horizontal="center")
    link = ws.cell(row=r, column=5)
    link.hyperlink = it["url"]
    link.font = Font(size=9.5, color=ACCENT, underline="single", name="Calibri")
    link.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
    # height from the longest wrapped cell, with a little breathing room
    lines = max(
        -(-len(it["why"]) // 74),
        -(-len(it["title"]) // 46),
        -(-len(it.get("struggle", "")) // 48),
        -(-len(it["creator"]) // 24),
        1,
    )
    ws.row_dimensions[r].height = min(76, max(26, 13.2 * lines + 9))

# ---------------------------------------------------------------- by module
ws2 = wb.create_sheet("By module")
ws2.sheet_view.showGridLines = False
ws2["A1"] = "Coverage and format mix"
ws2["A1"].font = Font(bold=True, size=15, color=INK, name="Calibri")
ws2["A2"] = f"{len(items)} resources · {len({urlparse(i['url']).netloc for i in items})} distinct publishers · links checked {generated[:10]}"
ws2["A2"].font = Font(size=10, color=MUTED, name="Calibri")

by_mod = defaultdict(list)
for it in items:
    by_mod[it["module"]].append(it)

cols = ["Module", "Resources", "Video", "Docs/Article", "Thread", "Paper/Book", "Podcast/Course", "Free", "Paid", "Publishers"]
widths = [34, 12, 9, 14, 9, 13, 15, 8, 8, 12]
for c, (name, w) in enumerate(zip(cols, widths), start=1):
    cell = ws2.cell(row=4, column=c, value=name)
    cell.font = Font(bold=True, size=10, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor=RAIL)
    cell.alignment = Alignment(horizontal="center" if c > 1 else "left", indent=1)
    ws2.column_dimensions[get_column_letter(c)].width = w
ws2.row_dimensions[4].height = 26

row = 5
for mod in [m for m in dict.fromkeys(i["module"] for i in items)]:
    rows = by_mod[mod]
    counts = Counter(i["format"] for i in rows)
    pubs = len({urlparse(i["url"]).netloc for i in rows})
    vals = [
        mod,
        len(rows),
        counts.get("Video", 0),
        counts.get("Docs", 0) + counts.get("Article", 0),
        counts.get("Thread", 0),
        counts.get("Paper", 0) + counts.get("Book", 0),
        counts.get("Podcast", 0) + counts.get("Course", 0),
        sum(1 for i in rows if i.get("cost") == "Free"),
        sum(1 for i in rows if i.get("cost") == "Paid"),
        pubs,
    ]
    for c, v in enumerate(vals, start=1):
        cell = ws2.cell(row=row, column=c, value=v)
        cell.font = Font(size=10, color="1D2427")
        cell.border = border
        cell.alignment = Alignment(horizontal="center" if c > 1 else "left", indent=1)
    row += 1

total = ["Total", len(items)]
for key in ["Video", "Docs/Article", "Thread", "Paper/Book", "Podcast/Course"]:
    total.append(sum(1 for i in items if i["format"] == key.split("/")[0] or (key == "Docs/Article" and i["format"] in ("Docs", "Article")) or (key == "Paper/Book" and i["format"] in ("Paper", "Book")) or (key == "Podcast/Course" and i["format"] in ("Podcast", "Course"))))
total.append(sum(1 for i in items if i.get("cost") == "Free"))
total.append(sum(1 for i in items if i.get("cost") == "Paid"))
total.append(len({urlparse(i["url"]).netloc for i in items}))
for c, v in enumerate(total, start=1):
    cell = ws2.cell(row=row, column=c, value=v)
    cell.font = Font(size=10, bold=True, color=INK)
    cell.fill = PatternFill("solid", fgColor=BAND)
    cell.border = Border(top=Side(style="medium", color=INK))
    cell.alignment = Alignment(horizontal="center" if c > 1 else "left", indent=1)

# ---------------------------------------------------------------- read me
ws3 = wb.create_sheet("Read me", 0)
ws3.sheet_view.showGridLines = False
ws3.column_dimensions["A"].width = 3
ws3.column_dimensions["B"].width = 100

ws3["B2"] = "Curated resource library"
ws3["B2"].font = Font(bold=True, size=22, color=INK, name="Calibri")
ws3["B3"] = "L1 readiness programme · datacenter, cloud and security support"
ws3["B3"].font = Font(size=11, color=MUTED, name="Calibri")
ws3["B4"] = f"96 resources · 8 modules · every link checked {generated[:10]}"
ws3["B4"].font = Font(size=10, color=MUTED, name="Calibri")

blocks = [
    ("What this is", "A source list for the eight modules of the L1 programme. Every item was chosen for a specific confusion a beginner hits on a shift, not for topic coverage. It is a reading and watching list to sit beside the lessons, not a substitute for the drills."),
    ("How it was built", "For each module I searched the questions people actually post — r/networking, r/sysadmin, r/linuxquestions, r/cybersecurity, r/blueteamsec, Stack Overflow, Server Fault, Super User and vendor forums — then selected material that answers those questions. Popularity was not the criterion; the most-watched course on a topic was usually rejected in favour of a specific 8-minute explanation, a vendor page with the exact command, or a thread where someone hit the same wall."),
    ("Selection rules", "1) At least 4 non-obvious items per module: a named thread, an old-but-canonical chapter, a deeper vendor page, a conference talk or an RFC. 2) A deliberate format mix: video, docs, threads, paper/book, podcast/course. 3) Free unless the free material genuinely is not enough. 4) Nothing that is only a certification advert. 5) Every URL opened and checked; sites that block automated checks (Reddit, some vendors) were confirmed from search results."),
    ("How to use it", "Filter the Resources sheet by Module or Format. Read the 'Struggle it answers' column first — if that question is not your question yet, skip the resource and come back to it after the lesson. The 'Why this one' column says what it adds that the lesson text cannot, usually a live packet capture, a real console, or a practitioner's argument."),
    ("What is deliberately missing", "No 'top 10 courses', no 40-hour video dumps, no paywalled bootcamps, no SEO listicles. Those optimise for completion, not for closing a ticket. If a company wants a paid platform seat, add it outside this list."),
    ("Column meanings", "Format = Video, Docs, Article, Thread, Paper, Book, Podcast, Course. Level = Starter (before the lesson), Working (alongside it), Deep (after the module test). Cost = Free or Paid. Struggle = the question the resource answers, in the words people post it."),
    ("Caveats", "Videos are hosted on YouTube; if the corporate network blocks it, replace the URL and keep the reason. A few publishers return 403 to automated checks while opening fine in a browser — those are marked alive only if the page was confirmed in search. Links age: re-run app/scripts/build_resources.mjs before a new cohort and replace anything dead."),
]
r = 6
for title, body in blocks:
    ws3.cell(row=r, column=2, value=title).font = Font(bold=True, size=11.5, color=INK, name="Calibri")
    r += 1
    cell = ws3.cell(row=r, column=2, value=body)
    cell.font = Font(size=10.5, color="2A3235", name="Calibri")
    cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws3.row_dimensions[r].height = max(26, 14.5 * ((len(body) // 96) + 1) + 6)
    r += 2

ws3.cell(row=r, column=2, value="Sheet guide").font = Font(bold=True, size=11.5, color=INK)
r += 1
guide = [
    ("Resources", "All 96 items, filterable by module, format, level and cost."),
    ("By module", "Coverage and format mix per module, with publisher count."),
]
for name, desc in guide:
    ws3.cell(row=r, column=2, value=f"{name} — {desc}").font = Font(size=10.5, color="2A3235")
    r += 1

ws3.cell(row=r + 2, column=2, value="Prepared for the L1 Academy programme. Fictional company data is used in the demo; no customer names appear in this workbook.").font = Font(size=9, italic=True, color=MUTED)

out = os.path.join(ROOT, "..", "research", "L1_Academy_Resource_Library.xlsx")
os.makedirs(os.path.dirname(out), exist_ok=True)
wb.save(out)
print("written", os.path.abspath(out), "rows", len(items))
