import { Graph } from '@langchain/langgraph';

export interface WorkflowConfig {
  nodes: {
    name: Parameters<(typeof Graph.prototype)['addNode']>['0'];
    handler: Parameters<(typeof Graph.prototype)['addNode']>['1'];
  }[];
  edges: {
    source: Parameters<(typeof Graph.prototype)['addEdge']>['0'];
    target: Parameters<(typeof Graph.prototype)['addEdge']>['1'];
  }[];
}
