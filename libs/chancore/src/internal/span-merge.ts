/**
 * ChanCore internal helper.
 *
 * 定点迭代合并的通用 operations 接口。
 *
 * Bi（笔）与 Channel（中枢）的 Phase B 都遵循同一套"短跨度优先 + 最左优先 +
 * 固定点迭代"的合并流程，但各自的"完成态/同向/可合并/envelope/合并产物"语义不同。
 * 通过注入本接口，两套算法复用同一个 {@link mergeSpans} 驱动，各自只实现领域谓词。
 */
export interface SpanMergeOperations<T> {
  /** span 内所有元素是否都已"完成"（Bi: Complete 且带 fenxings；Channel: Complete） */
  isCompleteItem(item: T): boolean;
  /** 首尾是否同向（Bi: trend 相同；Channel: trend 相同或 zone 兼容） */
  isSameDirection(head: T, tail: T): boolean;
  /** span 内是否含至少 1 个 Invalid 元素（驱动 Phase B 只消化残留，不误并干净序列） */
  spanHasInvalid(span: readonly T[]): boolean;
  /** 首尾能否合并（Bi: canMergeTwoBis 严格外扩阶梯；Channel: zone 兼容） */
  canMergeTwo(head: T, tail: T): boolean;
  /** 中间元素是否都落在首尾 envelope 内（不含首尾自身） */
  middleFitsEnvelope(span: readonly T[]): boolean;
  /** 执行合并：取 head 的起点 → tail 的终点，重算几何字段 */
  mergeTwo(head: T, tail: T): T;
  /** 合并产物重新判 Valid/Invalid 并回填 status 字段 */
  stampStatus(merged: T): T;
}

/**
 * 定点迭代合并：while-true 外循环 + 短跨度优先 + 最左优先内循环。
 *
 * 算法流程：
 * 1. 外层 while 反复扫描，直到没有任何可合并区间（固定点）
 * 2. 内层先按 spanLength 从短到长（短跨度优先），同跨度再从左到右（最左优先）
 * 3. 每轮只合并第一个满足条件的 span，splice 替换后回到最短跨度重新扫描
 *
 * 核心优势：
 * - 短跨度优先保证合并是"局部贪心"，避免长跨度吞掉本应独立的小区间
 * - 最左优先保证扫描顺序确定，结果可复现
 * - 每次合并都会缩短数组，必然终止，不会死循环
 * - 浅克隆输入，不修改调用方持有的数组与元素
 *
 * @param items 待合并序列（Phase A 输出）
 * @param operations 领域谓词与合并操作（Bi/Channel 各自实现）
 * @returns 合并到不动点后的干净序列
 */
export function mergeSpans<T>(
  items: readonly T[],
  operations: SpanMergeOperations<T>,
): T[] {
  // 浅克隆输入，避免 Phase B 修改调用方持有的数组与元素。
  const result = items.map((item) => ({ ...item }));

  while (true) {
    let merged = false;

    // 优先合并最短区间；同一跨度内优先选择时间上最靠左的区间。
    for (let spanLength = 2; spanLength <= result.length; spanLength++) {
      for (
        let headIndex = 0;
        headIndex + spanLength <= result.length;
        headIndex++
      ) {
        const tailIndex = headIndex + spanLength - 1;
        if (!isMergeableSpan(result, headIndex, tailIndex, operations)) {
          continue;
        }

        const mergedItem = operations.mergeTwo(
          result[headIndex],
          result[tailIndex],
        );
        const replacement = operations.stampStatus(mergedItem);
        result.splice(headIndex, spanLength, replacement);
        merged = true;
        break;
      }

      // 本轮命中后停止继续扫描，回到 while 起点重新检查新的最短窗口。
      if (merged) {
        break;
      }
    }

    // 没有任何可归约区间即到达固定点；每次成功归约都会缩短数组，必然终止。
    if (!merged) {
      return result;
    }
  }
}

/**
 * 判断 span[headIndex .. tailIndex] 是否满足合并前提：
 * 1. 区间内所有元素都已完成
 * 2. 首尾同向
 * 3. 区间内至少含 1 个 Invalid（Phase B 只消化残留）
 * 4. 首尾满足 canMergeTwo
 * 5. 中间元素都落在首尾 envelope 内
 */
function isMergeableSpan<T>(
  items: readonly T[],
  headIndex: number,
  tailIndex: number,
  operations: SpanMergeOperations<T>,
): boolean {
  const span = items.slice(headIndex, tailIndex + 1);
  if (!span.every((item) => operations.isCompleteItem(item))) {
    return false;
  }

  const head = items[headIndex];
  const tail = items[tailIndex];
  if (!operations.isSameDirection(head, tail)) {
    return false;
  }
  if (!operations.spanHasInvalid(span)) {
    return false;
  }
  if (!operations.canMergeTwo(head, tail)) {
    return false;
  }
  if (!operations.middleFitsEnvelope(span)) {
    return false;
  }

  return true;
}
