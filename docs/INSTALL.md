# 完整安装和故障排查

## 必需组件

| 组件 | 是否必需 | 获取方式 |
| --- | --- | --- |
| 云崽V3插件接口兼容框架 | 必需 | 现有机器人 |
| Node.js 18.17+ | 必需 | 框架运行环境 |
| Python 3.10+ | 必需 | 操作系统安装，或安装器显式安装 |
| `renderer/document.py` 与 `lib/` | 必需 | 完整发布包已包含 |
| Pillow | 图片必需 | Debian/Ubuntu `python3-pil`，其他系统 `python -m pip install -r requirements.txt` |
| 中文字体 | 图片必需 | `fonts-wqy-microhei`、Noto CJK，Windows自动识别微软雅黑/黑体 |
| AI / API Key / New API | 不需要 | 可选适配器才涉及你自己的模型 |
| Chromium / HTTP搜索服务器 | 不需要 | 本机按需进程，不打开端口 |

## 原生 Linux

在云崽根目录克隆完整插件：

```bash
git clone https://github.com/719083594/yunzai-web-search.git plugins/yunzai-web-search
sudo node plugins/yunzai-web-search/scripts/install.mjs --install-deps
```

配置只含路径与偏好，不含密钥，安装器以0644写入，root安装后普通机器人用户也能读取。若希望机器人用户随后修改配置，可改变所属用户，例如：

```bash
sudo chown BOT_USER:BOT_GROUP plugins/yunzai-web-search/config/plugin.json
```

将 `BOT_USER`、`BOT_GROUP` 替换为实际机器人用户和组。也可以先用系统包管理器装依赖，再由机器人运行用户生成配置：

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pil fonts-wqy-microhei
node plugins/yunzai-web-search/scripts/install.mjs
```

不要把 Python 文件路径填写成 `python3 --some-option`。自定义 Python/字体示例：

```bash
node plugins/yunzai-web-search/scripts/install.mjs \
  --python /usr/bin/python3 \
  --font /usr/share/fonts/truetype/wqy/wqy-microhei.ttc
```

无 sudo、非 Debian/Ubuntu：自行安装 Python；可在虚拟环境安装 Pillow，然后 `--python` 指向虚拟环境 Python。文字模式不需要 Pillow 或字体。

## Docker 部署

插件和 Python 脚本都运行在机器人容器里，安装器也要在容器里执行。宿主机装了 Pillow 不代表容器里可用。

以下 `BOT_CONTAINER` 是你实际容器名，`/app` 是**示例**机器人根目录，需要自行替换。先在共享的机器人目录克隆插件，再执行：

```bash
docker exec -u 0 BOT_CONTAINER node /app/plugins/yunzai-web-search/scripts/install.mjs --install-deps
docker exec BOT_CONTAINER node /app/plugins/yunzai-web-search/scripts/diagnose.mjs
```

如果容器以非root用户运行，0644配置可以读取；需要由机器人用户修改配置时再改变所属用户。依赖安装只支持容器为 Debian/Ubuntu 且有 apt-get 的情况；Alpine 用自己的包管理器安装 Python/Pillow/中文字体，再运行不带 `--install-deps` 的安装器。

**容器重建可能丢失已安装系统依赖。** 建议在你自己的机器人 Dockerfile 中加入：

```dockerfile
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil fonts-wqy-microhei && rm -rf /var/lib/apt/lists/*
# 按原镜像恢复机器人的运行用户，不要照抄未知用户名称
```

完整插件目录和本地 `config/plugin.json` 应留在现有持久化挂载中，路径以容器可见路径为准。不要配置宿主机专属的 Python 路径。没有新的 Docker Compose 服务、搜索端口或 Docker socket 权限要求。

## Windows

安装 Python 3.10+，在云崽根目录执行：

```powershell
git clone https://github.com/719083594/yunzai-web-search.git plugins/yunzai-web-search
python -m pip install -r plugins/yunzai-web-search/requirements.txt
node plugins/yunzai-web-search/scripts/install.mjs --python python
```

程序自动寻找 Windows 字体中的微软雅黑或黑体。不在 PATH 的 Python 可用 `--python "C:\Python312\python.exe"` 指定**自己的实际路径**。如果只有 `py` 启动器，请用 `py -3 -c "import sys; print(sys.executable)"` 查看 Python 路径并传给安装器；不要将 `py -3` 整串作为 pythonPath。

Windows 已验证本机命令逻辑、标准库解析和 Pillow 中文结果图，没有完成 Windows 云崽真人QQ收图测试。

## ZIP 和启动

从 Releases 下载完整ZIP，最外层文件夹名称必须是 `yunzai-web-search`，放到 `plugins/yunzai-web-search` 后执行安装步骤。不要形成双层 `plugins/yunzai-web-search/yunzai-web-search`。完成后重启机器人，再发 `#搜索帮助`。

若已经装有其他注册相同 `#搜索`/`#搜文`/`#搜图` 命令的插件，只启用其中一个命令入口，避免命令冲突。可选 GPT 工具适配器不是另一个命令插件。

## 诊断与关闭

- “Python不可用”：确认 `pythonPath` 在**机器人运行环境**中存在并可执行。
- 图片变成文字：运行 `#搜索诊断`，检查 Pillow 和字体；这是可恢复的降级，不是搜索失败。
- 网络问题：运行 `node plugins/yunzai-web-search/scripts/diagnose.mjs --network`，它会实际查询一次 Bing；可能遇到地区/网络/验证码限制。
- “没有有效搜索结果”：搜索引擎页面结构改变或访问限制都可能导致；不会编造来源。请提供版本及脱敏错误信息。
- 权限限制：`masterOnly=true` 时仅主人响应；诊断命令一直仅主人可用。
- 配置报错：对照 `config/plugin.example.json` 检查 JSON，数字不是字符串。
- 更新：`git pull --ff-only` 后重启；本地配置不会上传到仓库。
- 停用：在插件管理器停用入口，或将整个目录移出 `plugins` 后重启；没有服务要停，没有数据目录要清理。

Python脚本不是守护进程，不用手动后台启动。不需要其他附属机器人插件。
