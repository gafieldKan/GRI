# 智学慧眼 - NVIDIA API 配置说明

**更新日期**: 2026 年 5 月 26 日  
**API 提供商**: NVIDIA Nemotron 3 Super 120B

---

## 一、NVIDIA API 配置

### 使用的模型

| 配置项 | 值 |
|--------|-----|
| 模型名称 | NVIDIA Nemotron 3 Super 120B |
| 模型 ID | `nvidia/nemotron-3-super-120b-a12b` |
| API 端点 | `https://integrate.api.nvidia.com/v1/chat/completions` |
| 温度 | 1.0 |
| Top P | 0.95 |
| Max Tokens | 16384 |

### 环境变量配置

编辑 `services/ai-tutor-backend/.env` 文件：

```bash
# NVIDIA API 配置
LLM_API_KEY=nvapi-xxxxx  # 替换为你自己的 NGC API Key
LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
LLM_MODEL=nvidia/nemotron-3-super-120b-a12b
LLM_PROVIDER=nvidia
```

---

## 二、获取 NVIDIA API Key

1. 访问 https://build.nvidia.com/explore/discover
2. 使用 NVIDIA 账号登录（可注册）
3. 点击 "Get API Key" 获取
4. 复制 NGC API Key（格式：`nvapi-xxxxx`）

---

## 三、测试 API

### 使用 curl 测试

```bash
# 1. 创建会话
curl -X POST http://localhost:3002/api/session \
  -H "Content-Type: application/json" \
  -d '{"studentId":"s1","knowledgePointId":"math_pythagorean"}'

# 2. 发送消息
curl -X POST http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"session_xxx","message":"你好"}'
```

### 直接测试 NVIDIA API

```bash
invoke_url='https://integrate.api.nvidia.com/v1/chat/completions'
payload=$(cat <<'JSON'
{
  "model": "nvidia/nemotron-3-super-120b-a12b",
  "messages": [{"role":"user","content":"你好"}],
  "temperature": 1,
  "top_p": 0.95,
  "max_tokens": 16384,
  "reasoning_budget": 16384,
  "chat_template_kwargs": {"enable_thinking":true},
  "stream": false
}
JSON
)

curl -sS -N \
  --request POST \
  --url "$invoke_url" \
  --header "Authorization: Bearer nvapi-YOUR_KEY" \
  --header "Accept: application/json" \
  --header "Content-Type: application/json" \
  --data "$payload"
```

---

## 四、AI 教学场景示例

### 示例对话

```\n学生：你好，我想学习勾股定理
\nAI：你好！我是你的 AI 数学老师。很高兴你想学习勾股定理。
让我先了解一下你的基础。请问：
\n一个直角三角形的两条直角边分别是 3 和 4，斜边长是多少？\n\nA) 5\nB) 6\nC) 7\nD) 8\n\n请选择你的答案。\n```

### 状态流转

```\nWAIT_START → DIAGNOSING → ANALYZING → TEACHING → INTERACTION → CHECK_UNDERSTAND → QUIZZING → EVAL_QUIZ → EXPAND/MASTERED\n```

---

## 五、AIService 调用流程

```javascript
// 1. 创建会话时会初始化 AIService
const aiService = new AIService();

// 2. 调用 generateResponse 生成响应
const response = await aiService.generateResponse({
  studentGrade: 8,
  knowledgePoint: '勾股定理',
  conversationHistory: [...],
  currentState: 'WAIT_START'
});

// 3. 返回 AI 响应
console.log(response.content);
```

---

## 六、故障排除

### 问题：返回的始终是 Mock 响应

**原因**：API Key 配置为空或无效

**解决方案**：
1. 检查 `.env` 文件中的 `LLM_API_KEY` 是否正确
2. 确认 API Key 格式为 `nvapi-xxxxx`
3. 重启后端服务

### 问题：API 调用失败

**原因**：网络问题或 API Key 无效

**解决方案**：
1. 检查网络连接
2. 访问 https://build.nvidia.com/explore/discover 验证账号状态
3. 检查 API Key 是否过期

### 问题：响应速度慢

**原因**：NVIDIA API 响应时间较长

**解决方案**：
1. 使用 `stream: true` 启用流式输出
2. 考虑使用缓存
3. 优化 prompt 长度

---

## 七、费用说明

### NVIDIA API 定价

- 按 token 计费
- 查看最新定价：https://build.nvidia.com/pricing

### 费用控制建议

1. 监控 API 调用次数
2. 设置每日预算上限
3. 使用 Mock 响应进行测试
4. 优化 prompt 减少 token 消耗

---

## 八、安全建议

1. **不要提交 API Key 到代码仓库**
   - `.env` 已添加到 `.gitignore`
   - 生产环境使用密钥管理服务

2. **限制 API 访问**
   - 配置防火墙规则
   - 使用内网访问

3. **定期更换 API Key**
   - 定期更新 NVIDIA 控制台
   - 更新 `.env` 配置

---

**实施人员**: Claude Code  
**版本**: v2.0
