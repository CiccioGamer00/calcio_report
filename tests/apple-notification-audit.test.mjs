import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAppleHandler} from '../worker/apple-handler.mjs';

const db=owner=>({prepare:()=>({bind:()=>({first:async()=>owner})})});
for(const scenario of ['review','test','ignored','retired','unknown','verify_error','delivery_error','logger_error']){
test('notification audit: '+scenario,async()=>{
 const logs=[];let deliveries=0;
 const reviewOwner={account_id:'review-owner',retired_at:scenario==='retired'?1:null};
 const env={APPLE_SANDBOX_ENABLED:'1',APPLE_DEPLOYMENT:'test',APPLE_ENVIRONMENT:'Sandbox',
 APPLE_REVIEW_NOTIFICATIONS_ENABLED:'1',APP_REVIEW_ACCOUNT_ID:'review-owner',
 DB:db(scenario==='test'?{account_id:'test-owner',retired_at:null}:null),
 APP_REVIEW_DB:db(['test','unknown'].includes(scenario)?null:reviewOwner),
 APPLE_VERIFIER_SECRET:'secret-must-not-be-logged'};
 const transaction={transactionId:'123456',appAccountToken:'private-token',environment:'Sandbox'};
 const handler=createAppleHandler({},'test',{
 reconcile:async()=>{if(scenario==='verify_error')throw Error(env.APPLE_VERIFIER_SECRET);return scenario==='ignored'?null:transaction;},
 deliver:async()=>{deliveries++;if(scenario==='delivery_error')throw Error('private-delivery-detail');},
 logNotification:entry=>{if(scenario==='logger_error')throw Error('logger failed');logs.push(entry);}
 });
 const response=await handler.fetch(new Request('https://example.invalid/apple/notifications',{method:'POST',body:JSON.stringify({signedPayload:'private-signed-payload'})}),env,{});
 const failed=['unknown','verify_error','delivery_error'].includes(scenario);
 assert.equal(response.status,failed?503:200);
 if(scenario==='logger_error'){assert.equal(deliveries,1);return;}
 assert.equal(logs.length,1);
 assert.equal(logs[0].result,failed?'error':['ignored','retired'].includes(scenario)?'ignored':'processed');
 if(['review','test'].includes(scenario)){assert.equal(logs[0].database,scenario);assert.equal(logs[0].transactionId,'123456');assert.equal(deliveries,1);}
 if(scenario==='verify_error')assert.equal(logs[0].transactionId,undefined);
 if(scenario==='delivery_error')assert.equal(logs[0].stage,'delivery');
 assert.doesNotMatch(JSON.stringify(logs),/private-|secret-must|review-owner|test-owner/);
});
}
