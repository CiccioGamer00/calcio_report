import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildTraining} from './build-training.mjs';
import {experimentalForecast} from './experimental-model.mjs';
// CLI only. Reads sports data, no login credentials. Output must not exist.
const [pastPath,historyPath,targetPath,outPath]=process.argv.slice(2);
if(!pastPath||!historyPath||!targetPath||!outPath)throw Error('Usage: node freeze-experiment.mjs past-snapshot history target-snapshot output-new.json');
const bytes=await Promise.all([pastPath,historyPath,targetPath].map(p=>fs.readFile(p,'utf8')));
const [past,history,target]=bytes.map(JSON.parse);
const bank=buildTraining(past,history);
const forecastAt=new Date().toISOString();
const experiments=['scorer','booking'].map(market=>experimentalForecast({fixture:target.target.data.response[0],lineups:target.lineups,training:bank.records,forecastAt,market}));
const record={schemaVersion:1,forecastAt,inputSha256:bytes.map(b=>createHash('sha256').update(b).digest('hex')),training:bank,experiments};
await fs.writeFile(outPath,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({forecastAt,trainingRows:bank.records.length,excluded:bank.excluded.length,experiments:experiments.map(e=>({market:e.market,status:e.status,predictions:e.predictions.length}))}));
