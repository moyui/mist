import { Graph } from '@langchain/langgraph';
import { DynamicModule, Module } from '@nestjs/common';

type workflowConfigType = {
  nodes: {
    name: Parameters<(typeof Graph.prototype)['addNode']>['0'];
    handler: Parameters<(typeof Graph.prototype)['addNode']>['1'];
  }[];
  edges: {
    source: Parameters<(typeof Graph.prototype)['addEdge']>['0'];
    target: Parameters<(typeof Graph.prototype)['addEdge']>['1'];
  }[];
};

@Module({})
export class LangGraphModule {
  static register(workflowConfig: workflowConfigType): DynamicModule {
    return {
      module: LangGraphModule,
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
