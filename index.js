import plugin from '../../lib/plugins/plugin.js'
import {config,searcher} from './lib/runtime.mjs'
import {handleCommand} from './lib/commands.mjs'

export class WebSearch extends plugin {
  constructor(){
    super({name:'实时联网搜索',dsc:'联网文字和图片搜索',event:'message',priority:5,
      rule:[{reg:/^[#/](?:搜索|搜图|搜文|搜索帮助|搜索诊断)(?:\s|$)/,fnc:'search',permission:'all'}]})
  }
  async search(e){
    return handleCommand(e,{searcher,config,image:buffer=>{
      if(!globalThis.segment?.image)throw new Error('当前框架未提供 segment.image，已改为文字结果。')
      return globalThis.segment.image(buffer)
    }})
  }
}
