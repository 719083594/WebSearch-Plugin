<img src="resources/icon.png" width="72" height="72" alt="WebSearch-Plugin 图标">

# WebSearch-Plugin · 通用联网搜索

框架独立的搜索组件，提供 **Node API、JSON/文字/PNG命令行**，以及现成的云崽V3桥接和可选Chaite工具。旧名为 `yunzai-web-search`；2.1.0默认有限换源，保留完整关键词、实际引擎和来源，拒绝明显只匹配问题开头词的偏题结果。

管理面板显示为“联网搜索”。2.1.1 补齐用户提示与配置中文名称，图片和文字使用中文搜索源与北京时间；配置键、接口引擎标识和搜索来源保持兼容。新 AI 应用可直接通过[程序接口或认证服务](docs/AI-INTEGRATION.md)接入，不需要旧 GPT 插件。

![离线合成示例，非实时搜索数据](docs/preview.jpg)

## 独立使用

需要Node.js 18.17+。默认本机搜索解析需要Python 3.10+，Pillow和中文字体只影响图片。已部署认证搜索服务时可选择endpoint后端，不需要客户端本机Python。

```bash
git clone https://github.com/719083594/WebSearch-Plugin.git
cd WebSearch-Plugin
node scripts/install.mjs
node cli.mjs search "测试关键词" --format json
node cli.mjs search "测试关键词" --format text
node cli.mjs search "测试关键词" --format png --output result.png
node cli.mjs diagnose
```

JSON在stdout、错误和提示在stderr，适合其他机器人或Python调用。图片依赖缺失回退文字且不写目标图片。图片只在显式--output时落盘；默认搜索不保存历史、日志或图片缓存。endpoint模式是认证客户端；需要自行托管时可显式启动 [可选内部服务适配器](service/README.md)，核心/CLI及导入服务模块都不会自动监听端口。

默认provider:auto：含汉字的查询按360→Sogou→Bing优先级，其他按Bing→360→Sogou；每次最多尝试前两个源。每源默认8秒、全局26秒，安全验证、空结果、关键词变化或明显偏题时有限换源，失败明确报错，不编数据。显式bing/360/sogou固定单源，旧bing/endpoint配置保持有效。

轻量相关性只拦截“多主题问题只匹配开头词、其他主题完全未出现”的明显偏题，不能证明答案正确。未知同义词、缩写或跨语言结果标为uncertain而非一律拒绝。真实engine/searchUrl与query/provenance会返回，关键词不会被偷偷删改。

## Node API

```js
import {createWebSearch, formatText} from './api.mjs'
const service = createWebSearch({config:{maxResults:5}})
const result = await service.search('测试关键词', 'text')
console.log(formatText(result, service.config))
// result: {ok,query,results:[{title,snippet,url}],searchedAt,
//          searchUrl,engine,cached,format,imageBase64?,imageType?}
```

`api.mjs`、包默认导出和CLI始终不依赖机器人框架。根index默认也可直接导入，只有显式安装本地云崽标记后才加载桥接。每个service实例同时处理1次搜索，支持调用方AbortSignal。API不认识QQ权限，其他宿主需自己实现鉴权、冷却和消息发送。

## 云崽桥接

在云崽根目录执行，安装器自身不要求当前目录为云崽：

```bash
git clone https://github.com/719083594/WebSearch-Plugin.git plugins/WebSearch-Plugin
node plugins/WebSearch-Plugin/scripts/install.mjs --yunzai-bridge
```

缺依赖的Debian/Ubuntu可显式用root执行 `--install-deps --yunzai-bridge`。安装器保留已有 `config/plugin.json`，生成被Git忽略的 `config/integration.json`，然后重启机器人。

| 命令（同时支持 `/`） | 功能 |
| --- | --- |
| `#搜索 关键词` | 自动选择文字/图片，股票行情、对比等优先图片 |
| `#搜文 关键词` | 本次搜索的文字摘要、时间和来源 |
| `#搜图 关键词` | 本次搜索的结果图 |
| `#搜索帮助` | 命令说明 |
| `#搜索诊断` | 仅主人检查本地依赖，不联网 |

桥接按云崽V3的 `lib/plugins/plugin.js`、`e.reply`、`e.isMaster`、`segment.image` 接口提供，适用于TRSS/Miao等兼容实现。默认普通成员可搜，masterOnly可限制主人；诊断始终仅主人可用。保留个人冷却、共享并发、群聊引用、私聊直接回复和图片回退。Chaite工具共享同一搜索实例。

NoneBot、Koishi等可通过API/CLI接入，尚未提供这些框架的完整即用插件，见 [ADAPTERS](docs/ADAPTERS.md)。OrangeJuice配置声明和Guoba元数据只供对应云崽管理环境使用，不是核心依赖。

## 配置、更新与迁移

配置模板为 `config/plugin.example.json`。旧版pythonPath、fontPath、timeoutMs、maxResults、masterOnly、cooldownMs、timeZone继续兼容。provider可选auto/bing/360/sogou/endpoint，服务认证仅保存在被忽略的本地配置。重建需明确--force-config，更新不替换个人配置。

```bash
git -C plugins/WebSearch-Plugin pull --ff-only
node plugins/WebSearch-Plugin/cli.mjs diagnose
# 可选：真实联网一次
node plugins/WebSearch-Plugin/cli.mjs diagnose --network
```

目录改名后保留配置，启用新桥接，更新Chaite原生工具登记源码和磁盘导入路径，保证只有一个命令入口。保留search-client.mjs兼容接口，已部署的认证browser sidecar可继续使用。完整安装、迁移、Docker、Windows和CLI参数见 [INSTALL](docs/INSTALL.md)，验证范围见 [TESTING](docs/TESTING.md)。

## 搜索与隐私

默认每次请求HTTPS搜索源，不缓存查询。搜索摘要可能滞后，相关性检查不等于事实核实，搜索时间不等于来源内容或行情更新时间。验证码、引擎结构变动和网络限制均可能导致失败，插件不编造结果。

查询会传给Bing或你自行配置的搜索服务，QQ/框架/可选AI可能保存消息，见 [SECURITY](SECURITY.md)。源码包不含私人服务地址、凭据或实际聊天数据。

采用 [PolyForm Noncommercial 1.0.0](LICENSE)，允许符合条款的非商业使用、修改和分享；商业使用需另获许可，再分发保留LICENSE与NOTICE。Pillow、字体、外部框架适用各自许可证。
