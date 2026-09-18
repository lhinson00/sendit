(function () {
  const SCORE_URL = "https://cdn.espn.com/core/nfl/scoreboard?xhr=1";
  const SUM_URL = (id) => "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=" + id;
  const TZ = "America/Chicago";
  let VIEW = "live", OPEN_ID = null, OPEN_TAB = "scoring", LAST_SUM = {}, pollGame = null;
  window.SAUCE_FILT = window.SAUCE_FILT || { pos: "ALL", market: "Receiving Yards", line: "20+" };
  function $(id) { return document.getElementById(id); }
  function fmtCT(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT";
  }
  function showView(name) {
    VIEW = name;
    ["live", "research", "game", "slip"].forEach((k) => {
      const n = $("view" + k.charAt(0).toUpperCase() + k.slice(1));
      if (n) n.hidden = name !== k;
    });
    document.querySelectorAll("[data-nav]").forEach((b) =>
      b.classList.toggle("on", b.dataset.nav === name || (name === "game" && b.dataset.nav === "live"))
    );
    if (name !== "game" && pollGame) { clearInterval(pollGame); pollGame = null; OPEN_ID = null; }
  }
  window.showView = showView;
  function mapEvent(ev) {
    const c = (ev.competitions || [])[0] || {};
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === "home") || {};
    const away = comps.find((x) => x.homeAway === "away") || {};
    const st = (c.status || {}).type || {};
    return {
      id: String(ev.id || ""),
      away: (away.team && away.team.abbreviation) || "",
      home: (home.team && home.team.abbreviation) || "",
      awayScore: away.score != null ? String(away.score) : "",
      homeScore: home.score != null ? String(home.score) : "",
      state: st.state || "pre",
      detail: st.shortDetail || "",
      start: ev.date || "",
      completed: !!st.completed,
      period: (c.status || {}).period,
      clock: (c.status || {}).displayClock || ""
    };
  }
  function statusLine(g) {
    if (g.state === "in") return "LIVE \u00b7 " + (g.clock || "") + " Q" + (g.period || "");
    if (g.completed || g.state === "post") return g.detail || "Final";
    return fmtCT(g.start) || g.detail;
  }
  function paintSlate(games) {
    const host = $("liveList");
    if (!host) return;
    if ($("liveMeta")) $("liveMeta").textContent = games.filter((g) => g.state === "in").length + " live";
    host.innerHTML = games.map((g) => {
      const cls = g.state === "in" ? "on" : g.completed ? "done" : "";
      return '<button type="button" class="gcard ' + cls + '" data-gid="' + g.id + '">' +
        '<div class="gstat">' + statusLine(g) + '</div>' +
        '<div class="gduo"><div class="gteam"><b>' + g.away + '</b></div>' +
        '<div class="gscore">' + (g.state === "pre" ? "VS" : g.awayScore + " - " + g.homeScore) + '</div>' +
        '<div class="gteam right"><b>' + g.home + '</b></div></div>' +
        '<div class="gopen">Open game</div></button>';
    }).join("");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-gid]");
    if (b) { e.preventDefault(); openGame(b.getAttribute("data-gid")); }
  });
  function paintGame(g, sum) {
    const box = $("gameRoom");
    if (!box) return;
    const plays = (sum && sum.scoringPlays) || [];
    const playHtml = plays.map((p) => '<div class="play score"><b>' + ((p.team && p.team.abbreviation) || "") + " " + p.awayScore + "-" + p.homeScore + '</b><p>' + (p.text || "") + '</p></div>').join("") || "<p class='hint'>No scoring yet.</p>";
    box.innerHTML = '<button type="button" class="back" id="gameBack">\u2190 Slate</button>' +
      '<div class="scorebug ' + (g.state === "in" ? "on" : "") + '">' +
      '<div class="sbmeta">' + statusLine(g) + '</div>' +
      '<div class="sbgrid">' +
      '<div class="sbteam"><span>' + g.away + '</span><b>' + (g.state === "pre" ? "\u2014" : g.awayScore) + '</b></div>' +
      '<div class="sbteam"><span>' + g.home + '</span><b>' + (g.state === "pre" ? "\u2014" : g.homeScore) + '</b></div>' +
      '</div></div>' +
      '<div class="gtabs">' +
      '<button type="button" class="on" data-gtab="scoring">Scoring</button>' +
      '<button type="button" data-gtab="box">Box</button>' +
      '<button type="button" data-gtab="sauce">Sauce</button></div>' +
      '<div id="gtab-scoring">' + playHtml + '</div>' +
      '<div id="gtab-box" hidden><p class="hint">Box after kickoff.</p></div>' +
      '<div id="gtab-sauce" hidden><p class="hint">Full Sauce desk in next push.</p></div>';
    $("gameBack").onclick = () => showView("live");
    box.querySelectorAll("[data-gtab]").forEach((b) => {
      b.onclick = () => {
        box.querySelectorAll("[data-gtab]").forEach((x) => x.classList.toggle("on", x === b));
        ["scoring", "box", "sauce"].forEach((k) => { const n = $("gtab-" + k); if (n) n.hidden = k !== b.dataset.gtab; });
      };
    });
  }
  async function loadGame(id) {
    const games = window.LIVE_GAMES || [];
    const g = Object.assign({}, games.find((x) => x.id === String(id)) || { id: id, away: "", home: "", state: "pre" });
    let sum = {};
    try {
      const res = await fetch(SUM_URL(id), { cache: "no-store" });
      if (res.ok) sum = await res.json();
      const hdr = ((sum.header || {}).competitions || [])[0] || {};
      const comps = hdr.competitors || [];
      if (comps.length) {
        const home = comps.find((x) => x.homeAway === "home") || {};
        const away = comps.find((x) => x.homeAway === "away") || {};
        g.away = (away.team && away.team.abbreviation) || g.away;
        g.home = (home.team && home.team.abbreviation) || g.home;
        g.awayScore = away.score != null ? String(away.score) : g.awayScore;
        g.homeScore = home.score != null ? String(home.score) : g.homeScore;
        g.state = ((hdr.status || {}).type || {}).state || g.state;
        g.detail = ((hdr.status || {}).type || {}).shortDetail || g.detail;
      }
    } catch (e) {}
    LAST_SUM = sum;
    paintGame(g, sum);
  }
  function openGame(id) {
    OPEN_ID = String(id);
    showView("game");
    $("gameRoom").innerHTML = "<p class='hint'>Loading game\u2026</p>";
    loadGame(id);
    if (pollGame) clearInterval(pollGame);
    pollGame = setInterval(() => { if (OPEN_ID) loadGame(OPEN_ID); }, 20000);
  }
  window.openGame = openGame;
  async function tick() {
    try {
      const res = await fetch(SCORE_URL, { cache: "no-store" });
      const data = await res.json();
      const events = (((data.content || {}).sbData || {}).events) || [];
      window.LIVE_GAMES = events.map(mapEvent);
      paintSlate(window.LIVE_GAMES);
    } catch (e) {
      const host = $("liveList");
      if (host) host.innerHTML = "<p class='hint'>Could not load slate</p>";
    }
  }
  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.nav)));
  showView("live");
  tick();
  setInterval(tick, 30000);
})();
