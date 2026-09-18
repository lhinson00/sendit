(function () {
  const SCORE_URL = "https://cdn.espn.com/core/nfl/scoreboard?xhr=1";
  const INJ_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
  const POLL_MS = 30000;

  function el(id) { return document.getElementById(id); }

  function ensureBar() {
    let bar = el("liveBar");
    if (bar) return bar;
    bar = document.createElement("section");
    bar.id = "liveBar";
    bar.className = "livebar";
    const header = document.querySelector("header.top");
    if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
    else document.body.prepend(bar);
    return bar;
  }

  function mapEvent(ev) {
    const c = (ev.competitions || [])[0] || {};
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === "home") || {};
    const away = comps.find((x) => x.homeAway === "away") || {};
    const st = (c.status || {}).type || {};
    const clock = c.status || {};
    return {
      id: ev.id || c.id,
      week: (ev.week && ev.week.number) || null,
      away: (away.team && away.team.abbreviation) || "",
      home: (home.team && home.team.abbreviation) || "",
      awayScore: away.score != null ? String(away.score) : "",
      homeScore: home.score != null ? String(home.score) : "",
      state: st.state || "pre",
      detail: st.shortDetail || st.detail || st.description || "",
      completed: !!st.completed,
      period: clock.period,
      clock: clock.displayClock || "",
    };
  }

  function paint(games) {
    const bar = ensureBar();
    const live = games.filter((g) => g.state === "in");
    const pre = games.filter((g) => g.state === "pre");
    const post = games.filter((g) => g.state === "post" || g.completed);
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    function card(g) {
      const cls = g.state === "in" ? "on" : g.completed ? "done" : "";
      const score = g.state === "pre" ? g.detail : `${g.away} ${g.awayScore || "0"} – ${g.homeScore || "0"} ${g.home}`;
      return `<div class="lgame ${cls}"><b>${g.away} @ ${g.home}</b><span>${score}</span><em>${g.state === "in" ? "LIVE " + (g.clock || "") + " Q" + (g.period || "") : g.detail}</em></div>`;
    }
    bar.innerHTML = `<div class="livehead"><strong>Live slate</strong><span>Updated ${stamp} · ${live.length} in progress · ESPN</span></div><div class="liverow">${live.map(card).join("")}${pre.map(card).join("")}${post.map(card).join("")}</div>`;
  }

  async function pullScores() {
    const res = await fetch(SCORE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("scoreboard " + res.status);
    const data = await res.json();
    const events = (((data.content || {}).sbData || {}).events) || [];
    const games = events.map(mapEvent);
    window.LIVE_GAMES = games;
    const week = games.find((g) => g.week)?.week;
    if (week) window.CUR_WEEK = week;
    window.SLATE = (window.SLATE || []).filter((g) => {
      const hit = games.find((x) => x.away === g.away && x.home === g.home);
      return !hit || !hit.completed;
    });
    paint(games);
    if (typeof render === "function") render();
  }

  async function pullInjuries() {
    const res = await fetch(INJ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("injuries " + res.status);
    const data = await res.json();
    const out = {};
    (data.injuries || []).forEach((team) => {
      (team.injuries || []).forEach((x) => {
        const name = x.athlete && x.athlete.displayName;
        const st = x.status || "";
        if (!name || st === "Active") return;
        out[name] = { status: st, note: (x.shortComment || "").slice(0, 140), date: x.date || "" };
      });
    });
    window.INJ = out;
    if (typeof render === "function") render();
  }

  async function tick() {
    try { await pullScores(); }
    catch (e) {
      ensureBar().innerHTML = `<div class="livehead"><strong>Live slate</strong><span>Could not reach ESPN (${e.message})</span></div>`;
    }
  }
  tick();
  pullInjuries().catch(() => {});
  setInterval(tick, POLL_MS);
  setInterval(() => pullInjuries().catch(() => {}), 15 * 60 * 1000);
})();
