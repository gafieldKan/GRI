# B-3c 交付清单：`agent.delegate` 委派工具 —— 把外部 agent 当"派活儿"工人（接入点②）

> 执行者：Claude ｜ 日期：2026-10-23 ｜ 分支：`feat/stage-c-unified-auth-shell`（**未 commit / 未 checkout / 未 push**）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md` §四②/§六/§八（**本卡灵魂**）｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七
> 依赖：B-3a（`40ea83c`，`CliBackendRegistry`+四后端）+ B-3b（`b426070`，`provider='cli'` 路由）
> 定位：**「派活儿」接入点** —— agent 调工具 `agent.delegate` 把**独立子任务**交给本机外部 agent；
> **父只拿摘要结果**（对标 Hermes `delegate_tool`：parent 看不到 child 的中间工具调用）。与①「换脑子」分域。

---

## 一、交付文件（7 项，均在任务卡「产出物清单」内）

| # | 文件 | 状态 | 说明 |
|---|------|------|------|
| 1 | `packages/agent-core/src/cli-delegate.js` | **新** | `createDelegateTool({cliBackends,cwdAllowlist})`→`agent.delegate` Tool；含 cwd 白名单 + 超时 + error 明抛 + 摘要裁切 |
| 2 | `packages/agent-core/src/cli-backend.js` | 改 | `buildArgs({prompt,cwd,resumeKey})`：claude-code 追加 `--resume <id>`、codex 改子命令 `exec resume <id> <prompt>`；openclaw/hermes 忽略；`run` 透传 `resumeKey` |
| 3 | `packages/agent-core/src/index.js` | 改 | 导出 `createDelegateTool` / `resolveDelegateCwd` / `DEFAULT_DELEGATE_CWD_ALLOWLIST` |
| 4 | `packages/agent-core/index.d.ts` | 改 | 同步类型：`buildArgs` input 增 `resumeKey`、`run` opts 增 `resumeKey`、新增委派工具三声明 |
| 5 | `packages/agent-core/tests/cli-delegate.test.js` | **新**（25 测） | 契约/cwd 拒放/桩摘要/失败不静默/续接 argv/默认只读/审计/零明文 |
| 6 | `services/api/src/modules/agent/agent.service.ts` | 改 | `_teachingTools()` 注册 `createDelegateTool`（`cliBackends` + `_delegateCwdAllowlist()`）；经既有 `onRun`→`_audit` 落审计 |
| 6b | `services/api/src/modules/agent/{agent.service,agent-diagnosis}.spec.ts` | 改（**必要连带**） | 两处 `jest.mock('@gri/agent-core')` 补 `createDelegateTool` 工厂（见 §四 说明） |
| 7 | `.agents/claude/outputs/b3c-file-list.md` + `b3c-verify.sh` | **新** | 本文件 + 复验脚本（末行 `PASS=51 FAIL=0 VERIFY_EXIT=0`） |

**未改动**其他任何模块文件；未 `commit` / `checkout` / `push`；零明文（无密钥/token 落盘或打印）。

---

## 二、接线契约（实现要点）

### 1. 工具（`cli-delegate.js`，底座通用端口）

```js
export function createDelegateTool({ cliBackends = null, cwdAllowlist = DEFAULT_DELEGATE_CWD_ALLOWLIST } = {}) {
  return makeTool({
    name: 'agent.delegate',            // category: 'delegate'
    inputSchema: { properties: { backend, goal, cwd?, resumeKey?, timeoutMs? }, required: ['backend','goal'] },
    execute: async (_ctx, args) => {
      // 校验 backend/goal → 校验 cwd 白名单（C2，越界**不 spawn**）→ cliBackends.run(backend, {prompt:goal, cwd, resumeKey?, timeoutMs?})
      // → 只回 {ok, backend, summary, sessionId, exitCode, timedOut, error}（**父只拿摘要**）
    },
  });
}
```

- **底座侧只做工具工厂**：不 import 业务、不读 env、不碰 apiKey/token（C3）；CLI 只经 `CliBackendRegistry`，本模块**不 spawn**。
- **失败语义（C5）**：缺参 / 未注入 registry / `run` 抛错 / `timedOut` / 空文本 → **一律 `ok:false` + `error`**（绝不返回空成功）。
- **父只拿摘要**：返回体白名单字段，**不含** child 中间产物/stderr/pid。

### 2. cwd 白名单（`resolveDelegateCwd`，C2/§八第 3 条）

- 白名单归一化为**绝对、去尾分隔符**的根集合；`target === root || target.startsWith(root + sep)` 前缀判定（处理根 `/` 边界）。
- 未给 `cwd` → 落白名单**首根**；相对路径**相对首根**解析（`../../etc` 越界被拒）；绝对路径原样（`/etc` 越界被拒）；**前缀兄弟目录**（`/root-evil`）不误放。
- 越界 → `{ok:false, error:'… 越界 …'}`，**不 spawn**。

### 3. 续接 argv（`cli-backend.js`，按任务卡「实探」逐字实现）

| 后端 | 无 resumeKey（零回归） | 有 resumeKey |
|---|---|---|
| `claude-code` | `-p <p> --output-format stream-json --verbose --permission-mode default` | 上者 **+ `--resume <id>`** |
| `codex` | `exec <p> --json --skip-git-repo-check` | **`exec resume <id> <p> --json --skip-git-repo-check`** |
| `openclaw` | `agent exec --json --cwd <dir> <p>` | **忽略**（无显式 resume flag） |
| `hermes` | `-z <p>` | **忽略**（`resumeKey=null`，one-shot） |

`run(id,{prompt})` 的既有调用**零回归**（不传 `resumeKey` → argv 与 B-3a/B-3b 逐字一致，单测 deepEqual 锁死）。

### 4. 装配（不硬编码）

- `agent.service.ts::_teachingTools()`：`registry.register(createDelegateTool({ cliBackends: this.cliBackends ?? null, cwdAllowlist: this._delegateCwdAllowlist() }))`。
- 委派调用经既有 `onRun → _audit` 落 `agent.tool_runs`（**复用**，不新建审计表）。
- `cliBackends` 缺省 `null`（未注入）→ 工具仍注册但调用**明确失败**（不静默），与 B-3b 装配口径一致。

---

## 三、开放设计点（卡面授权「实现者自行决定并在 file-list 说明」）

1. **委派工具注册位置 = `_teachingTools()`（ToolRegistry 层，非 `_teachingToolDefs()`）**：
   委派工具需**实例态**（`this.cliBackends` + 白名单），放注册表装配处最自然；`_teachingToolDefs()` 保持纯静态工具 defs（既有 spec 直接遍历它，不动其形状）。
2. **`cwdAllowlist` 配置来源 = 宿主 env `AGENT_DELEGATE_CWD_ALLOWLIST`（逗号分隔），缺省 `['/home/ubantu/GRI']`**：
   底座工厂默认值同（`DEFAULT_DELEGATE_CWD_ALLOWLIST`）；**底座不读 env（C3），读 env 的是宿主**（与 `AGENT_CRED_MASTER_KEY` 同款宿主配置面）。
3. **`goal` 不拼 persona/父级上下文**：goal **原样**作子任务 prompt。「独立上下文」正是委派本义；拼入父的 persona/记忆会污染子任务、也不符 Hermes delegate 语义。不拼任何密钥（C4）。
4. **`resumeKey` 语义 = 「要续接的会话 id 值」**（claude-code 即 `session_id`、codex 即 `thread_id`）；仅这两后端 `buildArgs` 追加续接 argv，openclaw/hermes 传了忽略（不报错，退化为新上下文）。
5. **审计口径（C6）**：委派**结果**只落**摘要**（child 中间产物/stderr **绝不入审计**）；`args` 落工具入参（`backend/goal/cwd/resumeKey`，与其它工具**同口径**）。即审计不落 child 的完整 prompt/transcript。

---

## 四、必要连带改动说明（超出卡面 file-list 的 2 处 spec）

`services/api/src/modules/agent/agent.service.spec.ts`、`agent-diagnosis.spec.ts` 各自 `jest.mock('@gri/agent-core', …)` 是**手写假模块**（ESM 重定向），未含新导出 `createDelegateTool`；`agent.service.ts` 新增值导入后，若不补 mock 工厂，两 spec 运行时会 `createDelegateTool is not a function`。故在这两处 mock 各补 1 个 `createDelegateTool` 桩工厂（6 行），**属接线必要连带**，不改变任何断言。规则 3「既有测试变红必须修好」正是此意。

---

## 五、自检结果（命令 + 实际输出摘要）

```bash
# ① 底座单测
cd packages/agent-core && node --test --test-force-exit "tests/**/*.test.js"
#   ℹ tests 123  ℹ pass 123  ℹ fail 0     ← 既有 98 + 新增 25（cli-delegate），零回归

# ② API 类型检查
cd services/api && npx tsc --noEmit
#   TSC_EXIT=0

# ③ API 全量测试
cd services/api && npx jest
#   Test Suites: 48 passed, 48 total
#   Tests:       646 passed, 646 total

# ④ 复验脚本
bash .agents/claude/outputs/b3c-verify.sh
#   PASS=51 FAIL=0 VERIFY_EXIT=0   （含 §8 claude-code 真跑：委派"读文件总结"得非空摘要）
```

### 验收标准逐条对照

| # | 标准 | 证据 |
|---|------|------|
| 1 | 工具注册（`list()` 含 `agent.delegate`） | verify §1.1–§1.3；§10.7 装配 grep |
| 2 | cwd 白名单：内放行 / `/tmp` 类越界拒绝（不 spawn） | verify §2.1–§2.9（§2.8 拒绝、§2.9 `run` 未被调） |
| 3 | 正常委派：桩回 `{text:'摘要'}` → 返回含摘要，**父只拿摘要** | verify §3.1–§3.4（返回体白名单，无 stderr/pid） |
| 4 | 超时/错误：桩抛错 / `timedOut` → `ok:false`（不静默） | verify §4.4–§4.7 |
| 5 | 续接：claude-code `--resume <id>`、codex `exec resume <id> <p>`、hermes/openclaw 忽略 | verify §5.1–§5.7 |
| 6 | 默认只读：argv 不含 DENYLIST；不传 `allowDangerous` | verify §6.1–§6.4 + §10.3 |
| 7 | 审计：`onRun` 以 `tool_name='agent.delegate'` 被调用 | verify §7.1–§7.3 |
| 8 | 真跑（可选）：委派只读子任务给 claude-code 得非空摘要 | verify §8.1–§8.2（INFO 打印真实摘要） |
| 9 | 零回归 + C9 + 零明文 | verify §9.1–§9.3 + §10.9 + 末行 `PASS=51 FAIL=0 VERIFY_EXIT=0` |

---

## 六、设计模式与红线合规

| 红线 | 落实 |
|------|------|
| **本体驱动** | 无结构变更（工具为运行态能力，非持久化结构；审计复用既有 `agent.tool_runs`，无需迁移） |
| **OO 四特性** | 多态：同为「外部 agent」能力，① 走路由分支（换脑子）、② 走工具（派活儿），底座对两者**零特判**；封装：`createDelegateTool` 收口白名单/超时/摘要裁切，调用方只见 `{ok,summary,…}` |
| **设计模式** | **Factory（工具工厂）**：`createDelegateTool` 注入差异（backends/白名单）产同形 Tool；**Strategy**：四后端各自 `buildArgs`（argv 策略）；**Adapter**：委派工具把 `CliBackendRegistry.run` 适配成 Tool 契约；**Null Object**：`cliBackends` 缺省 `null` → 不崩、调用才 fail-fast |
| **fail-fast** | cwd 越界 / 未注入 registry / run 抛错 / timedOut / 空文本 → **一律明确失败**，绝不静默返回空成功 |
| **身份唯一真源** | 未触碰 |

---

## 七、未决项

无（`❓ 需确认` 空项）。开放设计点见 §三，必要连带见 §四。

- 可选真跑依赖本机已装 `claude`（本机已证通）；离线环境 `B3C_SKIP_REAL=1` 跳过 §8（记 SKIP，不影响 `FAIL=0`）。
- openclaw/hermes **不做续接**（按任务卡「实探」：openclaw 无显式 resume flag、hermes one-shot）；传 `resumeKey` 退化为新上下文，已在 §三.4 明示。
