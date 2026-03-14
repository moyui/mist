# 测试数据同步工作流

## 📚 数据结构说明

### 两种数据类型

**1. Fixtures（输入数据 - 原始 K 线）**
- 位置：`test-data/fixtures/k-line/`
- 文件：`shanghai-index-2024-2025.fixture.ts`, `csi-300-*.ts`
- 用途：测试输入数据（原始 K 线数据）
- 使用：后端测试读取这些文件作为输入

**2. Test Results（输出数据 - 计算结果）**
- 位置：`test-data/test-results/raw/`
- 文件：`shanghai-index-2024-2025-results.json` 等
- 用途：计算结果（mergeK, bi, channels, fenxing）
- 使用：前端在图表中展示这些结果

## 🔄 完整同步流程

### 步骤 1：运行后端测试（生成测试结果）

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run test:chan:shanghai-2024-2025
```

**输出**：`test-data/test-results/raw/` 目录中的 JSON 文件

### 步骤 2：生成 TypeScript 类型定义

```bash
node tools/generate-type-definitions.mjs
```

**输出**：`test-data/test-results/types/` 目录中的 `.ts` 文件
- 包含类型定义和数据导出
- 从 `../raw/` 目录导入 JSON

### 步骤 3：同步到前端

```bash
pnpm run test:sync
```

**执行操作**：
1. 复制 JSON：`test-data/test-results/raw/` → `mist-fe/test-data/results/json/`
2. 复制 `.ts`：`test-data/test-results/types/` → `mist-fe/test-data/results/types/`
3. 更新 `test-data/results/types/index.ts` 的导出

### 步骤 4：前端使用

```typescript
import { shanghaiIndex20242025Results } from '@/test-data/results/types';

// 使用数据
const kData = shanghaiIndex20242025Results.data.originalKLines;
const summary = shanghaiIndex20242025Results.summary;
```

## 🚀 快速同步命令

一键完成所有操作：

```bash
pnpm run test:full
```

此命令执行：`test` → `test:sync`

## 📁 目录结构

```
mist/ (后端)
├── test-data/
│   ├── fixtures/k-line/           # 输入：原始 K 线数据
│   │   └── shanghai-index-2024-2025.fixture.ts
│   └── test-results/
│       ├── raw/                    # JSON 结果（来自测试）
│       │   ├── shanghai-index-2024-2025-results.json
│       │   └── ...
│       └── types/                  # TypeScript 定义
│           ├── shanghai-index-2024-2025-results.ts
│           └── ...

mist-fe/ (前端)
├── test-data/
│   ├── fixtures/k-line/           # 从后端镜像
│   └── results/
│       ├── json/                   # 从后端 raw/ 同步
│       │   ├── shanghai-index-2024-2025-results.json
│       │   └── ...
│       └── types/                  # 从后端 types/ 同步
│           ├── shanghai-index-2024-2025-results.ts
│           └── index.ts
```

## 🛠️ 可用脚本

**后端**：
- `pnpm run test:sync` - 同步测试结果到前端
- `pnpm run test:gen-types` - 生成 TypeScript 定义
- `pnpm run test:full` - 运行测试并同步

**前端**：
- `pnpm run sync:from-backend` - 从后端拉取最新数据
- `pnpm run dev:sync` - 同步并启动开发服务器

## ✅ 验证同步

检查同步是否成功：

```bash
# 后端
ls test-data/test-results/raw/*.json

# 前端
ls test-data/results/json/*.json
ls test-data/results/types/*.ts
```
