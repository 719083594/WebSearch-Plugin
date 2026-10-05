import path from 'node:path'
import {fileURLToPath} from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))

// Metadata only; configuration is managed by the plugin's own files.
export function supportGuoba() {
  return {
    pluginInfo: {
      name: path.basename(directory).toLowerCase(),
      title: 'YunzaiWebSearch',
      author: '@719083594',
      authorLink: 'https://github.com/719083594',
      link: 'https://github.com/719083594/yunzai-web-search',
      description: '联网查询并发送文字摘要或搜索结果图，附来源链接和搜索时间。',
      isV3: true,
      isV2: false,
      icon: 'mdi:cloud-search-outline',
      iconColor: '#078b98',
      iconPath: path.join(directory, 'resources/icon.png'),
      showInMenu: false,
    },
  }
}
