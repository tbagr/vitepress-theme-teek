# vitepress-theme-teek 项目结构说明

> 一个轻量、简洁高效、灵活配置、易于扩展的 VitePress 主题

---

## 目录总览

```
vitepress-theme-teek/
├── packages/               # 核心功能包（monorepo 子包）
├── plugins/                # VitePress 插件（独立发布的 npm 包）
├── build/                  # 构建工具链（负责打包和发布）
├── docs/                   # 官方文档站点
├── typings/                # 全局类型声明
├── dist/                   # 构建产物输出目录
├── package.json            # 根 package.json（monorepo 配置中心）
├── pnpm-workspace.yaml     # pnpm 工作区配置
├── tsconfig.json           # TypeScript 根配置（项目引用）
├── tsconfig.base.json      # TypeScript 基础配置
├── tsconfig.web.json       # TypeScript Web 配置（packages 专用）
├── eslint.config.js        # ESLint 配置
├── commitlint.config.js    # Commit 提交规范配置
├── .prettierrc.json        # Prettier 代码格式化配置
├── .editorconfig           # 编辑器统一配置
├── .versionrc              # standard-version 版本生成配置
├── eslintrc-globals.js     # ESLint 全局变量声明（Vue Composition API）
├── .gitignore              # Git 忽略规则
├── .prettierignore         # Prettier 忽略规则
├── .husky/                 # Git Hooks 配置
├── .github/                # GitHub 配置（Issue 模板、Actions）
├── .changeset/             # Changesets 版本管理配置
└── .vscode/                # VS Code 工作区配置
```

---

## 根目录配置文件详解

### package.json

根 `package.json` 是整个 monorepo 的控制中心，包含：

- **版本号**：`version: "1.6.2"`，所有子包共享
- **包管理器**：`pnpm@10.7.1`
- **工作区依赖**：所有 `@teek/*` 包通过 `workspace:*` 引用
- **核心脚本**：
  - `stub`：开发模式构建（构建所有子包为开发形态）
  - `build`：生产构建（清理 → 构建产物）
  - `docs:dev` / `docs:build`：文档站点开发/构建
  - `packages:stub`：构建 packages 下所有子包
  - `plugins:stub`：构建 plugins 下所有插件
  - `cs` / `cs:version` / `cs:release`：Changesets 版本管理
  - `release` / `release-*`：standard-version 版本发布

### pnpm-workspace.yaml

定义 monorepo 工作区范围和共享依赖版本：

```yaml
packages:
  - packages/* # 核心功能包
  - plugins/* # VitePress 插件
  - docs # 文档站点
  - build # 构建工具
```

使用 `catalog` 统一管理共享依赖版本（vite、vitepress、sass 等），确保所有子包依赖版本一致。

### tsconfig.json / tsconfig.base.json / tsconfig.web.json

采用 TypeScript 项目引用模式：

- `tsconfig.json`：根配置，仅引用 `tsconfig.web.json`
- `tsconfig.base.json`：共享基础配置，定义 `@teek/*` 路径映射
- `tsconfig.web.json`：实际编译配置，覆盖 `packages/` 下所有 TS/Vue 文件

### eslint.config.js

ESLint flat config 格式，支持：

- Vue 文件解析（`vue-eslint-parser`）
- TypeScript 文件解析（`@typescript-eslint/parser`）
- Prettier 格式化集成
- 丰富的代码质量规则

### commitlint.config.js

基于 `cz-git` 的交互式提交规范：

- 支持 `feat`、`fix`、`docs`、`refactor`、`chore` 等类型
- 带 emoji 的交互式提交提示
- 支持自定义 scope 和关联 Issue

### .versionrc

`standard-version` 自动生成 CHANGELOG 的配置，定义各提交类型在 CHANGELOG 中的显示标题。

---

## packages/ — 核心功能包（重点）

`packages/` 是整个主题的核心代码库，包含 9 个子包，通过 `@teek/*` 命名空间组织。

### packages/teek — 主题入口包

**npm 名称**：`vitepress-theme-teek`
**作用**：整个主题的入口，用户安装后直接使用的包。

| 文件           | 说明                                                |
| -------------- | --------------------------------------------------- |
| `index.ts`     | 主入口，继承 VitePress 默认主题，注册所有组件和功能 |
| `version.ts`   | 版本号定义（`1.6.2`），构建时自动同步               |
| `icons.ts`     | 导出 `@teek/static/icons` 的图标                    |
| `package.json` | 包配置，`module` 指向 `./index.ts`                  |

**核心逻辑**（`index.ts`）：

- 继承 `DefaultTheme`，扩展为 Teek 主题
- 使用 `TeekConfigProvider` 包裹 `TkLayout` 作为布局
- 在 `enhanceApp` 中注册全局组件（目录页、归档页、登录页等）
- 初始化站点分析（百度、Google、Umami、Clarity）
- 处理永久链接首次加载的 404 问题
- 导出所有子包的公共 API

### packages/config — 主题配置中心

**npm 名称**：`@teek/config`
**作用**：定义主题的全部配置类型和配置加载逻辑。

| 文件/目录           | 说明                                              |
| ------------------- | ------------------------------------------------- |
| `index.ts`          | 核心入口，导出 `defineTeekConfig` 函数            |
| `types.ts`          | `TeekConfig` 接口定义（300+ 行配置项）            |
| `interface/`        | 各配置模块的接口类型定义                          |
| `vite-plugins.ts`   | Vite 插件注册逻辑（侧边栏、永久链接、文档分析等） |
| `auto-frontmatter/` | 自动生成 frontmatter 逻辑                         |
| `post/`             | 文章数据处理逻辑                                  |

**关键功能**：

- `defineTeekConfig()`：用户配置入口，合并 Teek 配置和 VitePress 配置
- 注册弱依赖插件（可关闭）：侧边栏、永久链接、H1 标题、文档分析、自动 frontmatter
- 注册强依赖插件（不可关闭）：目录页、文件内容加载器
- 配置 Markdown 插件（容器、Demo、视频、分享卡片等）

### packages/components — Vue 组件库

**npm 名称**：`@teek/components`
**作用**：主题的所有 Vue 组件，分为通用组件和主题组件。

#### 通用组件（`common/`）

| 组件                   | 说明                  |
| ---------------------- | --------------------- |
| `article-page/`        | 文章页面基础容器      |
| `avatar/`              | 头像组件              |
| `breadcrumb/`          | 面包屑导航            |
| `focus-trap/`          | 焦点陷阱（弹窗场景）  |
| `icon/`                | 图标组件              |
| `image-viewer/`        | 图片查看器            |
| `input-slide/`         | 滑动输入框            |
| `message/`             | 消息提示              |
| `page-card/`           | 页面卡片容器          |
| `pagination/`          | 分页器                |
| `popover/`             | 弹出层                |
| `segmented/`           | 分段控制器            |
| `title-tag/`           | 标题标签（如 "置顶"） |
| `transition-collapse/` | 折叠过渡动画          |
| `verify-code/`         | 验证码输入            |
| `vp-container/`        | VitePress 容器扩展    |

#### 主题组件（`theme/`）

**首页相关**：
| 组件 | 说明 |
|------|------|
| `home-main/` | 首页主布局 |
| `home-banner/` | 首页 Banner（支持大图/小图/全屏背景） |
| `home-post/` | 首页文章列表 |
| `home-card/` | 首页卡片容器 |
| `home-card-my/` | 博主信息卡片 |
| `home-card-category/` | 分类卡片 |
| `home-card-tag/` | 标签卡片 |
| `home-card-top-article/` | 精选文章卡片 |
| `home-card-friendLink/` | 友情链接卡片 |
| `home-card-doc-analysis/` | 站点统计卡片 |
| `home-feature/` | VitePress Feature 区域 |
| `home-fullscreen-wallpaper/` | 全屏壁纸模式 |

**文章页相关**：
| 组件 | 说明 |
|------|------|
| `article-title/` | 文章标题 |
| `article-info/` | 文章信息（作者、日期、分类等） |
| `article-analyze/` | 文章分析（字数、阅读时间） |
| `article-appreciation/` | 文章赞赏（微信/支付宝） |
| `article-breadcrumb/` | 文章面包屑 |
| `article-code-block/` | 代码块增强 |
| `article-heading-highlight/` | 标题高亮 |
| `article-image-preview/` | 文章图片预览 |
| `article-page-style/` | 文章页面样式切换 |
| `article-share/` | 文章分享 |
| `article-update/` | 最近更新栏 |
| `article-banner/` | 文章页顶部 Banner |

**功能页**：
| 组件 | 说明 |
|------|------|
| `page-archives/` | 归档页 |
| `page-article-overview/` | 文章清单页 |
| `page-catalogue/` | 目录页 |
| `page-login/` | 登录页 |
| `page-risk-link/` | 风险链接提示页 |

**评论系统**：
| 组件 | 说明 |
|------|------|
| `comment-artalk/` | Artalk 评论 |
| `comment-giscus/` | Giscus 评论 |
| `comment-twikoo/` | Twikoo 评论 |
| `comment-waline/` | Waline 评论 |

**布局与交互**：
| 组件 | 说明 |
|------|------|
| `layout/` | 主布局（包裹 VitePress 默认布局） |
| `body-bg-image/` | 页面背景图 |
| `config-provider/` | 配置提供者（上下文） |
| `demo-code/` | 代码演示组件 |
| `footer-group/` | 页脚信息组 |
| `footer-info/` | 页脚信息 |
| `notice/` | 公告弹窗 |
| `right-bottom-button/` | 右下角按钮组（回到顶部、评论等） |
| `route-loading/` | 路由加载动画 |
| `sidebar-trigger/` | 侧边栏触发器 |
| `theme-enhance/` | 主题增强（聚光灯、布局模式等） |

### packages/composables — Vue 组合式函数

**npm 名称**：`@teek/composables`
**作用**：提供 25+ 个 Vue 3 Composition API 工具函数。

| 函数                    | 说明               |
| ----------------------- | ------------------ |
| `on-click-outside`      | 点击外部关闭       |
| `use-anchor-scroll`     | 锚点滚动           |
| `use-clipboard`         | 剪贴板操作         |
| `use-copy-banner`       | 复制提示横幅       |
| `use-debounce`          | 防抖函数           |
| `use-element-hover`     | 元素悬停检测       |
| `use-event-listener`    | 事件监听器         |
| `use-locale`            | 国际化             |
| `use-media-query`       | 媒体查询           |
| `use-mounted`           | 组件挂载检测       |
| `use-namespace`         | BEM 命名空间       |
| `use-popover-size`      | 弹出层尺寸计算     |
| `use-scope-dispose`     | 作用域销毁         |
| `use-scroll-data`       | 滚动数据           |
| `use-scrollbar-size`    | 滚动条尺寸         |
| `use-storage`           | 本地存储           |
| `use-switch-data`       | 数据切换           |
| `use-text-types`        | 文本类型           |
| `use-theme-color`       | 主题色             |
| `use-uv-pv`             | UV/PV 统计         |
| `use-view-transition`   | 视图过渡动画       |
| `use-vp-router`         | VitePress 路由封装 |
| `use-window-size`       | 窗口尺寸           |
| `use-window-transition` | 窗口过渡           |
| `use-z-index`           | z-index 管理       |

### packages/helper — 工具函数库

**npm 名称**：`@teek/helper`
**作用**：提供类型判断、日期处理、颜色操作、分析统计等通用工具。

| 文件                             | 说明                                              |
| -------------------------------- | ------------------------------------------------- |
| `is.ts`                          | 类型判断工具（isString、isNumber、isFunction 等） |
| `date.ts`                        | 日期格式化（formatDate）                          |
| `util.ts`                        | 通用工具（withBase 等）                           |
| `types.ts`                       | 类型定义                                          |
| `color.ts`                       | 颜色处理工具                                      |
| `analytics/baidu-analytics.ts`   | 百度统计集成                                      |
| `analytics/google-analytics.ts`  | Google Analytics 集成                             |
| `analytics/umami-analytics.ts`   | Umami 统计集成                                    |
| `analytics/clarity-analytics.ts` | Microsoft Clarity 集成                            |

### packages/markdown — Markdown 插件

**npm 名称**：`@teek/markdown`
**作用**：扩展 VitePress Markdown 渲染能力，提供自定义容器和插件。

| 文件/目录                    | 说明                   |
| ---------------------------- | ---------------------- |
| `index.ts`                   | 导出所有 Markdown 插件 |
| `types.ts`                   | 插件类型定义           |
| `plugins/todo.ts`            | TODO 容器插件          |
| `plugins/container.ts`       | 自定义容器插件         |
| `plugins/shareCard.ts`       | 分享卡片插件           |
| `plugins/imgCard.ts`         | 图片卡片插件           |
| `plugins/navCard.ts`         | 导航卡片插件           |
| `plugins/demo.ts`            | 代码演示插件           |
| `plugins/video.ts`           | 视频嵌入插件           |
| `helper/card-container.ts`   | 卡片容器工具           |
| `helper/simple-container.ts` | 简单容器工具           |
| `helper/index.ts`            | 导出工具函数           |

### packages/locale — 国际化

**npm 名称**：`@teek/locale`
**作用**：提供中英文国际化支持。

| 文件            | 说明                     |
| --------------- | ------------------------ |
| `index.ts`      | 导出语言配置类型和语言包 |
| `lang/zh-cn.ts` | 简体中文语言包           |
| `lang/en.ts`    | 英文语言包               |

### packages/static — 静态资源

**npm 名称**：`@teek/static`
**作用**：存放图标、图片等静态资源。

| 目录        | 说明                |
| ----------- | ------------------- |
| `icons/`    | 主题图标集（SVG）   |
| `iconfont/` | iconfont 社交图标库 |
| `img/`      | 静态图片资源        |
| `index.ts`  | 导出图标            |

### packages/theme-chalk — 主题样式

**npm 名称**：`@teek/theme-chalk`
**作用**：主题的全部 SCSS 样式文件。

| 目录/文件              | 说明                                |
| ---------------------- | ----------------------------------- |
| `src/index.scss`       | 主入口样式                          |
| `src/base.scss`        | 基础样式                            |
| `src/var/`             | SCSS 变量定义（颜色、间距、字号等） |
| `src/mixins/`          | SCSS 混入                           |
| `src/common/`          | 通用样式                            |
| `src/components/`      | 组件样式                            |
| `src/tk-plus/`         | Teek 扩展样式                       |
| `src/vp-plus/`         | VitePress 扩展样式                  |
| `src/markdown-plugin/` | Markdown 插件样式                   |

构建时通过 `build/theme-chalk.ts` 编译为 CSS，输出到 `dist/theme-chalk/`。

---

## plugins/ — VitePress 插件

`plugins/` 下的 7 个插件是独立的 npm 包，作为 VitePress/Vite 插件在构建时注入。

| 插件                                   | 说明                            |
| -------------------------------------- | ------------------------------- |
| `vitepress-plugin-sidebar-resolve`     | 自动生成侧边栏（根据目录结构）  |
| `vitepress-plugin-permalink`           | 自动生成永久链接                |
| `vitepress-plugin-md-h1`               | 自动为 Markdown 添加 H1 标题    |
| `vitepress-plugin-catalogue`           | 自动生成目录页                  |
| `vitepress-plugin-doc-analysis`        | 文档内容分析（字数、分类统计）  |
| `vitepress-plugin-file-content-loader` | 文件内容加载器（Post 数据处理） |
| `vitepress-plugin-auto-frontmatter`    | 自动生成 frontmatter            |

每个插件目录结构：

```
plugin-name/
├── src/              # 源码
├── dist/             # 构建产物
├── build.config.ts   # unbuild 构建配置
├── tsconfig.json     # TypeScript 配置
├── package.json      # 包配置
├── README.md         # 使用文档
└── CHANGELOG.md      # 变更日志
```

---

## build/ — 构建工具链

**npm 名称**：`@vitepress-theme-teek/build`
**作用**：负责整个项目的构建、打包和发布。

| 文件/目录            | 说明                                                 |
| -------------------- | ---------------------------------------------------- |
| `index.ts`           | 构建主入口，执行版本同步、类型定义复制、产物打包     |
| `build.config.ts`    | unbuild 配置                                         |
| `theme-chalk.ts`     | SCSS → CSS 编译脚本（Sass + PostCSS）                |
| `helper/`            | 构建辅助工具（路径常量、外部依赖、Rollup 配置等）    |
| `tasks/`             | 构建任务（full-bundle 全量打包、modules 模块化打包） |
| `scripts/publish.sh` | 发布脚本                                             |
| `package.json`       | 构建依赖（rollup、esbuild、sass、postcss 等）        |

---

## docs/ — 官方文档站点

**npm 名称**：`vitepress-theme-teek-docs`
**作用**：VitePress 文档站点，使用 Teek 主题自身。

| 目录                        | 说明                        |
| --------------------------- | --------------------------- |
| `.vitepress/`               | VitePress 配置              |
| `.vitepress/config.ts`      | 站点配置（导入 teekConfig） |
| `.vitepress/teek-config.ts` | Teek 主题配置               |
| `.vitepress/theme/`         | 自定义主题扩展              |
| `.scripts/`                 | 百度推送脚本                |
| `@pages/`                   | 功能页（归档、清单等）      |
| `@fragment/`                | 碎片化页面                  |
| `01.指南/`                  | 指南文档                    |
| `10.配置/`                  | 配置文档                    |
| `15.主题开发/`              | 开发文档                    |
| `20.资源/`                  | 资源文档                    |
| `30.生态/`                  | 生态文档                    |
| `examples/`                 | 示例页面                    |
| `public/`                   | 静态资源                    |
| `index.md`                  | 首页                        |
| `personal.md`               | 个人页                      |

---

## .husky/ — Git Hooks

| 文件              | 说明                           |
| ----------------- | ------------------------------ |
| `commit-msg`      | 提交信息规范检查（commitlint） |
| `pre-commit`      | 提交前代码检查（lint-staged）  |
| `lintstagedrc.js` | lint-staged 配置               |

---

## .github/ — GitHub 配置

| 目录/文件                             | 说明                       |
| ------------------------------------- | -------------------------- |
| `workflows/baiduPush.yml.disabled`    | 百度推送 Actions（已禁用） |
| `ISSUE_TEMPLATE/bug.yaml`             | Bug 报告模板               |
| `ISSUE_TEMPLATE/feature_request.yaml` | 功能请求模板               |
| `ISSUE_TEMPLATE/join_case.yaml`       | 案例提交模板               |
| `ISSUE_TEMPLATE/question.yaml`        | 问题咨询模板               |

---

## 其他配置文件

| 文件                     | 说明                                        |
| ------------------------ | ------------------------------------------- |
| `.editorconfig`          | 编辑器统一配置（UTF-8、LF 换行、Tab 缩进）  |
| `.prettierrc.json`       | Prettier 配置（120 字符宽度、分号、双引号） |
| `.prettierignore`        | Prettier 忽略规则                           |
| `.versionrc`             | standard-version CHANGELOG 生成配置         |
| `.changeset/config.json` | Changesets 配置（公开发布、main 基准分支）  |
| `eslintrc-globals.js`    | ESLint 全局变量（Vue Composition API）      |
| `typings/env.d.ts`       | 全局类型声明（.vue、.scss、.data.ts）       |

---

## 构建流程

```
pnpm stub          # 开发构建：构建所有子包为开发形态
pnpm build         # 生产构建：清理 → 编译 SCSS → Rollup 打包 → 复制类型定义
pnpm docs:dev      # 文档开发：启动 VitePress 开发服务器
pnpm docs:build    # 文档构建：先 stub 构建子包 → 再构建文档
```

## 发布流程

```
pnpm cs            # 创建 changeset
pnpm cs:version    # 应用版本号
pnpm cs:release    # 构建插件 → 发布到 npm
```
