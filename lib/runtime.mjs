import {readConfig} from './config.mjs'
import {createWebSearch} from '../api.mjs'
export const config=readConfig()
// Commands and optional native tools share the same one-request gate.
export const searcher=createWebSearch({config})
