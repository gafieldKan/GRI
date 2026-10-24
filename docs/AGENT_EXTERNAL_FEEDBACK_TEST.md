# 外部 agent 反馈回路测试指南（B-4，2026-10-24）

> 对应提交 `a555c9e`。本指南是「里程碑后亲自测试」的操作手册：**T1 五分钟冒烟（现在就能跑）** + **T2 产品链路四步（外部项目视角）**。
> 验收口径：外部 agent 的中间动作**实时冒泡**、失败带机器码、run 可查可续、他人 404、sync 零回归。

---

## T1：轻量冒烟（无需重建容器、无需迁移；已替你跑通）

脚本（在我的工作区，可直接重跑）：

```bash
node ~/.openclaw/lobster_home/scripts/b4-feedback-smoke.mjs              # 只验事件流（真 claude-code 活体）
node ~/.openclaw/lobster_home/scripts/b4-feedback-smoke.mjs --db         # 追加：应用迁移 033 + 写/读 run 与事件行
B4_SMOKE_TIMEOUT_MS=300000 node ~/.openclaw/lobster_home/scripts/b4-feedback-smoke.mjs   # claude-code 慢时调大超时
```

它做什么：真 spawn `claude-code`（cwd=/home/ubantu/GRI，委派「算 41+1」），逐条打印事件时间线，断言 8 项（started 恰一次在最前 / 中间事件冒泡 / kind 闭集 / 终态唯一且在最后 / exit 0 / 摘要非空 / sessionId 可续接 / 事件 data 无 argv 泄漏）。

**已实测记录（2026-10-24）**：

| 链路 | 事件时间线 | 结论 |
|---|---|---|
| 成功 | `started(+3ms) → tool_use:Bash(+52.8s) → assistant_delta(+98s) → result(+98.6s)` | exit 0，摘要 92 字段级别、session 捕获 |
| 失败（claude-code 偶发慢） | `started(+5ms) → tool_use:Bash(+99.9s) → error{TIMEOUT}(+180s)` | **失败反馈路径同样正确**：机器码 TIMEOUT、绝不静默 |

> 注意：claude-code 活体耗时 1–3 分钟波动（首次工具调用可能 50–100 秒），**超时不是缺陷**——它验证的正是「有问题实时反馈」。

---

## T2：产品链路（四步；模拟外部项目从 HTTP 侧接入）

**前置事实**：`gri-api` 容器是 B-4 之前构建的镜像，且**镜像内没有 claude-code/codex**（委派 spawn 会 ENOENT → `BACKEND_NOT_FOUND`）。因此产品链路测试用**宿主直跑 api**（宿主已装 claude-code + codex，`which` 可证）。把 CLI 装进业务镜像属 W4 部署面，不在本卡。

### ① 应用迁移 033（幂等；只做一次）

```bash
cd /home/ubantu/GRI/services/api
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=gri DB_USER=postgres DB_PASSWORD=postgres \
  node dist/migrate/run-migrations.js
# 验证：docker exec gri-postgres psql -U postgres -d gri -c '\dt agent.*'
# → 应出现 external_runs / external_events
```

> `dist/migrate/033_agent_external_runs.sql` 已与 src 同步（构建产物、不入库）。若本地重新 `npm run build`，会自动带上。

### ② 宿主起 api（端口 3018，避开容器的 3008）

```bash
cd /home/ubantu/GRI/services/api
npm run build
PORT=3018 NODE_ENV=development \
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=gri DB_USER=postgres DB_PASSWORD=postgres \
AUTH_JWKS_URL=http://localhost:3004/auth/jwks AUTH_CENTER_URL=http://localhost:3004 \
AUTH_SERVICE_TOKEN=gri-service-token \
node dist/main.js &        # 日志出现 Nest 启动完成即可
```

### ③ 拿测试 JWT（auth-center 3004；`testuser` 密码用你的测试环境密码）

```bash
JWT=$(curl -s -X POST http://localhost:3004/auth/login \
  -H 'content-type: application/json' \
  -d '{"domain":"food","username":"testuser","password":"<你的密码>"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.accessToken||j.data?.accessToken||'')})")
# 若回体结构不同，先直接 curl 看一眼再取字段
```

### ④ 三步验证（+1 负例）

**a. 触发委派**（AI 教师在对话里调用 `agent.delegate`）：

```bash
curl -s -X POST http://localhost:3018/api/agent/me/message \
  -H "Authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"content":"请用 agent.delegate 把子任务「读 /home/ubantu/GRI/package.json 并用一句话总结」委派给 claude-code，cwd 用 /home/ubantu/GRI，然后在你的回复里引用它的摘要"}'
```

期望：回复里含 `@gri/agent-core` 一句话总结（**同步链路**；run 已随对话落库）。

**b. 查 run**（外部项目视角，只读本人）：

```bash
curl -s http://localhost:3018/api/v1/agent/delegate/runs -H "Authorization: Bearer $JWT" | jq .
RUN_ID=$(curl -s http://localhost:3018/api/v1/agent/delegate/runs -H "Authorization: Bearer $JWT" | jq -r '.data.runs[0].run_id')
curl -s http://localhost:3018/api/v1/agent/delegate/runs/$RUN_ID -H "Authorization: Bearer $JWT" | jq .
```

期望：`status=done`、`summary` 非空、`resume_key` 非空（= claude session_id）、`latency_ms` 有值。

**c. 看实时流**（另开终端；委派进行中或刚结束时拉）：

```bash
curl -N http://localhost:3018/api/v1/agent/delegate/runs/$RUN_ID/events -H "Authorization: Bearer $JWT"
```

期望：`id:/event:/data:` 帧按序刷出（`started → tool_use → assistant_delta → result → status`），终态后约 5 秒自动关流；`data` 里没有 argv/prompt。

**d. 负例**：把 runId 改成一个不存在的 UUID → `404` + `{v:1,success:false,error:{code:"RUN_NOT_FOUND"}}`；改别人的 runId 同样 404（所有权隔离）。

---

## 常见现象（不是缺陷）

- **每次委派都留 run 行**（sync 也建行）：列表里能看到所有试跑记录，`mode=sync`。
- **SSE 在终态前不发 `status` 事件、不关流**：进行中一直挂着是正确行为（客户端断开即清理）。
- **cwd 白名单默认 `['/home/ubantu/GRI']`**：宿主直跑时换目录设环境变量 `AGENT_DELEGATE_CWD_ALLOWLIST=/path/a,/path/b`（宿主侧读取，底座不读 env 的红线未破）。
- **容器内 delegate 暂不可用**（镜像无 CLI）：产品化部署时把 claude-code/codex 装进 api 镜像属 W4；在那之前，容器环境只会收到 `BACKEND_NOT_FOUND`（带机器码、不静默）。

## 环境清理

宿主 api 测完 `kill %1`（或关掉该终端）即可；容器栈（3008）不受影响。DB 里的试跑 run 行可留作证据，或 `DELETE FROM agent.external_runs WHERE mode='sync'` 清理。
