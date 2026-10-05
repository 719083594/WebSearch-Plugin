import test from 'node:test'
import assert from 'node:assert/strict'
import {createWebSearch, normalizeConfig,readConfig} from '../api.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const config={provider:'endpoint',endpoint:'http://search.example.test:3080',secret:'test-only-not-a-live-secret',cooldownMs:0}
const result={ok:true,searchedAt:'2026-01-01T00:00:00Z',engine:'Bing',results:[{title:'Source',snippet:'Returned snippet',url:'https://example.org/source'}],answerText:'Service answer',imageBase64:Buffer.from([255,216,255,224]).toString('base64')}
test('optional endpoint uses authenticated bounded POST and shared format/gate',async()=>{
  let calls=0
  const service=createWebSearch({config,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,config.endpoint+'/search');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers['x-search-secret'],config.secret);assert.deepEqual(JSON.parse(options.body),{query:'行情',image:true})
    return new Response(JSON.stringify(result))
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
  for(const body of [{ok:false},{...result,results:[]},{...result,searchedAt:'invalid'},{...result,results:[{title:'Bad',snippet:'Unsafe',url:'javascript:alert(1)'}]}]){
    const service=createWebSearch({config,fetchImpl:async()=>new Response(JSON.stringify(body))})
    await assert.rejects(service.search('query'))
  }
})
test('endpoint shares cancellation and one-request gate, releases after failure',async()=>{
  let release
  const service=createWebSearch({config,fetchImpl:()=>new Promise(resolve=>release=resolve)})
  const first=service.search('one');await assert.rejects(service.search('two'),/其他搜索/)
  release(new Response('bad'));await assert.rejects(first,/JSON/)
  const next=service.search('three');release(new Response(JSON.stringify(result)));assert((await next).ok)
  const controller=new AbortController();controller.abort();await assert.rejects(service.search('four','text',{signal:controller.signal}),/取消/)
})
test('endpoint diagnostics tolerate absent local Python without exposing endpoint or secret',async()=>{
  const service=createWebSearch({config,parse:async()=>{throw Error('Python unavailable')},fetchImpl:async()=>new Response(JSON.stringify(result))})
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
