# Evidence: datasource-logs-to-openobserve

验证证据占位目录（spec 确认后、实施验证时填充）：

- 生产验证（tasks 5.1/5.2）：OO 查询语句 + 结果摘要（service_name=tdx-datasource
  的 logs、trace_id 顶层检索、单发断言），参照 O1/O2a 证据格式
  （otel-whitebox-20260810/evidence-2026-08-10-o1-o2a-live-test-passed.md）。
- mock 验证（tasks 3.2）：mock-env mock-verify.sh 的 `_search?type=logs` 断言输出。
