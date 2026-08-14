# Design: Migrate Stack to Linux Node with SSH Tunnel

## Context

### 当前架构（单 Windows 节点，全套 Docker）

```
Windows 主机 192.168.31.182（Docker Desktop / WSL2）
├─ TDX 终端 + 内嵌 bridge 脚本（tqcenter Python）──→ localhost:9001/9003
├─ QMT 终端 XtItClient + 内嵌 bridge 脚本（Python3.6）──→ localhost:9002/9014
└─ Docker Compose 栈（mist-docker-appliance）：
   datasource(tdx/qmt) → backend → mysql → realtime-redis → signal/chan → napcat/astrbot → openobserve
```

terminal bridge 脚本与 datasource 的耦合方式（2026-08-13 代码调研实证）：

| 通道 | 端口 | 协议 | 校验 |
|------|------|------|------|
| TDX HTTP 控制面 | 9001 | `/tdx/bridge/*`（owner 注册/轮询/回传） | `_require_loopback`（仅 127.0.0.1） |
| TDX TCP 数据面 | 9003 | `[len][JSON]` snapshot 直推 | **无 IP 校验** |
| TDX 历史 | 17709 | datasource → TDX 官方 JSON-RPC（反向） | datasource 主动连 |
| QMT HTTP 控制面 | 9002 | `/qmt/bridge/*` | `_require_loopback` |
| QMT TCP 数据面 | 9014→容器9004 | snapshot 直推 | **无 IP 校验** |
| backend → datasource | 9001/9002 | WS `/ws/realtime/{tdx\|qmt}/{client_id}` | 无 loopback 限制 |

**关键事实**：datasource 容器不带终端 SDK（TDX 无 `tqcenter`、QMT 无 `xtquant`，守卫测试强制）。SDK 调用在终端进程内嵌脚本里，datasource 只是接收端 + WS 服务。终端是 client、datasource 是 server，所有对端地址为 env（默认 127.0.0.1）。

### producer → wire → decoder → state/persistence → consumer → deploy/monitoring 影响链

本 change 改变的是**传输物理路径与部署位置**，不改 producer/wire 契约/decoder/canonical：

```
producer   : TDX/QMT 终端 SDK（Windows 终端进程，不变）
             ↓ terminal bridge 脚本（Windows 终端进程内，不变，连 localhost）
wire-1     : 终端 → SSH 反向隧道（localhost:Windows → Linux，【新增中间层】）
             ↓ datasource container（位置：Windows Docker → Linux；TCP/HTTP 接收端语义不变）
wire-2     : WS /ws/realtime/*（backend → datasource，Linux 同机 localhost）
             ↓ decoder : backend realtime.client（位置：Windows → Linux；解码逻辑不变）
state      : Redis 当日 candle + MySQL 历史（位置：Windows → Linux；schema 不变）
             ↓ consumer : signal / strategy / chan（位置：Windows → Linux；语义不变）
deploy     : mist-deploy（单机 → 双节点）+ monitoring（新增隧道健康）
```

### 治理门禁触发项（governance §4 / §5）

- §4：改变部署拓扑 / Compose service / terminal bridge / 多仓原子发布 → **必须 OpenSpec**（本 change）。
- §5：改变 realtime/historical 数据**持久化位置**（Redis candle + MySQL 从 Windows → Linux）→ **必须与用户确认**。本 change 经用户明确"全套搬 Linux"，design §Decision 7 / §Migration Plan 锁定物理迁移方案，切换前需再次确认停机窗口。

## Goals / Non-Goals

**Goals:**

- Windows 主机彻底去除 Docker，退化为纯行情终端机（省 ~5.5 GiB，解决三角色内存争抢）。
- 全套服务在 Linux 节点运行，功能与单机等价（实时行情 → 信号 → 通知全链路）。
- terminal bridge 脚本与 datasource 代码**零改动**（保持开源通用性）。
- 提供可验证的切换与回滚路径，Linux 节点故障时可退回 Windows Docker 栈。

**Non-Goals:**

- 不改 canonical / wire 契约、数据库 schema、HTTP/WS 公共协议。
- 不引入高可用 / 多副本 / 负载均衡（仍是单 Linux 服务节点）。
- 不迁移 MuMu 模拟器（游戏负载留在 Windows）。
- 不改 terminal bridge 脚本默认值、不放宽 datasource `_require_loopback`。

## Decisions

### 1. 终端 ↔ datasource 跨机桥接采用 SSH 反向隧道（autossh）

终端脚本（开源）必须连 `localhost`（不写部署 IP），datasource 的 `_require_loopback`（开源）只接受 127.0.0.1。这两个约束叠加，**普通 TCP 转发（socat / nginx stream / netsh portproxy）无法满足**——Linux 侧看到的来源 IP 是 Windows 机器 IP，loopback 校验 403。

SSH 反向隧道是唯一不改动两端开源代码即可满足约束的方案：隧道远端（Linux）由 sshd **在本地发起**连接到 datasource，datasource 看到的 peer 是 `127.0.0.1`，校验自动通过。

保活采用 **autossh**（开源成熟，各发行版包管理器直装）+ `ServerAliveInterval` + `ExitOnForwardFailure`，不手写重连逻辑。

**替代方案已排除**：
- 改 datasource 加白名单 env（`MIST_BRIDGE_ALLOWED_REMOTE_PEERS`）——需改开源代码，用户否决。
- 终端脚本配 Linux IP——开源脚本不写部署 IP，用户否决。
- 普通 TCP 转发——绕不过 loopback。
- VPN（WireGuard/tinc）——L3 隧道，peer 仍非 127.0.0.1，绕不过 loopback。

### 2. 隧道方向：Linux 侧发起反向 `-R`（保活在 Linux，Windows 零额外软件）

autossh 在 **Linux** 上运行（systemd 管理），反向连 Windows sshd：

```
Linux: autossh -R <winport>:127.0.0.1:<linuxport> 12705@<windows_ip>
  → Windows sshd 在 <winport> 监听（bind 127.0.0.1，GatewayPorts=no 默认）
  → 流量经隧道到 Linux，sshd 本地连 127.0.0.1:<linuxport>（datasource）
```

选择 Linux 侧发起的理由：
- 保活由 Linux systemd 管理（最可靠的组合），不依赖 Windows 进程管理。
- Windows sshd **已配置且运行中**（08-12 开通，Mac 可连），`AllowTcpForwarding=yes` / `GatewayPorts=no` / `PubkeyAuthentication=yes` 均为默认值且已验证满足，**sshd_config 零改动**。
- Windows 侧零额外软件（不用 NSSM / autossh on Windows）。

### 3. terminal bridge 脚本与 datasource 代码零改动（设计基石）

- terminal bridge 脚本：继续连 `localhost`（默认 env 值），开源仓库不引入任何部署 IP。隧道在 Windows localhost 监听，终端无感知。
- datasource：`_require_loopback` 保持不变。SSH 隧道远端 sshd 本地发起连接，peer=127.0.0.1 自动满足，无需放宽信任边界。

**这两条是本 change 的不可妥协约束**，任何后续设计若要求改这两处，需回到本 spec 重新评审。

### 4. 全套服务搬 Linux，Windows 彻底去 Docker

迁移范围：datasource(tdx/qmt) + backend + mysql + realtime-redis + signal + chan-api + napcat + astrbot + openobserve + fe + web-gateway（全部 Compose service）。

迁移后 Windows 仅保留：TDX/QMT 终端进程 + sshd。Docker Desktop / WSL2 卸载或停用，回收 ~5.5 GiB。

不采用"只搬非核心层（napcat/openobserve）"的部分方案——那样 Windows 仍需 Docker 跑核心栈，无法达到"去 Docker"目标，收益有限（仅省 ~1.6 GiB）。

### 5. 端口映射方案（5 条 SSH 反向转发）

| Linux 端口（datasource） | Windows 转发端口（终端连） | 用途 | 转发类型 |
|--------------------------|---------------------------|------|----------|
| 9001 | 9001 | TDX HTTP 控制面 + WS | `-R 9001:127.0.0.1:9001` |
| 9003 | 9003 | TDX TCP 实时数据面 | `-R 9003:127.0.0.1:9003` |
| 9002 | 9002 | QMT HTTP 控制面 + WS | `-R 9002:127.0.0.1:9002` |
| 9004 | 9014 | QMT TCP 实时数据面（容器内 9004） | `-R 9014:127.0.0.1:9004` |
| 17709（Windows） | 17708（Linux） | TDX 历史数据（datasource 反向连） | `-R 17708:127.0.0.1:17709` |

最后一条是反向：datasource 在 Linux 连 `127.0.0.1:17708`，经隧道反向到 Windows 的 `127.0.0.1:17709`（TDX 官方 JSON-RPC）。前提是 17709 bind localhost（Open Question 1，需实测；若已监听 LAN 接口则 datasource 直接连 Windows IP 即可，无需此条）。

所有 `-R` 同载一条 SSH 连接（autossh 单 ExecStart）。

### 6. 认证：Linux 公钥加入 Windows administrators_authorized_keys

12705 ∈ administrators 组，sshd_config 的 `Match Group administrators` 生效，公钥文件为 `C:\ProgramData\ssh\administrators_authorized_keys`（非用户目录，Windows OpenSSH 规则）。

将 Linux 节点的 SSH 公钥追加到该文件（与现有 Mac 公钥共存）。autossh 据此非交互登录。ACL 已正确（Mac 可连即证明），追加公钥不改 ACL。

### 7. MySQL 物理迁移（停机 dump / restore，schema 不变）

迁移方式：交易时段外停机，`mysqldump`（或物理文件拷贝 if InnoDB + 停机）从 Windows MySQL 导出到 Linux MySQL。schema / migration 不变（仅物理位置变化）。

需 preflight（表/行数快照）+ postflight readback（关键表行数对齐）+ repair-forward 说明（governance §3.4）。不引入主从复制（单节点，过度工程）。

### 8. napcat / astrbot / openobserve 在 Linux 重建

- napcat：QQ 登录态在新节点重建（扫描/验证）。
- astrbot：配置迁移。
- openobserve：数据目录迁移（或重新采集，历史日志非关键）。

### 9. 分阶段切换 + 回滚保留 Windows Docker 栈

切换采用**并行运行 → 验证 → 切流量 → 下线**，Windows Docker 栈在 Linux 验证通过前**不删除**，作为回滚目标。回滚 = 终端重新连 Windows 本地 datasource（恢复默认 localhost 即原状，因脚本本就连 localhost，回滚只需断开隧道 + 重启 Windows Docker 栈）。

### 10. 实时性与延迟由交易时段 HIL 验证（非 CI 替代）

SSH 隧道对实时行情的加密开销 / 缓冲延迟、QMT 控制面跨隧道轮询延迟，**必须在交易时段实测**（governance §3.4：需要终端交互的能力必须完成 HIL，CI 不能替代终端证据）。验收标准：snapshot 端到端延迟不显著劣于单机基线（具体阈值在实施计划定）。

## Risks / Trade-offs

| 风险 | 设计响应 |
|------|----------|
| SSH 隧道加密/缓冲影响实时行情延迟 | → Decision 10：交易时段 HIL 实测，定延迟阈值；数据量小（~2MB/s）预估可接受 |
| 隧道断线 = 行情断流 | → autossh + systemd `Restart=always` + `ServerAliveInterval=30` + `ExitOnForwardFailure=yes`；监控隧道存活并告警 |
| 单 Linux 节点 = 单点故障 | → Decision 9：保留 Windows Docker 栈可回滚；回滚只需断隧道 + 重启 Windows 栈 |
| TDX 17709 仅 bind localhost，datasource 连不到 | → Decision 5：`-R 17708` 反向隧道解决（待 Open Question 1 实测确认） |
| QMT 控制面跨隧道延迟影响历史 bars | → HIL 实测轮询延迟；POLL_INTERVAL=3s，LAN 内通常可接受 |
| MySQL 迁移期间交易中断 | → 停机窗口选交易时段外；dump/restore 时间预估 + readback 校验 |
| napcat 重新登录失败 | → 切换前先在 Linux 节点验证 QQ 登录态，确认后才切 |
| 放开 SSH 入站（Linux→Windows）的安全面 | → 仅公钥认证 + 限定 autossh 账户 + Windows 防火墙限 Linux IP；隧道本身加密 |

## Migration Plan

分阶段，每阶段可独立验证、可回滚：

1. **Linux 节点就绪**：装 Linux + Docker + Compose 服务编排（mist-deploy 拆出 Linux 栈）。
2. **SSH 隧道建立**：Linux 公钥入 Windows `administrators_authorized_keys`；autossh systemd unit 上线；5 条转发连通性验证（非交易时段）。
3. **MySQL 数据迁移**：停机 dump → Linux restore → readback 校验。
4. **服务在 Linux 启动**：datasource/backend/redis/signal/chan 起来；datasource loopback 经隧道验证（终端能注册 owner）。
5. **交易时段 HIL**：实时行情端到端验证（snapshot 延迟、QMT 控制面轮询）；信号/通知全链路验证。
6. **切流量**：终端经隧道访问 Linux datasource（脚本不动，隧道已就位）；观察一个完整交易日。
7. **napcat / openobserve / astrbot 迁移**：QQ 登录态重建 + 数据迁移。
8. **Windows Docker 栈下线**（保留镜像/配置供回滚）；确认稳定后可卸载 Docker Desktop。

## Open Questions（design 阶段需实测确认）

1. **TDX 17709 是否仅 bind 127.0.0.1**？决定是否需要 `-R 17708` 反向隧道，还是 datasource 直接连 Windows LAN IP。（实测：Windows 侧 `netstat` 查 17709 监听地址）
2. **SSH 隧道对实时 snapshot 的端到端延迟量化**？（交易时段 HIL：单机基线 vs 隧道，对比 snapshot capturedAt→acceptedAt）
3. **QMT 控制面跨隧道轮询的延迟与可靠性**？（历史 bars 查询经隧道命令网关往返延迟）
4. **8GB 单通道 Linux 跑全套服务的实际内存占用**？（预估 ~3.5 GiB，需实测确认不触发 swap）
5. **MySQL 停机 dump/restore 的耗时**？（决定迁移窗口长度）
