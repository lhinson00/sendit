import {readFileSync, writeFileSync, existsSync} from "node:fs";

const START = "2026-11-16";
const OUT = "data/tssaa-hoops.json";
const UA = {"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36","accept":"text/html,application/xhtml+xml"};

function chiToday(){
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const g = k => parts.find(x=>x.type===k).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function mdy(iso){
  const [y,m,d] = iso.split("-");
  return `${m}-${d}-${y}`;
}
function addDays(iso, n){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d+n));
  return dt.toISOString().slice(0,10);
}
function daysFrom(start, end){
  const out = [];
  for(let d=start; d<=end; d=addDays(d,1)) out.push(d);
  return out;
}
function clean(s){
  return String(s||"").replace(/<[^>]+>/g," ").replace(/&middot;/g,"·").replace(/&/g,"&").replace(/&nbsp;/g," ").replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}
async function get(url){
  const tries = [
    url,
    "https://api.allorigins.win/raw?url="+encodeURIComponent(url),
    "https://corsproxy.io/?"+encodeURIComponent(url)
  ];
  let last = url;
  for(const u of tries){
    try{
      const res = await fetch(u, {headers:UA, redirect:"follow"});
      if(!res.ok){ last = res.status+" "+u; continue; }
      const text = await res.text();
      if(/eventRow|Quick Facts|Division/.test(text)) return text;
      last = "unreadable "+u;
    }catch(e){ last = String(e); }
  }
  throw new Error(last);
}

function normName(s){
  return clean(s).toLowerCase()
    .replace(/\bcounty\b/g,"co")
    .replace(/\b(high school|academy|christian|school|the|hamblen)\b/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function nameFit(team, name){
  if(!team || !name) return false;
  if(team===name) return true;
  if(name.length<5 || team.length<5) return false;
  return team.startsWith(name) || name.startsWith(team);
}
async function maxpreps(sport, iso){
  const [y,m,d] = iso.split("-");
  const date = Number(m)+"/"+Number(d)+"/"+y;
  const url = sport==="girls"
    ? "https://www.maxpreps.com/tn/tennessee/basketball/girls/scores/?date="+encodeURIComponent(date)
    : "https://www.maxpreps.com/tn/tennessee/basketball/scores/?date="+encodeURIComponent(date);
  const res = await fetch(url, {headers:UA, redirect:"follow"});
  if(!res.ok) throw new Error(res.status+" maxpreps");
  const html = await res.text();
  const rows = [];
  const re = /<ul class="teams"\s*>([\s\S]*?)<\/ul>\s*<div class="details"\s*>([^<]*)/g;
  let hit;
  while((hit = re.exec(html))){
    const chunk = hit[1];
    if(/junior-varsity|freshman|\/jv-/i.test(chunk)) continue;
    const sides = [...chunk.matchAll(/<div class="score"\s*>([^<]*)<\/div>[\s\S]*?<div class="name"\s*>([^<]+)/g)];
    if(sides.length<2) continue;
    rows.push({n1:clean(sides[0][2]), s1:clean(sides[0][1]), n2:clean(sides[1][2]), s2:clean(sides[1][1]), status:clean(hit[2])});
  }
  return rows;
}
function applyMax(all, rows, iso, sport, allowInsert){
  let n = 0;
  const real = all.filter(g=>g.date===iso && g.sport===sport && !String(g.id).startsWith("mp"));
  const same = (g, n1, n2)=> (nameFit(normName(g.away), n1) && nameFit(normName(g.home), n2)) || (nameFit(normName(g.away), n2) && nameFit(normName(g.home), n1));
  for(const row of rows){
    const n1 = normName(row.n1), n2 = normName(row.n2);
    if(!n1 || !n2) continue;
    const g = real.find(x=>same(x, n1, n2));
    if(g){
      const firstAway = nameFit(normName(g.away), n1);
      const as = firstAway ? row.s1 : row.s2;
      const hs = firstAway ? row.s2 : row.s1;
      const have = String(g.as||"").trim()!=="" && String(g.hs||"").trim()!=="" && /final/i.test(g.status||"");
      if(have) continue;
      if(as) g.as = as;
      if(hs) g.hs = hs;
      if(row.status) g.status = row.status;
      n++;
      continue;
    }
    if(!row.s1 && !row.s2) continue;
    if(!allowInsert) continue;
    const id = "mp-"+sport+"-"+iso+"-"+n1.slice(0,18)+"-"+n2.slice(0,18);
    if(all.some(x=>x.id===id)) continue;
    all.push({id, date:iso, sport, group:"", status:row.status||(row.s1||row.s2?"Final":""), away:row.n1, awayId:"", as:row.s1||"", home:row.n2, homeId:"", hs:row.s2||""});
    n++;
  }
  for(let i=all.length-1;i>=0;i--){
    const g = all[i];
    if(!String(g.id).startsWith("mp") || g.date!==iso || g.sport!==sport) continue;
    if(real.some(x=>same(x, normName(g.away), normName(g.home)))) all.splice(i,1);
  }
  return n;
}

function parseBoard(html, iso){
  const games = [];
  let group = "";
  const re = /<h4 class="mt-4 mb-2">([\s\S]*?)<\/h4>|<div class="d-flex eventRow" data-eventid="(\d+)" data-sport="([^"]+)">/g;
  const marks = [];
  let m;
  while((m = re.exec(html))) marks.push({index:m.index, h:m[1], id:m[2], sport:m[3]});
  for(let i=0;i<marks.length;i++){
    const mark = marks[i];
    if(mark.h!=null){ group = clean(mark.h); continue; }
    if(!/basketball/i.test(mark.sport||"")) continue;
    const chunk = html.slice(mark.index, marks[i+1]?marks[i+1].index:mark.index+5000);
    const side = (label)=>{
      const box = chunk.match(new RegExp('class="name '+label+'name"([\\s\\S]{0,350}?)</span>'));
      const block = box ? box[1] : "";
      const linked = block.match(/schoolid=(\d+)[^"']*"[^>]*>([^<]+)/);
      const score = chunk.match(new RegExp(label+'score[^>]*>([\\s\\d]*)'));
      const name = (linked ? clean(linked[2]) : clean(block)).replace(/^>\s*/,"");
      return {id:linked?linked[1]:"", name, score:score?clean(score[1]):""};
    };
    const away = side("visiting");
    const home = side("host");
    const status = clean((chunk.match(/gameStatus[^>]*>([^<]+)/)||[])[1]||"");
    if(!away.name && !home.name) continue;
    games.push({
      id: mark.id,
      date: iso,
      sport: /girls/i.test(mark.sport) ? "girls" : "boys",
      group,
      status: status || (away.score||home.score ? "Final" : ""),
      away: away.name, awayId: away.id, as: away.score,
      home: home.name, homeId: home.id, hs: home.score
    });
  }
  return games;
}

function parseFacts(html){
  const text = clean(html);
  const m = text.match(/Division\s+(I{1,3}|Independent)\s+Class\s+([0-9A-Za-z]+),\s+(.*?)(?:\s+Schedule|\s+Record|\s+Strength|$)/);
  if(!m) return null;
  let rest = m[3];
  const dm = rest.match(/District\s+(\d+)/i);
  const district = dm ? dm[1] : "";
  rest = rest.replace(/,?\s*District\s+\d+/i,"");
  const region = rest.replace(/^Region\s+/i,"").replace(/\s+Region\b/i,"").replace(/\s+District\b/i,"").replace(/,/g,"").trim();
  if(!region && !district) return null;
  return {division:m[1], klass:m[2].toUpperCase(), region, district};
}

async function mapPool(items, limit, worker){
  const out = [];
  let i = 0;
  async function run(){
    while(i<items.length){
      const n = i++;
      out[n] = await worker(items[n]);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit, items.length)}, run));
  return out;
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT,"utf8")) : {schools:{}};
const schools = prev.schools || {};
const today = chiToday();
const from = START < addDays(today,-10) ? addDays(today,-10) : START;
const dates = daysFrom(from, today).filter(d=>d>=START && d<=today);
const games = [];
const okDates = new Set();
let coachBlocked = false;
for(const iso of dates){
  if(coachBlocked) break;
  try{
    const html = await get("https://www.coacht.com/tennessee/scoreboard/index.cfm?selDate="+mdy(iso));
    const rows = parseBoard(html, iso);
    games.push(...rows);
    okDates.add(iso);
    console.log(iso, rows.length);
  }catch(e){
    const msg = String(e && e.message || e);
    console.log("skip", iso, msg.slice(0,160));
    if(/403/.test(msg)) coachBlocked = true;
  }
}
const byId = new Map();
for(const g of (prev.games||[])) if(!okDates.has(g.date) && !(String(g.id).startsWith("mp") && g.date!==today)) byId.set(g.id, g);
for(const g of games){
  const old = (prev.games||[]).find(x=>x.id===g.id);
  if(old){
    if((g.as===""||g.as==null) && old.as) g.as=old.as;
    if((g.hs===""||g.hs==null) && old.hs) g.hs=old.hs;
    if((!g.status || /\b(am|pm)\b/i.test(g.status)) && old.status && !/\b(am|pm)\b/i.test(old.status)) g.status=old.status;
  }
  byId.set(g.id, g);
}
const all = [...byId.values()];
let filled = okDates.size;
for(const iso of dates){
  for(const sport of ["boys","girls"]){
    try{
      const rows = await maxpreps(sport, iso);
      const n = applyMax(all, rows, iso, sport, iso===today);
      console.log("maxpreps", iso, sport, rows.length, "matched", n);
      if(n) filled++;
    }catch(e){ console.log("maxpreps skip", iso, sport, String(e && e.message || e).slice(0,120)); }
  }
}
const day = mdy(today);
for(const [sportid, sport] of [[3,"boys"],[2,"girls"]]){
  try{
    const res = await fetch("https://www.coacht.com/tennessee/scoreboard/updates_init.cfm?sportid="+sportid+"&selDate="+encodeURIComponent(day)+"&bust="+Date.now(), {headers:UA});
    if(!res.ok) continue;
    const rows = await res.json();
    if(!Array.isArray(rows)) continue;
    for(const row of rows){
      const g = all.find(x=>x.id===String(row.eventid||""));
      if(!g) continue;
      const vs=String(row.visitingscore??"").trim();
      const hs=String(row.hostscore??"").trim();
      if(vs) g.as=vs;
      if(hs) g.hs=hs;
      if(row.period) g.status=String(row.period).trim();
      filled++;
    }
    console.log("live", sport, rows.length);
  }catch(e){ console.log("live skip", sport, String(e).slice(0,80)); }
}
if(!filled){
  console.log("no scoreboard reached");
  process.exit(0);
}

const need = [];
const seen = new Set();
for(const g of all){
  for(const [id, sport] of [[g.awayId, g.sport],[g.homeId, g.sport]]){
    if(!id || seen.has(sport+":"+id) || schools[sport+":"+id]) continue;
    seen.add(sport+":"+id);
    need.push({id, sport});
  }
}
console.log("new schools", need.length);
await mapPool(need, 8, async (s)=>{
  const sportid = s.sport==="girls" ? 2 : 3;
  try{
    const html = await get(`https://www.coacht.com/tennessee/inside/team.cfm?sportid=${sportid}&schoolid=${s.id}`);
    const facts = parseFacts(html);
    schools[s.sport+":"+s.id] = facts || {miss:true};
  }catch(e){}
});

const gamesOut = all.sort((a,b)=>a.date.localeCompare(b.date)||a.sport.localeCompare(b.sport)||String(a.id).localeCompare(String(b.id)));
const same = JSON.stringify(prev.games||[])===JSON.stringify(gamesOut) && JSON.stringify(prev.schools||{})===JSON.stringify(schools);
if(same){
  console.log("unchanged");
  process.exit(0);
}
const out = {asOf:new Date().toISOString(), games:gamesOut, schools};
writeFileSync(OUT, JSON.stringify(out));
const tagged = all.filter(g=>schools[g.sport+":"+g.homeId]||schools[g.sport+":"+g.awayId]).length;
console.log("games", all.length, "schools", Object.keys(schools).length, "tagged", tagged);
