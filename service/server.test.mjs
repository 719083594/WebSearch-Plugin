import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {once} from 'node:events'
import {createSearchServer} from './server.mjs'

const secret='private-test-secret'
const sample=Object.freeze({ok:true,query:'天气',results:[{title:'天气来源',snippet:'当前网页搜索摘要',url:'https://example.org/weather'}],engine:'360',searchUrl:'https://www.so.com/s?q=%E5%A4%A9%E6%B0%94',searchedAt:'2026-10-06T02:00:00.000Z',requestedQuery:'天气',effectiveQuery:'天气',queryVerified:true,attemptedEngines:['360'],cached:true})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
async function fixture(t,search=async()=>sample){
  const server=createSearchServer({secret,searchService:{config:{timeZone:'Asia/Shanghai'},search}})
  assert.equal(server.listening,false)
  server.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(()=>server.shutdown())
  return {server,base:'http://127.0.0.1:'+server.address().port}
}
const send=(base,body,headers={})=>fetch(base+'/search',{method:'POST',headers:{'content-type':'application/json','x-search-secret':secret,...headers},body:typeof body==='string'?body:JSON.stringify(body)})

test('factory requires explicit secret and never binds on import/create',()=>{
  for(const invalid of ['',null,'secret\nheader'])assert.throws(()=>createSearchServer({secret:invalid,searchService:{search:async()=>sample}}),/SEARCH_SECRET/)
})

test('unauthenticated health is limited; methods and authentication fail closed',async t=>{
  let calls=0
  const {base}=await fixture(t,async()=>{calls++;return sample})
  const health=await fetch(base+'/healthz');assert.deepEqual(await health.json(),{ok:true,busy:false,renderer:'web-result-card'})
  for(const headers of [{'x-search-secret':''},{'x-search-secret':'incorrect'}]){
    const response=await send(base,{query:'天气'},headers);assert.equal(response.status,401);await response.json()
  }
  const missing=await fetch(base+'/search',{method:'POST',body:'{"query":"天气"}'});assert.equal(missing.status,401);await missing.json()
  const get=await fetch(base+'/search');assert.equal(get.status,405);assert.equal(get.headers.get('allow'),'POST');await get.json()
  const postHealth=await fetch(base+'/healthz',{method:'POST'});assert.equal(postHealth.status,405);await postHealth.json()
  assert.equal(calls,0)
})

test('validates query, image and JSON before invoking search',async t=>{
  let calls=0
  const {base}=await fixture(t,async()=>{calls++;return sample})
  for(const body of [{query:''},{query:' '.repeat(20)},{query:'x'.repeat(241)},{query:22},{query:'天气',image:'yes'},[],null,'{']){
    const response=await send(base,body);assert.equal(response.status,400);assert.equal((await response.json()).ok,false)
  }
  assert.equal(calls,0)
})

test('4096 byte limit applies to content-length and streamed bodies',async t=>{
  let calls=0
  const {base}=await fixture(t,async()=>{calls++;return sample})
  const tooLarge=await send(base,{query:'天气',unused:'x'.repeat(4096)});assert.equal(tooLarge.status,413);await tooLarge.json()
  const streamed=await new Promise((resolve,reject)=>{
    const req=http.request(base+'/search',{method:'POST',headers:{'x-search-secret':secret,'content-type':'application/json'}},res=>{
      res.resume();res.once('end',()=>resolve(res.statusCode))
    })
    req.on('error',reject);req.write('{"query":"天气","unused":"');req.write('x'.repeat(4096));req.end('"}')
  })
  assert.equal(streamed,413);assert.equal(calls,0)
})

test('preserves real source metadata, image type and provenance without caching',async t=>{
  const imageBase64=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')
  let options
  const {base}=await fixture(t,async(query,format,settings)=>{
    options={query,format,settings};return {...sample,imageBase64,imageType:'png',renderer:'web-result-card'}
  })
  const response=await send(base,{query:'  天气  ',image:true});assert.equal(response.status,200)
  const result=await response.json()
  assert.equal(options.query,'天气');assert.equal(options.format,'image');assert.equal(options.settings.imageType,'png')
  for(const field of ['engine','searchUrl','searchedAt','requestedQuery','effectiveQuery','queryVerified','attemptedEngines'])assert.deepEqual(result[field],sample[field])
  assert.equal(result.cached,false);assert.equal(result.imageType,'png');assert.equal(result.imageBase64,imageBase64)
  assert.ok(result.answerText.includes(sample.results[0].url));assert.equal(typeof result.durationMs,'number')
  assert.equal(response.headers.get('cache-control'),'no-store')
})

test('one global in-flight request; health reports busy and second search gets 429',async t=>{
  const started=deferred(),release=deferred();let calls=0
  const {base}=await fixture(t,async()=>{calls++;started.resolve();await release.promise;return sample})
  const first=send(base,{query:'天气'});await started.promise
  const health=await fetch(base+'/healthz');assert.equal((await health.json()).busy,true)
  const second=await send(base,{query:'新闻'});assert.equal(second.status,429);await second.json()
  assert.equal(calls,1);release.resolve()
  const firstResponse=await first;assert.equal(firstResponse.status,200);await firstResponse.json()
  const after=await fetch(base+'/healthz');assert.equal((await after.json()).busy,false)
})

test('client disconnect cancels the core search',async t=>{
  const started=deferred(),cancelled=deferred()
  const {base}=await fixture(t,async(query,format,{signal})=>{
    started.resolve()
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{cancelled.resolve();reject(new Error('cancelled'))},{once:true}))
    return sample
  })
  const req=http.request(base+'/search',{method:'POST',headers:{'x-search-secret':secret,'content-type':'application/json'}})
  req.on('error',()=>{});req.end(JSON.stringify({query:'天气'}));await started.promise;req.destroy()
  let timeout
  try{await Promise.race([cancelled.promise,new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('abort not received')),1000)})])}
  finally{clearTimeout(timeout)}
})

test('search failure exposes no secret, endpoint or internal stack',async t=>{
  const {base}=await fixture(t,async()=>{throw new Error('credentials '+secret+' endpoint http://internal.private/token stack trace')})
  const response=await send(base,{query:'天气'});assert.equal(response.status,502)
  const text=await response.text();assert.ok(!text.includes(secret));assert.ok(!text.includes('internal.private'));assert.ok(!text.includes('stack'))
  assert.deepEqual(JSON.parse(text),{ok:false,error:'搜索暂时不可用，请稍后重试。'})
})

test('shutdown aborts in-flight work and closes the listener',async t=>{
  const started=deferred(),cancelled=deferred()
  const {server,base}=await fixture(t,async(query,format,{signal})=>{
    started.resolve();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{cancelled.resolve();reject(new Error('abort'))},{once:true}));return sample
  })
  const request=send(base,{query:'天气'});await started.promise
  await server.shutdown();await cancelled.promise
  const response=await request;assert.equal(response.status,503);await response.json();assert.equal(server.listening,false)
})
