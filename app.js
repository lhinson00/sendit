const posEl = document.getElementById("pos");
const marketEl = document.getElementById("market");
const lineEl = document.getElementById("line");
const minGamesEl = document.getElementById("minGames");
const minHitsEl = document.getElementById("minHits");
const listEl = document.getElementById("list");
const summaryEl = document.getElementById("summary");
const qEl = document.getElementById("q");

["ALL","WR","TE","RB","QB"].forEach((p) => {
  const o=document.createElement("option"); o.value=p; o.textContent=p; posEl.appendChild(o);
});
Object.keys(window.LINES_BY_MARKET).forEach((m) => {
  const o=document.createElement("option"); o.value=m; o.textContent=m; marketEl.appendChild(o);
});

function fillLines(market, preferred) {
  const lines = window.LINES_BY_MARKET[market] || [];
  lineEl.innerHTML = "";
  lines.forEach((t) => {
    const o=document.createElement("option"); o.value=t; o.textContent=t; lineEl.appendChild(o);
  });
  if (preferred && lines.includes(preferred)) lineEl.value = preferred;
  else if (lines.length) lineEl.value = lines[0];
}

posEl.value = "WR";
marketEl.value = "Receiving Yards";
fillLines("Receiving Yards", "20+");

marketEl.addEventListener("change", () => {
  fillLines(marketEl.value);
  if (/TD|Interceptions|Receptions/.test(marketEl.value) && Number(minHitsEl.value) > 10) {
    minHitsEl.value = marketEl.value === "Receptions" ? 10 : 5;
  }
  render();
});

function render() {
  const pos = posEl.value;
  const market = marketEl.value;
  const line = lineEl.value;
  const minGames = Number(minGamesEl.value || 0);
  const minHits = Number(minHitsEl.value || 0);
  const q = (qEl.value || "").trim().toLowerCase();

  const universe = window.VOLUME
    .filter((r) => pos === "ALL" || r.pos === pos)
    .filter((r) => r.market === market)
    .filter((r) => r.threshold === line);

  const rows = universe
    .filter((r) => r.games >= minGames && r.hits >= minHits)
    .filter((r) => !q || r.player.toLowerCase().includes(q))
    .sort((a,b) => b.hits - a.hits || b.games - a.games || a.player.localeCompare(b.player));

  summaryEl.innerHTML = `<strong>${rows.length}</strong> of ${universe.length} · ${pos} · ${market} ${line} · min ${minHits}/${minGames}`;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty">Nobody cleared that cut. Lower Min hits.</div>`;
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const cls = r.hits / r.games >= 0.85 ? "" : "mid";
    return `<article class="card" data-player="${r.player.replace(/"/g,"")}">
      <div>
        <h3>${r.player}</h3>
        <p class="meta">${r.pos} · ${r.team} · ${r.threshold}</p>
      </div>
      <div>
        <div class="record ${cls}">${r.hits}/${r.games}</div>
        <div class="pass">${r.games} gms</div>
      </div>
    </article>`;
  }).join("");

  listEl.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", () => openPlayer(el.dataset.player));
  });
}

function rungRow(label, hits, games) {
  const cls = hits / games >= 0.85 ? "" : "mid";
  return `<div class="brk"><div>${label}</div><div class="record ${cls}">${hits}/${games}</div></div>`;
}

function openPlayer(name) {
  const p = window.PLAYER[name];
  if (!p) return;
  const g = p.games;
  let rungs = "";
  if (p.keep_rec) {
    rungs += `<p class="sec">Receiving yards</p>`;
    ["20+","40+","60+","80+","100+"].forEach((th,i) => rungs += rungRow(th, p.rec_hits[i], g));
    rungs += `<p class="sec">Receptions</p>`;
    ["2+","3+","4+","5+","6+","7+","8+","10+"].forEach((th,i) => rungs += rungRow(th, p.catch[i], g));
    rungs += `<p class="sec">Receiving TDs</p>` + rungRow("1+", p.rec_td1, g);
  }
  if (p.keep_rush) {
    rungs += `<p class="sec">Rushing yards</p>`;
    ["20+","40+","60+","80+","100+"].forEach((th,i) => rungs += rungRow(th, p.rush_hits[i], g));
    rungs += `<p class="sec">Rushing TDs</p>` + rungRow("1+", p.rush_td1, g);
  }
  if (p.keep_pass) {
    rungs += `<p class="sec">Passing yards</p>`;
    ["150+","200+","250+","300+","350+"].forEach((th,i) => rungs += rungRow(th, p.pass_hits[i], g));
    rungs += `<p class="sec">Passing TDs</p>` + rungRow("1+", p.pass_td1, g) + rungRow("2+", p.pass_td2, g);
    rungs += `<p class="sec">INTs</p>` + rungRow("1+", p.int1, g) + rungRow("0 INT", p.clean, p.qb_games || g);
    rungs += `<p class="sec">QB rush TDs</p>` + rungRow("1+", p.rush_td1, g);
  }

  const log = (p.log || []).slice().reverse();
  const logRows = log.map((x) => {
    const rec = (x.rec || x.ry || x.rtd) ? `${x.rec}-${x.ry}-${x.rtd}` : "—";
    const rush = (x.ru || x.rutd) ? `${x.ru} / ${x.rutd}` : "—";
    const pass = x.att ? `${x.py} / ${x.ptd} / ${x.int}` : "—";
    return `<tr>
      <td>${String(x.s).slice(2)} W${x.w}</td>
      <td>${x.tm}–${x.opp}</td>
      <td>${rec}</td>
      <td>${rush}</td>
      <td>${pass}</td>
    </tr>`;
  }).join("");

  document.getElementById("sheetBody").innerHTML = `
    <h2>${p.player}</h2>
    <p class="meta">${p.pos} · ${p.team} · last ${p.games} games</p>
    ${rungs}
    <p class="sec">Last 10 box scores</p>
    <div class="tblwrap">
      <table class="log">
        <thead><tr><th>Wk</th><th>Opp</th><th>Rec</th><th>Rush</th><th>Pass</th></tr></thead>
        <tbody>${logRows}</tbody>
      </table>
    </div>
    <p class="meta">Rec = catches-yards-TD. Rush = yards / TD. Pass = yards / TD / INT.</p>
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
