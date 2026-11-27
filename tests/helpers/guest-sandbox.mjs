import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../../worker/worker.js";

export function guestSandbox() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["../fixtures/account-schema.sql", "../../worker/migrations/guest-v1.sql"]) {
    sqlite.exec(readFileSync(new URL(file,import.meta.url),"utf8"));
  }
  const db = {
    prepare(sql) {
      const stmt=sqlite.prepare(sql);
      return {values:[],bind(...values){this.values=values;return this},
        first(){return stmt.get(...this.values)},run(){return stmt.run(...this.values)},
        all(){return {results:stmt.all(...this.values)}}};
    },
    batch(stmts) {
      sqlite.exec("BEGIN");
      try { const result=stmts.map(s=>s.all());sqlite.exec("COMMIT");return result; }
      catch(error){ sqlite.exec("ROLLBACK");throw error; }
    }
  };
  const env={DB:db,GUEST_ENABLED:"1",GUEST_SECRET:"guest-test-only",LICENSE_SECRET:"account-test-only",
    CR_RELAY_URL:"https://relay.invalid",CR_RELAY_SECRET:"relay-test-only"};
  const cache=new Map(), calls=[];
  globalThis.caches={default:{match:key=>cache.get(key.url)?.clone(),put:(key,response)=>cache.set(key.url,response)}};
  const team=id=>({id,name:({1:"AC Milan",2:"Inter",3:"Juventus",4:"Roma"})[id] || "Team "+id,country:"Italy"});
  const fixture=(id,home,away)=>({fixture:{id,date:"2026-12-01T19:45:00Z",referee:"Test Ref",status:{short:"NS"}},
    league:{id:135,season:2026,name:"Serie A"},teams:{home:team(home),away:team(away)},goals:{home:null,away:null}});
  globalThis.fetch=async input=>{
    const u=new URL(input); if(u.origin!==env.CR_RELAY_URL) throw Error("Unexpected destination");
    calls.push(u.pathname+u.search);
    const p=u.searchParams,id=Number(p.get("team"));
    let rows=[];
    if(u.pathname==="/teams") rows=[1,2,3,4].map(id=>({team:team(id)})).filter(x=>x.team.name.toLowerCase().includes(p.get("search").toLowerCase()));
    if(u.pathname==="/fixtures" && p.has("next")){
      if (id===90) return Response.json({errors:{service:"unavailable"}});
      if (id===91) return Response.json({response:[{fixture:{id:1}}]});
      if (id===92) return Response.json({errors:{requests:"rate limit"}});
      if(id===1||id===2) rows=[fixture(101,1,2)];
      if(id===3||id===4) rows=[fixture(202,3,4)];
    }
    if(u.pathname==="/fixtures" && p.has("last")) rows=[fixture(500+id,id,8)];
    if(u.pathname==="/fixtures" && p.has("id")) rows=[fixture(Number(p.get("id")),3,4)];
    if(u.pathname==="/fixtures" && p.get("next")==="2") rows=[fixture(202,3,4)];
    return Response.json({response:rows,errors:[]});
  };
  const request=(path,auth,method="GET",body,signal)=>worker.fetch(new Request("https://worker.invalid"+path,{
    method,signal,headers:{Authorization:auth || "","Content-Type":"application/json"},body:body?JSON.stringify(body):undefined
  }),env,{});
  return {sqlite,env,request,calls};
}
