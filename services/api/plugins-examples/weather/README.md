# weather —— 外部插件最小样例（P-3 契约）

一个**与教育无关**的插件，用来证明「按组件组装」这条命题：

> 一个外人放一个目录进去 → AI 教师**可列、可调**这个工具 → 删掉目录 → 工具**消失**，宿主毫发无损。

它**不在**出厂 `plugins/` 下（那是 `memory`/`tutor` 等出厂插件），而在 `plugins-examples/` —— 所以
**干净检出不会装载它**。这正是「外部」的含义：出厂零影响，装上是**使用者的选择**。

## 装载 / 卸载

宿主扫描 `AGENT_PLUGINS_DIR`（缺省 `services/api/plugins`，见 `agent-plugins.ts`）。装载是

```sh
cp -r services/api/plugins-examples/weather services/api/plugins/weather   # 装入
rm -rf services/api/plugins/weather                                        # 卸下
```

再**重启 api**（插件在启动期一次性装载，不每次消息扫盘）。装入后 `GET /api/agent/me` 的 `tools`
会多出 `weather.lookup`；卸下后消失。端到端证明见 `.agents/claude/outputs/w2.5-verify.sh`。

## 它做了什么

导出**一个工具** `weather.lookup(city)` —— 查某城市的天气（**离线确定性桩**，不联网，使端到端可复现）。

## 为什么它是「干净的样例」（契约 §一 三条红线）

1. **只描述能力**：唯一外部依赖是 `@gri/agent-core` 的 `makeTool`（工具原语，**不是**业务包）；
   不 import 任何 `@gri/*` 业务模块，不读 `apiKey`/`baseUrl`/env。
2. **工具名全局唯一**：`weather.lookup` 不在宿主保留表内；若撞名，装配期即拒（`TOOL_NAME_RESERVED`）。
3. **无密钥**：不需要 `config.secretRefs`。

清单与 `plugins/memory`、`plugins/tutor` **同源 schema**（manifest-first，见 `plugin.json`）；
weather 是其合法**子集** —— 未声明可选的 `provides`/`trust`（memory 用到）/`skill`（tutor 用到）。
