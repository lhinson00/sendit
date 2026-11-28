import {readFileSync, writeFileSync, existsSync} from "node:fs";

const UA = {"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36","accept":"text/html"};
const FB = "data/tssaa.json";
const HOOPS = "data/tssaa-hoops.json";

function chiParts(delta){
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(Date.now()+delta*86400000));
  const g = k => parts.find(x=>x.type===k).value;
  return {y:g("year"), m:g("month"), d:g("day")};
}
function mdy(p){ return p.m+"-"+p.d+"-"+p.y; }
function iso(p){ return p.y+"-"+p.m+"-"+p.d; }
function clean(s){
  return String(s||"").replace(/<[^>]+>/g," ").replace(/&middot;/g,"·").replace(/&/g,"&").replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}
async function get(url){
  const tries = [url, "https://api.allorigins.win/raw?url="+encodeURIComponent(url)];
  let last = "";
  for(const u of tries){
    try{
      const res = await fetch(u, {headers:UA, redirect:"follow"});
      if(!res.ok){ last = res.status+" "+u; continue; }
      const text = await res.text();
      if(/eventRow/.test(text)) return text;
      last = "no board "+u;
    }catch(e){ last = String(e); }
  }
  throw new Error(last);
}
function parseBoard(html){
  const games = [];
  let group = "";
  const re = /<h4 class="mt-4 mb-2">([\s\S]*?)<\/h4>|<div class="d-flex eventRow" data-eventid="(\d+)" data-sport="([^"]+)">/g;
  const marks = [];
  let m;
  while((m = re.exec(html))) marks.push({index:m.index, h:m[1], id:m[2], sport:m[3]});
  const side = (chunk, label)=>{
    const box = chunk.match(new RegExp('class="name '+label+'name"([\\s\\S]{0,450}?)</span>'));
    const block = box ? box[1] : "";
    const linked = block.match(/schoolid=(\d+)[^"']*"[^>]*>([^<]+)/);
    const score = chunk.match(new RegExp(label+'score[^>]*>([\\s\\d]*)'));
    const rec = chunk.match(new RegExp(label+'name[\\s\\S]{0,500}?class="records[^"]*"[^>]*>([^<]*)'));
    const name = (linked ? clean(linked[2]) : clean(block)).replace(/^>\s*/,"");
    return {id:linked?linked[1]:"", name, score:score?clean(score[1]):"", rec:rec?clean(rec[1]):""};
  };
  for(let i=0;i<marks.length;i++){
    const mark = marks[i];
    if(mark.h!=null){ group = clean(mark.h); continue; }
    const sportName = mark.sport||"";
    const football = /^football$/i.test(sportName);
    const hoop = /basketball/i.test(sportName);
    if(!football && !hoop) continue;
    const chunk = html.slice(mark.index, marks[i+1] ? marks[i+1].index : mark.index+7000);
    const away = side(chunk, "visiting");
    const home = side(chunk, "host");
    const status = clean((chunk.match(/gameStatus[^>]*>([^<]+)/)||[])[1]||"");
    if(!away.name && !home.name) continue;
    games.push({
      id: mark.id,
      kind: football ? "football" : (/girls/i.test(sportName) ? "girls" : "boys"),
      group,
      status: status || ((away.score||home.score) ? "Final" : ""),
      away, home
    });
  }
  return games;
}
function readJson(path){
  if(!existsSync(path)) return null;
  try{ return JSON.parse(readFileSync(path,"utf8")); }
  catch(e){ return null; }
}
function stamp(g, schools){
  const take = id => {
    const hit = id && schools[g.sport+":"+id];
    if(!hit || hit.miss || !hit.klass) return null;
    return hit;
  };
  const h = take(g.homeId), a = take(g.awayId);
  if(h){ g.hdiv=h.division||""; g.hklass=h.klass; g.hreg=String(h.region||""); g.hdist=String(h.district||""); }
  if(a){ g.adiv=a.division||""; g.aklass=a.klass; g.areg=String(a.region||""); g.adist=String(a.district||""); }
}

function addIso(iso, n){
  const [y,m,d]=iso.split("-").map(Number);
  const dt=new Date(Date.UTC(y, m-1, d+n));
  return dt.toISOString().slice(0,10);
}
function partsFromIso(iso){
  const [y,m,d]=iso.split("-");
  return {y, m, d, mdy:m+"-"+d+"-"+y, iso};
}
const SEASON="2026-11-16";
const todayIso=iso(chiParts(0));
const yestIso=iso(chiParts(-1));
const hoopPreview=readJson(HOOPS);
const gap=[];
if(hoopPreview && Array.isArray(hoopPreview.games)){
  const by={};
  const quiet=hoopPreview.quiet||{};
  hoopPreview.games.forEach(g=>{ (by[g.date]=by[g.date]||[]).push(g); });
  for(let d=SEASON; d<todayIso; d=addIso(d,1)){
    if((quiet[d]||0)>=2) continue;
    const rows=by[d]||[];
    const open=!rows.length || rows.some(g=>{
      const scored=String(g.as||"").trim() && String(g.hs||"").trim() && /final/i.test(g.status||"");
      return !scored && (g.miss||0)<2;
    });
    if(open) gap.push(d);
  }
}
const daySet=new Set([yestIso, todayIso, ...gap.slice(0,4)]);
const days=[...daySet].sort().map(partsFromIso);
console.log("days", days.map(d=>d.iso).join(","));
const boards = [];
for(const day of days){
  try{
    const html = await get("https://www.coacht.com/tennessee/scoreboard/index.cfm?selDate="+day.mdy);
    const rows = parseBoard(html);
    boards.push({...day, rows});
    console.log(day.mdy, rows.length);
  }catch(e){
    console.log("skip", day.mdy, String(e.message||e).slice(0,140));
  }
}
if(!boards.length){
  console.log("no scoreboard");
  process.exit(0);
}

const fb = readJson(FB);
if(fb && Array.isArray(fb.games) && fb.games.length>100){
  let n = 0;
  for(const board of boards){
    for(const g of board.rows){
      if(g.kind!=="football") continue;
      let row = fb.games.find(x=>String(x.id)===String(g.id));
      if(!row){
        fb.games.push({id:g.id, date:board.mdy, region:g.group||"", status:g.status||"", away:g.away.name, home:g.home.name, as:g.away.score, hs:g.home.score, ar:g.away.rec, hr:g.home.rec, aid:g.away.id, hid:g.home.id});
        n++;
        continue;
      }
      const had = String(row.as||"")!=="" && String(row.hs||"")!=="" && /final/i.test(row.status||"");
      if(g.away.score) row.as = g.away.score;
      if(g.home.score) row.hs = g.home.score;
      if(g.status) row.status = g.status;
      if(g.away.rec) row.ar = g.away.rec;
      if(g.home.rec) row.hr = g.home.rec;
      if(!row.region && g.group && /region/i.test(g.group)) row.region = g.group;
      if(!row.aid && g.away.id) row.aid = g.away.id;
      if(!row.hid && g.home.id) row.hid = g.home.id;
      if(!had) n++;
    }
  }
  fb.pulled = new Date().toISOString();
  fb.asOf = fb.pulled;
  writeFileSync(FB, JSON.stringify(fb));
  console.log("football updates", n, "games", fb.games.length);
}else{
  console.log("football file missing, left untouched");
}

const hoop = readJson(HOOPS);
if(hoop && Array.isArray(hoop.games)){
  const schools = hoop.schools || {};
  let n = 0;
  for(const board of boards){
    for(const g of board.rows){
      if(g.kind==="football") continue;
      let row = hoop.games.find(x=>String(x.id)===String(g.id));
      if(!row){
        row = {id:g.id, date:board.iso, sport:g.kind, group:g.group||"", status:g.status||"", away:g.away.name, awayId:g.away.id, as:g.away.score, home:g.home.name, homeId:g.home.id, hs:g.home.score};
        stamp(row, schools);
        hoop.games.push(row);
        n++;
        continue;
      }
      const had = String(row.as||"")!=="" && String(row.hs||"")!=="" && /final/i.test(row.status||"");
      if(g.away.score) row.as = g.away.score;
      if(g.home.score) row.hs = g.home.score;
      if(g.status && (!had || /final/i.test(g.status))) row.status = g.status;
      if(!row.group && g.group) row.group = g.group;
      if(!row.awayId && g.away.id) row.awayId = g.away.id;
      if(!row.homeId && g.home.id) row.homeId = g.home.id;
      stamp(row, schools);
      if(!had) n++;
    }
    if(board.iso>=todayIso) continue;
    const hoopRows=board.rows.filter(g=>g.kind!=="football");
    hoop.quiet=hoop.quiet||{};
    if(!hoopRows.length) hoop.quiet[board.iso]=(hoop.quiet[board.iso]||0)+1;
    else delete hoop.quiet[board.iso];
    const scored = g => String(g.as||"").trim() && String(g.hs||"").trim() && /final/i.test(g.status||"");
    hoop.games.forEach(row=>{
      if(row.date!==board.iso) return;
      if(scored(row)) delete row.miss;
      else row.miss=(row.miss||0)+1;
    });
  }
  hoop.pulled = new Date().toISOString();
  hoop.asOf = hoop.pulled;
  writeFileSync(HOOPS, JSON.stringify(hoop));
  console.log("hoops updates", n, "games", hoop.games.length);
}
