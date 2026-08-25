# apps/chan — 缠论计算 API 微服务

`apps/chan` 是独立的缠论（Chan Theory）计算微服务，将底层的 `@app/chancore` 纯算法封装为高性能无状态 HTTP API。

---

## 🎯 模块职责

- **无状态缠论计算**：提供包含 K 线合并、分型、宽笔、特征序列线段、对称中枢以及第一/二/三类买卖点（BSP）的 HTTP 计算服务。
- **图表数据转换**：为前端可视化和量化策略提供标准化的缠论几何元素与形态诊断数据。

---

## 🔌 核心接口与路由

| 路由路径 | 方法 | 说明 |
| :--- | :--- | :--- |
| `GET /app/hello` | GET | 服务健康检查探针 |
| `POST /v1/chan/merge-k` | POST | K 线包含关系合并处理 |
| `POST /v1/chan/fenxing` | POST | 顶底分型识别 |
| `POST /v1/chan/bi` | POST | 宽笔（标准新笔）形态识别 |
| `POST /v1/chan/duan` | POST | 特征序列法线段识别 |
| `POST /v1/chan/channel` | POST | 中枢计算（Phase A 滑窗候选 + Phase B 不动点归约） |
| `POST /v1/chan/bsp` | POST | 第一类/第二类/第三类买卖点（BSP）判定 |

---

## 📂 关键文件速查

- `src/chan.controller.ts`：缠论各阶段计算端点。
- `src/chan.service.ts`：调用 `@app/chancore` 核心计算逻辑并组装响应。
- `src/chan.module.ts`：NestJS 模块定义。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地缠论微服务 (默认端口 8008)
pnpm run start:dev:chan

# 运行应用单元测试
pnpm run test -- apps/chan
```

---

## 🔗 上下游边界

- **核心依赖**：`libs/chancore`（算法核心）、`libs/decimal`（高精度几何计算）。
- **调用方**：`mist-fe`（前端图表可视化渲染）、`mist-skills`（AI 缠论解盘技能）。
