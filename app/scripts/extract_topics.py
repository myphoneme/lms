import re, html, json, sys
src = "/Users/DELL/workspace/Training Courses/research/source/Complete_traning_Topics.html"
s = open(src, encoding="utf-8", errors="ignore").read()
s = re.sub(r'<script.*?</script>', '', s, flags=re.S | re.I)
s = re.sub(r'<style.*?</style>', '', s, flags=re.S | re.I)
rows = re.findall(r'<tr.*?</tr>', s, flags=re.S | re.I)
data = []
for r in rows:
    cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, flags=re.S | re.I)
    vals = []
    for c in cells:
        c = re.sub(r'<br\s*/?>', ' / ', c, flags=re.I)
        c = re.sub(r'<[^>]+>', '', c)
        vals.append(html.unescape(c).strip())
    if any(vals):
        data.append(vals)

# Section detection: header rows are ["Topic","What you should understand"] etc.
sections, cur = [], None
headers = {"topic", "port", "command", "category", "library", "filter", "event id", "vulnerability", "project", "stage", "framework", "tools"}
for i, v in enumerate(data):
    a = v[0].strip().lower()
    if len(v) >= 2 and a in headers:
        cur = {"section": v[0].strip(), "col2": v[1].strip(), "rows": [], "index": i}
        sections.append(cur)
        continue
    if cur is None:
        continue
    cur["rows"].append({"a": v[0], "b": v[1] if len(v) > 1 else "", "c": v[2] if len(v) > 2 else ""})
out = {"source": "Complete traning Topics .html", "sections": sections, "row_count": len(data)}
json.dump(out, open("/Users/DELL/workspace/Training Courses/app/content/topics.json", "w"), indent=1)
print("sections:", len(sections), "data rows:", sum(len(x['rows']) for x in sections))
for x in sections:
    print(f"{x['section']:14s} | {x['col2'][:32]:32s} | {len(x['rows']):3d} rows")
