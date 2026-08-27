# Design: 量化回测决策状态机、严格 A 股撮合与防未来函数质检体系

## 1. 架构总览

```mermaid
graph TD
    subgraph L1["Layer 1: 信号与特征计算层 (Signal Engine)"]
        S1["Rule DSL Evaluator"]
        S2["Chan BSP Detector"]
    end

    subgraph L2["Layer 2: 策略决策与持仓状态机 (Strategy State Machine)"]
        D1["Entry Filter (入场过滤)"]
        D2["Position Tracker (持仓跟踪与基准价)"]
        D3["Multi-layer Exit & Stop-Loss (多层止损分析)"]
    end

    subgraph L3["Layer 3: 执行与撮合层 (Execution / Broker)"]
        E1["Simulated Broker (回测: Next-Bar/T+1/涨跌停/规费)"]
        E2["Live Gateway (实盘: QMT/券商委托与回报)"]
    end

    subgraph L4["Layer 4: 呈现与质检层 (Presentation & Parity)"]
        P1["Web 控制台 (绩效报表/逐笔流水/质检报告)"]
        P2["TDX / QMT 标记回写管道 (桌面极速看盘)"]
        P3["Parity & Lookahead Test (双轨对账与因果断言)"]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
```

---

## 2. 策略决策与持仓生命周期状态机（Strategy State Machine）

### 2.1 状态转移图

```mermaid
stateDiagram-v2
    [*] --> Empty: 初始空仓
    Empty --> PendingEntry: 信号触发 + 入场过滤通过
    PendingEntry --> Holding: Next-Bar Open 撮合成交 (记录成本价与初始止损)
    PendingEntry --> Empty: 涨停无法买入 / 超时取消
    Holding --> Holding: 逐 Bar 更新最高价 (High Watermark) & 上移追踪止损线
    Holding --> PendingExit: 触发止损 / 移动止盈 / 结构破坏 / 反向卖点
    PendingExit --> Closed: 撮合成交 (记录盈亏与出场归因)
    PendingExit --> PendingExit: 跌停无法卖出 (顺延至次日)
    Closed --> Empty: 结算归档，重置持仓
```

### 2.2 出场与止损规则配置契约（`StrategyExitPolicy`）

```typescript
export interface StrategyExitPolicy {
  // 1. 缠论结构止损
  chanStructuralStop?: {
    enabled: boolean;
    reference: 'point_price' | 'zhongshu_zd' | 'zhongshu_dd'; // 跌破买点笔底 / 中枢下轨 / 最低点
    bufferRatio?: number; // 缓冲比例，如 0.005 (0.5%)
  };
  // 2. 动态保本机制
  breakEven?: {
    enabled: boolean;
    triggerProfitRatio: number; // 浮盈达到此比例 (如 0.03 = 3%) 后上移止损线至成本价
  };
  // 3. 移动追踪止盈
  trailingStop?: {
    enabled: boolean;
    activationProfitRatio: number; // 激活阈值 (如浮盈达到 5%)
    callbackRatio: number; // 从最高点回撤比例 (如 2%) 触发平仓
  };
  // 4. 硬风控止损
  hardStopLossRatio?: number; // 固定止损比例，如 0.05 (5%)
  // 5. 反向卖点出场
  oppositeSignalExit?: boolean; // 出现反向一卖/二卖/三卖或顶分型确立出场
  // 6. 最大持仓 K 线数超时出场
  maxHoldingBars?: number; // 超过 N 根 Bar 未触发止盈止损强制平仓
}
```

---

## 3. A 股严格成交撮合模型（Lookahead-Free Simulated Broker）

### 3.1 时序与撮合规则

| 动作 | 判定时机 | 撮合时机与价格 | 异常与边界处理 |
| :--- | :--- | :--- | :--- |
| **开仓买入** | Bar $t$ 闭合计算确认信号 | Bar $t+1$ 以 `open` 价格撮合 | 若 Bar $t+1$ 涨停一字板（`open == highLimit`），标记 `BUY_REJECTED_LIMIT_UP`，撤单放弃 |
| **盘中触价止损** | Bar $t$ 处于持仓状态且已过 T+1 | 若 `bar.low <= stopPrice`：<br>• 若 `open <= stopPrice`，以 `open` 成交；<br>• 否则以 `stopPrice` 撮合 | 若 Bar $t$ 跌停一字板（`open == lowLimit`），标记 `SELL_BLOCKED_LIMIT_DOWN`，顺延至次日 |
| **收盘信号/形态卖出** | Bar $t$ 闭合计算满足出场条件 | Bar $t+1$ 以 `open` 价格撮合 | 严格受 T+1 限制（当天买入的标的当天不可卖出，持仓锁定至次日） |

### 3.2 摩擦成本与滑点模型

- **佣金 (Commission)**: `max(5.0, tradeAmount * 0.00025)` (买卖双向)
- **印花税 (Stamp Duty)**: `tradeAmount * 0.0005` (仅卖出单向)
- **过户费 (Transfer Fee)**: `tradeAmount * 0.00001` (买卖双向)
- **滑点 (Slippage)**: 默认 0.1% 或固定 1~2 Tick，买入上浮、卖出下浮。

---

## 4. 三维防未来函数质检与对账机制

```mermaid
graph TD
    subgraph V1["1. 因果不变性断言 (Causality Assertions)"]
        A1["所有指标输入时间戳 ≤ 决策时间戳"]
        A2["成交时间戳 > 信号确认时间戳"]
        A3["缠论买点确认时延校验 (t_confirm ≥ t_extrema)"]
    end

    subgraph V2["2. 双轨对账单元测试 (Live-Backtest Parity Suite)"]
        B1["录制历史行情切片"]
        B2["实时推流引擎运行 (Signal App)"]
        B3["离线回测引擎运行 (Backtest App)"]
        B4["断言: Signal 产生时间/内容/持仓动作 100% 逐字对齐"]
    end

    subgraph V3["3. 未来数据扰动与泄漏测试 (Lookahead Leakage Injection)"]
        C1["在时间点 t 截断或注入未来随机噪声"]
        C2["重新计算 t 时刻的决策输出"]
        C3["断言: t 时刻的信号与持仓决策严格保持不变"]
    end
```

---

## 5. 实体与数据库设计（Schema Migrations）

### 5.1 `backtest_trade_results` 表（替代/升级现有仅信号表）

```sql
CREATE TABLE `backtest_trade_results` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `backtest_run_id` INT NOT NULL,
  `security_code` VARCHAR(20) NOT NULL,
  `entry_signal_time` DATETIME(3) NOT NULL,
  `entry_time` DATETIME(3) NOT NULL,
  `entry_price` DECIMAL(12, 4) NOT NULL,
  `exit_signal_time` DATETIME(3) NOT NULL,
  `exit_time` DATETIME(3) NOT NULL,
  `exit_price` DECIMAL(12, 4) NOT NULL,
  `exit_reason` VARCHAR(60) NOT NULL, -- 'STRUCTURAL_CHAN_STOP' | 'TRAILING_STOP' | 'BREAK_EVEN' | 'HARD_STOP_LOSS' | 'OPPOSITE_SIGNAL' | 'TIMEOUT'
  `holding_bars` INT NOT NULL,
  `pnl_amount` DECIMAL(14, 4) NOT NULL,
  `pnl_ratio` DECIMAL(8, 4) NOT NULL,
  `total_fee` DECIMAL(10, 4) NOT NULL,
  `context_snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_run_id` (`backtest_run_id`),
  INDEX `idx_security` (`security_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. 与原生终端可视化（QMT / TDX）与 Web 控制台分工

1. **Web 端 (`mist-fe`)**：
   - 任务控制与状态轮询；
   - 量化绩效卡片：总收益率、年化收益率、夏普比率、最大回撤、胜率、盈亏比、交易总次数；
   - 逐笔 Trade 流水表格（包含入场时间/价格、出场时间/价格、持仓时长、出场归因）；
   - 因果质检报告（时序断言与双轨对账状态）。
2. **桌面端 (`TDX / QMT`)**：
   - 通过 `openspec/changes/integrate-native-terminal-visualization` 提供的绘图指令接口，将回测生成的 Trade 序列自动转为买入 Pin 标、卖出 Pin 标、持仓连接线与动态止损警戒线，在桌面专业终端极速复盘。
