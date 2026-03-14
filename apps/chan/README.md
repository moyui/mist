# Chan Application

缠论（Chan Theory）测试与调试入口 - 提供 K 线合并、笔计算、中枢识别的测试接口。

## 功能特性

- **K 线合并（Merge K）**：基于包含关系对连续 K 线进行分组
- **笔识别（Bi Recognition）**：识别显著价格变动，使用 4 步递归算法
- **中枢识别（Channel Detection）**：检测 5 笔中枢及延伸逻辑
- **测试数据管理**：支持多种测试数据集和结果验证

## 前置要求

- Node.js (v18+)
- MySQL 数据库
- 测试数据文件（位于 `test-data/` 目录）

## 安装

```bash
# 安装依赖
pnpm install
```

## 运行应用

### 开发模式

```bash
pnpm run start:dev:chan
```

应用将在 `http://localhost:8008` 启动

### 生产构建

```bash
# 构建应用
pnpm run build

# 启动生产服务器
pnpm run start:prod:chan
```

## API 端点

### K 线合并
- `POST /chan/merge-k` - 合并 K 线

### 笔识别
- `POST /chan/bi` - 识别笔（4 步算法）

### 中枢识别
- `POST /chan/channel` - 识别中枢（5 笔最小值）

### 健康检查
- `GET /app/hello` - 服务健康检查

## 测试

### 运行特定测试

```bash
# 上证指数 2024-2025 测试
pnpm run test:chan:shanghai-2024-2025

# 所有缠论测试
pnpm run test -- chan
```

### 测试数据同步

```bash
# 运行测试并同步到前端
pnpm run test:full

# 仅同步（不运行测试）
pnpm run test:sync
```

## 缠论算法说明

### K 线合并（Merge K）

基于包含关系对连续 K 线进行分组：
- 上升 K 线：当前 K 线的最高点 ≤ 前 K 线的最高点
- 下降 K 线：当前 K 线的最低点 ≥ 前 K 线的最低点

### 笔识别（Bi）

使用 4 步递归算法：
1. 识别所有分型（Fenxing）
2. 顶底交替
3. 生成候选笔 + 宽笔过滤
4. 递推状态机处理（支持回滚）

### 中枢识别（Channel）

**5 笔最小值规则**：
- 至少 5 笔才能形成中枢
- zg（中枢高）= 前 3 笔最低的最高点
- zd（中枢低）= 前 3 笔最高的最低点
- 有效中枢条件：zd < zg

**中枢延伸**：
- 只有奇数笔（第 7、9、11...笔）可以延伸中枢
- 必须满足离开段高度条件
- 刺穿笔不延伸中枢

## 配置

缠论相关配置在 `src/chan/config/` 目录：
- 分型识别参数
- 笔识别参数
- 中枢识别参数

## 故障排查

### 测试数据未找到

确保测试数据文件在 `test-data/fixtures/k-line/` 目录下。

### 中枢识别结果异常

检查：
1. 笔识别是否正确（趋势交替）
2. zg/zd 计算是否正确
3. 延伸逻辑是否正确执行

## 许可证

BSD-3-Clause
