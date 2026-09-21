# 智学慧眼 AI 学情辅导系统 - 实施总结

**文档生成日期**: 2026 年 5 月 25 日
**项目版本**: v1.0 (MVP)

---

## 一、项目概述

**智学慧眼 (SmartLens)** 是一款基于 AI 的 K12 学情分析与互动辅导系统，采用苏格拉底式教学法，通过 AI 对话引导学生主动思考，实现个性化辅导。

### 核心特性

- **AI 互动教学**: 苏格拉底式启发教学，不直接给答案
- **知识点追踪**: 基于艾宾浩斯遗忘曲线的掌握度评估
- **多端支持**: Uni-app 跨平台，支持微信小程序、H5、App
- **公式渲染**: KaTeX 数学公式实时渲染
- **学情报告**: 动态生成学习报告和薄弱点分析

---

## 二、技术架构

### 前端架构

```
apps/web-ai-tutor/
├── pages/
│   ├── index/         # 首页（功能入口、学习统计）
│   ├── chat/          # AI 对话页（核心教学界面）
│   ├── report/        # 学情报告页
│   └── camera/        # 拍照搜题页
├── components/
│   └── MathInput.vue  # 数学公式输入器
├── store/             # Pinia 状态管理
├── utils/             # 工具函数（KaTeX 渲染）
└── api/               # API 接口封装
```

### 后端架构

```
services/ai-tutor-backend/
├── src/
│   ├── modules/
│   │   ├── session/    # 会话管理 (FSM 状态机)
│   │   ├── ai/         # AI 服务（大模型调用）
│   │   ├── question/   # 题目服务
│   │   └── report/     # 学情报告服务
│   └── db/
│       └── init.sql    # 数据库初始化脚本
```

### 技术栈

| 层次 | 技术选型 |
|------|----------|
| 前端框架 | Uni-app (Vue 3) + TDesign |
| 公式渲染 | KaTeX |
| 后端框架 | Node.js + Express |
| 数据库 | PostgreSQL 16 + pgvector |
| 缓存 | Redis 7 |
| 大模型 | Anthropic API / 通义千问 |
| 部署 | Docker + Docker Compose |

---

## 三、核心功能实现

### 1. AI 教学状态机 (FSM)

```
WAIT_START → DIAGNOSING → ANALYZING → TEACHING
                                     ↓
CHECK_UNDERSTAND ← INTERACTION
    ↓
QUIZZING → EVAL_QUIZ → EXPAND (掌握)
           ↓
       REMEDIATE (未掌握)
```

状态机核心代码位置：`services/ai-tutor-backend/src/modules/session/SessionFSM.js`

### 2. 苏格拉底式 Prompt 工程

System Prompt 核心原则：
1. 永远不直接给答案
2. 通过提问引导学生思考
3. 根据学生反应调整讲解方式
4. 使用鼓励性语言

### 3. 知识点追踪

- 使用 pgvector 进行知识点向量化
- 基于余弦相似度计算知识点关联
- 动态更新学生掌握度评分

---

## 四、已完成功能清单

### 前端 (web-ai-tutor)
- [x] 项目基础架构
- [x] Uni-app 配置 (pages.json, manifest.json)
- [x] 首页（功能入口、学习统计）
- [x] AI 对话界面（支持 LaTeX 公式）
- [x] 数学公式输入器组件
- [x] 拍照搜题页
- [x] 学情报告页
- [x] TDesign 组件库集成
- [x] KaTeX 公式渲染

### 后端 (ai-tutor-backend)
- [x] Express 服务框架
- [x] WebSocket 实时通信
- [x] AI 教学状态机 (FSM)
- [x] AI 服务层（大模型调用）
- [x] 题目服务层
- [x] 学情报告服务层
- [x] PostgreSQL 数据库设计（含 pgvector）
- [x] 数据库迁移脚本
- [x] Docker 容器化配置

### 文档
- [x] 部署指南 (DEPLOYMENT.md)
- [x] 后端服务 README
- [x] 前端应用 README
- [x] 数据库初始化脚本

---

## 五、待完成功能

### P0 - 核心功能
- [ ] WebSocket 与前端联调
- [ ] 真实大模型 API 对接
- [ ] OCR 拍照识别集成
- [ ] 学生/知识点数据持久化

### P1 - 增强功能
- [ ] 知识图谱可视化
- [ ] 学习建议生成优化
- [ ] 家长端监督功能
- [ ] 错题本功能

### P2 - 扩展功能
- [ ] 多学科支持（物理、化学）
- [ ] 语音输入/输出
- [ ] 学习报告导出 PDF
- [ ] 教师端管理后台

---

## 六、低代码平台复用评估

### 可复用的能力

| 能力 | 复用方式 | 优先级 |
|------|----------|--------|
| 组织权限管理 | 直接复用低代码平台 RBAC | P1 |
| 数据模型设计器 | 复用 Schema 管理逻辑 | P2 |
| 工作流引擎 | 评估后复用 | P2 |
| 多端发布 | 配置后启用 | P2 |

### 不可复用的核心功能

| 功能 | 原因 | 实现方式 |
|------|------|----------|
| AI 教学状态机 | 低代码平台无此能力 | 独立开发 |
| WebSocket 通信 | 低代码平台不支持 | 独立开发 |
| KaTeX 公式渲染 | 低代码平台无内置 | 独立开发 |
| pgvector 向量检索 | 需扩展数据库驱动 | 独立开发 |

### 结论

**低代码平台无法直接构建 AI 教学核心功能**，但可作为运营后台的技术底座，提供权限管理、数据模型设计等支撑能力。

推荐架构：
- **核心教学功能**: Uni-app 原生开发
- **运营后台**: 复用低代码平台
- **权限/组织**: 直接复用低代码能力

---

## 七、工作量估算

| 阶段 | 已完成 | 待完成 | 估算工时 |
|------|--------|--------|----------|
| Phase 1: 基础架构 | ✅ | - | 已完成 |
| Phase 2: AI 核心 | 状态机 | 大模型对接 | 3 天 |
| Phase 3: 前端页面 | ✅ 页面框架 | WebSocket 联调 | 2 天 |
| Phase 4: 业务完善 | - | OCR/报告/错题本 | 5 天 |
| Phase 5: 测试部署 | - | 测试/容器化 | 2 天 |

**总计**: 约 12 人天（不含产品设计和 UI 设计）

---

## 八、下一步行动

1. **立即可执行**:
   - [ ] 安装依赖：`cd apps/web-ai-tutor && npm install`
   - [ ] 启动后端：`cd services/ai-tutor-backend && npm install`
   - [ ] 配置环境变量

2. **本周完成**:
   - [ ] 完成 WebSocket 前后端联调
   - [ ] 完成大模型 API 对接
   - [ ] 完成数据库初始化

3. **下周完成**:
   - [ ] OCR 拍照识别功能
   - [ ] 学情报告完善
   - [ ] 性能优化

---

## 九、关键文件路径

### 前端
- `/home/ubantu/GRI/apps/web-ai-tutor/` - 前端应用根目录
- `/home/ubantu/GRI/apps/web-ai-tutor/pages/chat/chat.vue` - AI 对话界面
- `/home/ubantu/GRI/apps/web-ai-tutor/components/MathInput.vue` - 公式输入器

### 后端
- `/home/ubantu/GRI/services/ai-tutor-backend/` - 后端服务根目录
- `/home/ubantu/GRI/services/ai-tutor-backend/src/modules/session/SessionFSM.js` - 状态机核心
- `/home/ubantu/GRI/services/ai-tutor-backend/src/db/init.sql` - 数据库脚本

### 文档
- `/home/ubantu/GRI/docs/ai-tutor/` - 文档目录
- `/home/ubantu/.claude/plans/home-ubantu-openclaw-workspace-docs-ai-idempotent-hartmanis.md` - 原始评估报告

---

**实施团队**: GRI Team
**最后更新**: 2026 年 5 月 25 日
