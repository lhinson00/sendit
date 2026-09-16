window.RECV_LINES = ["20+","40+","60+","80+","100+"];
window.RUSH_LINES = ["20+","40+","60+","80+","100+"];
window.PASS_LINES = ["150+","200+","250+","300+","350+"];
window.CATCH_LINES = ["2+","3+","4+","5+","6+","7+","8+","10+"];
window.LINES_BY_MARKET = {
  "Receiving Yards": window.RECV_LINES,
  "Rushing Yards": window.RUSH_LINES,
  "Passing Yards": window.PASS_LINES,
  "Receptions": window.CATCH_LINES,
  "Receiving TDs": ["1+"],
  "Rushing TDs": ["1+"],
  "Passing TDs": ["1+","2+"],
  "QB Rushing TDs": ["1+"],
  "Interceptions": ["1+","0 (clean)"]
};
window.VOLUME = [];
window.PLAYER = {};
(window.FULL || []).forEach((p) => {
  window.PLAYER[p.player] = p;
  const base = { player: p.player, pos: p.pos, team: p.team, games: p.games };
  if (p.keep_rec) {
    window.RECV_LINES.forEach((th, i) => {
      window.VOLUME.push(Object.assign({}, base, { market: "Receiving Yards", threshold: th, hits: p.rec_hits[i] }));
    });
    window.CATCH_LINES.forEach((th, i) => {
      window.VOLUME.push(Object.assign({}, base, { market: "Receptions", threshold: th, hits: p.catch[i] }));
    });
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
    window.VOLUME.push(Object.assign({}, base, { games: p.qb_games || p.games, market: "Interceptions", threshold: "0 (clean)", hits: p.clean }));
    window.VOLUME.push(Object.assign({}, base, { market: "QB Rushing TDs", threshold: "1+", hits: p.rush_td1 }));
  }
});
