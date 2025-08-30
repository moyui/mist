import { type BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
      if (Array.isArray(right)) {
        return left.concat(right);
      }
      return left.concat([right]);
    },
    default: () => [],
  }),
  // 常量
  TEAM_MEMBERS: Annotation<string[]>,
  // 运行时变量
  next: Annotation<string>,
  fullPlan: Annotation<string>,
  isDeepThinking: Annotation<boolean>,
});
