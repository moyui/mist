import { BaseMessage } from '@langchain/core/messages';
import {
  Annotation,
  Messages,
  messagesStateReducer,
} from '@langchain/langgraph';

/**
 * Main graph state.
 */
export const GraphAnnotation = Annotation.Root({
  /**
   * The messages in the conversation.
   */
  messages: Annotation<BaseMessage[], Messages>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

type GraphAnnotationState = typeof GraphAnnotation.State;

export interface State extends GraphAnnotationState {
  // 常量
  TEAM_MEMBERS: string[];

  // 运行时变量
  next: string;
  fullPlan: string;
  isDeepThinking: boolean;
}
