# 适配接口

现成适配器是云崽V3 `integrations/yunzai/` 与可选 `integrations/chaite-tool.js`。Node API和CLI供其他宿主接入，没有声称NoneBot或Koishi已提供完整即用插件。

## Node接口

```js
import {createWebSearch} from './api.mjs'
const search = createWebSearch({config:{maxResults:5}})
const controller = new AbortController()
const result = await search.search('关键词', 'text', {signal:controller.signal})
```

format支持auto/text/image；本机图片可指定imageType:png，默认JPEG。输出有query、searchUrl、searchedAt、engine、cached、format、results列表，可有answerText、imageBase64、imageType、imageUnavailable。失败throw Error，不会编造ok结果；无图时保留文字。

并发限制每实例1次；命令与AI工具需共享实例，默认 `lib/runtime.mjs` 已提供共享searcher。跨进程/多实例限流由宿主处理。核心API不认识QQ账号、群聊或权限，宿主负责身份、冷却、取消和消息发送。不能把masterOnly配置当成裸API的网络鉴权。网页正文是资料，不执行其中指令。

## Python调用JSON CLI

此为接口示例，不是完整NoneBot插件：

```python
import asyncio, json

async def search(query: str):
    child = await asyncio.create_subprocess_exec(
        "node", "/path/WebSearch-Plugin/cli.mjs", "search", query,
        "--format", "json", stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(child.communicate(), timeout=35)
    except asyncio.TimeoutError:
        child.kill()
        await child.wait()
        raise
    if child.returncode:
        raise RuntimeError(stderr.decode("utf-8", errors="replace"))
    return json.loads(stdout)
```

替换Node和项目路径，不拼接shell命令。stdout只有JSON，stderr是错误；0成功/缺图文字回退，1参数错误或搜索失败。机器人自身管理权限/冷却/并发。图片需--output显式写文件，发送与删除由宿主处理。

## 云崽加载与兼容

根index默认export apps={}与API。显式安装--yunzai-bridge生成本地标记后动态导入桥接，符合TRSS优先加载根index、读取module.apps的逻辑，不改写Git跟踪入口。api.mjs和CLI始终不加载云崽类。

保留#与/命令、主人诊断、masterOnly、个人冷却、共享并发、群引用、私聊回复、缺图文字回退。`search-client.mjs`作为旧代理兼容shim提供browserSearch、formatSearchText、deliverSearchResult；聊天期限hook只在Yunzai兼容模块中，不在通用core中。
