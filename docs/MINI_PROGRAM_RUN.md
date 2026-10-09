# 微信小程序「跑通」Runbook（免费 / 不进正式审核）

> 目标：用**零成本**方式让 `apps/mini-program-ai-tutor` 微信小程序连上本机后端栈，在
> **微信开发者工具**与**真机预览**里跑通登录与业务页。
>
> **边界（重要）**：本路径**不涉及 ICP 备案 / 微信服务器域名白名单 / 正式证书**，产物
> **无法通过正式审核**，仅供开发 / 演示 / 体验版使用。要正式发布见 `docs/` 内的正规部署方案。

## 为什么不用改后端

后端已是本机 Docker Compose 栈，`nginx`（宿主 :80）的 dev 配置
（`nginx/conf.d/default.conf`）已把 `/api/` → `services/api:3002`、`/auth/` →
`services/auth-center:3004`、`/health` 全部路由好。小程序只要把请求指向**同一个 origin**即可。

小程序侧原本连不上，是两处相对地址在 `wx.request` 里非法（小程序无「同源」概念）：

- `api/index.js` 的 `VITE_API_BASE_URL` 从未被注入（构建后残留字面量）。
- `store/auth.js` 的 `AUTH_BASE` 硬编码 `/auth`。

现已改为**构建期注入绝对 origin**（`vite.config.js` 的 `define` + `store/auth.js` 读 env）。

## 前置条件

- Docker / docker compose v2 可用。
- 微信开发者工具（导入 `apps/mini-program-ai-tutor/dist/dev/mp-weixin`）。
- 真机预览另需：一个微信小程序账号 + AppID（或在开发者工具里用「测试号」）；以及一个免费公网穿透。
- 本机模式**不需要**任何穿透。

## 一、起后端栈并验证

```bash
cd /home/ubantu/GRI
docker compose up -d          # nginx:80 + api:3008→3002 + auth-center:3004 + PG + Redis

# 判定 nginx 用的是 dev 还是 prod 配置（决定本机 origin 是 http 还是 https）：
curl -s -o /dev/null -w "%{http_code}\n" localhost/health
#   200 → dev conf（conf.d/default.conf）：origin = http://localhost
#   301 → prod conf（conf.d.prod，HTTP 强制跳 HTTPS + 自签证书）：origin = https://localhost
#         此即本项目当前运行态（自签证书，curl 需 -k）：
curl -sk https://localhost/health                                    # 200 存活态
curl -sk 'https://localhost/api/curriculum/knowledge-points?limit=1' # 200 知识点 JSON
curl -sk https://localhost/auth/me                                   # 401（未带 token，符合预期）
```

> 想本机用明文 http：把 nginx 切回 dev conf 起一次基础栈即可（`docker compose up -d` 不带 prod
> overlay 会重建 nginx 为 conf.d + 仅 :80）。当前文档以 https（现状）为准。

## 二、微信开发者工具模式（零依赖）

> **origin 必须是「微信开发者工具所在机器」能访问到的地址。**
> 小程序无「同源」概念，origin 在**构建期**被烘焙成绝对地址（改了必须重启构建）——所以
> `https://localhost` 只在**开发者工具与后端同机**时成立。若开发者工具跑在**另一台机器**
> （如 Windows 开发者工具 + 后端在本 Linux 主机），改用后端主机的局域网 IP
> （`ip -4 addr show scope global` 取，例 `192.168.1.11`）。nginx `server_name _` 为
> catch-all，会照常应答任意 Host/IP；自签证书 SAN 不含该 IP，靠下面的「不校验…证书」跳过。

```bash
cd apps/mini-program-ai-tutor
./scripts/dev.sh https://localhost      # 同机：若上一步判定为 dev conf，则用 http://localhost
# 异机（同一局域网）：./scripts/dev.sh https://192.168.1.11   # ← 换成后端主机的 LAN IP
```

产出 `dist/dev/mp-weixin`。在微信开发者工具「导入项目」选该目录，打开
**详情 → 本地设置 → 勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」**
（`project.config.json` 的 `urlCheck:false` 已默认关闭校验，如被覆盖请手动确认；
**自签 HTTPS 必须靠这项跳过证书校验**）。

此时登录页应能走通 `POST <origin>/auth/login`，登录后进入业务页。

> 异机报 `ERR_CONNECTION_REFUSED` 时排查：① 后端主机能否从网关自测
> `curl -sk https://<LAN-IP>/health`；② 后端主机防火墙是否放行 :443/:80（docker 发布端口
> 一般绕过 ufw，但如已用 ufw-docker 则需显式放行）；③ 两机是否真在同一网段。

> 测试凭据：用户名 `testuser`（或邮箱 `test@example.com`），密码 `test1234`。

## 三、真机预览模式（免费穿透）

手机要能访问一个公网 HTTPS 地址，用免费方案把本机 `nginx:80` 暴露出去：

### 方案 A：ngrok 免费版（最快）

```bash
# 安装（本仓脚本，或按 https://ngrok.com 指引）
bash tools/nat-proxy/scripts/install-ngrok.sh
ngrok config add-authtoken <你的免费 authtoken>

# 暴露 nginx:80（同时路由 /api、/auth、/health）
ngrok http 80
# 记下输出的 Forwarding 地址，如 https://xxxx-xxxx.ngrok-free.dev
```

然后用该地址**重启**小程序构建（env 在进程启动时烘焙，改了 origin 必须重启）：

```bash
cd apps/mini-program-ai-tutor
./scripts/dev.sh https://xxxx-xxxx.ngrok-free.dev
```

> 注：`tools/nat-proxy/README.md` 里提到的 `GRI/start-ngrok.sh` 目录已不存在（过期文档），
> 直接用 `ngrok http 80` 即可。ngrok 免费版域名每次重启会变，每次都要重跑本步骤。

### 方案 B：Oracle Cloud 免费版 + frp（固定 IP，稳定）

一次性配置成本更高（注册 Oracle、建 ARM VM、部署 frps），但给固定公网 IP，不必每次换地址。
完整步骤见 `tools/nat-proxy/docs/deployment.md`。配好后把 frpc 的 remote_port 指向本机 `nginx:80`。

### 真机步骤

1. 开发者工具里点「预览」，手机扫码。
2. 首次需在开发者工具确认「不校验合法域名」对预览生效；如手机上报「不在以下 request
   合法域名列表中」，说明校验未关（真机预览沿用开发者工具的该设置）。

## 四、验证清单

- 构建产物不含未替换字面量：
  ```bash
  grep -r "VITE_API_BASE_URL" dist/dev/mp-weixin   # 不应出现裸字面量
  grep -r "ngrok-free.dev\|http://localhost" dist/dev/mp-weixin/app.js  # 应能搜到注入的 origin
  ```
- 开发者工具：登录 `POST <origin>/auth/login` 返回 200 且拿到 token；`App.onLaunch` 的
  `auth.restore()` 后进入业务页不被打回登录页。
- 真机：能登录、拉知识点列表、发起会话（`POST <origin>/api/tuition/sessions`）。

## 五、排错

| 现象 | 原因 / 处置 |
|------|------------|
| 请求报「不在合法域名列表」 | 开发者工具「不校验合法域名」未勾选；或真机预览未继承该设置 |
| 登录 404 | `VITE_AUTH_BASE_URL` 少了 `/auth` 后缀，或带了 `/auth/`（多斜杠） |
| 换了 ngrok 地址后仍连旧地址 | env 在进程启动时烘焙，必须重启 `scripts/dev.sh` |
| 真机连不上但开发者工具正常 | 穿透未起 / 未指向 `nginx:80`；确认 `ngrok http 80` 而非 `:3008` |
| 请求超时（拍照分析类） | nginx `/api/` 已设 `proxy_read_timeout 180s`，真实 LLM 链 ~107s 属正常 |

## 六、明确不做

- ICP 备案、微信后台服务器域名白名单、正式证书、正式发布。
- 不改后端 / nginx / compose。
- 不引入任何付费云资源。
