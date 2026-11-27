// Build an isolated release candidate from the exact owner-supplied live bundle.
// Never deploys, reads credentials, or contacts any service.
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const [input,output]=process.argv.slice(2);
if(!input||!output||resolve(input)===resolve(output)) throw Error("Usage: node worker/build-onboarding-production.mjs LIVE.txt OUTPUT.mjs (distinct paths)");
const normalize=s=>s.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").trimEnd();
const digest=s=>createHash("sha256").update(s).digest("hex");
const live=normalize(readFileSync(input,"utf8"));
const expected="62511afb565ec887897fe9c1a3ab23ff83fee18cb546827c4e1571e477f0942f";
if(digest(live)!==expected) throw Error("Unrecognized live bundle; compare actual deployment before proceeding");
const source=normalize(readFileSync(new URL("./worker.js",import.meta.url),"utf8"));
const marker="// Only /guest/* enters this handler.";
const offset=source.indexOf(marker);
if(offset<0||source.indexOf(marker,offset+1)>=0) throw Error("Guest handler not uniquely identified");
const guest=source.slice(offset);
if(!guest.includes("async function handleGuest(request, env, ctx)")||!guest.endsWith("}")) throw Error("Guest source not recognized");
let candidate=live;
const patches=[
  ["async function fetchApiFootballCached(requestUrl, env, ttlSeconds = 0, ctx) {","async function fetchApiFootballCached(requestUrl, env, ttlSeconds = 0, ctx, beforeMiss) {"],
  ["  const relayRes = await fetchRelay(pathWithQuery, env);","  if (beforeMiss) await beforeMiss();\n  const relayRes = await fetchRelay(pathWithQuery, env);"],
  ["const semanticOk = relayRes.ok && parsed !== null && !hasApiSportsErrors(parsed);","const semanticOk = relayRes.ok && parsed !== null && !hasApiSportsErrors(parsed) && (!beforeMiss || Array.isArray(parsed.response));"],
  ["export {\n  apple_production_entry_default as default\n};",guest+"\n\n"+`// Route only guests using the original public DB binding, never reviewEnv.DB.
const onboardingProduction = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/guest/")) {
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders()});
      return handleGuest(request,env,ctx);
    }
    return apple_production_entry_default.fetch(request,env,ctx);
  }
};
export { onboardingProduction as default };`],
];
for(const [old,next] of patches){
  if(candidate.split(old).length!==2) throw Error("Live patch anchor missing or repeated");
  candidate=candidate.replace(old,()=>next);
}
candidate=candidate.replace(/\n\/\/#[ ]*sourceMappingURL=[^\n]*$/,"")+"\n";
const syntax=spawnSync(process.execPath,["--input-type=module","--check","-"],{input:candidate,encoding:"utf8"});
if(syntax.status!==0) throw Error("Candidate syntax check failed");
writeFileSync(output,candidate,{flag:"wx",mode:0o600});
console.log(JSON.stringify({baselineSha256:expected,candidateSha256:digest(candidate),guestSha256:digest(guest),patches:4,syntax:"PASS",deployed:false}));
