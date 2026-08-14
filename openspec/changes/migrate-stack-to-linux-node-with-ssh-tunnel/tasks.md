# Tasks: Migrate Stack to Linux Node with SSH Tunnel

## 1. 前置实测与基线（Open Questions 验证）

- [ ] 1.1 实测 TDX 17709 监听地址（Windows `netstat`），确认是否仅 bind 127.0.0.1，决定 `-R 17708` 反向隧道是否必需
- [ ] 1.2 记录各仓库 branch/HEAD/dirty 状态，建立迁移前基线
- [ ] 1.3 实测 8GB Linux 跑全套服务的内存占用（预估 ~3.5 GiB，确认不触发 swap）
- [ ] 1.4 确认 Windows sshd 配置（`AllowTcpForwarding`/`GatewayPorts`/`PubkeyAuthentication` 默认值满足——已初步验证）

## 2. Linux 节点与服务编排

- [ ] 2.1 Linux 节点安装 + Docker + 基础环境
- [ ] 2.2 mist-deploy 拆出 Linux Compose 栈（全套服务：datasource/backend/mysql/realtime-redis/signal/chan/napcat/astrbot/openobserve/fe/gateway）
- [ ] 2.3 Linux 节点 `.env` 配置（DB/Redis/datasource 地址 = localhost 同机）
- [ ] 2.4 全套镜像在 Linux 可拉取/构建验证

## 3. SSH 反向隧道（autossh + 认证）

- [ ] 3.1 Linux 生成 SSH 密钥对，公钥追加到 Windows `C:\ProgramData\ssh\administrators_authorized_keys`（与 Mac 公钥共存）
- [ ] 3.2 验证 Linux 非交互 SSH 登录 Windows（公钥认证通过，ACL 正确）
- [ ] 3.3 编写 autossh systemd unit（5 条 `-R` 转发 + `ServerAliveInterval=30` + `ExitOnForwardFailure=yes` + `Restart=always`）
- [ ] 3.4 启动 autossh，验证 Windows `localhost:9001/9003/9002/9014` 转发到 Linux datasource
- [ ] 3.5 隧道连通性测试（终端脚本能注册 owner / TCP 数据面通，datasource peer=127.0.0.1）

## 4. MySQL 数据迁移

- [ ] 4.1 交易时段外停机，`mysqldump` Windows MySQL 导出
- [ ] 4.2 导入 Linux MySQL（schema 不变）
- [ ] 4.3 readback 校验（关键表行数对齐）
- [ ] 4.4 记录迁移耗时（Open Question 5）

## 5. 服务部署与 loopback 验证

- [ ] 5.1 Linux 启动全套服务
- [ ] 5.2 datasource loopback 经隧道验证（终端注册 owner 成功，peer=127.0.0.1）
- [ ] 5.3 backend 连 datasource WS（localhost）验证
- [ ] 5.4 backend 连 mysql / realtime-redis（localhost）验证

## 6. 交易时段 HIL（实时性 + 全链路）

- [ ] 6.1 实时 snapshot 端到端延迟实测（单机基线 vs 隧道，Open Question 2）
- [ ] 6.2 QMT 控制面跨隧道轮询延迟实测（Open Question 3）
- [ ] 6.3 实时行情 → 信号 → 通知全链路验证（至少一个完整交易日）
- [ ] 6.4 隧道断线恢复测试（autossh 重连 + 行情恢复 + owner 重注册）

## 7. 切换、回滚与下线

- [ ] 7.1 终端切流量经隧道访问 Linux datasource（观察完整交易日）
- [ ] 7.2 napcat 在 Linux 重建 QQ 登录态 + 验证投递
- [ ] 7.3 openobserve / astrbot 数据与配置迁移
- [ ] 7.4 确认稳定后 Windows Docker 栈下线（保留镜像/配置供回滚）
- [ ] 7.5 Windows Docker Desktop 停用/卸载（回收 ~5.5 GiB）

## 8. 监控与质量基线

- [ ] 8.1 SSH 隧道存活监控 + 断线告警
- [ ] 8.2 Linux 节点存活与健康监控
- [ ] 8.3 mist-deploy 受影响 health / smoke / compose-contract 测试通过（pwsh-preview）
- [ ] 8.4 mist / mist-datasource 受影响 lint / typecheck / test 基线通过
- [ ] 8.5 `openspec validate --all --strict` 通过
