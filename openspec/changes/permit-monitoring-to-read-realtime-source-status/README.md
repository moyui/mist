# permit-monitoring-to-read-realtime-source-status

放宽 backend loopback guard，放行 mist-network 网段的 monitoring exporter 读 /internal/realtime/{tdx,qmt}/status，让 lastCapturedAt 能转成 Prometheus 指标
