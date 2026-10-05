import test from 'node:test'
import assert from 'node:assert/strict'
import {createWebSearch, normalizeConfig,readConfig} from '../api.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const config={provider:'endpoint',endpoint:'http://search.example.test:3080',secret:'test-only-not-a-live-secret',cooldownMs:0}
const result={ok:true,searchedAt:'2026-01-01T00:00:00Z',engine:'Bing',results:[{title:'Source',snippet:'Returned snippet',url:'https://example.org/source'}],answerText:'Service answer',imageBase64:Buffer.from([255,216,255,224]).toString('base64')}
const payload=(query,extra={})=>({...result,query,searchUrl:'https://cn.bing.com/search?q='+encodeURIComponent(query),...extra})
test('optional endpoint uses authenticated bounded POST and shared format/gate',async()=>{
  let calls=0
  const service=createWebSearch({config,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,config.endpoint+'/search');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers['x-search-secret'],config.secret);assert.deepEqual(JSON.parse(options.body),{query:'行情',image:true})
    return new Response(JSON.stringify(payload('行情')))
  }})
  const returned=await service.search('行情')
  assert.equal(returned.format,'image');assert.equal(returned.imageType,'jpeg');assert.equal(returned.answerText,'Service answer');assert.equal(returned.query,'行情');assert.equal(calls,1)
})
test('endpoint never forwards auth to redirects and does not echo private config on errors',async()=>{
  const service=createWebSearch({config,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://other.example.test'}})})
  await assert.rejects(service.search('query'),error=>/302/.test(error.message)&&!error.message.includes(config.secret))
  assert.throws(()=>normalizeConfig({...config,secret:''}),/secret/)
  assert.throws(()=>normalizeConfig({...config,endpoint:'http://user:pass@host'}),/endpoint/)
})
test('malformed or untrusted service output fails without inventing sources',async()=>{
  for(const body of [{ok:false},payload('query',{results:[]}),payload('query',{searchedAt:'invalid'}),payload('query',{results:[{title:'Bad',snippet:'Unsafe',url:'javascript:alert(1)'}]})]){
    const service=createWebSearch({config,fetchImpl:async()=>new Response(JSON.stringify(body))})
    await assert.rejects(service.search('query'))
  }
})
test('endpoint shares cancellation and one-request gate, releases after failure',async()=>{
  let release
  const service=createWebSearch({config,fetchImpl:()=>new Promise(resolve=>release=resolve)})
  const first=service.search('one');await assert.rejects(service.search('two'),/其他搜索/)
  release(new Response('bad'));await assert.rejects(first,/JSON/)
  const next=service.search('three');release(new Response(JSON.stringify(payload('three'))));assert((await next).ok)
  const controller=new AbortController();controller.abort();await assert.rejects(service.search('four','text',{signal:controller.signal}),/取消/)
})
test('endpoint diagnostics tolerate absent local Python without exposing endpoint or secret',async()=>{
  const service=createWebSearch({config,parse:async()=>{throw Error('Python unavailable')},fetchImpl:async(url,options)=>new Response(JSON.stringify(payload(JSON.parse(options.body).query)))})
  const diagnosis=await service.diagnose();assert.equal(diagnosis.provider,'endpoint');assert.equal(diagnosis.networkChecked,false)
  assert(!JSON.stringify(diagnosis).includes(config.secret));assert(!JSON.stringify(diagnosis).includes(config.endpoint))
  assert.equal((await service.diagnose({network:true})).resultCount,1)
})
test('invalid local JSON never echoes a private secret in parser errors',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'websearch-private-config-'))
  try{const file=path.join(directory,'plugin.json');fs.writeFileSync(file,'{"secret":"'+config.secret+'", invalid}')
    assert.throws(()=>readConfig(file),error=>/JSON/.test(error.message)&&!error.message.includes(config.secret))
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
})
test('endpoint preserves actual source URL and query provenance instead of relabeling',async()=>{
  const query='中国有哪些种类的猫',searchUrl='https://www.so.com/s?q='+encodeURIComponent(query)+'&src=test'
  const response=payload(query,{engine:'360',searchUrl,results:[{title:'中国猫的种类',snippet:'狸花猫与山东狮子猫',url:'https://example.org/cats'}],provenance:{requestedQuery:query,effectiveQuery:query,attemptedEngines:['360']}})
  const service=createWebSearch({config,fetchImpl:async()=>new Response(JSON.stringify(response))})
  const received=await service.search(query)
  assert.equal(received.searchUrl,searchUrl);assert.equal(received.engine,'360');assert.equal(received.provenance.effectiveQuery,query)
})
test('endpoint rejects changed query, actual URL or engine rather than hiding them',async()=>{
  const query='中国有哪些种类的猫'
  for(const response of [payload('中国'),payload(query,{searchUrl:'https://cn.bing.com/search?q=中国'}),payload(query,{engine:'Sogou'}),payload(query,{provenance:{effectiveQuery:'中国'}}),payload(query,{searchUrl:'https://unknown.example/search?q='+encodeURIComponent(query)})]){
    const service=createWebSearch({config,fetchImpl:async()=>new Response(JSON.stringify(response))})
    await assert.rejects(service.search(query))
  }
})
