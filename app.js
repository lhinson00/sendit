const posEl = document.getElementById("pos");
const marketEl = document.getElementById("market");
const lineEl = document.getElementById("line");
const minGamesEl = document.getElementById("minGames");
const minHitsEl = document.getElementById("minHits");
const listEl = document.getElementById("list");
const summaryEl = document.getElementById("summary");
const presetsEl = document.getElementById("presets");
const qEl = document.getElementById("q");

["ALL", "WR", "TE", "RB", "QB"].forEach((p) => {
  const opt = document.createElement("option");
  opt.value = p;
  opt.textContent = p;
  posEl.appendChild(opt);
});

["Receiving Yards", "Rushing Yards", "Passing Yards", "Receptions", "Receiving TDs", "Rushing TDs", "Passing TDs", "QB Rushing TDs", "Interceptions"].forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = m;
  marketEl.appendChild(opt);
});

function fillLines(market, preferred) {
  const lines = window.LINES_BY_MARKET[market] || [];
  lineEl.innerHTML = "";
  lines.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    lineEl.appendChild(opt);
  });
  if (preferred && lines.includes(preferred)) lineEl.value = preferred;
  else if (lines.length) lineEl.value = lines[0];
}

posEl.value = "WR";
marketEl.value = "Receiving Yards";
fillLines("Receiving Yards", "20+");

window.PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.label;
  b.addEventListener("click", () => {
    posEl.value = p.pos;
    marketEl.value = p.market;
    fillLines(p.market, p.threshold);
    minHitsEl.value = p.minHits;
    render();
  });
  presetsEl.appendChild(b);
});

function isTdMarket(m) {
  return /TDs|Interceptions/.test(m);
}

marketEl.addEventListener("change", () => {
  fillLines(marketEl.value);
  if (isTdMarket(marketEl.value) && Number(minHitsEl.value) > 8) {
    minHitsEl.value = marketEl.value === "Passing TDs" ? 10 : 6;
  }
  render();
});

function render() {
  const pos = posEl.value;
  const market = marketEl.value;
  const line = lineEl.value;
  const minGames = Number(minGamesEl.value || 0);
  const minHits = Number(minHitsEl.value || 0);

  const q = (qEl && qEl.value || "").trim().toLowerCase();
  const universe = window.VOLUME
    .filter((r) => pos === "ALL" || r.pos === pos)
    .filter((r) => r.market === market)
    .filter((r) => r.threshold === line);
  const rows = universe
    .filter((r) => r.games >= minGames && r.hits >= minHits)
    .filter((r) => !q || r.player.toLowerCase().includes(q))
    .sort((a, b) => b.hits - a.hits || b.games - a.games || a.player.localeCompare(b.player));

  summaryEl.innerHTML = `<strong>${rows.length}</strong> of ${universe.length} in ${pos} · ${market} ${line}. Drop Min hits to see the rest.`;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty">Nobody cleared that cut. Lower Min hits or drop the yardage rung.</div>`;
    return;
  }

  listEl.innerHTML = rows.map((r, i) => {
    const cls = r.hits / r.games >= 0.9 ? "" : "mid";
    return `
      <article class="card" data-player="${r.player.replace(/"/g,'')}">
        <div>
          <h3>${r.player}</h3>
          <p class="meta">${r.pos} · ${r.team} · ${r.threshold} · tap</p>
        </div>
        <div>
          <div class="record ${cls}">${r.hits}/${r.games}</div>
          <div class="pass">${r.games} games</div>
        </div>
      </article>
    `;
  }).join("");

  listEl.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", () => openPlayer(el.dataset.player));
  });
}

function week1Block(name) {
  const w = window.WEEK1 && window.WEEK1[name];
  if (!w) return `<p class="meta">No Week 1 2026 line stored for him yet.</p>`;
  const bits = [];
  if (w.opp) bits.push(w.opp);
  if (w.passYds != null) bits.push(`${w.passYds} pass yds`);
  if (w.passTd != null) bits.push(`${w.passTd} pass TD`);
  if (w.int != null) bits.push(`${w.int} INT`);
  if (w.rushYds != null) bits.push(`${w.rushYds} rush yds`);
  if (w.rushTd != null) bits.push(`${w.rushTd} rush TD`);
  if (w.rec != null) bits.push(`${w.rec} rec`);
  if (w.recYds != null) bits.push(`${w.recYds} rec yds`);
  if (w.recTd != null) bits.push(`${w.recTd} rec TD`);
  return `<p class="m" style="margin:10px 0 4px;color:#d4b36a;font-size:12px">2026 WEEK 1</p>
    <div class="brk"><div>${bits.join(" · ")}</div><div></div></div>`;
}

function openPlayer(name) {
  const rows = window.VOLUME.filter((r) => r.player === name)
    .sort((a, b) => a.market.localeCompare(b.market) || a.threshold.localeCompare(b.threshold));
  if (!rows.length) return;
  const p = rows[0];
  const groups = {};
  rows.forEach((r) => {
    if (!groups[r.market]) groups[r.market] = [];
    groups[r.market].push(r);
  });
  const body = document.getElementById("sheetBody");
  body.innerHTML = `
    <h2>${p.player}</h2>
    <p class="meta">${p.pos} · ${p.team}</p>
    ${week1Block(name)}
    ${Object.keys(groups).map((m) => `
      <p class="m" style="margin:14px 0 4px;color:#9aa6c2;font-size:12px">${m}</p>
      ${groups[m].map((r) => `
        <div class="brk">
          <div>${r.threshold}</div>
          <div class="record ${r.hits / r.games >= 0.9 ? "" : "mid"}">${r.hits}/${r.games}</div>
        </div>
      `).join("")}
    `).join("")}
    <p class="meta" style="margin-top:12px">Rungs = 2025 season + 2026 Week 1 (last ~18–20 games). Week 1 line is the actual box score.</p>
    <button class="close" type="button" id="sheetClose">Close</button>
  `;
  const sheet = document.getElementById("sheet");
  sheet.classList.add("open");
  document.getElementById("sheetClose").onclick = () => sheet.classList.remove("open");
  sheet.onclick = (e) => { if (e.target === sheet) sheet.classList.remove("open"); };
}

[posEl, lineEl, minGamesEl, minHitsEl, qEl].forEach((el) => {
  el.addEventListener("change", render);
  el.addEventListener("input", render);
});

render();
