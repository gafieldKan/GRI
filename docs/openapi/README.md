# OpenAPI —— GRI 对外契约

- `agent-v1.yaml` —— `/api/v1/agent/*` 的 **OpenAPI 3.1** 机读契约（对外承诺面，B-2）。
  形状/语义的散文真源是 `docs/AGENT_PUBLIC_CONTRACT.md`；本文件是其机读镜像，供 SDK 生成、网关校验、编辑器提示。

查看/校验（零新依赖可用的姿势）：

```bash
# 任一 OpenAPI 工具皆可，例如：
npx @redocly/cli lint docs/openapi/agent-v1.yaml
# 或贴进 https://editor.swagger.io
```

约定：契约版本随响应头 `X-Agent-Api-Version` 与信封 `v` 同时下发；任何**不兼容**变更开 `/api/v2/**`，不原地改 v1。
