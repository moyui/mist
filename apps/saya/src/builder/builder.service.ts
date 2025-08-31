import { HumanMessage } from '@langchain/core/messages';
import { StateGraph } from '@langchain/langgraph';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StateAnnotation } from '../role/dto/state.dto';
import { RoleService } from '../role/role.service';

@Injectable()
export class BuilderService implements OnModuleInit {
  private graph: ReturnType<typeof this.buildGraph>;

  @Inject()
  private roleService: RoleService;

  onModuleInit() {
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const builder = new StateGraph(StateAnnotation);
    const graph = builder
      .addNode('commander', this.roleService.Commander)
      .addEdge('__start__', 'commander')
      .addEdge('commander', '__end__')
      .compile();

    return graph;
  }

  async invoke(userInput: string) {
    const TEAM_MEMBERS = ['member1', 'member2']; // 你的团队成员
    return await this.graph.invoke({
      TEAM_MEMBERS,
      messages: [new HumanMessage(userInput)],
      next: '1111',
      fullPlan: '111',
      isDeepThinking: false,
    });
  }
}
