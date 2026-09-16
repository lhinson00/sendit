window.RECV_LINES = ["20+","40+","60+","80+","100+"];
window.RUSH_LINES = ["20+","40+","60+","80+","100+"];
window.PASS_LINES = ["150+","200+","250+","300+","350+"];
window.LINES_BY_MARKET = {
  "Receiving Yards": window.RECV_LINES,
  "Rushing Yards": window.RUSH_LINES,
  "Passing Yards": window.PASS_LINES,
  "Receptions": ["2+"],
  "Receiving TDs": ["1+"],
  "Rushing TDs": ["1+"],
  "Passing TDs": ["1+","2+"],
  "QB Rushing TDs": ["1+"],
  "Interceptions": ["1+","0 (clean)"]
};
window.VOLUME = [];
(window.FULL || []).forEach((p) => {
  const base = { player: p.player, pos: p.pos, team: p.team, games: p.games };
  if (p.keep_rec) {
    window.RECV_LINES.forEach((th, i) => {
      window.VOLUME.push(Object.assign({}, base, { market: "Receiving Yards", threshold: th, hits: p.rec_hits[i] }));
    });
    window.VOLUME.push(Object.assign({}, base, { market: "Receptions", threshold: "2+", hits: p.rec2 }));
    window.VOLUME.push(Object.assign({}, base, { market: "Receiving TDs", threshold: "1+", hits: p.rec_td1 }));
  }
  if (p.keep_rush) {
    window.RUSH_LINES.forEach((th, i) => {
      window.VOLUME.push(Object.assign({}, base, { market: "Rushing Yards", threshold: th, hits: p.rush_hits[i] }));
    });
    window.VOLUME.push(Object.assign({}, base, { market: "Rushing TDs", threshold: "1+", hits: p.rush_td1 }));
  }
  if (p.keep_pass) {
    window.PASS_LINES.forEach((th, i) => {
      window.VOLUME.push(Object.assign({}, base, { market: "Passing Yards", threshold: th, hits: p.pass_hits[i] }));
    });
    window.VOLUME.push(Object.assign({}, base, { market: "Passing TDs", threshold: "1+", hits: p.pass_td1 }));
    window.VOLUME.push(Object.assign({}, base, { market: "Passing TDs", threshold: "2+", hits: p.pass_td2 }));
    window.VOLUME.push(Object.assign({}, base, { market: "Interceptions", threshold: "1+", hits: p.int1 }));
    const qbG = p.qb_games || p.games;
    window.VOLUME.push(Object.assign({}, base, { games: qbG, market: "Interceptions", threshold: "0 (clean)", hits: p.clean }));
    window.VOLUME.push(Object.assign({}, base, { market: "QB Rushing TDs", threshold: "1+", hits: p.rush_td1 }));
  }
});
window.PRESETS = [
  { label: "WR 20+ yds", pos: "WR", market: "Receiving Yards", threshold: "20+", minHits: 14 },
  { label: "WR 40+ yds", pos: "WR", market: "Receiving Yards", threshold: "40+", minHits: 10 },
  { label: "WR 60+ yds", pos: "WR", market: "Receiving Yards", threshold: "60+", minHits: 8 },
  { label: "WR 2+ rec", pos: "WR", market: "Receptions", threshold: "2+", minHits: 12 },
  { label: "WR 1+ rec TD", pos: "WR", market: "Receiving TDs", threshold: "1+", minHits: 5 },
  { label: "TE 20+ yds", pos: "TE", market: "Receiving Yards", threshold: "20+", minHits: 10 },
  { label: "TE 1+ rec TD", pos: "TE", market: "Receiving TDs", threshold: "1+", minHits: 4 },
  { label: "RB 20+ rush", pos: "RB", market: "Rushing Yards", threshold: "20+", minHits: 12 },
  { label: "RB 40+ rush", pos: "RB", market: "Rushing Yards", threshold: "40+", minHits: 8 },
  { label: "RB 1+ rush TD", pos: "RB", market: "Rushing TDs", threshold: "1+", minHits: 5 },
  { label: "QB 150+", pos: "QB", market: "Passing Yards", threshold: "150+", minHits: 12 },
  { label: "QB 200+", pos: "QB", market: "Passing Yards", threshold: "200+", minHits: 8 },
  { label: "QB 1+ pass TD", pos: "QB", market: "Passing TDs", threshold: "1+", minHits: 10 },
  { label: "QB 2+ pass TD", pos: "QB", market: "Passing TDs", threshold: "2+", minHits: 6 },
  { label: "QB 0 INT", pos: "QB", market: "Interceptions", threshold: "0 (clean)", minHits: 8 },
  { label: "QB 1+ rush TD", pos: "QB", market: "QB Rushing TDs", threshold: "1+", minHits: 3 }
];
