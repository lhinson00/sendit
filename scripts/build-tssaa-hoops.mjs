import {readFileSync, writeFileSync, existsSync} from "node:fs";

const START = "2026-11-16";
const OUT = "data/tssaa-hoops.json";
const UA = {"user-agent":"SportsSauce/1.0"};

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
  const res = await fetch(url, {headers:UA});
  if(!res.ok) throw new Error(res.status+" "+url);
  return res.text();
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
for(const iso of dates){
  const html = await get("https://www.coacht.com/tennessee/scoreboard/index.cfm?selDate="+mdy(iso));
  const rows = parseBoard(html, iso);
  games.push(...rows);
  console.log(iso, rows.length);
}
const byId = new Map();
for(const g of (prev.games||[])) if(g.date<from) byId.set(g.id, g);
for(const g of games) byId.set(g.id, g);
const all = [...byId.values()];

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

const out = {asOf:new Date().toISOString(), games:all.sort((a,b)=>a.date.localeCompare(b.date)||a.sport.localeCompare(b.sport)), schools};
writeFileSync(OUT, JSON.stringify(out));
const tagged = all.filter(g=>schools[g.sport+":"+g.homeId]||schools[g.sport+":"+g.awayId]).length;
console.log("games", all.length, "schools", Object.keys(schools).length, "tagged", tagged);
