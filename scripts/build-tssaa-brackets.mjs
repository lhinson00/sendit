import {writeFileSync} from "node:fs";

const CLASSES = [
  ["20260101","1A","I"],
  ["20260102","2A","I"],
  ["20260103","3A","I"],
  ["20260104","4A","I"],
  ["20260105","5A","I"],
  ["20260106","6A","I"],
  ["20260107","A","II"],
  ["20260108","AA","II"],
  ["20260109","AAA","II"]
];

function text(s){
  return String(s||"").replace(/<br\s*\/?>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&middot;/g,"·").replace(/&#39;/g,"'").replace(/&/g,"&").replace(/\s+/g," ").trim();
}

function parse(html){
  const games=[];
  for(const g of String(html||"").match(/<table class="game"[\s\S]*?<\/table>/gi)||[]){
    const label=text((g.match(/class="label">([\s\S]*?)<\/div>/i)||[])[1]).replace(/\s*·\s*Tickets.*$/i,"");
    const when=text((g.match(/class="infoBottom">([\s\S]*?)<\/div>/i)||[])[1]);
    const id=(g.match(/data-eventid="(\d+)"/i)||[])[1]||"";
    const teams=[];
    for(const row of g.match(/<tr>([\s\S]*?)<\/tr>/gi)||[]){
      if(!/schoolName/i.test(row)) continue;
      teams.push({
        seed:text((row.match(/class="seed">([\s\S]*?)<\/td>/i)||[])[1]),
        name:text((row.match(/class="schoolName"[^>]*>([\s\S]*?)<\/span>/i)||[])[1]),
        rec:text((row.match(/<small>([\s\S]*?)<\/small>/i)||[])[1]).replace(/[()]/g,""),
        host:/hostIndicator/i.test(row),
        score:text((row.match(/class="score"[^>]*>([\s\S]*?)</i)||[])[1])
      });
    }
    if(label) games.push({id, label, when, teams:teams.slice(0,2)});
  }
  games.sort((a,b)=>Number((a.label.match(/(\d+)/)||[])[1]||0)-Number((b.label.match(/(\d+)/)||[])[1]||0));
  return games;
}

const classes=[];
for(const [id,label,division] of CLASSES){
  const url="https://tssaasports.com/event/bracket.cfm?id="+id;
  const res=await fetch(url,{headers:{"user-agent":"SportsSauce/1.0"}});
  if(!res.ok) throw new Error(id+" "+res.status);
  const html=await res.text();
  const games=parse(html);
  if(games.length<8) throw new Error(id+" only "+games.length+" games");
  classes.push({id, label, division, games});
  console.log(id, label, games.length);
}
const out={asOf:new Date().toISOString(), classes};
writeFileSync("data/tssaa-brackets.json", JSON.stringify(out));
console.log("wrote", classes.reduce((n,c)=>n+c.games.length,0), "games");
