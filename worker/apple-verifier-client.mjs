const hex = bytes => [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const encode = text => new TextEncoder().encode(text);

// Server-owned HTTPS URL + dedicated verifier secret. Do not reuse the football
// relay key, accept a URL from the caller, or follow redirects with credentials.
export async function fetchReconciledAppleTransaction(config, signedPayload, kind='transaction') {
  let url;
  try {url=new URL(config.url);} catch {throw Error('APPLE_VERIFIER_CONFIG_INVALID');}
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash ||
      url.pathname!=='/' || !/^[0-9a-f]{64}$/i.test(config.secret || '') ||
      !['transaction','notification'].includes(kind)) throw Error('APPLE_VERIFIER_CONFIG_INVALID');
  if (typeof signedPayload!=='string' || encode(signedPayload).length>128*1024) throw Error('APPLE_SIGNED_DATA_INVALID');
  const path=`/v1/${kind}`;
  const body=JSON.stringify({signedPayload});
  const timestamp=String(Date.now());
  const digest=hex(await crypto.subtle.digest('SHA-256',encode(body)));
  const key=await crypto.subtle.importKey('raw',encode(config.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,encode(`${timestamp}\nPOST\n${path}\n${digest}`)));
  // Cloudflare supports manual/follow only. Manual keeps signed requests from
  // following redirects; the response.ok guard below rejects every 3xx.
  const response=await fetch(new URL(path,url),{method:'POST',redirect:'manual',
    headers:{'content-type':'application/json','x-cr-timestamp':timestamp,'x-cr-signature':signature},
    body,signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('APPLE_VERIFICATION_UNAVAILABLE');
  // Bound a compromised/misconfigured upstream's response too.
  const reader=response.body?.getReader();
  if (!reader) throw Error('APPLE_VERIFIER_RESPONSE_INVALID');
  let text='';let bytes=0;const decoder=new TextDecoder();
  try {
    for (;;) {
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.length;if(bytes>128*1024)throw Error('APPLE_VERIFIER_RESPONSE_INVALID');
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
  } finally {await reader.cancel();}
  const result=JSON.parse(text);
  if (kind==='notification' && result?.ignored===true && result.transaction===null) return null;
  if (!result?.transaction || typeof result.transaction!=='object' || Array.isArray(result.transaction)) {
    throw Error('APPLE_VERIFIER_RESPONSE_INVALID');
  }
  return result.transaction;
}
