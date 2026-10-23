const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../admin.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const storage=new Map(); let requests=[],mode='ok',resolveFetch;
function context(){
 const nodes={workerUrl:{value:'https://api.calcioreport.com'},adminKey:{value:'test-key'}};
 const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,Set,Date,JSON,Number,String,Math,
 document:{getElementById:id=>nodes[id]||(nodes[id]={addEventListener(){}})},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 alert(){},confirm:()=>true,fetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));if(mode==='lost')throw Error('lost');if(mode==='wait')await new Promise(r=>resolveFetch=r);return {ok:true,json:async()=>({ok:true})}}});
 vm.runInContext(script,ctx);vm.runInContext('loadUsers = async () => {}',ctx);return ctx;
}
(async()=>{
 let c=context();mode='wait';const first=c.adjustDays('test@example.com',30);await c.adjustDays('test@example.com',30);assert.equal(requests.length,1);resolveFetch();await first;assert.equal(storage.size,0);
 mode='lost';await c.adjustDays('test@example.com',30);const id=requests[1].requestId;assert.ok(id);assert.equal(storage.size,1);
 await c.adjustDays('test@example.com',-30);assert.equal(requests.length,2);
 c=context();await c.adjustDays('test@example.com',30);assert.equal(requests.length,2);assert.ok([...storage.values()][0].includes(id));
 c.resolveAdjustment('test@example.com');assert.equal(storage.size,0);mode='ok';await c.adjustDays('test@example.com',30);assert.notEqual(requests[2].requestId,id);
 c.localStorage.setItem=()=>{throw Error('storage blocked')};await c.adjustDays('other@example.com',30);assert.equal(requests.length,3);
 assert.equal(c.escapeHtml('<"&'), '&lt;&quot;&amp;');
 console.log('PASS: concurrent clicks, successful completion, lost response, opposite adjustment blocked, reload persistence, explicit resolution, new operation ID, storage failure, HTML escaping. No remote calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
