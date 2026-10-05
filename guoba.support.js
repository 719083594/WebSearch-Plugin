import path from 'node:path'
import {fileURLToPath} from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))

// Metadata only; configuration is managed by the plugin's own files.
export function supportGuoba() {
  return {
    pluginInfo: {
      name: path.basename(directory).toLowerCase(),
      title: 'WebSearch-Plugin',
      author: '@719083594',
      authorLink: 'https://github.com/719083594',
      link: 'https://github.com/719083594/WebSearch-Plugin',
      description: '通用联网搜索，提供文字、JSON和结果图；此处为云崽桥接。',
      isV3: true,
      isV2: false,
      icon: 'mdi:cloud-search-outline',
      iconColor: '#078b98',
      iconPath: path.join(directory, 'resources/icon.png'),
      showInMenu: false,
    },
  }
}
