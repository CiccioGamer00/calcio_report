// Read-only metadata audit. No review credentials or email addresses are fetched.
import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const app = '6821570508';
const plan = JSON.parse(await readFile('deploy/app-store-candidate.json', 'utf8'));
if (process.env.GITHUB_REPOSITORY !== 'CiccioGamer00/calcio_report' ||
    process.env.GITHUB_REF !== 'refs/heads/release/apple-production-preparation') throw Error('Wrong execution target');
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (process.env.GITHUB_EVENT_NAME !== 'push' || event.head_commit?.message !== 'release: audit App Store metadata 31.1' ||
    event.after !== process.env.GITHUB_SHA || process.env.GITHUB_RUN_ATTEMPT !== '1' || plan.build !== '31.1') throw Error('Explicit metadata audit required');
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const input = b64({alg:'ES256',kid:process.env.APP_STORE_CONNECT_KEY_ID,typ:'JWT'}) + '.' +
  b64({iss:process.env.APP_STORE_CONNECT_ISSUER_ID,iat:now,exp:now+600,aud:'appstoreconnect-v1'});
const jwt = input + '.' + sign('sha256', Buffer.from(input), {key:process.env.APP_STORE_CONNECT_PRIVATE_KEY,dsaEncoding:'ieee-p1363'}).toString('base64url');
delete process.env.APP_STORE_CONNECT_PRIVATE_KEY;
async function get(path) {
  if (!/^\/v1\/(apps|appStoreVersions|appStoreVersionLocalizations|appInfos|builds|appScreenshotSets)\//.test(path) && !path.startsWith('/v1/builds?')) throw Error('Path not allowed');
  const response = await fetch('https://api.appstoreconnect.apple.com' + path, {
    headers:{Authorization:'Bearer '+jwt},redirect:'error',signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Apple metadata request failed: HTTP '+response.status+' '+path.split('?')[0]);
  return response.json();
}
try {
  const identity = (await get('/v1/apps/'+app)).data;
  if (identity.attributes.bundleId !== plan.bundleId) throw Error('App bundle mismatch');
  const versions = (await get('/v1/apps/'+app+'/appStoreVersions?filter[platform]=IOS&filter[versionString]=1.0')).data;
  if (versions.length !== 1) throw Error('Expected exactly one iOS 1.0 version');
  const version = versions[0];
  const selected = (await get('/v1/appStoreVersions/'+version.id+'/build')).data;
  const builds = (await get('/v1/builds?filter[app]='+app+'&filter[version]='+plan.build)).data;
  const report = {app,versionId:version.id,version:version.attributes.versionString,state:version.attributes.appStoreState,
    releaseType:version.attributes.releaseType,selectedBuild:selected && {id:selected.id,version:selected.attributes.version,usesNonExemptEncryption:selected.attributes.usesNonExemptEncryption},
    candidateBuilds:builds.map(b=>({id:b.id,version:b.attributes.version,processingState:b.attributes.processingState,expired:b.attributes.expired,usesNonExemptEncryption:b.attributes.usesNonExemptEncryption})),localizations:[],appInfos:[]};
  for (const loc of (await get('/v1/appStoreVersions/'+version.id+'/appStoreVersionLocalizations')).data) {
    const sets = await get('/v1/appStoreVersionLocalizations/'+loc.id+'/appScreenshotSets?include=appScreenshots');
    report.localizations.push({id:loc.id,locale:loc.attributes.locale,supportUrl:loc.attributes.supportUrl,
      hasDescription:Boolean(loc.attributes.description),hasKeywords:Boolean(loc.attributes.keywords),
      screenshots:sets.data.map(s=>({display:s.attributes.screenshotDisplayType,count:s.relationships?.appScreenshots?.data?.length ?? 0}))});
  }
  for (const info of (await get('/v1/apps/'+app+'/appInfos')).data) {
    const localizations = (await get('/v1/appInfos/'+info.id+'/appInfoLocalizations')).data;
    report.appInfos.push({id:info.id,state:info.attributes.appStoreState,
      localizations:localizations.map(l=>({id:l.id,locale:l.attributes.locale,privacyPolicyUrl:l.attributes.privacyPolicyUrl}))});
  }
  console.log('ASC_METADATA_AUDIT '+JSON.stringify(report));
} catch(error) { console.error(error.message); process.exitCode=1; }
