import { readFile, writeFile } from "node:fs/promises";

const UA={"User-Agent":"SportsSauce/1.0"};
function capWeekId(now=new Date()){
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"});
  const parts=fmt.formatToParts(now);
  const g=k=>parts.find(x=>x.type===k).value;
  const y=+g("year"), m=+g("month"), d=+g("day");
  const dow={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[g("weekday")];
  const dt=new Date(Date.UTC(y,m-1,d));
  dt.setUTCDate(dt.getUTCDate()-(dow>=3?dow-3:dow+4));
  const wm=String(dt.getUTCMonth()+1).padStart(2,"0"), wd=String(dt.getUTCDate()).padStart(2,"0");
  return {id:"cap-"+dt.getUTCFullYear()+"-"+wm+"-"+wd, wed:dt};
}
function slateStamps(){
  const wed=capWeekId().wed, out=[];
  for(let i=1;i<=5;i++){
    const dt=new Date(wed);
    dt.setUTCDate(wed.getUTCDate()+i);
    out.push(dt.getUTCFullYear()+String(dt.getUTCMonth()+1).padStart(2,"0")+String(dt.getUTCDate()).padStart(2,"0"));
  }
  return out;
}
async function getJson(url){
  let last;
  for(let n=0;n<3;n++){
    try{
      const r=await fetch(url,{headers:UA});
      if(!r.ok) throw new Error(r.status+" "+url);
      return await r.json();
    }catch(e){ last=e; await new Promise(s=>setTimeout(s,400*(n+1))); }
  }
  throw last;
}
async function mapPool(items, n, fn){
  const out=new Array(items.length);
  let i=0;
  async function worker(){
    while(i<items.length){
      const k=i++;
      try{ out[k]=await fn(items[k]); }catch(e){ out[k]=null; }
    }
  }
  await Promise.all(Array.from({length:Math.min(n, items.length)}, worker));
  return out;
}
function num(v){ return Number(String(v||"0").replace(/,/g,""))||0; }
function playedRows(rows){
  return (rows||[]).filter(g=>
    (g.passingAttempts||0)>0 || (g.rushingAttempts||0)>0 || (g.receptions||0)>0 || (g.targets||0)>0
    || (g.passingYards||0) || (g.rushingYards||0) || (g.receivingYards||0)
    || (g.passingTouchdowns||0) || (g.rushingTouchdowns||0) || (g.receivingTouchdowns||0)
  );
}
function gameFpts(g){
  let pts=(g.passingYards||0)*0.04+(g.passingTouchdowns||0)*4+(g.interceptions||0)*-1
    +(g.rushingYards||0)*0.1+(g.rushingTouchdowns||0)*6
    +(g.receptions||0)*1+(g.receivingYards||0)*0.1+(g.receivingTouchdowns||0)*6
    +(g.fumblesLost||0)*-1;
  if((g.passingYards||0)>=300) pts+=3;
  if((g.rushingYards||0)>=100) pts+=3;
  if((g.receivingYards||0)>=100) pts+=3;
  return pts;
}
function parseSeasonGames(d){
  const by={};
  (d.seasonTypes||[]).forEach(st=>{
    if(/preseason/i.test(st.displayName||st.name||"")) return;
    (st.categories||[]).forEach(c=>(c.events||[]).forEach(ev=>{
      const meta=(d.events||{})[ev.eventId]||{};
      const names=ev.names||c.names||d.names||[];
      const stats=ev.stats||[];
      const row=by[ev.eventId]||{passingYards:0,passingTouchdowns:0,interceptions:0,passingAttempts:0,rushingYards:0,rushingTouchdowns:0,rushingAttempts:0,receptions:0,receivingYards:0,receivingTouchdowns:0,targets:0,fumblesLost:0};
      const take=(key, field)=>{ const i=names.indexOf(key); if(i>=0) row[field]=num(stats[i]); };
      ["passingYards","passingTouchdowns","interceptions","passingAttempts","rushingYards","rushingTouchdowns","rushingAttempts","receptions","receivingYards","receivingTouchdowns"].forEach(k=>take(k,k));
      take("receivingTargets","targets");
      take("fumblesLost","fumblesLost");
      by[ev.eventId]=row;
    }));
  });
  return Object.values(by);
}
function bandFor(pos){ return {QB:[4900,7800],RB:[4000,8800],WR:[3000,8600],TE:[2500,6400],DST:[2000,4200]}[pos]||[3000,6000]; }
function dstFpts(d, seasonGp){
  d=d||{};
  const gp=Math.max(1, Number(d.gp)||seasonGp||1);
  const paG=(d.pa||0)/gp;
  let pa=0;
  if(paG<=0) pa=10; else if(paG<=6) pa=7; else if(paG<=13) pa=4; else if(paG<=20) pa=1; else if(paG<=27) pa=0; else if(paG<=34) pa=-1; else pa=-4;
  return ((d.sacks||0)/gp)*1+((d.to||0)/gp)*2+((d.st||0)/gp)*6+pa;
}
function worth(p){
  if(!p || p.pos==="DST" || /practice/i.test(p.status||"")) return false;
  const seat=p.depth||99;
  if(p.pos==="QB") return seat<=2 || p.starter || seat>=99;
  if(p.pos==="RB") return seat<=2 || p.starter;
  if(p.pos==="WR") return seat<=3 || p.starter;
  if(p.pos==="TE") return seat<=2 || p.starter;
  return false;
}

const stamp=capWeekId();
const days=slateStamps();
const bookPath=new URL("../data/cap-week.json", import.meta.url);
if(!process.env.FORCE){
  try{
    const prev=JSON.parse(await readFile(bookPath, "utf8"));
    if(prev.week===stamp.id && (prev.players||[]).length>80){
      console.log("already posted", stamp.id, prev.players.length);
      process.exit(0);
    }
  }catch(e){}
}
console.log("week", stamp.id, days.join(","));
const pages=await Promise.all(days.map(day=>getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates="+day).catch(()=>null)));
const seen=new Set(), evs=[];
let week="", seasonYear="";
const chiYmd=iso=>iso?new Date(iso).toLocaleDateString("en-CA",{timeZone:"America/Chicago"}).replace(/-/g,""):"";
pages.forEach(d=>{
  if(!d) return;
  if(!week && d.week) week=d.week.number;
  const sy=(d.season&&d.season.year)||(d.leagues&&d.leagues[0]&&d.leagues[0].season&&d.leagues[0].season.year)||"";
  if(!seasonYear && sy) seasonYear=String(sy);
  (d.events||[]).forEach(ev=>{
    const iso=ev.date||(((ev.competitions||[])[0]||{}).date)||"";
    const ymd=chiYmd(iso);
    if(!seen.has(ev.id) && days.includes(ymd)){ seen.add(ev.id); evs.push(ev); }
  });
});
if(!seasonYear){
  try{
    const live=await getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    seasonYear=String((live.season&&live.season.year)||(live.leagues&&live.leagues[0]&&live.leagues[0].season&&live.leagues[0].season.year)||"");
  }catch(e){}
}
if(!seasonYear) seasonYear="2026";
if(evs.length<8) throw new Error("slate too small: "+evs.length);
console.log("season", seasonYear, "games", evs.length);
const games=evs.map(ev=>{
  const c=(ev.competitions||[])[0]||{};
  const comps=c.competitors||[];
  const home=comps.find(x=>x.homeAway==="home")||{};
  const away=comps.find(x=>x.homeAway==="away")||{};
  const ht=home.team||{}, at=away.team||{};
  return {eventId:String(ev.id), start:c.date||ev.date, homeId:String(ht.id||""), homeAb:ht.abbreviation||"HOME", awayId:String(at.id||""), awayAb:at.abbreviation||"AWAY"};
}).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
const tids=[...new Set(games.flatMap(g=>[g.homeId,g.awayId]).filter(Boolean))];
const when=iso=>iso?new Date(iso).toLocaleString("en-US",{timeZone:"America/Chicago",weekday:"short",hour:"numeric",minute:"2-digit"}):"";

const depth={};
await mapPool(tids, 8, async tid=>{
  const d=await getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/"+tid+"/depthcharts");
  const map={};
  (d.depthchart||[]).forEach(chart=>{
    const pos=chart.positions||{};
    Object.keys(pos).forEach(k=>{
      const slot=pos[k]||{};
      const abbr=String((slot.position&&slot.position.abbreviation)||k).toUpperCase();
      if(!(abbr==="QB"||abbr==="RB"||abbr==="FB"||abbr.indexOf("WR")===0||abbr==="TE")) return;
      (slot.athletes||[]).forEach((a,i)=>{
        const id=String(a.id||"");
        if(id && (map[id]==null || map[id]>i+1)) map[id]=i+1;
      });
    });
  });
  depth[tid]=map;
});

const pool=[];
await mapPool(games.flatMap(g=>[[g.awayId,g.awayAb,g],[g.homeId,g.homeAb,g]]), 8, async ([tid,ab,game])=>{
  const d=await getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/"+tid+"/roster");
  const team=(d.team&&(d.team.abbreviation||ab))||ab;
  const chart=depth[tid]||{};
  (d.athletes||[]).forEach(grp=>{
    (grp.items||grp.athletes||[]).forEach(a=>{
      if(!a||!a.id) return;
      const pos=((a.position&&a.position.abbreviation)||"").toUpperCase();
      if(!/^(QB|RB|WR|TE)$/.test(pos)) return;
      const opp=String(tid)===String(game.homeId)?game.awayAb:game.homeAb;
      pool.push({id:String(a.id), name:a.displayName||a.fullName||"", pos, team, opp, eventId:game.eventId, when:when(game.start), start:game.start, starter:!!a.starter, depth:chart[String(a.id)]||99, status:(a.status&&(a.status.name||a.status.type))||""});
    });
  });
});
const ids=new Set();
const players=pool.filter(p=>{ if(ids.has(p.id)) return false; ids.add(p.id); return true; });
players.forEach(p=>{ if(p.starter && (!p.depth || p.depth===99)) p.depth=1; });

const TEAMDEF={};
await mapPool(tids, 8, async tid=>{
  const d=await getJson("https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams/"+tid+"/statistics");
  const ab=(d.team&&d.team.abbreviation)||"";
  if(!ab) return;
  const grab=(side, cat, name)=>{
    const root=side==="opp" ? ((d.results||{}).opponent) : (((d.results||{}).stats)||{});
    const cats=Array.isArray(root) ? root : ((root&&root.categories)||[]);
    const c=cats.find(x=>x&&x.name===cat);
    const s=((c&&c.stats)||[]).find(x=>x&&x.name===name);
    return s ? Number(s.value)||0 : 0;
  };
  TEAMDEF[ab]={pa:grab("opp","scoring","totalPoints"), to:grab("team","miscellaneous","totalTakeaways"), st:grab("team","scoring","returnTouchdowns")+grab("team","defensive","miscTouchdowns"), sacks:grab("team","defensive","sacks"), gp:grab("team","defensive","teamGamesPlayed")||undefined};
});
games.forEach(g=>{
  [ [g.homeId,g.homeAb,g.awayAb], [g.awayId,g.awayAb,g.homeAb] ].forEach(([tid,ab,opp])=>{
    players.push({id:"DST-"+tid, teamId:String(tid), name:ab+" D/ST", pos:"DST", team:ab, opp, eventId:g.eventId, when:when(g.start), start:g.start, depth:1, starter:true});
  });
});

const inj={};
try{
  const d=await getJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries");
  (d.injuries||[]).forEach(team=>{
    (team.injuries||[]).forEach(row=>{
      const a=row.athlete||{};
      let id=String(a.id||"");
      if(!id){ const href=(((a.links||[])[0]||{}).href)||""; const m=href.match(/\/id\/(\d+)/); if(m) id=m[1]; }
      const st=row.status||(a.status&&a.status.name)||"";
      if(id && st && st!=="Active") inj[id]=st;
    });
  });
}catch(e){ console.log("injuries", e.message); }
players.forEach(p=>{ p.inj=inj[p.id]||""; });

const LOGS={}, PRIOR={};
const need=players.filter(worth);
console.log("pricing", need.length, "of", players.length);
let done=0;
await mapPool(need, 16, async p=>{
  const d=await getJson("https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/"+p.id+"/gamelog?season="+seasonYear);
  LOGS[p.id]=parseSeasonGames(d);
  if(!playedRows(LOGS[p.id]).length && ((p.depth||99)===1 || p.starter || p.pos==="QB")){
    try{
      const prior=await getJson("https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/"+p.id+"/gamelog?season="+(Number(seasonYear)-1));
      PRIOR[p.id]=parseSeasonGames(prior);
    }catch(e){}
  }
  done++;
  if(done%40===0) console.log(done+"/"+need.length);
});

const seasonGp=Math.max(1, ...Object.values(TEAMDEF).map(d=>Number(d.gp)||0));
function rateOf(p){
  if(p.pos==="DST"){ const pts=dstFpts(TEAMDEF[p.team]||{}, seasonGp); return {pts, g:0, ppg:pts, proj:false}; }
  if(!Object.prototype.hasOwnProperty.call(LOGS, p.id)) return null;
  const games=playedRows(LOGS[p.id]);
  if(games.length){ const pts=games.reduce((s,g)=>s+gameFpts(g),0); return {pts, g:games.length, ppg:pts/games.length, proj:false}; }
  const known=(p.depth===1 || p.starter) && p.inj!=="Out" && p.inj!=="Injured Reserve";
  if(!known) return {pts:0, g:0, ppg:0, proj:false};
  const prior=playedRows(PRIOR[p.id]||[]);
  if(prior.length){ const pts=prior.reduce((s,g)=>s+gameFpts(g),0); return {pts:0, g:0, ppg:pts/prior.length, proj:true, prior:true}; }
  return {pts:0, g:0, ppg:{QB:15,RB:12,WR:10,TE:7}[p.pos]||8, proj:true, prior:false};
}
function willPlay(p){
  if(p.pos==="DST") return true;
  const seat=p.depth||99;
  return seat===1 || (seat>=99 && p.starter);
}
function fptsOf(p){
  const card=rateOf(p);
  if(!card) return 0;
  if(p.pos==="DST") return card.ppg;
  let ppg=card.ppg;
  if(card.g>0 && card.g<4) ppg=ppg*(card.g/4);
  if(card.g>0 || card.proj) return ppg;
  if(willPlay(p)) return card.ppg;
  return 0;
}
function hasBump(p){
  if(p.pos==="DST") return false;
  const bad=s=>s==="Out"||s==="Injured Reserve"||s==="Doubtful";
  const mates=players.filter(x=>x.team===p.team && x.pos===p.pos);
  const down=mates.filter(x=>x.id!==p.id && bad(x.inj));
  if(!down.length || !down.some(x=>x.starter || (x.depth||99)<=1) || bad(p.inj)) return false;
  const avail=mates.filter(x=>x.inj!=="Out" && x.inj!=="Injured Reserve").sort((a,b)=>(a.depth||99)-(b.depth||99) || a.name.localeCompare(b.name));
  return avail[0] && avail[0].id===p.id;
}
function posCeil(pos){
  const base={QB:26,RB:22,WR:22,TE:16,DST:14}[pos]||20;
  let m=base;
  players.forEach(p=>{
    if(p.pos!==pos) return;
    const card=rateOf(p);
    if(card && !card.proj && card.g>0 && card.ppg>m) m=card.ppg;
  });
  return m;
}
function priceOf(p){
  const [lo,hi]=bandFor(p.pos);
  if(p.pos!=="DST" && !Object.prototype.hasOwnProperty.call(LOGS, p.id) && !worth(p)) return null;
  const pts=fptsOf(p);
  if(hasBump(p) && p.pos==="QB" && pts<12) return 5600;
  if(hasBump(p) && pts<8) return p.pos==="RB"?5200:4600;
  if(!pts) return p.pos==="DST" && TEAMDEF[p.team] ? lo : (Object.prototype.hasOwnProperty.call(LOGS, p.id) ? lo : null);
  const ceil=posCeil(p.pos)||1;
  const t=Math.max(0, Math.min(1, pts/ceil));
  let sal=Math.round((lo+Math.pow(t,0.9)*(hi-lo))/100)*100;
  if(pts>0) sal=Math.max(sal, lo+400);
  if(p.inj==="Out"||p.inj==="Injured Reserve") sal=Math.max(lo, sal-1500);
  if(p.inj==="Doubtful") sal=Math.max(lo+200, sal-800);
  return sal;
}
function lineOf(p){
  if(p.pos==="DST"){
    const d=TEAMDEF[p.team]||{};
    return [d.pa!=null?d.pa+" PA":"", d.to!=null?d.to+" TO":"", d.sacks!=null?d.sacks+" SK":"", d.st?d.st+" ST TD":"", dstFpts(d, seasonGp).toFixed(1)+" FPTS"].filter(Boolean).join(" · ");
  }
  const card=rateOf(p);
  if(!card) return "";
  if(card.proj) return "PROJ "+card.ppg.toFixed(1)+(card.prior?" · last year":" · starter");
  if(!card.g) return "No games";
  const seat=(p.depth||99)<=8 ? (" · "+p.pos+p.depth) : "";
  return card.pts.toFixed(1)+" in "+card.g+"G · "+card.ppg.toFixed(1)+seat;
}
function show(p){
  if(/practice/i.test(p.status||"")) return false;
  if(p.pos==="DST") return true;
  const card=rateOf(p);
  const scored=card && card.g>0;
  if((p.inj==="Out"||p.inj==="Injured Reserve") && !scored) return false;
  if(card && card.proj) return true;
  if(card && card.g>0 && (card.ppg>=6 || p.depth===1 || p.starter || hasBump(p) || !((p.depth||99)<99))) return true;
  if(hasBump(p)) return true;
  const seat=p.depth||99;
  if(!(seat>0 && seat<99)) return p.pos==="QB";
  if(p.pos==="QB") return p.depth===1 || p.starter || hasBump(p);
  if(p.pos==="RB") return seat<=2 || p.depth===1 || p.starter;
  if(p.pos==="WR") return seat<=3 || p.depth===1 || p.starter;
  if(p.pos==="TE") return seat<=1 || p.depth===1 || p.starter;
  return false;
}
const priced=players.map(p=>{
  const sal=p.pos==="DST" ? priceOf(p) : (Object.prototype.hasOwnProperty.call(LOGS, p.id) ? priceOf(p) : null);
  return Object.assign(p, {sal});
}).filter(p=>p.sal && show(p)).map(p=>({
  id:p.id, name:p.name, pos:p.pos, team:p.team, opp:p.opp, eventId:p.eventId, teamId:p.teamId||"",
  start:p.start||"", when:p.when||"", depth:p.depth||99, starter:!!p.starter, inj:p.inj||"",
  sal:p.sal, line:lineOf(p), book:true, priced:true
}));
const thu=days[0], mon=days[4];
const nice=s=>s.slice(4,6)+"/"+s.slice(6);
const label=(week?("Week "+week+" · "):"")+"Thu "+nice(thu)+" – Mon "+nice(mon);
const out={week:stamp.id, label, at:Date.now(), players:priced};
await writeFile(new URL("../data/cap-week.json", import.meta.url), JSON.stringify(out));
const by={};
priced.forEach(p=>{ (by[p.pos]=by[p.pos]||[]).push(p.sal); });
Object.keys(by).forEach(pos=>{
  const a=by[pos].slice().sort((x,y)=>x-y);
  console.log(pos, a.length, "lo", a[0], "mid", a[Math.floor(a.length/2)], "hi", a[a.length-1]);
});
console.log("wrote", priced.length);
