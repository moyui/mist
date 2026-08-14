# Migrate Stack to Linux Node with SSH Tunnel

## Why

Windows 部署机（192.168.31.182，16 GB）长期承担"游戏机 + 交易机 + Docker 宿主"三角色，内存持续满载（实测 host 用 14.4 / 15.9 GiB，空闲仅 1.5 GiB）。根因不是 Mist 容器（全套仅 ~3 GiB），而是 Windows 系统空载（~5 GiB）+ MuMu 模拟器（~4.5 GiB）+ 软开销叠加。加内存已单独确认（2×8 GB → 24 GB），但更彻底的解法是把交易服务栈从 Windows 主机剥离，让 Windows 退化为纯"行情终端机"。

技术可行性已验证（见 `datasource-remote-able-no-sdk` 调研结论）：

- datasource 容器**不带终端 SDK**——TDX 不 import `tqcenter`、QMT 不 import `xtquant`（守卫测试强制），采集逻辑在终端进程内嵌的 Python 脚本里，datasource 只是"接收端 + WS 服务"，可在任意机器运行。
- 终端与 datasource 通过 TCP 数据面（9003 / 9014，**无 IP 校验**）+ HTTP 控制面（`/bridge/*`，**loopback 校验**）通信，所有对端地址为 env，可跨网。
- 唯一阻塞是 datasource 的 `_require_loopback`（`src/core/local_bridge.py`）只接受 127.0.0.1 来源。

本 change 通过 **SSH 反向隧道**（autossh，Linux systemd → Windows sshd）绕过 loopback——隧道远端由 sshd 在 Linux 本地发起连接到 datasource，peer=127.0.0.1 自动通过校验。从而实现 **terminal bridge 脚本零改动、datasource 代码零改动**，把全套服务迁移到一台 Linux 机器，Windows 主机彻底去除 Docker。

## What Changes

### 新增：Linux 服务节点 + SSH 反向隧道

- 新增一台 Linux 机器（用户已有：E3-1230v2 + 8 GB，安装 Linux）作为**服务节点**，跑全套：datasource(tdx/qmt) + backend + mysql + realtime-redis + signal + chan-api + napcat + astrbot + openobserve。
- autossh（由 Linux systemd 管理）建立**反向 SSH 隧道**到 Windows sshd，承载终端 → datasource 的端口转发。
- 隧道承载 5 条转发：TDX HTTP `9001` / TCP `9003`；QMT HTTP `9002` / TCP `9014→容器9004`；TDX 历史数据 `17709` 反向（`-R 17708:127.0.0.1:17709`）。

### 改变：Windows 主机角色（去 Docker）

- Windows 主机从"全套 Docker 栈部署机"退化为**纯行情终端机**。
- 只保留：TDX / QMT 终端进程（Windows 原生）+ sshd（已配置，零改动）。
- 移除 Docker Desktop / WSL2 / 全部容器（预计省 ~5.5 GiB：WSL2 vmmem 2.29 + Docker Desktop 管理层 0.48 + 全部容器 RSS 2.76）。
- terminal bridge 脚本**零改动**——继续连 `localhost` 默认值，流量经 SSH 反向隧道到达 Linux 的 datasource。

### 不改（关键约束，本 change 的设计基石）

- **terminal bridge 脚本**：零改动（开源仓库，终端脚本连 `localhost` 默认值，不写任何部署 IP）。
- **datasource 代码**：零改动（`_require_loopback` 保持，SSH 隧道远端 sshd 本地发起 → peer=127.0.0.1 自动满足）。
- **canonical / wire 契约**：不变（schema-v2 frame、`CanonicalRealtimeSnapshot`、WS 协议均不变，仅传输物理路径变化）。
- **数据库 schema**：不变（MySQL 仅物理迁移 Windows → Linux）。

### 迁移

- MySQL 数据从 Windows（E 盘 bind mount）物理迁移到 Linux（dump/restore 或文件拷贝，schema 不变）。
- napcat 在 Linux 节点重新建立 QQ 登录态。
- openobserve / astrbot 配置迁移到 Linux。

## Capabilities

### New Capabilities

- `linux-service-node-deployment`: Mist 服务栈在 Linux 节点的部署拓扑、SSH 反向隧道桥接（autossh）、终端↔datasource 通路、节点健康与回滚要求。

### Modified Capabilities

- `windows-docker-appliance`: 从"唯一部署机（全套 Docker Compose 栈）"→"行情终端机（去 Docker，只留终端进程 + sshd + SSH 隧道入口）"。
- `datasource-container-deployment`: datasource 可在 Linux 服务节点运行；loopback 信任通过 SSH 反向隧道远端本地发起满足，不放宽校验。
- `mist-production-baseline`: 生产拓扑从单 Windows 节点 → 双节点（Windows 终端机 + Linux 服务节点），新增原子发布与回滚要求。
- `monitoring-health-alerts`: 新增 SSH 隧道健康 + Linux 节点存活观测。

## Impact

- **mist-deploy**（主要改动）：Compose 栈拆分（Linux 全套 + Windows 终端机配置）、autossh systemd unit、部署 workflow 改造、分阶段切换与回滚脚本、`.env` 跨节点配置。
- **mist**（后端）：部署位置变化（Windows Docker → Linux），配置项（DB / Redis / datasource 地址）改为 localhost（Linux 同机）；**业务代码不变**。
- **mist-datasource**：部署位置变化（Windows Docker → Linux）；**代码零改动**。
- **database**：MySQL 物理迁移（Windows → Linux），schema 不变，需 preflight/readback。
- **terminal bridge**：传输路径增加 SSH 隧道中间层（脚本不改）。
- **mist-monitoring**：新增隧道存活 + Linux 节点健康监控。
- **不包含**：mist-fe 业务逻辑、策略 / 缠论 / 回测语义、canonical 数据模型、HTTP / WS 公共契约。
