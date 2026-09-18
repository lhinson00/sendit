(function () {
  const SCORE_URL = "https://cdn.espn.com/core/nfl/scoreboard?xhr=1";
  const SUM_URL = (id) => "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=" + id;
  const TZ = "America/Chicago";
  let VIEW = "live", OPEN_ID = null, pollGame = null;
  window.SAUCE_FILT = window.SAUCE_FILT || { pos: "ALL", market: "Receiving Yards", line: "20+" };
  function $(id) { return document.getElementById(id); }
  function logo(ab) { return "https://a.espncdn.com/i/teamlogos/nfl/500/" + String(ab || "").toLowerCase() + ".png"; }
  function fmtCT(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT";
  }
  function showView(name) {
    VIEW = name;
    ["Live", "Research", "Game", "Slip"].forEach(function (k) {
      var n = $("view" + k);
      if (n) n.hidden = name !== k.toLowerCase();
    });
    document.querySelectorAll("[data-nav]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.nav === name || (name === "game" && b.dataset.nav === "live"));
    });
    if (name !== "game" && pollGame) { clearInterval(pollGame); pollGame = null; OPEN_ID = null; }
  }
  window.showView = showView;
  function mapEvent(ev) {
    var c = (ev.competitions || [])[0] || {};
    var comps = c.competitors || [];
    var home = comps.find(function (x) { return x.homeAway === "home"; }) || {};
    var away = comps.find(function (x) { return x.homeAway === "away"; }) || {};
    var st = (c.status || {}).type || {};
    return { id: String(ev.id || ""), away: (away.team && away.team.abbreviation) || "", home: (home.team && home.team.abbreviation) || "", awayScore: away.score != null ? String(away.score) : "", homeScore: home.score != null ? String(home.score) : "", state: st.state || "pre", detail: st.shortDetail || "", start: ev.date || "", completed: !!st.completed, period: (c.status || {}).period, clock: (c.status || {}).displayClock || "" };
  }
  function statusLine(g) {
    if (g.state === "in") return "LIVE \u00b7 " + (g.clock || "") + " Q" + (g.period || "");
    if (g.completed || g.state === "post") return g.detail || "Final";
    return fmtCT(g.start) || g.detail;
  }
  function card(g) {
    var cls = g.state === "in" ? "on" : (g.completed ? "done" : "");
    var mid = g.state === "pre" ? "VS" : (g.awayScore + "<em>-</em>" + g.homeScore);
    return '<button type="button" class="gcard ' + cls + '" data-gid="' + g.id + '">' +
      '<div class="gstat"><span>' + statusLine(g) + '</span></div>' +
      '<div class="gduo">' +
      '<div class="gteam"><img alt="" src="' + logo(g.away) + '"/><b>' + g.away + '</b></div>' +
      '<div class="gscore">' + mid + '</div>' +
      '<div class="gteam right"><b>' + g.home + '</b><img alt="" src="' + logo(g.home) + '"/></div>' +
      '</div><div class="gopen">Open game room</div></button>';
  }
  function paintSlate(games) {
    var host = $("liveList");
    if (!host) return;
    var live = games.filter(function (g) { return g.state === "in"; });
    var pre = games.filter(function (g) { return g.state === "pre"; });
    var post = games.filter(function (g) { return g.state === "post" || g.completed; });
    if ($("liveMeta")) $("liveMeta").textContent = live.length + " live \u00b7 Central Time";
    host.innerHTML =
      (live.length ? '<p class="sec">Live now</p>' + live.map(card).join("") : "") +
      (pre.length ? '<p class="sec">Upcoming</p>' + pre.map(card).join("") : "") +
      (post.length ? '<p class="sec">Final</p>' + post.map(card).join("") : "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-gid]");
    if (b) { e.preventDefault(); openGame(b.getAttribute("data-gid")); }
  });
  function scoringList(sum) {
    var plays = (sum && sum.scoringPlays) || [];
    if (!plays.length) return "<p class='hint'>No scoring yet.</p>";
    return plays.map(function (p) {
      var tm = (p.team && (p.team.abbreviation || p.team.displayName)) || "";
      return '<div class="play score"><b>' + tm + " " + p.awayScore + "\u2013" + p.homeScore + '</b><p>' + (p.text || "") + '</p></div>';
    }).join("");
  }
  function boxTables(sum) {
    var players = ((sum && sum.boxscore) || {}).players || [];
    var html = "";
    players.forEach(function (side) {
      var team = (side.team && side.team.abbreviation) || "";
      html += '<p class="sec">' + team + ' box</p>';
      (side.statistics || []).forEach(function (grp) {
        if (["passing", "rushing", "receiving"].indexOf(grp.name) < 0) return;
        var labels = grp.labels || [];
        var rows = (grp.athletes || []).map(function (a) {
          var n = (a.athlete && a.athlete.displayName) || "";
          var st = a.stats || [];
          return "<tr><td>" + n + "</td>" + st.slice(0, 5).map(function (v) { return "<td>" + v + "</td>"; }).join("") + "</tr>";
        }).join("");
        html += '<div class="tblwrap"><table class="log"><thead><tr><th>' + (grp.label || grp.name) + '</th>' +
          labels.slice(0, 5).map(function (l) { return "<th>" + l + "</th>"; }).join("") +
          '</tr></thead><tbody>' + (rows || "<tr><td>No stats yet</td></tr>") + '</tbody></table></div>';
      });
    });
    return html || "<p class='hint'>Box opens after kickoff.</p>";
  }
  function sauceBlock(g) {
    var f = window.SAUCE_FILT;
    var teams = [g.away, g.home];
    var rows = (window.VOLUME || []).filter(function (r) {
      return teams.indexOf(r.team) >= 0 && r.market === f.market && r.threshold === f.line && (f.pos === "ALL" || r.pos === f.pos);
    }).sort(function (a, b) { return (b.hits / Math.max(b.games,1)) - (a.hits / Math.max(a.games,1)); }).slice(0, 40);
    var opts = function (list, cur) {
      return list.map(function (v) { return "<option" + (v === cur ? " selected" : "") + ">" + v + "</option>"; }).join("");
    };
    var list = rows.map(function (r) {
      return '<article class="sauce cardish"><div><b>' + r.player + '</b><span>' + r.pos + ' \u00b7 ' + r.team + ' \u00b7 ' + r.hits + '/' + r.games + ' on ' + r.threshold + '</span></div></article>';
    }).join("") || "<p class='hint'>No volume rows for this filter on these two teams.</p>";
    return '<div class="sfilt"><label>Pos<select id="sPos">' + opts(["ALL", "WR", "TE", "RB", "QB"], f.pos) +
      '</select></label><label>Stat<select id="sMkt">' + opts(["Receiving Yards", "Receptions", "Rushing Yards", "Passing Yards"], f.market) +
      '</select></label><label>Line<select id="sLine">' + opts(["20+", "30+", "40+", "50+", "2+", "3+", "150+", "175+"], f.line) +
      '</select></label></div>' + list;
  }
  function paintGame(g, sum) {
    var box = $("gameRoom");
    if (!box) return;
    box.innerHTML =
      '<button type="button" class="back" id="gameBack">\u2190 Slate</button>' +
      '<div class="scorebug ' + (g.state === "in" ? "on" : "") + '">' +
      '<div class="sbmeta"><span class="chipstat">' + statusLine(g) + '</span></div>' +
      '<div class="sbgrid">' +
      '<div class="sbteam"><img alt="" src="' + logo(g.away) + '"/><span>' + g.away + '</span><b>' + (g.state === "pre" ? "\u2014" : g.awayScore) + '</b></div>' +
      '<div class="sbteam"><img alt="" src="' + logo(g.home) + '"/><span>' + g.home + '</span><b>' + (g.state === "pre" ? "\u2014" : g.homeScore) + '</b></div>' +
      '</div></div>' +
      '<div class="gtabs">' +
      '<button type="button" data-gtab="scoring" class="on">Scoring</button>' +
      '<button type="button" data-gtab="box">Box</button>' +
      '<button type="button" data-gtab="sauce">Sauce</button></div>' +
      '<div id="gtab-scoring" class="gtab">' + scoringList(sum || {}) + '</div>' +
      '<div id="gtab-box" class="gtab" hidden>' + boxTables(sum || {}) + '</div>' +
      '<div id="gtab-sauce" class="gtab" hidden>' + sauceBlock(g) + '</div>';
    $("gameBack").onclick = function () { showView("live"); };
    box.querySelectorAll("[data-gtab]").forEach(function (b) {
      b.onclick = function () {
        box.querySelectorAll("[data-gtab]").forEach(function (x) { x.classList.toggle("on", x === b); });
        ["scoring", "box", "sauce"].forEach(function (k) {
          var n = $("gtab-" + k);
          if (n) n.hidden = k !== b.dataset.gtab;
        });
      };
    });
    function bindFilt() {
      ["sPos", "sMkt", "sLine"].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.onchange = function () {
          window.SAUCE_FILT.pos = $("sPos").value;
          window.SAUCE_FILT.market = $("sMkt").value;
          window.SAUCE_FILT.line = $("sLine").value;
          var pane = $("gtab-sauce");
          if (pane) { pane.innerHTML = sauceBlock(g); bindFilt(); }
        };
      });
    }
    bindFilt();
  }
  async function loadGame(id) {
    var games = window.LIVE_GAMES || [];
    var g = Object.assign({}, games.find(function (x) { return x.id === String(id); }) || { id: id, away: "", home: "", state: "pre" });
    var sum = {};
    try {
      var res = await fetch(SUM_URL(id), { cache: "no-store" });
      if (res.ok) sum = await res.json();
      var hdr = ((sum.header || {}).competitions || [])[0] || {};
      var comps = hdr.competitors || [];
      if (comps.length) {
        var home = comps.find(function (x) { return x.homeAway === "home"; }) || {};
        var away = comps.find(function (x) { return x.homeAway === "away"; }) || {};
        g.away = (away.team && away.team.abbreviation) || g.away;
        g.home = (home.team && home.team.abbreviation) || g.home;
        g.awayScore = away.score != null ? String(away.score) : g.awayScore;
        g.homeScore = home.score != null ? String(home.score) : g.homeScore;
        g.state = ((hdr.status || {}).type || {}).state || g.state;
        g.detail = ((hdr.status || {}).type || {}).shortDetail || g.detail;
      }
    } catch (e) {}
    paintGame(g, sum);
  }
  function openGame(id) {
    OPEN_ID = String(id);
    showView("game");
    $("gameRoom").innerHTML = "<p class='hint'>Loading game\u2026</p>";
    loadGame(id);
    if (pollGame) clearInterval(pollGame);
    pollGame = setInterval(function () { if (OPEN_ID) loadGame(OPEN_ID); }, 20000);
  }
  window.openGame = openGame;
  async function tick() {
    try {
      var res = await fetch(SCORE_URL, { cache: "no-store" });
      var data = await res.json();
      var events = (((data.content || {}).sbData || {}).events) || [];
      window.LIVE_GAMES = events.map(mapEvent);
      paintSlate(window.LIVE_GAMES);
    } catch (e) {
      var host = $("liveList");
      if (host) host.innerHTML = "<p class='hint'>Could not load slate</p>";
    }
  }
  document.querySelectorAll("[data-nav]").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.dataset.nav); });
  });
  showView("live");
  tick();
  setInterval(tick, 30000);
})();
