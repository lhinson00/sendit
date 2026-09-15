const posEl = document.getElementById("pos");
const marketEl = document.getElementById("market");
const minGamesEl = document.getElementById("minGames");
const minHitsEl = document.getElementById("minHits");
const listEl = document.getElementById("list");
const summaryEl = document.getElementById("summary");
const presetsEl = document.getElementById("presets");

const positions = ["ALL", "WR", "TE", "RB", "QB"];
const markets = [...new Set(window.VOLUME.map((r) => r.market))];

positions.forEach((p) => {
  const opt = document.createElement("option");
  opt.value = p;
  opt.textContent = p;
  posEl.appendChild(opt);
});
markets.forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = m;
  marketEl.appendChild(opt);
});
posEl.value = "WR";
marketEl.value = "Receiving Yards";

window.PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.label;
  b.addEventListener("click", () => {
    posEl.value = p.pos;
    marketEl.value = p.market;
    minHitsEl.value = p.minHits;
    render();
  });
  presetsEl.appendChild(b);
});

function render() {
  const pos = posEl.value;
  const market = marketEl.value;
  const minGames = Number(minGamesEl.value || 0);
  const minHits = Number(minHitsEl.value || 0);

  const rows = window.VOLUME
    .filter((r) => (pos === "ALL" || r.pos === pos))
    .filter((r) => r.market === market)
    .filter((r) => r.games >= minGames && r.hits >= minHits)
    .sort((a, b) => b.hits - a.hits || b.games - a.games || a.player.localeCompare(b.player));

  summaryEl.innerHTML = `<strong>${rows.length}</strong> names pass ${pos} · ${market} · min ${minHits}/${minGames}. Take this list into FanDuel.`;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty">Nobody cleared that cut. Lower Min hits.</div>`;
    return;
  }

  listEl.innerHTML = rows.map((r) => {
    const cls = r.hits / r.games >= 0.9 ? "" : "mid";
    return `
      <article class="card">
        <div>
          <h3>${r.player}</h3>
          <p class="meta">${r.pos} · ${r.team} · ${r.threshold}</p>
        </div>
        <div>
          <div class="record ${cls}">${r.hits}/${r.games}</div>
          <div class="pass">${r.games} games</div>
        </div>
      </article>
    `;
  }).join("");
}

[posEl, marketEl, minGamesEl, minHitsEl].forEach((el) => {
  el.addEventListener("change", render);
  el.addEventListener("input", render);
});

render();
