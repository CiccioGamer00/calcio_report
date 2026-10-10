import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/features/accountDeletion.js', import.meta.url),'utf8');
function harness(fetch) {
  const ids = ['btnOpenDeleteAccount','deleteAccountModal','deleteAccountForm','deleteAccountPassword',
    'deleteAccountConfirmation','deleteAccountMessage','btnConfirmDeleteAccount','btnCancelDeleteAccount'];
  const elements = Object.fromEntries(ids.map(id=>[id,{ value:'', textContent:'', disabled:false,
    events:{}, classList:{add(){},remove(){}}, focus(){}, addEventListener(type,cb){this.events[type]=cb;},
    reset(){ elements.deleteAccountPassword.value='';elements.deleteAccountConfirmation.value=''; } }]));
  let logout = 0;
  const context = vm.createContext({ document:{getElementById:id=>elements[id]},window:{API_CONFIG:{baseUrl:'https://worker.test'}},
    fetch, getToken:()=> 'test-token',forceLogout:()=>logout++,authErrorMessage:res=>res.status===429?'Troppi tentativi':res.json.message||'Errore' });
  vm.runInContext(source+'\nsetupAccountDeletion();',context);
  const submit = () => elements.deleteAccountForm.events.submit({preventDefault(){}});
  const fill = () => {elements.deleteAccountPassword.value='test-password';elements.deleteAccountConfirmation.value='ELIMINA';};
  return {elements,submit,fill,logout:()=>logout};
}
test('cancel never calls server; invalid confirmation is rejected', async()=> {
  let calls=0; const h=harness(()=>calls++);
  h.fill(); h.elements.btnCancelDeleteAccount.events.click();
  await h.submit(); assert.equal(calls,0);assert.equal(h.elements.deleteAccountPassword.value,'');
});
test('double click sends exactly one authenticated request and logout happens only after success', async()=> {
  let calls=0, resolve; const h=harness(async(url,options)=>{
    calls++;assert.equal(url,'https://worker.test/auth/delete');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body),{password:'test-password',confirmation:'ELIMINA'});
    return new Promise(r=>resolve=r);
  });
  h.fill();const first=h.submit();await h.submit();assert.equal(calls,1);assert.equal(h.logout(),0);
  resolve({ok:true,json:async()=>({ok:true})});await first;
  assert.equal(h.logout(),1);assert.equal(h.elements.deleteAccountPassword.value,'');
});
test('server and network failures preserve login, erase password and permit retry', async()=> {
  for (const behavior of ['rate','wrong','network','malformed']) {
    const h=harness(async()=>{
      if(behavior==='network')throw new Error('offline');
      return {ok:behavior==='malformed',status:behavior==='rate'?429:403,json:async()=>({message:'Password errata'})};
    });
    h.fill();await h.submit();assert.equal(h.logout(),0);
    assert.equal(h.elements.deleteAccountPassword.value,'');
    assert.equal(h.elements.btnConfirmDeleteAccount.disabled,false);
    assert.ok(h.elements.deleteAccountMessage.textContent);
  }
});
