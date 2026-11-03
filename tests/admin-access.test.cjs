const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../admin.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes={},requests=[],alerts=[];let mode='ok',confirmResult=true,release;
function node(id){return nodes[id] ||= {value:'',textContent:'',innerHTML:'',disabled:false,events:{},addEventListener(n,f){this.events[n]=f},checkValidity(){return this.value.includes('@')},reportValidity(){}}}
node('adminKey').value='test-key';node('workerUrl').value='https://untrusted.invalid';
const ctx=vm.createContext({document:{getElementById:node},console,Set,Date,JSON,Number,String,Math,crypto:require('node:crypto').webcrypto,localStorage:{},location:{reload(){}},alert:s=>alerts.push(s),confirm:()=>confirmResult,
 fetch:async(url,opts)=>{requests.push({url,opts});if(mode==='wait')await new Promise(r=>release=r);return {ok:mode!=='forbidden',status:mode==='forbidden'?403:200,json:async()=>({ok:mode!=='forbidden',error:'FORBIDDEN'})}}});
vm.runInContext(script,ctx);
vm.runInContext('loadUsers=async()=>{__USERS__=[{email:"user@example.com"}]}',ctx);
(async()=>{
 await ctx.disableUser('user@example.com',true);
 assert.equal(requests[0].url,'https://api.calcioreport.com/admin/disable');assert.deepEqual(JSON.parse(requests[0].opts.body),{email:'user@example.com',disabled:true});assert.equal(requests[0].opts.headers['x-admin-key'],'test-key');
 node('reenableEmail').value='User@Example.com';node('adminKey').value='';await node('btnReenable').events.click();assert.equal(requests.length,1);
 node('adminKey').value='test-key';confirmResult=false;await node('btnReenable').events.click();assert.equal(requests.length,1);
 confirmResult=true;mode='wait';const pending=node('btnReenable').events.click();await node('btnReenable').events.click();assert.equal(requests.length,2);release();await pending;
 assert.deepEqual(JSON.parse(requests[1].opts.body),{email:'user@example.com',disabled:false});assert.ok(alerts.at(-1).includes('Accesso riabilitato'));
 mode='ok';await ctx.disableUser('unknown@example.com',false);assert.ok(alerts.at(-1).includes('non verificata'));
 mode='forbidden';await ctx.disableUser('user@example.com',false);assert.ok(alerts.at(-1).includes('FORBIDDEN'));
 node('btnLock').events.click();assert.equal(node('adminKey').value,'');assert.equal(node('output').textContent,'');
 assert.ok(html.includes('name="viewport"'));assert.ok(html.includes('td::before'));assert.ok(!/localStorage\.setItem\([^,]+,\s*(?:key|adminKey)\s*\)/.test(script));
 console.log('PASS admin access: fixed API origin, authenticated block/unblock, missing key, cancel, duplicate click, unknown user, forbidden, logout. No real users modified.');
})().catch(e=>{console.error(e);process.exitCode=1});
