import { Graph } from '@langchain/langgraph';
import { DynamicModule, Module } from '@nestjs/common';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';
import { WorkflowConfig } from './dto/workflow.dto';

@Module({
  controllers: [BuilderController],
  providers: [BuilderService],
})
export class BuilderModule {
  static register(workflowConfig: WorkflowConfig): DynamicModule {
    return {
      module: BuilderModule,
      providers: [
        {
          provide: 'LANG_GRAPH',
          useFactory: () => {
            const graph = new Graph();
            workflowConfig.nodes.forEach((node) =>
              graph.addNode(node.name, node.handler),
            );
            workflowConfig.edges.forEach((edge) =>
              graph.addEdge(edge.source, edge.target),
            );
            return graph.compile();
          },
        },
      ],
      exports: ['LANG_GRAPH'],
    };
  }
}
