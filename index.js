import fs from 'node:fs'
export * from './api.mjs'

// Empty by default so Yunzai's loader does not instantiate API exports as
// message plugins. Framework imports are enabled only by an explicit install.
export let apps = {}
const marker = new URL('./config/integration.json', import.meta.url)
try {
  const integration = JSON.parse(fs.readFileSync(marker, 'utf8').replace(/^\uFEFF/, ''))
  if (integration.adapter === 'yunzai') apps = (await import('./integrations/yunzai/index.js')).apps
  else if (integration.adapter !== 'none') throw new Error('不支持的集成适配器：'+integration.adapter)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
