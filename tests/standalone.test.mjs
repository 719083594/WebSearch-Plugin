import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createWebSearch, version} from '../api.mjs'
import {runCli} from '../cli.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const sample={ok:true,query:'例子',searchedAt:'2026-01-01T00:00:00Z',searchUrl:'https://cn.bing.com/search?q=x',results:[{title:'标题',snippet:'摘录',url:'https://example.org/source'}],format:'text'}

test('public root import is framework-free and portable from an unrelated cwd',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'websearch-import-'))
  try {
    const result=spawnSync(process.execPath,['--input-type=module','-e',`const api=await import(${JSON.stringify(pathToFileURL(path.join(root,'index.js')).href)}); if(api.version!==${JSON.stringify(version)}||typeof api.createWebSearch!=='function'||Object.keys(api.apps).length) process.exit(1)`],{cwd:temporary,encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
    const cli=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'--version'],{cwd:temporary,encoding:'utf8'})
    assert.equal(cli.status,0,cli.stderr);assert.equal(cli.stdout.trim(),version)
  } finally {await fs.rm(temporary,{recursive:true,force:true})}
})

test('public API uses config and cancellation without any bot events',async()=>{
  let parsed=0
  const service=createWebSearch({config:{cooldownMs:0},fetchImpl:async()=>new Response('<html>inert</html>'),parse:async input=>{parsed++;return {results:sample.results}}})
  assert.equal((await service.search('例子','text')).results[0].url,sample.results[0].url)
  const cancellation=new AbortController();cancellation.abort()
  await assert.rejects(service.search('例子','text',{signal:cancellation.signal}),/取消/)
  assert.equal(parsed,1)
})

function capture(service={config:{timeZone:'Asia/Shanghai'},search:async()=>sample,diagnose:async()=>({networkChecked:false})}) {
  let out='',err='',written=[]
  return {options:{stdout:v=>out+=v,stderr:v=>err+=v,writeFile:async(...v)=>written.push(v),createService:()=>service},read:()=>({out,err,written})}
}
test('CLI JSON is machine readable; text preserves sources',async()=>{
  const json=capture();assert.equal(await runCli(['search','例子'],json.options),0);assert.deepEqual(JSON.parse(json.read().out),sample);assert.equal(json.read().err,'')
  const text=capture();assert.equal(await runCli(['search','例子','--format','text'],text.options),0);assert(text.read().out.includes('https://example.org/source'))
})
test('CLI explicit PNG output writes bytes; missing renderer falls back to text',async()=>{
  const bytes=Buffer.from([137,80,78,71,13,10,26,10])
  const png=capture({config:{timeZone:'Asia/Shanghai'},search:async(query,format,options)=>{assert.equal(format,'image');assert.equal(options.imageType,'png');return {...sample,imageType:'png',imageBase64:bytes.toString('base64')}}})
  assert.equal(await runCli(['search','例子','--format','png','--output','example.png'],png.options),0)
  assert.deepEqual(png.read().written[0][1],bytes);assert.equal(png.read().out,'')
  const fallback=capture();assert.equal(await runCli(['search','例子','--format','png','--output','example.png'],fallback.options),0)
  assert.equal(fallback.read().written.length,0);assert(fallback.read().out.includes('https://example.org/source'));assert(fallback.read().err.includes('回退'))
})
test('CLI usage errors cannot make a network request',async()=>{
  const errors=capture({search:async()=>{throw new Error('must not reach transport')}})
  for(const args of [['search','词','--format','png'],['search','词','--format','xml'],['search','--config'],['search'],['search','词','--network']]) assert.equal(await runCli(args,errors.options),1)
  assert.equal(errors.read().out,'')
})
test('diagnosis is offline by default and network check is explicit',async()=>{
  let calls=0
  const service=createWebSearch({config:{},fetchImpl:async()=>{calls++;return new Response('html')},parse:async input=>input.check?{python:'3.12.0',imageReady:false}:{results:sample.results}})
  assert.equal((await service.diagnose()).networkChecked,false);assert.equal(calls,0)
  assert.equal((await service.diagnose({network:true})).resultCount,1);assert.equal(calls,1)
})

test('legacy Yunzai client retains deadline hook without putting it in the core',async()=>{
  const symbol=Symbol.for('qqbot.chatResilience'),original=globalThis[symbol]
  try {
    let calls=0;globalThis[symbol]={extendForSearch:()=>{calls++;return {expired:true}}}
    const client=await import('../search-client.mjs')
    await assert.rejects(client.browserSearch('query'),/等待上限/);assert.equal(calls,1)
    assert(client.formatSearchText(sample).includes(sample.results[0].url))
  } finally {if(original===undefined)delete globalThis[symbol];else globalThis[symbol]=original}
})

test('standalone installer preserves config; explicit Yunzai bridge loads actual adapter exports',async t=>{
  const python=process.env.WEBSEARCH_TEST_PYTHON||(process.platform==='win32'?'python':'python3')
  if(spawnSync(python,['--version']).status!==0){t.skip('Python unavailable; Linux CI covers installation');return}
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'websearch-install-'))
  const project=path.join(temporary,'bot','plugins','WebSearch-Plugin')
  try {
    await fs.mkdir(project,{recursive:true})
    for(const name of ['api.mjs','index.js','cli.mjs','lib','renderer','scripts','integrations'])await fs.cp(path.join(root,name),path.join(project,name),{recursive:true})
    const install=argv=>spawnSync(process.execPath,[path.join(project,'scripts','install.mjs'),...argv],{cwd:temporary,encoding:'utf8'})
    const first=install(['--python',python]);assert.equal(first.status,0,first.stderr)
    const original=await fs.readFile(path.join(project,'config','plugin.json'),'utf8')
    assert.equal(install([]).status,0)
    assert.equal(await fs.readFile(path.join(project,'config','plugin.json'),'utf8'),original)
    assert.notEqual(install(['--yunzai-bridge']).status,0)
    await fs.mkdir(path.join(temporary,'bot','lib','plugins'),{recursive:true})
    await fs.writeFile(path.join(temporary,'bot','package.json'),' {"type":"module"}')
    await fs.writeFile(path.join(temporary,'bot','lib','plugins','plugin.js'),'export default class Plugin {constructor(options){Object.assign(this,options)}}')
    const bridge=install(['--yunzai-bridge']);assert.equal(bridge.status,0,bridge.stderr)
    assert.equal(JSON.parse(await fs.readFile(path.join(project,'config','integration.json'),'utf8')).adapter,'yunzai')
    const imported=spawnSync(process.execPath,['--input-type=module','-e',`const {apps}=await import(${JSON.stringify(pathToFileURL(path.join(project,'index.js')).href)}); const p=new apps.WebSearch(); if(p.rule[0].permission!=='all'||typeof p.search!=='function')process.exit(1)`],{cwd:temporary,encoding:'utf8'})
    assert.equal(imported.status,0,imported.stderr)
    assert.equal(install(['--standalone']).status,0)
    assert.equal(JSON.parse(await fs.readFile(path.join(project,'config','integration.json'),'utf8')).adapter,'none')
  } finally {await fs.rm(temporary,{recursive:true,force:true})}
})
