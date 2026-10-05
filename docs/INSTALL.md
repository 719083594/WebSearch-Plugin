# 安装、配置与迁移

## 独立安装

项目可放任意目录，安装器根据自身文件定位项目，不依赖cwd或机器人：

```bash
git clone https://github.com/719083594/WebSearch-Plugin.git
node WebSearch-Plugin/scripts/install.mjs
node WebSearch-Plugin/cli.mjs search "测试关键词" --format json
```

| 组件 | 默认bing后端 | 认证endpoint后端 |
| --- | --- | --- |
| Node.js 18.17+ | 必需 | 必需 |
| Python 3.10+ | HTML解析必需 | 不要求本机安装 |
| Pillow与中文字体 | 图片必需，缺失回退文字 | 图片由既有服务提供 |
| 云崽/AI/API Key | 不需要 | 不需要；仅使用自己的搜索服务密钥 |
| 新HTTP端口/守护进程 | 不提供 | 不提供 |

Debian/Ubuntu自行安装 `python3 python3-pil fonts-wqy-microhei`，或显式用root运行 `node scripts/install.mjs --install-deps`。其他系统安装Python/字体并 `python -m pip install -r requirements.txt`。文字解析不需要Pillow。

Windows执行 `node scripts/install.mjs --python python`。不在PATH的Python填可执行文件完整路径，字体默认查找微软雅黑/黑体，也可传--font。只有py启动器时用 `py -3 -c "import sys; print(sys.executable)"` 查路径，不要将 `py -3` 整串作为pythonPath。

## 配置

默认 `config/plugin.json`；旧版参数兼容。独立CLI/安装器可传 `--config 路径`，云崽桥接使用项目内默认配置。

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| provider | `bing` | bing本机解析，endpoint认证服务客户端 |
| endpoint | 空 | 服务基础HTTP(S)地址，不含密码、查询串或片段 |
| secret | 空 | 服务密钥，只保存本地，不可提交 |
| pythonPath | Windows python，其余python3 | 可执行文件路径，不带命令参数 |
| fontPath | 空 | 自动查找中文字体，可指定文件 |
| timeoutMs | 26000 | 整次上限，1000～30000毫秒 |
| maxResults | 5 | 1～8条，本机图片卡片最多4条 |
| masterOnly | false | 云崽/Chaite主人权限；裸API的宿主自己鉴权 |
| cooldownMs | 5000 | 云崽命令个人冷却，0～600000毫秒 |
| timeZone | Asia/Shanghai | 文字与本机图片显示时区 |

已有服务配置示例，必须替换占位值，不可提交真实密钥：

```json
{
  "provider": "endpoint",
  "endpoint": "http://127.0.0.1:3080",
  "secret": "REPLACE_WITH_YOUR_PRIVATE_SECRET",
  "timeoutMs": 26000,
  "maxResults": 5,
  "masterOnly": false,
  "cooldownMs": 5000,
  "timeZone": "Asia/Shanghai"
}
```

服务约定：POST /search，header x-search-secret，JSON `{query,image}`；返回 `{ok:true,searchedAt,results:[{title,snippet,url}],answerText?,imageBase64?}`。图片接受PNG/JPEG；禁止重定向转发密钥。公网用HTTPS，HTTP只适合可信本地/内网。服务部署、鉴权和生命周期由你维护，本插件不开放搜索端口。

## CLI

```bash
node cli.mjs search "关键词" --format json
node cli.mjs search "关键词" --format text
node cli.mjs search "关键词" --format png --output result.png
node cli.mjs search "关键词" --format image --output result.jpg
node cli.mjs diagnose
node cli.mjs diagnose --network
```

JSON为默认；stdout只含结果，提示/错误在stderr。png要求实际PNG，默认本机后端可生成；endpoint返回JPEG时用image保留原图，不会伪装成PNG。image为后端原格式，本机默认为JPEG，请相应选择后缀。缺图回退文字、退出码0并不写图片；参数/查询失败退出码1。diagnose默认不联网、不暴露密钥，--network真实查询一次。CLI每次启动新实例，跨进程限流由宿主管理。

## 云崽桥接

完整目录放 `plugins/WebSearch-Plugin`，不要双层套文件夹，也不能只复制index.js：

```bash
node plugins/WebSearch-Plugin/scripts/install.mjs --yunzai-bridge
```

安装器验证实际云崽基类位置，然后生成被忽略的 `config/integration.json`，内容adapter:yunzai。根index仅在标记存在时加载 `integrations/yunzai/index.js`；默认export空apps，避免云崽加载器把通用API当消息插件实例化。核心入口不会改写；api.mjs和CLI即使已启用桥接也始终无框架依赖。

已有配置保留，可直接启用桥接；明确替换配置才用--force-config，python/font/master-only不会静默覆盖。root安装以0644写配置使机器人用户可读；若含密钥，按实际运行用户调整所属用户和目录权限。重启后测#搜索帮助、#搜文和#搜图。停用可传--standalone，写adapter:none并重启；不会停用你自行部署的外部服务。

## Docker

Python/字体及安装器必须在实际机器人容器内，宿主机依赖不代表容器依赖：

```bash
docker exec BOT_CONTAINER node /app/plugins/WebSearch-Plugin/scripts/install.mjs --yunzai-bridge
docker exec BOT_CONTAINER node /app/plugins/WebSearch-Plugin/cli.mjs diagnose
```

BOT_CONTAINER和/app是示例，换成实际名称/根目录。Debian/Ubuntu容器可显式root --install-deps；Alpine使用自身包管理器。容器重建可能丢失系统依赖，推荐加入自己的Dockerfile。项目、配置、适配标记应在持久挂载中。endpoint模式沿用原服务，不增加公网端口或Docker socket要求。

## 从1.x迁移

1. 保留config/plugin.json，将完整目录命名WebSearch-Plugin，origin改为新仓库URL。GitHub改名保留历史，旧URL通常重定向。
2. 复制原配置；若旧部署是独立browser sidecar代理，复制原endpoint/secret到新config/plugin.json并设provider:endpoint，保留原服务。
3. 运行--yunzai-bridge，重启，只启用一个相同命令入口。
4. 更新Chaite原生工具登记源码及utils/tools/web_search.js导入路径，见AI-INTEGRATION。只改磁盘文件不一定更新数据库源码。
5. 验证后停用旧入口，保留服务认证、聊天保护与其他机器人设置。

Python不可用检查容器/系统与pythonPath；图片变文字检查Pillow/字体。没有有效结果可能是验证码、页面结构或网络限制，插件不补造来源。更新 `git pull --ff-only` 保留本地配置与标记。
