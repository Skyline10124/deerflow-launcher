# 更新日志

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [0.4.1-alpha] - 2026-04-03

### 新增

- GitHub Actions 自动构建发布工作流
  - 支持 Windows、Linux、macOS 三平台
  - 通过版本标签 (v*) 或手动触发
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

## [0.4.0] - 2026-03-XX

### 新增

- 首个版本，基于 PM2 的服务管理
- 支持 langgraph、gateway、frontend、nginx 服务
- 可配置超时的健康检查
- 日志管理和查看
- 配置管理
- 环境诊断（`doctor` 命令）
- 优雅关闭处理
