import {writeFileSync} from "node:fs";

const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings", {cache:"no-store"});
if(!res.ok) throw new Error("ESPN rankings "+res.status);
const data = await res.json();
const polls = (data.rankings||[]).filter(p=>{
  const n=(p.name||"")+" "+(p.shortName||"");
  return /ap top|ap poll|coaches poll|afca/i.test(n);
});
function slim(p){
  return {
    name: p.name,
    shortName: p.shortName||p.name,
    date: p.date||"",
    ranks: (p.ranks||[]).slice(0,25).map(r=>{
      const t=r.team||{};
      const displayName=t.displayName||[t.location,t.name].filter(Boolean).join(" ");
      return {
        current: r.current,
        previous: r.previous,
        trend: r.trend,
        points: r.points,
        recordSummary: r.recordSummary||"",
        team: {
          id: String(t.id||""),
          abbreviation: t.abbreviation||"",
          displayName,
          nickname: t.nickname||"",
          logos: t.logos&&t.logos[0]&&t.logos[0].href?[{href:t.logos[0].href}]:[]
        }
      };
    })
  };
}
const coaches = polls.find(p=>/coaches/i.test(p.name||""));
const ap = polls.find(p=>/ap/i.test(p.name||""));
if(!coaches && !ap) throw new Error("No AP or Coaches poll in the ESPN feed");
const iso = (coaches&&coaches.date)||(ap&&ap.date)||"";
const date = iso ? new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/Chicago"}) : "";
const out = {date, iso, source: (coaches&&coaches.name)||(ap&&ap.name)||""};
if(coaches) out.coaches = slim(coaches);
if(ap) out.ap = slim(ap);
writeFileSync(new URL("../data/cfb-polls.json", import.meta.url), JSON.stringify(out));
const tn = rows => (rows||[]).find(r=>r.team.id==="2633");
console.log(date, "AP", ap?tn(out.ap.ranks)?.current:"—", "Coaches", coaches?tn(out.coaches.ranks)?.current:"—");
