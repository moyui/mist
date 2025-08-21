import { BaseMessage } from '@langchain/core/messages';
export interface State {
  messages: BaseMessage[];

  // 常量
  TEAM_MEMBERS: string[];

  // 运行时变量
  next: string;
  fullPlan: string;
  isDeepThinking: boolean;
}
