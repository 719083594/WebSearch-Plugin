# 云崽实时联网搜索插件

发送一条命令，返回本次联网搜索的文字结果或图片。**无需 AI、无需模型额度、无需 API Key、无需 Chromium、无需 New API，不需要额外搜索服务器或常驻后台服务。**

![合成示例，非真实搜索数据](docs/preview.jpg)

## 命令

所有命令支持 `#` 和 `/`：

| 命令 | 功能 |
| --- | --- |
| `#搜索 关键词` | 自动选择文字或图片；股票、行情、指数、对比等优先图片 |
| `#搜文 关键词` | 搜索结果文字、摘要、时间、来源链接 |
| `#搜图 关键词` | 本次搜索结果图片，不调用绘画模型 |
| `#搜索帮助` | 查看命令说明 |
| `#搜索诊断` | 仅主人检查 Python、Pillow 和字体；不会联网 |

示例：`/搜文 香港电话卡 内地使用 月租`、`#搜图 上证指数实时行情`。

**这是网页搜索结果，不是 AI 自动总结，不是目标网站整页截图，不是证券行情接口。** 每次重新向 Bing 请求搜索页，不使用结果缓存；搜索引擎本身的索引和摘要可能滞后。搜索时间不等于来源内容、股票报价的更新时间，没有取得的行情数据不会凭空生成。

## 支持范围与依赖

- 按云崽 V3 插件接口设计，支持具有 `lib/plugins/plugin.js`、`e.reply`、`e.isMaster`、全局 `segment.image` 的 TRSS-Yunzai、Miao-Yunzai 等兼容框架。
- Node.js 18.17+、Python 3.10+；文字搜索只需 Python 标准库，没有 Node 外部依赖，无需运行 `npm install`。
- 图片需要 Pillow 和可用的中文字体；包内已包含 HTML 解析及图片渲染脚本，缺少图片依赖自动改发文字。
- 原生 Linux、Docker 内的 Linux 部署是主要支持场景。Windows 提供 Python 路径配置和中文字体自动识别，已进行离线解析/渲染及命令测试。
- 本项目不是 NoneBot 或 AstrBot 插件。任意魔改分支的兼容性仍以接口和安装检查为准。
- 服务器必须能访问 Bing。被搜索引擎限制、返回验证码或网络不可用时会明确报错；不会模拟搜索成功。

## 安装：Ubuntu / Debian

在云崽根目录执行：

```bash
git clone https://github.com/719083594/yunzai-web-search.git plugins/yunzai-web-search
sudo node plugins/yunzai-web-search/scripts/install.mjs --install-deps
```

安装器只在明确传入 `--install-deps` 时安装发行版的 Python、Pillow、中文字体，生成被 Git 忽略的本地配置，不覆盖已有配置。**然后重启云崽**，发送 `#搜索帮助` 或 `#搜文 测试关键词`。

如果已经有 Python，可以不安装系统依赖，先用文字搜索：

```bash
node plugins/yunzai-web-search/scripts/install.mjs
```

安装脚本会提示图片依赖是否齐全。只复制 `index.js` 不够，请保留完整目录，尤其是 `lib/` 和 `renderer/`。

### ZIP、Docker、Windows

下载 [Releases 完整包](https://github.com/719083594/yunzai-web-search/releases)，将最外层 `yunzai-web-search` 文件夹完整放入云崽 `plugins` 目录，再运行安装器。Docker 的 Python/Pillow/字体必须在**机器人容器内**可用；不需要挂 Docker socket，不需要宿主机服务。

路径、容器镜像持久化、手动安装和 Windows 示例见 [完整安装说明](docs/INSTALL.md)。

## 配置

配置模板为 `config/plugin.example.json`，安装器生成 `config/plugin.json`。

| 字段 | 默认值 | 作用 |
| --- | --- | --- |
| `pythonPath` | Linux `python3`，Windows `python` | Python 可执行文件；只填文件路径，不带命令参数 |
| `fontPath` | 空 | 自动查找中文字体，也可填写字体文件路径 |
| `timeoutMs` | `26000` | 整次搜索上限，允许 1000～30000 毫秒 |
| `maxResults` | `5` | 文字结果条数，1～8；图片最多显示前4条 |
| `masterOnly` | `false` | 改为 `true` 后仅主人能使用全部命令 |
| `cooldownMs` | `5000` | 同一用户连续命令搜索的间隔 |
| `timeZone` | `Asia/Shanghai` | 搜索时间显示时区 |

默认普通用户也能搜索，`#搜索诊断` 始终仅主人可用。想按主人权限安装可用 `--master-only`。不写死 QQ 号，不管理 QQ 主人账号；框架本身的权限、禁言、黑白名单仍由框架处理。

每个插件进程最多处理1次搜索，命令与可选工具共享请求门控；繁忙时提示稍后再试，不堆积任务。私聊直接回复，群聊引用触发消息。没有搜索历史数据库，不写结果图片文件，不保留用户查询；每次 Python 处理完成即退出。

## 可选：让 GPT 自动调用

不使用 AI 的用户无需处理这一项。兼容的 chatgpt-plugin / Chaite 可接入包内的 `integrations/chaite-tool.js`，让模型自行搜索，详情见 [可选 AI 接入](docs/AI-INTEGRATION.md)。只复制适配器文件通常还不够，需要在原生工具面板登记工具源码并启用对应工具组。

独立插件不修改模型、人设、对话历史、New API 渠道或聊天超时。GPT 自己的超时、模型能否调用工具、供应商限流仍由 GPT 插件负责。

## 更新、诊断与验证

```bash
git -C plugins/yunzai-web-search pull --ff-only
node plugins/yunzai-web-search/scripts/diagnose.mjs
# 可选：实际发起一次联网诊断
node plugins/yunzai-web-search/scripts/diagnose.mjs --network
```

更新后重启云崽。本地配置在 `.gitignore` 中，更新不会提交个人路径；不要用别人的配置覆盖自己的配置。安装器拒绝自动覆盖，明确重建才使用 `--force-config`。

测试覆盖命令、权限、引用、取消、并发、访问限制、HTML 解析、危险链接过滤、真实 JPEG、缺少图片依赖回退。发布前验证 Linux 容器里的正式命令处理函数：实时文字和图片搜索均成功，回复被捕获，不发送 QQ。没有宣称所有云崽分支都经过真人 QQ 收图验证。细节见 [测试说明](docs/TESTING.md)。

## 非商业许可与隐私

沿用系统状态插件的 [PolyForm Noncommercial 1.0.0](LICENSE)：允许符合条款的非商业使用、复制、修改、分享，商业使用需另行取得权利人许可。再分发保留 `LICENSE` 与 `NOTICE`；以完整许可证为准。外部框架、Pillow 和字体各自保留自己的许可证，不包含在源码包中。

公开包没有真实 QQ 号、服务器地址、私有部署路径、API Key、SSH 密钥、聊天历史或真实服务器截图。预览完全合成。实际查询会传到 Bing，搜索结果和发送内容还受 QQ/机器人框架的日志与留存设置影响，见 [隐私说明](SECURITY.md)。

本项目为源码公开的非商业软件，不标称允许所有用途的 OSI 开源软件。
