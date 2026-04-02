# 跨平台编译解决方案

## 问题
Bun 的 `--compile` 跨平台编译需要下载目标平台运行时，网络不稳定时会失败。

## 解决方案

### 方案一：GitHub Actions（推荐）

在推送 tag 时自动构建所有平台：

```bash
# 创建并推送 tag
git tag v0.5.0
git push origin v0.5.0
```

或手动触发：GitHub Actions -> Build Release -> Run workflow

**优点：**
- 原生构建，无跨平台问题
- 支持 Windows/Linux/macOS (x64 + ARM64)
- 自动创建 GitHub Release

### 方案二：Docker 构建 Linux 版本

```bash
# 构建 Linux x64
docker build -t deerflow-launcher-builder .
docker create --name temp deerflow-launcher-builder
docker cp temp:/deerflow-launcher ./deerflow-launcher-linux-x64
docker rm temp
```

### 方案三：本地代理/镜像

如果需要本地跨平台编译，可以配置代理：

```bash
# 设置代理
set HTTP_PROXY=http://127.0.0.1:7890
set HTTPS_PROXY=http://127.0.0.1:7890

# 然后运行构建
bun run build:release
```

### 方案四：手动下载运行时

Bun 运行时下载位置：
- Windows: `%USERPROFILE%\.bun\bin`
- Linux/macOS: `~/.bun/bin`

可以预先手动下载对应平台的运行时。

## 推荐流程

1. **开发阶段**：使用 `bun run build:release:current` 构建当前平台
2. **发布阶段**：推送 tag 到 GitHub，由 Actions 自动构建所有平台
