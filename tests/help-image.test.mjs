import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCommand,help} from '../lib/commands.mjs';
import {helpTopics} from '../lib/help-content.mjs';

const config={masterOnly:false,cooldownMs:0};
test('fixed search help is delivered through injection without starting search',async()=>{
  const replies=[],calls=[];const e={msg:'#搜索帮助',isGroup:true,reply:value=>replies.push(value)};
  assert.equal(await handleCommand(e,{config,searcher:{search(){assert.fail('help must not search')}},image(){assert.fail('help must not render search')},helpReply:async(event,topic)=>{assert.equal(event,e);calls.push(topic);return true}}),true);
  assert.deepEqual(calls,['search-help']);assert.deepEqual(replies,[]);
});
test('search help respects masterOnly before delivery and explicit text skips image callback',async()=>{
  let calls=0;const replies=[];
  await handleCommand({msg:'#搜索帮助',isMaster:false,reply:value=>replies.push(value)},{config:{...config,masterOnly:true},helpReply:()=>{calls++;return true}});
  assert.equal(calls,0);assert.deepEqual(replies,[]);
  await handleCommand({msg:'/搜索帮助 文字',isMaster:true,reply:value=>replies.push(value)},{config:{...config,masterOnly:true},helpReply:()=>{calls++;return true}});
  assert.equal(calls,0);assert.deepEqual(replies,[help]);
});
test('missing fixed help falls back to text and partial image failures do not duplicate text',async()=>{
  const replies=[],event={msg:'#搜索帮助',reply:value=>replies.push(value)};
  await handleCommand(event,{config,helpReply:async()=>false});assert.deepEqual(replies,[help]);replies.length=0;
  await assert.rejects(handleCommand(event,{config,helpReply:async()=>{throw new Error('PARTIAL_FIXED_HELP_DELIVERY')}}),/PARTIAL_FIXED_HELP_DELIVERY/);
  assert.deepEqual(replies,[]);
});
test('source help describes all existing commands without personal or live result fields',()=>{
  const topic=helpTopics['search-help'];assert.equal(topic.title,'联网搜索 · WebSearch');
  const text=JSON.stringify(topic);for(const command of ['#搜索 关键词','#搜文 关键词','#搜图 关键词','#搜索帮助','#搜索诊断'])assert.ok(text.includes(command));
  assert.doesNotMatch(text,/secret|token|cookie|user_id|endpoint|imageBase64/i);
});
