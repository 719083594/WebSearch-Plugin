import {readConfig} from './config.mjs'
import {createSearcher} from './search.mjs'
export const config=readConfig()
// Commands and optional native tools share the same one-request gate.
export const searcher=createSearcher({config})
