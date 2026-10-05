import test from 'node:test'
import assert from 'node:assert/strict'
import {createSearcher,chooseFormat} from '../lib/search.mjs'
import {normalizeConfig} from '../lib/config.mjs'
import {handleCommand,deliverResult} from '../lib/commands.mjs'

const results=[{title:'Example source',snippet:'Acquired content',url:'https://example.org/source'}]
const sample={query:'测试',searchedAt:'2026-01-01T00:00:00Z',searchUrl:'https://cn.bing.com/search?q=test',results,format:'text'}
const config=normalizeConfig({cooldownMs:0})
const image=b=>({type:'image',bytes:b.length})
test('query is encoded and every call fetches again; shell-like text is inert',async()=>{
  let urls=[]
  const s=createSearcher({config,fetchImpl:async(url,options)=>{urls.push(url);assert.equal(options.cache,'no-store');return new Response('<html>results</html>')},parse:async input=>{assert.equal(input.html,'<html>results</html>');return {results}}})
  const query='a & $(touch xyz); `cmd` /路径'
  await s.search(query);await s.search(query)
  assert.equal(urls.length,2);assert.equal(new URL(urls[0]).searchParams.get('q'),query)
})
test('one in-flight request; gate is released after engine error',async()=>{
  let release
  const s=createSearcher({config,fetchImpl:()=>new Promise(r=>release=r),parse:async()=>({results})})
  const first=s.search('first');await assert.rejects(s.search('second'),/其他搜索/)
  release(new Response('busy',{status:429}));await assert.rejects(first,/429/)
  const next=s.search('next');release(new Response('ok'));assert((await next).ok)
})
test('provider restriction or empty parsing is reported, never invented',async()=>{
  const s=createSearcher({config,fetchImpl:async()=>new Response('captcha'),parse:async()=>({results:[]})})
  await assert.rejects(s.search('x'),/验证码/)
  await assert.rejects(s.search('x'.repeat(241)),/240/)
})
test('redirect is limited to Bing and oversized HTML is rejected',async()=>{
  const bad=createSearcher({config,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})})
  await assert.rejects(bad.search('x'),/不支持/)
  const large=createSearcher({config,fetchImpl:async()=>new Response('x'.repeat(3000001))})
  await assert.rejects(large.search('x'),/过大/)
})
test('cancellation is passed through and cannot deliver a late result',async()=>{
  const controller=new AbortController()
  const s=createSearcher({config,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))})
  const promise=s.search('x','text',{signal:controller.signal});controller.abort()
  await assert.rejects(promise,/取消/)
})
test('explicit format wins over market auto-format and invalid config fails clearly',()=>{
  assert.equal(chooseFormat('股票行情'),'image');assert.equal(chooseFormat('股票行情','text'),'text');assert.equal(chooseFormat('简单问题'),'text')
  assert.throws(()=>normalizeConfig({timeoutMs:50000}),/范围/)
  assert.throws(()=>normalizeConfig({pythonPath:'python\ncommand'}),/无效/)
})
test('both command prefixes work; private replies do not quote, groups quote',async()=>{
  const sent=[],searcher={search:async q=>({...sample,query:q})}
  for(const [msg,isGroup] of [['#搜文 问题',false],['/搜文 问题',true]]){
    assert(await handleCommand({msg,isGroup,user_id:msg,reply:async(m,quote)=>sent.push({m,quote})},{searcher,config,image}))
  }
  assert.equal(sent[0].quote,false);assert.equal(sent[1].quote,true)
  assert(sent[0].m.includes('搜索时间')&&sent[0].m.includes(results[0].url))
})
test('owner restriction and diagnosis cannot be bypassed by ordinary users',async()=>{
  let calls=0,replies=0
  const args={config:{...config,masterOnly:true},searcher:{search:async()=>{calls++;return sample}},image,diagnose:async()=>{calls++;return {}}}
  const e={msg:'#搜文 test',isMaster:false,reply:async()=>replies++}
  assert(await handleCommand(e,args));assert.equal(calls,0);assert.equal(replies,0)
  await handleCommand({...e,msg:'#搜索诊断'},{...args,config});assert.equal(calls,0)
})
test('cooldown prevents repeated fetch and unrelated messages do not trigger',async()=>{
  let calls=0;const args={config:{...config,cooldownMs:5000},searcher:{search:async()=>{calls++;return sample}},image,now:()=>10000}
  const e={msg:'#搜文 x',user_id:'cooldown-test',reply:async()=>{}}
  await handleCommand(e,args);await handleCommand(e,args);assert.equal(calls,1)
  assert.equal(await handleCommand({...e,msg:'ordinary chat'},args),false)
})
test('missing image dependency or framework segment falls back to text',async()=>{
  const sent=[],e={isGroup:false,reply:async m=>sent.push(m)}
  await deliverResult(e,{...sample,format:'image',imageUnavailable:true},{config,image})
  assert(sent[0].includes('已改为文字')&&sent[0].includes(results[0].url))
  await deliverResult(e,{...sample,format:'image',imageBase64:Buffer.from('jpeg').toString('base64')},{config,image:()=>{throw Error('missing')}})
  assert(sent[1].includes('改为文字'))
  await deliverResult(e,{...sample,format:'image',imageBase64:Buffer.from('jpeg').toString('base64')},{config,image})
  assert.equal(sent[2][1].type,'image')
})

test('default config allows non-owner text and image searches with both prefixes',async()=>{
  assert.equal(config.masterOnly,false)
  const sent=[];let calls=0
  const searcher={search:async(q,format)=>{calls++;return {...sample,query:q,format,imageBase64:format==='image'?Buffer.from('jpeg').toString('base64'):undefined}}}
  for(const msg of ['#搜文 测试','/搜图 测试']){
    await handleCommand({msg,isMaster:false,isGroup:true,user_id:msg,reply:async m=>sent.push(m)},{searcher,config,image})
  }
  assert.equal(calls,2);assert.equal(sent.length,2)
  assert(sent[0].includes(results[0].url));assert(sent[1].some(x=>x?.type==='image'))
})

test('framework send failure is never reported as delivered',async()=>{
  for(const outcome of [false,{error:'send refused'}]){
    const e={reply:async()=>outcome,isGroup:true}
    await assert.rejects(deliverResult(e,sample,{config,image}),/发送失败/)
    await assert.rejects(deliverResult(e,{...sample,format:'image',imageBase64:'aGVsbG8='},{config,image}),/发送失败/)
    await assert.rejects(deliverResult(e,{...sample,format:'image',imageBase64:'aGVsbG8='},{config,image:()=>{throw Error('missing image adapter')}}),/发送失败/)
  }
})
test('delivery preserves message receipt for legacy image-sent detection',async()=>{
  const receipt={message_id:'fake-offline-id',time:123}
  const delivered=await deliverResult({reply:async()=>receipt},{...sample,format:'image',imageBase64:'aGVsbG8='},{config,image})
  assert.equal(delivered.message_id,receipt.message_id);assert.equal(delivered.delivered,true);assert.equal(delivered.format,'image');assert.equal(delivered.receipt,receipt)
})
