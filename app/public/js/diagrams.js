/* Authored instructional diagrams, rendered as animated inline SVG.
   Eight grammars: layers, flow, sequence, compare, topology, timeline,
   tree, quadrant. Colour comes from the tenant accent; the plate stays dark
   so the diagram reads as an instrument view inside the manual. */

const C = {
  line: '#2b3a40',
  lineSoft: '#1e2b30',
  panel: '#121c20',
  panel2: '#162226',
  text: '#cad8d5',
  muted: '#82948f',
  faint: '#5c6d69',
  ok: '#3ecf8e',
  warn: '#efb02f',
  bad: '#ff6f5e',
  accent: 'var(--accent)',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `<style>
  .an { animation: rise .55s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--d, 0) * 65ms); }
  .draw { stroke-dasharray: var(--len, 600); animation: draw .9s ease-out both; animation-delay: calc(var(--d, 0) * 65ms + 90ms); }
  .pulse { animation: pulse 2.6s ease-in-out infinite; animation-delay: calc(var(--d, 0) * 65ms + 600ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  @keyframes draw { from { stroke-dashoffset: var(--len, 600); } to { stroke-dashoffset: 0; } }
  @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  text { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .t { fill: ${C.text}; font-size: 13px; }
  .t-b { fill: #eef5f3; font-size: 13px; font-weight: 620; }
  .t-s { fill: ${C.muted}; font-size: 11px; }
  .t-xs { fill: ${C.faint}; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  @media (prefers-reduced-motion: reduce) { .an, .draw, .pulse { animation: none; } }
</style>`;

function wrapText(text, max) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function svg(vb, body, label) {
  return `<svg viewBox="0 0 ${vb[0]} ${vb[1]}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet" style="max-width:100%">${STYLE}${body}</svg>`;
}

/* ---------------- layers ---------------- */
function layers(d) {
  const items = d.layers || [];
  const rowH = 58;
  const h = 44 + items.length * rowH;
  let body = '';
  items.forEach((l, i) => {
    const y = 24 + i * rowH;
    const accent = i === (d.highlight ?? -1);
    body += `<g class="an" style="--d:${i}">
      <rect x="44" y="${y}" width="${accent ? 468 : 460}" height="44" rx="6"
        fill="${accent ? 'rgba(47,107,255,.16)' : C.panel}" stroke="${accent ? C.accent : C.line}"/>
      <circle cx="64" cy="${y + 22}" r="12" fill="${C.panel2}" stroke="${C.line}"/>
      <text x="64" y="${y + 26}" text-anchor="middle" class="t-s mono" fill="${accent ? C.accent : C.muted}">${esc(l.n ?? i + 1)}</text>
      <text x="86" y="${y + 19}" class="t-b">${esc(l.name)}</text>
      <text x="86" y="${y + 34}" class="t-s" style="font-size:11px">${esc(wrapText(l.fn, 62)[0] || '')}</text>
      <line x1="512" y1="${y + 22}" x2="540" y2="${y + 22}" stroke="${C.lineSoft}" stroke-width="1"/>
      <text x="548" y="${y + 26}" class="t-s" style="font-size:11.5px">${esc(wrapText(l.example || '', 34)[0] || '')}</text>
    </g>`;
  });
  body += `<text x="44" y="${h - 8}" class="t-xs">${esc(d.footer || 'Each layer adds one job; troubleshooting walks the ladder from the bottom up.')}</text>`;
  return svg([820, h], body, d.title || 'Layered model');
}

/* ---------------- flow ---------------- */
function flow(d) {
  const steps = d.steps || [];
  const n = Math.max(1, steps.length);
  const w = 820;
  const colW = w / n;
  const h = 300;
  let body = '';
  steps.forEach((s, i) => {
    const cx = colW * i + colW / 2;
    const y = 62;
    body += `<g class="an" style="--d:${i}">
      <circle cx="${cx}" cy="${y}" r="19" fill="${C.panel2}" stroke="${C.accent}" stroke-width="1.4"/>
      <text x="${cx}" y="${y + 4.5}" text-anchor="middle" class="mono" fill="${C.text}" style="font-size:12px">${i + 1}</text>
      <text x="${cx}" y="${y + 44}" text-anchor="middle" class="t-b" style="font-size:12.5px">${esc(wrapText(s.label, Math.floor(colW / 7))[0])}</text>
    </g>`;
    wrapText(s.detail, Math.floor(colW / 6.2))
      .slice(0, 3)
      .forEach((line, li) => {
        body += `<text x="${cx}" y="${y + 62 + li * 14}" text-anchor="middle" class="t-s" style="font-size:10.8px">${esc(line)}</text>`;
      });
    if (i < n - 1) {
      body += `<line class="draw" style="--d:${i};--len:${colW - 40}" x1="${cx + 22}" y1="${y}" x2="${cx + colW - 24}" y2="${y}" stroke="${C.line}" stroke-width="1.4" marker-end="url(#arr)"/>`;
    }
  });
  body += `<defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" fill="${C.line}"/></marker></defs>`;
  body += `<line x1="24" y1="${h - 42}" x2="${w - 24}" y2="${h - 42}" stroke="${C.lineSoft}"/>`;
  body += `<text x="24" y="${h - 22}" class="t-xs">${esc(d.footer || 'Order matters: each step depends on the one before it.')}</text>`;
  return svg([w, h], body, d.title || 'Process flow');
}

/* ---------------- sequence ---------------- */
function sequence(d) {
  const actors = d.actors || [];
  const msgs = d.messages || [];
  const w = 820;
  const h = 96 + msgs.length * 44;
  const n = Math.max(1, actors.length);
  const lane = (w - 100) / n;
  let body = '';
  actors.forEach((a, i) => {
    const x = 50 + lane * i + lane / 2;
    body += `<g class="an" style="--d:0">
      <rect x="${x - 62}" y="18" width="124" height="34" rx="5" fill="${C.panel}" stroke="${C.line}"/>
      <text x="${x}" y="39" text-anchor="middle" class="t-b" style="font-size:11.5px">${esc(wrapText(a.label, 18)[0])}</text>
    </g>`;
    body += `<line x1="${x}" y1="52" x2="${x}" y2="${h - 26}" stroke="${C.lineSoft}" stroke-dasharray="3 5"/>`;
  });
  msgs.forEach((m, j) => {
    const from = actors.findIndex((a) => a.id === m.from);
    const to = actors.findIndex((a) => a.id === m.to);
    if (from < 0 || to < 0) return;
    const x1 = 50 + lane * from + lane / 2;
    const x2 = 50 + lane * to + lane / 2;
    const y = 84 + j * 44;
    const dir = x2 > x1 ? 1 : -1;
    const colour = m.tone === 'bad' ? C.bad : m.tone === 'ok' ? C.ok : C.accent;
    body += `<g class="an" style="--d:${j + 1}">
      <line x1="${x1 + dir * 6}" y1="${y}" x2="${x2 - dir * 10}" y2="${y}" stroke="${colour}" stroke-width="1.5" marker-end="url(#arr2-${j})"/>
      <defs><marker id="arr2-${j}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" fill="${colour}"/></marker></defs>
      <text x="${(x1 + x2) / 2}" y="${y - 7}" text-anchor="middle" class="t" style="font-size:11.8px">${esc(wrapText(m.text, 46)[0])}</text>
      ${m.note ? `<text x="${(x1 + x2) / 2}" y="${y + 14}" text-anchor="middle" class="t-xs" style="font-size:9.5px">${esc(m.note)}</text>` : ''}
    </g>`;
  });
  return svg([w, h], body, d.title || 'Message sequence');
}

/* ---------------- compare ---------------- */
function compare(d) {
  const w = 820;
  const left = d.left || {};
  const right = d.right || {};
  const rows = Math.max(left.items?.length || 0, right.items?.length || 0);
  const h = 150 + rows * 30 + 60;
  const colW = 350;
  const panel = (x, data, tone) => {
    let s = `<g class="an">
      <rect x="${x}" y="24" width="${colW}" height="${h - 96}" rx="8" fill="${C.panel}" stroke="${C.line}"/>
      <rect x="${x}" y="24" width="${colW}" height="40" rx="8" fill="${C.panel2}"/>
      <text x="${x + 16}" y="49" class="t-b" style="font-size:13px">${esc(data.title || '')}</text>
    </g>`;
    (data.items || []).forEach((item, i) => {
      const y = 92 + i * 30;
      s += `<g class="an" style="--d:${i + 1}">
        <circle cx="${x + 20}" cy="${y - 4}" r="3" fill="${tone}"/>
        <text x="${x + 32}" y="${y}" class="t" style="font-size:11.8px">${esc(wrapText(item, 48)[0])}</text>
      </g>`;
    });
    return s;
  };
  let body = panel(30, left, C.accent) + panel(440, right, C.muted);
  body += `<g class="an" style="--d:${rows + 2}">
    <line x1="30" y1="${h - 56}" x2="${w - 30}" y2="${h - 56}" stroke="${C.lineSoft}"/>
    <text x="30" y="${h - 30}" class="t-xs">${esc(d.verdict || 'Pick by the job, not by preference.')}</text>
  </g>`;
  return svg([w, h], body, d.title || 'Comparison');
}

/* ---------------- topology ---------------- */
function topology(d) {
  const nodes = d.nodes || [];
  const links = d.links || [];
  const w = 820;
  const tiers = [...new Set(nodes.map((n) => Number(n.tier ?? 0)))].sort((a, b) => a - b);
  const rowH = 108;
  const h = 70 + tiers.length * rowH;
  const pos = {};
  for (const tier of tiers) {
    const row = nodes.filter((n) => Number(n.tier ?? 0) === tier);
    const gap = (w - 80) / row.length;
    row.forEach((n, i) => { pos[n.id] = { x: 40 + gap * i + gap / 2, y: 52 + tiers.indexOf(tier) * rowH }; });
  }
  let body = '';
  for (const l of links) {
    const a = pos[l.from];
    const b = pos[l.to];
    if (!a || !b) continue;
    const midY = (a.y + b.y) / 2;
    const colour = l.tone === 'bad' ? C.bad : l.tone === 'warn' ? C.warn : C.line;
    body += `<path class="draw" style="--len:600" d="M${a.x} ${a.y + 22} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 24}" fill="none" stroke="${colour}" stroke-width="1.4" ${l.dashed ? 'stroke-dasharray="4 5"' : ''}/>`;
    if (l.label) {
      body += `<text x="${(a.x + b.x) / 2}" y="${midY + 4}" text-anchor="middle" class="t-xs" style="font-size:9.4px" fill="${C.faint}">${esc(l.label)}</text>`;
    }
  }
  for (const n of nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const colour = n.tone === 'bad' ? C.bad : n.tone === 'ok' ? C.ok : n.tone === 'warn' ? C.warn : C.accent;
    body += `<g class="an" style="--d:${Math.min(6, Number(n.tier ?? 0) + 1)}">
      <rect x="${p.x - 54}" y="${p.y - 22}" width="108" height="44" rx="6" fill="${C.panel}" stroke="${C.line}"/>
      <circle cx="${p.x - 36}" cy="${p.y}" r="4.5" fill="${colour}" class="pulse" style="--d:${nodes.indexOf(n)}"/>
      <text x="${p.x + 4}" y="${p.y + 4}" text-anchor="middle" class="t" style="font-size:11.3px">${esc(wrapText(n.label, 15)[0])}</text>
      ${n.sub ? `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" class="t-xs" style="font-size:9px">${esc(n.sub)}</text>` : ''}
    </g>`;
  }
  return svg([w, h], body, d.title || 'Topology');
}

/* ---------------- timeline ---------------- */
function timeline(d) {
  const events = d.events || [];
  const w = 820;
  const h = 330;
  const n = Math.max(1, events.length);
  const step = (w - 120) / n;
  let body = `<line x1="50" y1="165" x2="${w - 50}" y2="165" stroke="${C.line}" stroke-width="1.2" class="draw" style="--len:720"/>`;
  events.forEach((e, i) => {
    const x = 60 + step * i + step / 2;
    const above = i % 2 === 0;
    const y = above ? 165 - 26 : 165 + 26;
    const tone = e.actor === 'attacker' ? C.bad : e.actor === 'defender' ? C.ok : C.accent;
    body += `<g class="an" style="--d:${i + 1}">
      <line x1="${x}" y1="165" x2="${x}" y2="${y}" stroke="${C.lineSoft}"/>
      <circle cx="${x}" cy="165" r="5" fill="${tone}"/>
      <text x="${x}" y="${above ? y - 44 : y + 52}" text-anchor="middle" class="t-xs" style="font-size:9.5px" fill="${tone}">${esc(e.t)}</text>
      <text x="${x}" y="${above ? y - 26 : y + 34}" text-anchor="middle" class="t-b" style="font-size:11.3px">${esc(wrapText(e.title, 17)[0])}</text>
      ${wrapText(e.detail, 20).slice(0, 2).map((line, li) => `<text x="${x}" y="${above ? y - 12 + li * 12 : y + 47 + li * 12}" text-anchor="middle" class="t-s" style="font-size:9.8px">${esc(line)}</text>`).join('')}
    </g>`;
  });
  return svg([w, h], body, d.title || 'Timeline');
}

/* ---------------- tree ---------------- */
function tree(d) {
  const branches = d.branches || [];
  const w = 820;
  const rowH = 76;
  const h = 60 + branches.length * rowH + 30;
  const rootY = h / 2;
  let body = `<g class="an">
    <rect x="24" y="${rootY - 30}" width="176" height="60" rx="7" fill="${C.panel2}" stroke="${C.accent}"/>
    <text x="112" y="${rootY - 6}" text-anchor="middle" class="t-b" style="font-size:12px">${esc(wrapText(d.root, 24)[0])}</text>
    <text x="112" y="${rootY + 14}" text-anchor="middle" class="t-xs" style="font-size:9px">start here</text>
  </g>`;
  branches.forEach((b, i) => {
    const y = 50 + i * rowH + rowH / 2 - 10;
    const tone = b.tone === 'bad' ? C.bad : b.tone === 'warn' ? C.warn : C.ok;
    body += `<g class="an" style="--d:${i + 1}">
      <path class="draw" style="--len:400" d="M200 ${rootY} C 250 ${rootY}, 250 ${y}, 296 ${y}" fill="none" stroke="${C.line}" stroke-width="1.3"/>
      <rect x="300" y="${y - 22}" width="180" height="42" rx="5" fill="${C.panel}" stroke="${C.line}"/>
      <text x="312" y="${y + 3}" class="t" style="font-size:11.4px">${esc(wrapText(b.label, 26)[0])}</text>
      <path d="M490 ${y} L 516 ${y}" stroke="${C.line}" stroke-width="1.3" marker-end="url(#tarr)"/>
      <circle cx="532" cy="${y}" r="4" fill="${tone}"/>
      <text x="544" y="${y + 4}" class="t-b" style="font-size:11.4px" fill="${tone}">${esc(wrapText(b.result, 34)[0])}</text>
    </g>`;
  });
  body += `<defs><marker id="tarr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" fill="${C.line}"/></marker></defs>`;
  return svg([w, h], body, d.title || 'Decision tree');
}

/* ---------------- quadrant ---------------- */
function quadrant(d) {
  const w = 820;
  const h = 430;
  const x0 = 70, y0 = 40, x1 = 700, y1 = 360;
  const px = (v) => x0 + (Math.max(0, Math.min(100, v)) / 100) * (x1 - x0);
  const py = (v) => y1 - (Math.max(0, Math.min(100, v)) / 100) * (y1 - y0);
  let body = `<g class="an">
    <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${C.panel}" stroke="${C.line}"/>
    <line x1="${(x0 + x1) / 2}" y1="${y0}" x2="${(x0 + x1) / 2}" y2="${y1}" stroke="${C.lineSoft}" stroke-dasharray="4 4"/>
    <line x1="${x0}" y1="${(y0 + y1) / 2}" x2="${x1}" y2="${(y0 + y1) / 2}" stroke="${C.lineSoft}" stroke-dasharray="4 4"/>
    <text x="${(x0 + x1) / 2}" y="${y1 + 26}" text-anchor="middle" class="t-xs">${esc(d.xLabel || '')}</text>
    <text x="${x0 - 14}" y="${(y0 + y1) / 2}" text-anchor="middle" transform="rotate(-90 ${x0 - 14} ${(y0 + y1) / 2})" class="t-xs">${esc(d.yLabel || '')}</text>
  </g>`;
  (d.points || []).forEach((p, i) => {
    const tone = p.tone === 'bad' ? C.bad : p.tone === 'warn' ? C.warn : C.accent;
    body += `<g class="an" style="--d:${i + 1}">
      <circle cx="${px(p.x)}" cy="${py(p.y)}" r="17" fill="${tone}" opacity=".14"/>
      <circle cx="${px(p.x)}" cy="${py(p.y)}" r="5" fill="${tone}" class="pulse" style="--d:${i}"/>
      <text x="${px(p.x)}" y="${py(p.y) - 14}" text-anchor="middle" class="t" style="font-size:10.8px">${esc(wrapText(p.label, 22)[0])}</text>
    </g>`;
  });
  return svg([w, h], body, d.title || 'Quadrant');
}

export function renderDiagram(d) {
  if (!d || !d.type) return '';
  const fn = { layers, flow, sequence, compare, topology, timeline, tree, quadrant }[d.type];
  if (!fn) return '';
  // Authored content keeps the payload under `data`; older plates are flat.
  return fn(d.data ? { ...d, ...d.data } : d);
}
