import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createWebSearch,runDocument,normalizeConfig,formatText} from '../api.mjs'
import {engineOrder,searchAddress} from '../lib/engines.mjs'
import {assessRelevance} from '../lib/relevance.mjs'

const cats=[{title:'中国猫的种类',snippet:'中国本土猫包括狸花猫、山东狮子猫、四川简州猫。',url:'https://example.org/cats'}]
const general=[{title:'中国 - 百科',snippet:'中国是东亚的国家，幅员辽阔，首都北京。',url:'https://example.org/china'}]
const query='中国有哪些种类的猫'

test('auto defaults to bounded language-aware order; legacy provider selections stay explicit',()=>{
  assert.equal(normalizeConfig().provider,'auto');assert.deepEqual(engineOrder(query),['360','sogou']);assert.deepEqual(engineOrder('Node.js documentation'),['bing','360'])
  for(const provider of ['bing','360','sogou'])assert.deepEqual(engineOrder(query,provider),[provider])
  assert.equal(new URL(searchAddress('sogou',query)).searchParams.get('query'),query)
})
test('wrong-topic check rejects only-first-term matches across subjects, preserves uncertainty',()=>{
  for(const subject of ['猫','鸡','植物','水果','鸟'])assert.equal(assessRelevance('中国有哪些种类的'+subject,general).status,'unrelated')
  assert.equal(assessRelevance(query,cats).status,'relevant')
  assert.notEqual(assessRelevance(query,[{title:'Native feline varieties',snippet:'Li Hua and other domestic breeds.'}]).status,'unrelated')
  assert.notEqual(assessRelevance('美国医疗保险',[{title:'美国医保政策',snippet:'健康保障计划。'}]).status,'unrelated')
  assert.notEqual(assessRelevance('cats',[{title:'Feline varieties',snippet:'Domestic breeds.'}]).status,'unrelated')
  assert.equal(assessRelevance(query,general,'联网搜索：'+query+'\n中国是东亚国家。').status,'unrelated')
})
test('a full formatted service answer is not duplicated, while extra summary survives',()=>{
  const result={query,engine:'360',searchUrl:searchAddress('360',query),searchedAt:'2026-01-01T00:00:00Z',results:cats}
  const original=formatText(result)
  assert.equal(formatText({...result,answerText:original}),original)
  const extra=formatText({...result,answerText:'实际额外摘要'})
  const received=formatText({...result,answerText:extra},{timeZone:'UTC'})
  assert.equal(received.split(cats[0].url).length,2);assert.equal(received.split('实际额外摘要').length,2);assert.equal(received.split('联网搜索：').length,2)
  assert(received.includes('（UTC）'));assert(!received.includes('（Asia/Shanghai）'))
})
test('unrelated nonempty results cause one fallback with original query intact',async()=>{
  const requests=[]
  const service=createWebSearch({config:{},fetchImpl:async url=>{requests.push(url);return new Response('inert')},parse:async input=>({results:input.engine==='360'?general:cats,effectiveQuery:input.query})})
  const result=await service.search(query)
  assert.equal(result.engine,'Sogou');assert.equal(result.query,query);assert.equal(result.effectiveQuery,query);assert.deepEqual(result.attemptedEngines,['360','Sogou']);assert.equal(requests.length,2)
  assert.equal(new URL(requests[0]).searchParams.get('q'),query);assert.equal(new URL(requests[1]).searchParams.get('query'),query)
  assert.equal(result.provenance.attempts[0].ok,false);assert.equal(result.provenance.relevance.status,'relevant')
})
test('two failed providers return explicit failure without inventing a third attempt',async()=>{
  let requests=0
  const service=createWebSearch({config:{},fetchImpl:async()=>{requests++;return new Response('inert')},parse:async()=>({results:general})})
  await assert.rejects(service.search(query),/缺少问题主题/);assert.equal(requests,2)
})
test('a captcha result page cannot be accepted; next provider can recover',async()=>{
  const service=createWebSearch({config:{},fetchImpl:async()=>new Response('inert'),parse:async input=>input.engine==='360'?{blocked:true,results:cats}:{results:cats,effectiveQuery:query}})
  const result=await service.search(query);assert.equal(result.engine,'Sogou');assert.equal(result.provenance.attempts[0].ok,false)
})
test('Bing redirects and response URLs cannot drop or change complete q',async()=>{
  const redirected=createWebSearch({config:{provider:'bing'},fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://www.bing.com/search?q='+encodeURIComponent('中国')}})})
  await assert.rejects(redirected.search(query),/完整关键词/)
  const response=new Response('inert');Object.defineProperty(response,'url',{value:'https://www.bing.com/search?q=中国'})
  const final=createWebSearch({config:{provider:'bing'},fetchImpl:async()=>response,parse:async()=>({results:cats})})
  await assert.rejects(final.search(query),/完整关键词/)
})
test('same-query Bing host redirect remains valid and reports actual URL',async()=>{
  let count=0
  const target='https://www.bing.com/search?q='+encodeURIComponent(query)+'&setlang=zh'
  const service=createWebSearch({config:{provider:'bing'},fetchImpl:async()=>++count===1?new Response(null,{status:302,headers:{location:target}}):new Response('inert'),parse:async()=>({results:cats,effectiveQuery:query})})
  const result=await service.search(query);assert.equal(result.searchUrl,target);assert.equal(result.queryVerified,true)
})
test('mismatched actual page searchbox is rejected instead of relabeled',async()=>{
  const service=createWebSearch({config:{provider:'360'},fetchImpl:async()=>new Response('inert'),parse:async()=>({results:cats,effectiveQuery:'中国'})})
  await assert.rejects(service.search(query),/搜索框/)
})
test('a slow first provider consumes its own budget and falls back within global deadline',async()=>{
  const started=Date.now();let calls=0
  const service=createWebSearch({config:{sourceTimeoutMs:1000,timeoutMs:4000},fetchImpl:async()=>++calls===1?new Promise(()=>{}):new Response('inert'),parse:async()=>({results:cats})})
  const result=await service.search(query);assert.equal(result.engine,'Sogou');assert.equal(calls,2);assert(Date.now()-started<2500)
})
test('global cancellation stops fallback and releases the request gate',async()=>{
  let calls=0
  const service=createWebSearch({config:{timeoutMs:1000},fetchImpl:async()=>++calls===1?new Promise(()=>{}):new Response('inert'),parse:async()=>({results:cats})})
  await assert.rejects(service.search(query),/取消|上限/);assert.equal(calls,1)
  assert((await service.search(query)).ok)
})
test('actual Chinese Node-to-Python pipe stays UTF-8 even with a legacy inherited encoding',async t=>{
  const python=process.env.WEBSEARCH_TEST_PYTHON||(process.platform==='win32'?'python':'python3')
  if(spawnSync(python,['--version']).status!==0){t.skip('Python unavailable');return}
  const original=process.env.PYTHONIOENCODING;process.env.PYTHONIOENCODING='gbk'
  try{
    const html='<input id="sb_form_q" value="'+query+'"><li class="b_algo"><h2><a href="https://example.org/cats">中国猫的种类</a></h2><p>狸花猫与山东狮子猫。</p></li>'
    const parsed=await runDocument({html,query,engine:'bing',searchUrl:searchAddress('bing',query),searchedAt:'2026-01-01T00:00:00Z'},normalizeConfig({pythonPath:python}))
    assert.equal(parsed.effectiveQuery,query);assert.equal(parsed.results[0].title,'中国猫的种类');assert(parsed.results[0].snippet.includes('狸花猫'))
  }finally{if(original===undefined)delete process.env.PYTHONIOENCODING;else process.env.PYTHONIOENCODING=original}
})
