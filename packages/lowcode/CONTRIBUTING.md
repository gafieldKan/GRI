# 贡献指南

感谢你为 awesome-lowcode 项目做出贡献！

## 行为准则

本项目采用贡献者公约行为准则。参与本项目的每个人都应尊重彼此，建设性地合作。

## 如何贡献

### 1. Fork 仓库

点击 GitHub 上的 Fork 按钮创建你自己的副本。

### 2. 克隆仓库

```bash
git clone https://github.com/your-username/awesome-lowcode.git
cd awesome-lowcode
```

### 3. 安装依赖

```bash
npm install
```

### 4. 创建分支

```bash
git checkout -b feature/amazing-feature
```

### 5. 进行更改

进行你的更改，并确保：

- 代码符合 ESLint 规范
- 代码格式通过 Prettier 检查
- 添加必要的测试
- 更新相关文档

```bash
# 运行代码检查
npm run lint

# 检查代码格式
npm run format:check

# 运行测试
npm run test
```

### 6. 提交更改

```bash
git add .
git commit -m "feat: add amazing feature"
```

### 7. 推送并创建 Pull Request

```bash
git push origin feature/amazing-feature
```

然后在 GitHub 上创建 Pull Request。

## 开发环境设置

### 安装 Node.js

确保安装了 Node.js 18+ 版本。

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

## 代码风格

- 使用 ES6+ 语法
- 使用函数式组件和 Hooks（React）
- 遵循 Airbnb JavaScript 风格指南
- 使用有意义的变量名
- 保持代码简洁

## 提交信息规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新功能也不是修复 bug）
- `perf`: 性能优化
- `test`: 添加或修改测试
- `chore`: 构建过程或辅助工具变更

示例：

```
feat: 添加自定义组件支持
fix: 修复表单提交时的数据丢失问题
docs: 更新 README.md 添加安装说明
```

## 测试

```bash
# 运行所有测试
npm run test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式
npm run test -- --watch
```

## 构建

```bash
# 开发构建
npm run build

# 预览生产构建
npm run preview
```

## 目录结构

```
awesome-lowcode/
├── src/                    # 前端 UI 层
├── lowcode/                # 低代码核心层
├── tests/                  # 测试文件
├── .github/                # GitHub 配置
└── docs/                   # 文档
```

## 需要帮助？

- 查看 [README.md](README.md) 了解项目介绍
- 查看 [lowcode/plugins/README.md](lowcode/plugins/README.md) 了解插件开发
- 查看 issues 列表看是否有类似问题

## 许可证

通过贡献，你同意你的贡献根据本项目的 ISC 许可证进行许可。
