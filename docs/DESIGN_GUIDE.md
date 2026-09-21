# GRI 多行业平台统一风格方案

本文档���详���细���描述了 GRI 平台的视觉、交互和主题规范，���旨在让所有前端（Web、H5、小程序）和后端管理界面保持一致的专业感和易用性。方案分为原则、设计 tokens、组件规范、主题与品牌、实施步���骤以及参考案例六部分，便于团队直接落地。

## 1. 设计原则（团队共识）

| 编号 | 原则 | 说明 | 参考案例 |
|------|------|------|----------|
| P1 | **内容���优先，信息密集** | 平台面向运营者、商家、配送员等业务角色，首要目标是让关���键数据一目了然，���避免装���饰性元素���抢占注意力。 | 后台系统（Ant Design Pro、���飞书企业后台）、SaaS ��� � � 数据看板（Grafana、Datadog） |
| P2 | **一致的���层级与间���距** | 使用 8px ��� � � 基准网格，所有间���距（margin、padding、间���隙）取 8 的倍数；字号、图标尺寸同样���遵���循 4px ��� � � 基线。 | Material Design 8dp 网格、Ant Design 8px 间���距 |
| P3 | **明确的状态与反���馈** | � 每个可操作项都有默认、 hover、focus、active、disabled 五种状态；加载、成功、错误、警告采用统一的���颜色与图标。 | Apple 人机界面指南（状态���颜色）、Ant Design 状态色 |
| P4 | **可���访问性第一** | ��� � � 色彩对比度 ≥ 4.5：1（AA），关���键信息不仅���靠色彩���辨识；提供���焦点可见、���键���盘可遍历、ARIA 标���签。 | WCAG 2.1 AA、微���软 Fluent |
| P5 | **响应式与渐进增强** | ��� � � 桌面���优先的宽���屏布局（���侧边���栏 + 主内容），移动端采用���抽���屉或底部 TAB；在 uni-app/Vue 中使用响应式容器（`flex`、`grid`、`rem`/`vw`）实现同一���套代码多端���适配。 | ��� � � 响应式后台（Ant Design Pro Layout）、GitHub ��� � � 首页 |

## 2. ��� � � 基���础设计 tokens（可直接写进 Ant Design 主题或 CSS 变量）

| Token | ��� � � 值（示例） | 用途 | 说明 |
|-------|------------|------|------|
| `--color-primary` | `#1890FF` | 主品牌色（按���钮、���链接、激活状态） | Ant Design ��� � � 默认���蓝，可根据公司 LOGO ���� �� �� 调整 |
| `--color-success` | `#52C41A` | 成功、完成 | ���� �绿色 |
| `--color-warning` | `#FAAD14` | ��� � � 警告、待处理 | ��� � � 黄色 |
| `--color-error` | `#FF4D4F` | ���� �� �� 错误、删除 | 红色 |
| `--color-info` | `#1890FF` | 信息提示 | 与 primary 共用或另选青���蓝 |
| `--color-bg-base` | `#FFFFFF` | 页面底色 | 白色 |
| `--color-bg-panel` | `#F6F8FF` | 卡片/���侧边���栏背景 | ��� � � 极���浅���蓝���灰，提升���层次感 |
| `--color-text-primary` | `#000000` | 主文本 | ��� � � 黑色（对比度 21:1） |
| `--color-text-secondary` | `#666666` | ��� � � 次要文本 | 中���灰 |
| `--color-text-disabled` | `#BFBFBF` | 禁用文本 | ��� � � 浅���灰 |
| `--radius-sm` | `4px` | 小���圆角（输入���框、标���签） |  |
| `--radius-md` | `6px` | 中���圆角（卡片、模态���框） |  |
| `--radius-lg` | `8px` | 大���圆角（按���钮、���弹���窗） |  |
| `--spacing-unit` | `8px` | ��� � � 基���础间���距 | 所有 margin/padding 取该值的整数倍 |
| `--font-base` | `14px` | ��� � � 基���础字号 | 正文、表格 |
| `--font-heading` | `16px`（H3）、`20px`（H2）、`24px`（H1） | 标题 | 行高 1.4 |
| `--font-weight-normal` | `400` | ��� � � 常规文字 |  |
| `--font-weight-medium` | `500` | 半���粗（按���钮、标���签） |  |
| `--font-weight-bold` | `600` | 加���粗（重要标题） |  |
| `--icon-size` | `16px`（小）、`20px`（中）、`24px`（大） | 图标尺寸 | 与间���距对���齐 |

> **实现方式**  
> - 在 Ant Design 自定义主题中修改 `@primary-color`、`@border-radius-base`、`@font-size-base` 等 Less 变量。  
> - 在 uni-app/Vue 中使用 CSS 变量（`:root { --color-primary: #1890FF; ... }`），并在全局样式（`App.vue`、`index.css`）引用。

## 3. 组件���层面的统一规范

### 3.1 通用布局容器
| 容器 | ��� � � 推���荐实现 | 备注 |
|------|----------|------|
| **页面外���壳** | `<Layout>`（Ant Design） → `header` + `sider` + `content` | ��� � � 桌面：���固定宽度���侧边���栏（200px）+ ��� � � 响应式折���叠；移动：���侧边���栏变为���抽���屉（`trigger={null}`） |
| **卡片** | `<Card>`（Ant Design） → 无边���框或仅���细线（`bordered={false}`），背景使用 `--color-bg-panel`，���圆角 `--radius-md` | ��� � � 内部标题使用 `Card.title`，内容区保持 16px ��� � � 内间���距 |
| **表格** | `<Table>`（Ant Design） → 分页、尺寸 `middle`、`size="small"`（密集场景） | 表头背景 `--color-bg-panel`，奇偶行背景交替使用 `rgba(0,0,0,0.02)` |
| **表单** | `<Form>`（Ant Design） → ��� � � 布局 `inline`（���搜索���栏）或 `vertical`（编辑页），标���签宽度统一 80px，间���距 `--spacing-unit` | 使用 `Form.Item` 的 `noStyle` 与自定义 `label` 配合 `colon:false` 实现紧���凑布局 |
| **列表** | `<List>`（Ant Design） → `grid` 或 `vertical`，`itemLayout="horizontal"`（头像+文字） | ��� � � 每项间���距 `--spacing-unit`，右���侧操作按���钮使用 `space` ��� � � 包���裹 |

### 3.2 导���航与交互
| 组件 | ��� � � 推���荐实现 | 参考 |
|------|----------|------|
| **���顶部导���航** | `Layout.Header` → ��� � � 左���侧 LOGO（���固定宽度 160px），右���侧用户头像 + 下拉菜单（Ant Design `Dropdown`） | ��� � � 飞书、���钉��钉后台 |
| **���侧边菜单** | `Layout.Sider` → Ant Design `Menu`（mode="inline"，主题 `dark` 或 `light` 根据背景），选中状态使用 `--color-primary` ��� � � 背景＋白字 | Ant Design Pro Layout |
| **面包���屑** | `Breadcrumb`（Ant Design） → 分隔符使用 “/”，���颜色 `--color-text-secondary` | 企业级后台通用 |
| **操作按���钮** | 主按���钮：`<Button type="primary">`（使用 `--color-primary`）；次按���钮：`<Button>`（边���框色 `--color-primary`，文字同色）；危险按���钮：`<Button type="danger">`（`--color-error`） | ��� � � 按���钮大小统一 `middle`（高度 32px），���圆角 `--radius-md` |
| **加载状态** | 全局页面加载：`Spin`（������嵌���套在 Layout 中）；局部加载：按���钮 `loading`、`Spin` ��� � � 包���裹表格或卡片 | ��� � � 颜色使用 `--color-primary` |
| **提示与���弹���窗** | `Message`、`Notification`、`Modal`（Ant Design） → ��� � � 颜色语义同上；`Modal` 宽度 600px（���桌面），100% 宽度（移动） | 确保 `maskClosable={false}` ��� � � 防止误点关闭 |

### 3.3 表单控件统一
| ��� � � 控件 | ��� � � 默认属性 | 备注 |
|------|----------|------|
| `Input` | `allowClear`、`size="middle"`、`style={{ width: 200px }}` | 配合 `Search` 组件使用 |
| `Select` | `showSearch`、`allowClear`、`optionLabelProp="label"`、`filterOption` | 下拉菜单宽度匹配输入���框 |
| `DatePicker` | `size="middle"`、`showTime`（若需要） | 面板���颜色与主题一致 |
| `Switch` | `size="small"` | ��� � � 开关���颜色使用 `--color-primary`（打开）和 `--color-bg-panel`（关闭） |
| `Checkbox` / `Radio` | `size="small"` | 选中色 `--color-primary` |

### 3.4 ��� � � 数据展示组件（图表、地图、VR、���签名）
- **图表**：推���荐使用 Ant Design 的 `Chart` ��� � � 包（基于 G2Plot）或轻量级 `recharts`，主题色采用 `--color-primary`、`--color-success`、`--color-warning`、`--color-error`，背景透明或 `--color-bg-panel`。
- **地图**：已有高德/百度���适配器（`GaodeMapAdapter.js`、`BaiduMapAdapter.js`），统一封装为 `<MapContainer>` 组件，属性包括 `provider`（`gaode`\|`baidu`）、`zoom`、`center`、`markers`（数组），内部处理加载状态与错误提示（使用 `Spin` + `Alert`）。
- **VR/全景**：基于 Three.js 的球体映射，封装为 `<VRViewer>`，接受 `images`（URL ��� � � 数组）、`hotspots`（位置+内容），默认开启自动旋转，提供全screen ��� � � 按���钮。
- **电子���签名**：封装为 `<SignaturePad>`，内部使用 Canvas，提供 `clear`、`undo`、`save`（返回 Base64）方法；外���层配合 `<Form.Item>` 提交。

## 4. 主题与品牌���扩展

| 元素 | ��� � � 建议值 | 说明 |
|------|--------|------|
| **LOGO** | ��� � � 建议使用单色或双色（���蓝+白）的简约图标，宽高比 4:1，放置在左上角导���航���栏，高度 32px，���垂直居中。 |  |
| **字体家族** | ��� � � 默认使用系统 UI ���� �� �� 需要的字体（`-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `Roboto`, `'Helvetica Neue'`, `Arial`, `sans-serif`），保证在不同 OS 上���渲���染一致。如需品牌字体，可在 `index.html` ��� � � 引入 Google Fonts（例如 `Inter`）并在全局样式设置 `font-family: 'Inter', system-ui;`。 |  |
| **图标库** | 继续使用 Ant Design ��� � � 内置图标（`@ant-design/icons`），如需自定义图标（如公司专属符号），可通过 `@ant-design/icons` 的 `createFromIconfontCN` 生成，并放在 `src/assets/icons/` 目录。 |  |
| **动画** | Ant Design 自带的过渡（`motion`）已满足大多数场景；如需自定义（如卡片展开、���抽���屉���滑动），使用 `rc-motion` 或 CSS `transition: all .2s ease-in-out;`。保持时长 150‑200ms，���避免过度花���哨。 |  |

## 5. 实施步���骤（可直接分�分��分配给前端/后端团队）

| 步���骤 | ���� �� �� 负责方 | ���� �� �� 操作 | 产出 |
|------|--------|------|------|
| **1. ��� � � 基���础 Token 统一** | 前端架构师 | 在 `src/theme/`（Less 或 CSS）定义上面的 `--color-*`、`--spacing-unit`、`--radius-*`、`--font-*` 变量；在 Ant Design 主题文件中引用这些变量。 | `src/theme/index.less`（或 `index.css`） |
| **2. Layout ��� � � 基座** | 前端 UI 组 | 创建 `src/layouts/BasicLayout.vue`（或 `.jsx`）使用 Ant Design `Layout`，左���侧 `Sider`（可折���叠），���顶部 `Header`。配���套提供 `useCollapse` hook（响应式���抽���屉）。 | `BasicLayout` 组件 |
| **3. 全局组件库** | 前端 UI 组 | 封装常用容器：`BaseCard`、`BaseTable`、`BaseForm`、`BaseButton`、`BaseInput`、`BaseSelect`、`BaseSpin`、`BaseAlert`、`BaseModal`、`BaseMapContainer`、`BaseVRViewer`、`BaseSignaturePad`。每个组件内部仅使用 theme tokens，外部可透传 Ant Design props。 | `src/components/base/` 目录下的一��套基���础组件 |
| **4. 页面模板** | 各业务前端团队 | 新页面直接���套用 `BasicLayout` + ��� � � 基���础组件，业务���逻辑仅关注数据请求与表单验证。例如���订单列表页：`<BaseTable :columns="columns" :data="list" />`。 | 统一的页面结构 & 视觉 |
| **5. 主题切换（可选）** | 前端架构师 | ��� � � 若需要暗色模式或多品牌，准备两���套 token 文件（`light.less`、`dark.less`），通过 `window.__THEME__` 或 CSS `class` 切换。可参考 Ant Design 的 `theme` ��� � � 动态切换方案。 |  |
| **6. 文档与示例** | 前端文档工程师 | 在 `docs/` ��� � � 添加 `DESIGN.md`，列出 token 表、组件使用示例（代码片段）、响应式断点（���桌面 ≥ 992px，平板 768‑991px，移动 < 768px），以及���访问性���检查清单（�颜色对比、���焦点可见、ARIA）。 |  |
| **7. ��� � � 测试与回归** | QA / 前端 | 使用 Storybook（或 uni-app 的组件���预���览）验证每个基���础组件在不同状态下的表现；运行视觉回归���测试（如 Percy）确保后续改动不破���坏统一风格。 |  |
| **8. ��� � � 持续改进** | 全体 | ��� � � 每���迭代结束后，进行一次 15 分钟的“风格���检查”会议，���检查是否有新组件未使用基���础组件或���硬编码���颜色/间���距，及时修正。 |  |

## 6. 参考成���熟网站/系统的具体取向

| 参考对象 | ��� � � 借鉴点 | 在 GRI 中的对应实现 |
|----------|--------|----------------------|
| **Ant Design Pro** | ���� �� �� 菜单布局、页头页���脚、页面切换动画、全局 loading、权限占位 | 直接采用其 `BasicLayout`、`RouteContainer`、`Exception` 页面模板 |
| **���飞书企业后台** | 信息密集的���仪表���盘、卡片式数据���块、���顶部全局���搜索 + ���� �� �� 账号下拉、���侧边二级菜单折���叠 | 参考其 `Dashboard` 页面卡片网格、`Header` 中的���搜索���框与用户菜单 |
| **Grafana** | 时间选择器、面板可���拖���拽、外延���颜色主题、数据源统一配置 | 在���监控/统计页采用类似时间范���围选择器（`RangePicker`）和可自定义的图表卡片 |
| **Stripe  Dashboard** | ��� � � 清���晰的状态���颜色、成功/错误/警告的统一图标、操作按���钮的 loading 状态 | 参照其按���钮状态与提示���框�颜色（成功���绿、警告黄、错误红） |
| **Apple ��� � � 开发者后台** | ��� � � 极简的表单布局、字体与间���距的严格基线、���聚���焦状态的明显轮���廓 | 表单采用 8px ��� � � 基线、���聚���焦时使用 2px solid `--color-primary` ��� � � 轮���廓 |
| **Material Design 3（M3）** | ��� � � 动态色彩、形状与排版的可伸���缩系统（���适用于深色/���浅色主题） | ��� � � 若以后需要主题切换，可参考其色彩生成算法（基���础色 → ��� � � 派生色） |

## 7. ���� �� �� 快速���检查清单（在每个新页面或组件提交前）

- [ ] 使用了 `BasicLayout` 或明确声明不需要布局（如登录页）。
- [ ] 所有间��距（margin/padding）是 `8px` 的整数倍。
- [ ] 所有文字���颜色使用 token（`--color-text-primary`、`--color-text-secondary`、`--color-text-disabled`）。
- [ ] ��� � � 按���钮、输入���框、选择���框的尺寸统一为 `middle`（或特殊场景说明原因）。
- [ ] 加载状态使用 `Spin` 或按���钮 `loading`，不使用自定义 GIF ���� �闪���烁。
- [ ] ���� �� �� 错误/成功/警告信息使用对应的 Ant Design `Alert` 或 `Message`，���颜色语义正确。
- [ ] 图标尺寸与文本基线对���齐（一般选 `16px` 或 `20px`）。
- [ ] 在 uni-app/Vue 中使用了 `flex` 或 `grid` ��� � � 布局，未使用���固定 `width/height` 导致横向���滚动。
- [ ] ��� � � 已在相应的 Storybook 或组件文档中加入使用示例。

--- 
以上即为 GRI 多行业平台统一风格方案的完整说明。���遵���循此文档，所有前端与后端界面即可在视觉、交互和可���访问性上保持高度一致，提升用户体验并降低开发与维���护成本。
