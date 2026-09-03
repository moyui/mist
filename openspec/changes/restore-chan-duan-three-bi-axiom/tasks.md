# Tasks: restore-chan-duan-three-bi-axiom

- [x] 1. 在 `libs/chancore/src/internal/duan.ts` 中强制落实线段 `endIdx - segStartIdx >= 2`（至少 3 笔）公理约束
- [x] 2. 升级 `ChanCore.algorithmVersion` 从 7 到 8（`libs/chancore/src/chan-core.ts`）
- [x] 3. 更新 `libs/chancore/src/internal/duan.spec.ts` 中的单笔段用例与断言
- [x] 4. 更新 `libs/chancore/src/chan-core.spec.ts` 中的 `algorithmVersion` 断言
- [x] 5. 运行全量 `libs/chancore` 16 个测试套件，确保 100% 通过
- [x] 6. 验证 000001 全量数据下的线段输出与笔中枢嵌套自洽性
