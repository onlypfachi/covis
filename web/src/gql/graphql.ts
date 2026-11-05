/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type CreateChangeSetInput = {
  acceptanceCriteria?: string | null | undefined;
  repositoryId: string;
  request: string;
  selectedKeys?: Array<string> | null | undefined;
};

export type GraphFilter = {
  keys?: Array<string> | null | undefined;
  kinds?: Array<string> | null | undefined;
  limit?: number | null | undefined;
  /** Only direct children of this node. Use "repository:" for the root. */
  parentKey?: string | null | undefined;
  pathPrefix?: string | null | undefined;
  search?: string | null | undefined;
};

export type PositionInput = {
  key: string;
  x: number;
  y: number;
};

export type RepositoriesQueryVariables = Exact<{ [key: string]: never; }>;


export type RepositoriesQuery = { repositories: Array<{ id: string, name: string, cloneUrl: string, defaultBranch: string, latestSnapshot: { id: string, commitSha: string, status: string, error: string } | null, currentSnapshot: { id: string, commitSha: string } | null }> };

export type ConnectRepositoryMutationVariables = Exact<{
  cloneUrl: string;
}>;


export type ConnectRepositoryMutation = { connectRepository: { id: string } };

export type RepositoryQueryVariables = Exact<{
  id: string;
}>;


export type RepositoryQuery = { repository: { id: string, name: string, cloneUrl: string, defaultBranch: string, testCommand: string, latestSnapshot: { id: string, commitSha: string, status: string, error: string } | null, currentSnapshot: { id: string, commitSha: string, createdAt: string } | null, layout: Array<{ key: string, x: number, y: number }>, changeSets: Array<{ id: string, status: string, requestText: string, selectedKeys: Array<string>, baseCommitSha: string, createdAt: string }> } | null };

export type GraphNodeFieldsFragment = { id: string, key: string, kind: string, name: string, qualifiedName: string, filePath: string, startLine: number, endLine: number, parentKey: string, meta: Record<string, unknown> };

export type GraphEdgeFieldsFragment = { id: string, sourceKey: string, targetKey: string, kind: string, filePath: string, line: number, inferred: boolean };

export type GraphQueryVariables = Exact<{
  snapshotId: string;
  filter?: GraphFilter | null | undefined;
}>;


export type GraphQuery = { graph: { truncated: boolean, nodes: Array<{ id: string, key: string, kind: string, name: string, qualifiedName: string, filePath: string, startLine: number, endLine: number, parentKey: string, meta: Record<string, unknown> }>, edges: Array<{ id: string, sourceKey: string, targetKey: string, kind: string, filePath: string, line: number, inferred: boolean }> } };

export type NodeQueryVariables = Exact<{
  snapshotId: string;
  key: string;
}>;


export type NodeQuery = { node: { source: string, id: string, key: string, kind: string, name: string, qualifiedName: string, filePath: string, startLine: number, endLine: number, parentKey: string, meta: Record<string, unknown>, incoming: Array<{ id: string, sourceKey: string, targetKey: string, kind: string, filePath: string, line: number, inferred: boolean }>, outgoing: Array<{ id: string, sourceKey: string, targetKey: string, kind: string, filePath: string, line: number, inferred: boolean }> } | null };

export type IndexRepositoryMutationVariables = Exact<{
  id: string;
}>;


export type IndexRepositoryMutation = { indexRepository: { id: string } };

export type SetTestCommandMutationVariables = Exact<{
  id: string;
  command: string;
}>;


export type SetTestCommandMutation = { setTestCommand: { id: string, testCommand: string } };

export type SaveLayoutMutationVariables = Exact<{
  repositoryId: string;
  positions: Array<PositionInput> | PositionInput;
}>;


export type SaveLayoutMutation = { saveLayout: boolean };

export type ClearLayoutMutationVariables = Exact<{
  repositoryId: string;
}>;


export type ClearLayoutMutation = { clearLayout: boolean };

export type CreateChangeSetMutationVariables = Exact<{
  input: CreateChangeSetInput;
}>;


export type CreateChangeSetMutation = { createChangeSet: { id: string } };

export type ChangeSetQueryVariables = Exact<{
  id: string;
}>;


export type ChangeSetQuery = { changeSet: { id: string, repositoryId: string, baseCommitSha: string, requestText: string, acceptanceCriteria: string, selectedKeys: Array<string>, status: string, branchName: string, resultCommitSha: string, prNumber: number | null, prUrl: string, revisionOf: string | null, createdAt: string, updatedAt: string, events: Array<{ id: string, type: string, payload: Record<string, unknown>, createdAt: string }>, latestExecution: { id: string, attempt: number, status: string, diff: string, diffHash: string, testExitCode: number | null, testOutput: string, error: string, startedAt: string, finishedAt: string | null } | null, executions: Array<{ id: string, attempt: number, status: string, testExitCode: number | null, error: string, startedAt: string }> } | null };

export type RunChangeSetMutationVariables = Exact<{
  id: string;
}>;


export type RunChangeSetMutation = { runChangeSet: { id: string, status: string } };

export type CancelChangeSetMutationVariables = Exact<{
  id: string;
}>;


export type CancelChangeSetMutation = { cancelChangeSet: { id: string, status: string } };

export type ApproveChangeSetMutationVariables = Exact<{
  id: string;
  diffHash: string;
}>;


export type ApproveChangeSetMutation = { approveChangeSet: { id: string, status: string } };

export type RejectChangeSetMutationVariables = Exact<{
  id: string;
  reason?: string | null | undefined;
}>;


export type RejectChangeSetMutation = { rejectChangeSet: { id: string, status: string } };

export type RetryPullRequestMutationVariables = Exact<{
  id: string;
}>;


export type RetryPullRequestMutation = { retryPullRequest: { id: string, status: string } };

export type SyncPullRequestMutationVariables = Exact<{
  id: string;
}>;


export type SyncPullRequestMutation = { syncPullRequest: { id: string, status: string } };

export type ReviseChangeSetMutationVariables = Exact<{
  id: string;
}>;


export type ReviseChangeSetMutation = { reviseChangeSet: { id: string } };

export const GraphNodeFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphNodeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphNode"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"qualifiedName"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"startLine"}},{"kind":"Field","name":{"kind":"Name","value":"endLine"}},{"kind":"Field","name":{"kind":"Name","value":"parentKey"}},{"kind":"Field","name":{"kind":"Name","value":"meta"}}]}}]} as unknown as DocumentNode<GraphNodeFieldsFragment, unknown>;
export const GraphEdgeFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphEdgeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphEdge"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sourceKey"}},{"kind":"Field","name":{"kind":"Name","value":"targetKey"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"inferred"}}]}}]} as unknown as DocumentNode<GraphEdgeFieldsFragment, unknown>;
export const RepositoriesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Repositories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"repositories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"cloneUrl"}},{"kind":"Field","name":{"kind":"Name","value":"defaultBranch"}},{"kind":"Field","name":{"kind":"Name","value":"latestSnapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"commitSha"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"error"}}]}},{"kind":"Field","name":{"kind":"Name","value":"currentSnapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"commitSha"}}]}}]}}]}}]} as unknown as DocumentNode<RepositoriesQuery, RepositoriesQueryVariables>;
export const ConnectRepositoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConnectRepository"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cloneUrl"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectRepository"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"cloneUrl"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cloneUrl"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<ConnectRepositoryMutation, ConnectRepositoryMutationVariables>;
export const RepositoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Repository"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"repository"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"cloneUrl"}},{"kind":"Field","name":{"kind":"Name","value":"defaultBranch"}},{"kind":"Field","name":{"kind":"Name","value":"testCommand"}},{"kind":"Field","name":{"kind":"Name","value":"latestSnapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"commitSha"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"error"}}]}},{"kind":"Field","name":{"kind":"Name","value":"currentSnapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"commitSha"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"layout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}}]}},{"kind":"Field","name":{"kind":"Name","value":"changeSets"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"requestText"}},{"kind":"Field","name":{"kind":"Name","value":"selectedKeys"}},{"kind":"Field","name":{"kind":"Name","value":"baseCommitSha"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]} as unknown as DocumentNode<RepositoryQuery, RepositoryQueryVariables>;
export const GraphDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Graph"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snapshotId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"graph"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"snapshotId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snapshotId"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GraphNodeFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GraphEdgeFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"truncated"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphNodeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphNode"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"qualifiedName"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"startLine"}},{"kind":"Field","name":{"kind":"Name","value":"endLine"}},{"kind":"Field","name":{"kind":"Name","value":"parentKey"}},{"kind":"Field","name":{"kind":"Name","value":"meta"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphEdgeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphEdge"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sourceKey"}},{"kind":"Field","name":{"kind":"Name","value":"targetKey"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"inferred"}}]}}]} as unknown as DocumentNode<GraphQuery, GraphQueryVariables>;
export const NodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Node"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snapshotId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"key"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"snapshotId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snapshotId"}}},{"kind":"Argument","name":{"kind":"Name","value":"key"},"value":{"kind":"Variable","name":{"kind":"Name","value":"key"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GraphNodeFields"}},{"kind":"Field","name":{"kind":"Name","value":"source"}},{"kind":"Field","name":{"kind":"Name","value":"incoming"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GraphEdgeFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"outgoing"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GraphEdgeFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphNodeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphNode"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"qualifiedName"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"startLine"}},{"kind":"Field","name":{"kind":"Name","value":"endLine"}},{"kind":"Field","name":{"kind":"Name","value":"parentKey"}},{"kind":"Field","name":{"kind":"Name","value":"meta"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GraphEdgeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GraphEdge"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sourceKey"}},{"kind":"Field","name":{"kind":"Name","value":"targetKey"}},{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"filePath"}},{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"inferred"}}]}}]} as unknown as DocumentNode<NodeQuery, NodeQueryVariables>;
export const IndexRepositoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IndexRepository"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"indexRepository"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<IndexRepositoryMutation, IndexRepositoryMutationVariables>;
export const SetTestCommandDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTestCommand"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"command"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTestCommand"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"command"},"value":{"kind":"Variable","name":{"kind":"Name","value":"command"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"testCommand"}}]}}]}}]} as unknown as DocumentNode<SetTestCommandMutation, SetTestCommandMutationVariables>;
export const SaveLayoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SaveLayout"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repositoryId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"positions"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PositionInput"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"saveLayout"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"repositoryId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repositoryId"}}},{"kind":"Argument","name":{"kind":"Name","value":"positions"},"value":{"kind":"Variable","name":{"kind":"Name","value":"positions"}}}]}]}}]} as unknown as DocumentNode<SaveLayoutMutation, SaveLayoutMutationVariables>;
export const ClearLayoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ClearLayout"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repositoryId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"clearLayout"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"repositoryId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repositoryId"}}}]}]}}]} as unknown as DocumentNode<ClearLayoutMutation, ClearLayoutMutationVariables>;
export const CreateChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateChangeSetInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateChangeSetMutation, CreateChangeSetMutationVariables>;
export const ChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"repositoryId"}},{"kind":"Field","name":{"kind":"Name","value":"baseCommitSha"}},{"kind":"Field","name":{"kind":"Name","value":"requestText"}},{"kind":"Field","name":{"kind":"Name","value":"acceptanceCriteria"}},{"kind":"Field","name":{"kind":"Name","value":"selectedKeys"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"branchName"}},{"kind":"Field","name":{"kind":"Name","value":"resultCommitSha"}},{"kind":"Field","name":{"kind":"Name","value":"prNumber"}},{"kind":"Field","name":{"kind":"Name","value":"prUrl"}},{"kind":"Field","name":{"kind":"Name","value":"revisionOf"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"events"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"latestExecution"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"attempt"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"diff"}},{"kind":"Field","name":{"kind":"Name","value":"diffHash"}},{"kind":"Field","name":{"kind":"Name","value":"testExitCode"}},{"kind":"Field","name":{"kind":"Name","value":"testOutput"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"finishedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"executions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"attempt"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"testExitCode"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}}]}}]}}]}}]} as unknown as DocumentNode<ChangeSetQuery, ChangeSetQueryVariables>;
export const RunChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RunChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"runChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<RunChangeSetMutation, RunChangeSetMutationVariables>;
export const CancelChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CancelChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cancelChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<CancelChangeSetMutation, CancelChangeSetMutationVariables>;
export const ApproveChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ApproveChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"diffHash"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"approveChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"diffHash"},"value":{"kind":"Variable","name":{"kind":"Name","value":"diffHash"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<ApproveChangeSetMutation, ApproveChangeSetMutationVariables>;
export const RejectChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RejectChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"reason"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rejectChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"reason"},"value":{"kind":"Variable","name":{"kind":"Name","value":"reason"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<RejectChangeSetMutation, RejectChangeSetMutationVariables>;
export const RetryPullRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RetryPullRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"retryPullRequest"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<RetryPullRequestMutation, RetryPullRequestMutationVariables>;
export const SyncPullRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SyncPullRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"syncPullRequest"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<SyncPullRequestMutation, SyncPullRequestMutationVariables>;
export const ReviseChangeSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ReviseChangeSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"reviseChangeSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<ReviseChangeSetMutation, ReviseChangeSetMutationVariables>;