// Framework-independent public API. Importing does not load a bot, open a
// listener, read chat events or send a network request.
import {readConfig, normalizeConfig} from './lib/config.mjs'
import {createSearcher, runDocument} from './lib/search.mjs'

export {createSearcher, chooseFormat, runDocument} from './lib/search.mjs'
export {readConfig, normalizeConfig, defaults, localConfigPath} from './lib/config.mjs'
export {formatText} from './lib/format.mjs'
export const version = '2.0.0'

export function createWebSearch(options = {}) {
  const config = options.config === undefined ? readConfig(options.configPath) : normalizeConfig(options.config)
  const searcher = createSearcher({...options, config})
  return {
    config,
    search: (...args) => searcher.search(...args),
    async diagnose({network = false} = {}) {
      let dependencies={python:null,pillow:null,fontAvailable:false,imageReady:false}
      try {dependencies=await (options.parse || runDocument)({check:true, fontPath:config.fontPath}, config)}
      catch(error) {if(config.provider!=='endpoint')throw error;dependencies.localRendererError=error.message}
      const result = {version, node:process.versions.node, provider:config.provider, ...dependencies, masterOnly:config.masterOnly, timeoutMs:config.timeoutMs, networkChecked:false}
      if (network) {
        const search = await searcher.search('北京时间', 'text')
        result.networkChecked = true
        result.resultCount = search.results.length
        result.searchedAt = search.searchedAt
      }
      return result
    }
  }
}
