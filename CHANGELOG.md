# 更新日志

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## \[0.4.2-alpha] - 2026-04-03

### 新增

- **TUI 基础设施 (Phase 1)**：为后续 Dashboard 开发搭建基础
  - 安装 React + Ink 依赖 (`react@18.3.1`, `ink@5`, `ink-spinner@5.0.0`, `ink-text-input@6.0.0`)
  - 创建 `src/tui/` 目录结构
  - 添加测试依赖 (`jest`, `@testing-library/react@14`, `ink-testing-library`)

- **TUI 组件库**：
  - `ServiceCard` - 服务状态卡片组件
  - `ServiceGrid` - 服务网格布局组件
  - `LogPanel` - 日志面板组件
  - `CommandInput` - 命令输入组件

- **TUI Hooks**：
  - `useServiceStatus` - 服务状态订阅 Hook
  - `useLogStream` - 日志流管理 Hook
  - `useKeyboard` - 键盘事件处理 Hook
  - `useTerminalSize` - 终端尺寸监听 Hook

- **工具函数**：
  - `colors.ts` - 状态颜色常量
  - `icons.ts` - 状态图标常量
  - `format.ts` - 格式化工具（内存、运行时间、进度条）

### 变更

- **TypeScript 配置**：更新 `module` 和 `moduleResolution` 为 `NodeNext`
  - 支持现代 ES Module 库（如 `ink`）的类型解析
  - 保持 CommonJS 输出兼容性

- **pkg 打包配置**：添加 React/Ink 相关资源到打包配置

### 依赖变更

#### 新增

- `react@^18.3.1` - UI 框架
- `ink@^5.2.1` - 终端 UI 渲染
- `ink-spinner@^5.0.0` - 加载动画
- `ink-text-input@^6.0.0` - 文本输入
- `@types/react@^18.3.0` - React 类型定义（开发依赖）
- `@testing-library/react@14` - React 测试库（开发依赖）
- `ink-testing-library` - Ink 测试库（开发依赖）

## \[0.4.1-alpha] - 2026-04-03

### 新增

- GitHub Actions 自动构建发布工作流
  - 支持 Windows、Linux、macOS 三平台
  - 通过版本标签 (v\*) 或手动触发
  - 自动创建 GitHub Release 并上传构建产物

### 变更

- **打包工具**：从 `pkg` 切换到 `@yao-pkg/pkg` 以支持 Node.js 22
  - 原版 `pkg` 最高仅支持 Node.js 18
  - `@yao-pkg/pkg` 支持上游要求的 Node.js 22
- **构建产物命名**：压缩包命名格式改为 `deerflow-launcher_{版本}_{平台}_{时间}`
  - 示例：`deerflow-launcher_0.4.1_win-x64_20260403_0123.zip`
- 合并 `env.ts` 和 `dotenv.ts` 为单一 `env.ts` 模块
  - 导出：`getDeerFlowPath()`、`loadDotEnv()`、`getEnvVar()`、`clearCache()`
  - 添加路径和环境变量缓存

### 修复

- 打包环境下 PM2 模块导入兼容性
- pkg 环境下日志快照错误
- 配置初始化问题
- 日志目录创建问题
- IPv6 健康检查绑定问题
- 打包环境下 Windows `pnpm.cmd` 执行问题
- Windows 上 PM2 spawn EINVAL 错误
- Windows cmd.exe 包装器现在仅在 pkg 环境使用（开发环境不使用）

### 移除

- 无用依赖：`nexe`、`pkg`、`esbuild`、`postject`
- 过时构建脚本：`build-release.js`、`build-sea.js`、`build-nexe.js`

### 依赖变更

#### 新增

- `archiver@^7.0.1` - 用于创建发布压缩包

#### 移除

- `nexe@^4.0.0-rc.2` - 被 @yao-pkg/pkg 替代
- `pkg@^5.8.1` - 被 @yao-pkg/pkg 替代（通过 npx 使用）
- `esbuild@^0.25.2` - 不再需要
- `postject@^1.0.0-alpha.6` - 不再需要

## \[0.4.0-alpha] - 2026-04-02

### 新增

- 首个版本，基于 PM2 的服务管理
- 支持 langgraph、gateway、frontend、nginx 服务
- 可配置超时的健康检查
- 日志管理和查看
- 配置管理
- 环境诊断（`doctor` 命令）
- 优雅关闭处理

