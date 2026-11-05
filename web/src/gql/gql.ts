/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Repositories {\n    repositories {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha }\n    }\n  }\n": typeof types.RepositoriesDocument,
    "\n  mutation ConnectRepository($cloneUrl: String!) {\n    connectRepository(cloneUrl: $cloneUrl) { id }\n  }\n": typeof types.ConnectRepositoryDocument,
    "\n  query Repository($id: ID!) {\n    repository(id: $id) {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      testCommand\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha createdAt }\n      layout { key x y }\n      changeSets { id status requestText selectedKeys baseCommitSha createdAt }\n    }\n  }\n": typeof types.RepositoryDocument,
    "\n  fragment GraphNodeFields on GraphNode {\n    id key kind name qualifiedName filePath startLine endLine parentKey meta\n  }\n": typeof types.GraphNodeFieldsFragmentDoc,
    "\n  fragment GraphEdgeFields on GraphEdge {\n    id sourceKey targetKey kind filePath line inferred\n  }\n": typeof types.GraphEdgeFieldsFragmentDoc,
    "\n  query Graph($snapshotId: ID!, $filter: GraphFilter) {\n    graph(snapshotId: $snapshotId, filter: $filter) {\n      nodes { ...GraphNodeFields }\n      edges { ...GraphEdgeFields }\n      truncated\n    }\n  }\n": typeof types.GraphDocument,
    "\n  query Node($snapshotId: ID!, $key: String!) {\n    node(snapshotId: $snapshotId, key: $key) {\n      ...GraphNodeFields\n      source\n      incoming { ...GraphEdgeFields }\n      outgoing { ...GraphEdgeFields }\n    }\n  }\n": typeof types.NodeDocument,
    "\n  mutation IndexRepository($id: ID!) { indexRepository(id: $id) { id } }\n": typeof types.IndexRepositoryDocument,
    "\n  mutation SetTestCommand($id: ID!, $command: String!) { setTestCommand(id: $id, command: $command) { id testCommand } }\n": typeof types.SetTestCommandDocument,
    "\n  mutation SaveLayout($repositoryId: ID!, $positions: [PositionInput!]!) {\n    saveLayout(repositoryId: $repositoryId, positions: $positions)\n  }\n": typeof types.SaveLayoutDocument,
    "\n  mutation ClearLayout($repositoryId: ID!) { clearLayout(repositoryId: $repositoryId) }\n": typeof types.ClearLayoutDocument,
    "\n  mutation CreateChangeSet($input: CreateChangeSetInput!) { createChangeSet(input: $input) { id } }\n": typeof types.CreateChangeSetDocument,
    "\n  query ChangeSet($id: ID!) {\n    changeSet(id: $id) {\n      id\n      repositoryId\n      baseCommitSha\n      requestText\n      acceptanceCriteria\n      selectedKeys\n      status\n      branchName\n      resultCommitSha\n      prNumber\n      prUrl\n      revisionOf\n      createdAt\n      updatedAt\n      events { id type payload createdAt }\n      latestExecution { id attempt status diff diffHash testExitCode testOutput error startedAt finishedAt }\n      executions { id attempt status testExitCode error startedAt }\n    }\n  }\n": typeof types.ChangeSetDocument,
    "\n  mutation RunChangeSet($id: ID!) { runChangeSet(id: $id) { id status } }\n": typeof types.RunChangeSetDocument,
    "\n  mutation CancelChangeSet($id: ID!) { cancelChangeSet(id: $id) { id status } }\n": typeof types.CancelChangeSetDocument,
    "\n  mutation ApproveChangeSet($id: ID!, $diffHash: String!) { approveChangeSet(id: $id, diffHash: $diffHash) { id status } }\n": typeof types.ApproveChangeSetDocument,
    "\n  mutation RejectChangeSet($id: ID!, $reason: String) { rejectChangeSet(id: $id, reason: $reason) { id status } }\n": typeof types.RejectChangeSetDocument,
    "\n  mutation RetryPullRequest($id: ID!) { retryPullRequest(id: $id) { id status } }\n": typeof types.RetryPullRequestDocument,
    "\n  mutation SyncPullRequest($id: ID!) { syncPullRequest(id: $id) { id status } }\n": typeof types.SyncPullRequestDocument,
    "\n  mutation ReviseChangeSet($id: ID!) { reviseChangeSet(id: $id) { id } }\n": typeof types.ReviseChangeSetDocument,
};
const documents: Documents = {
    "\n  query Repositories {\n    repositories {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha }\n    }\n  }\n": types.RepositoriesDocument,
    "\n  mutation ConnectRepository($cloneUrl: String!) {\n    connectRepository(cloneUrl: $cloneUrl) { id }\n  }\n": types.ConnectRepositoryDocument,
    "\n  query Repository($id: ID!) {\n    repository(id: $id) {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      testCommand\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha createdAt }\n      layout { key x y }\n      changeSets { id status requestText selectedKeys baseCommitSha createdAt }\n    }\n  }\n": types.RepositoryDocument,
    "\n  fragment GraphNodeFields on GraphNode {\n    id key kind name qualifiedName filePath startLine endLine parentKey meta\n  }\n": types.GraphNodeFieldsFragmentDoc,
    "\n  fragment GraphEdgeFields on GraphEdge {\n    id sourceKey targetKey kind filePath line inferred\n  }\n": types.GraphEdgeFieldsFragmentDoc,
    "\n  query Graph($snapshotId: ID!, $filter: GraphFilter) {\n    graph(snapshotId: $snapshotId, filter: $filter) {\n      nodes { ...GraphNodeFields }\n      edges { ...GraphEdgeFields }\n      truncated\n    }\n  }\n": types.GraphDocument,
    "\n  query Node($snapshotId: ID!, $key: String!) {\n    node(snapshotId: $snapshotId, key: $key) {\n      ...GraphNodeFields\n      source\n      incoming { ...GraphEdgeFields }\n      outgoing { ...GraphEdgeFields }\n    }\n  }\n": types.NodeDocument,
    "\n  mutation IndexRepository($id: ID!) { indexRepository(id: $id) { id } }\n": types.IndexRepositoryDocument,
    "\n  mutation SetTestCommand($id: ID!, $command: String!) { setTestCommand(id: $id, command: $command) { id testCommand } }\n": types.SetTestCommandDocument,
    "\n  mutation SaveLayout($repositoryId: ID!, $positions: [PositionInput!]!) {\n    saveLayout(repositoryId: $repositoryId, positions: $positions)\n  }\n": types.SaveLayoutDocument,
    "\n  mutation ClearLayout($repositoryId: ID!) { clearLayout(repositoryId: $repositoryId) }\n": types.ClearLayoutDocument,
    "\n  mutation CreateChangeSet($input: CreateChangeSetInput!) { createChangeSet(input: $input) { id } }\n": types.CreateChangeSetDocument,
    "\n  query ChangeSet($id: ID!) {\n    changeSet(id: $id) {\n      id\n      repositoryId\n      baseCommitSha\n      requestText\n      acceptanceCriteria\n      selectedKeys\n      status\n      branchName\n      resultCommitSha\n      prNumber\n      prUrl\n      revisionOf\n      createdAt\n      updatedAt\n      events { id type payload createdAt }\n      latestExecution { id attempt status diff diffHash testExitCode testOutput error startedAt finishedAt }\n      executions { id attempt status testExitCode error startedAt }\n    }\n  }\n": types.ChangeSetDocument,
    "\n  mutation RunChangeSet($id: ID!) { runChangeSet(id: $id) { id status } }\n": types.RunChangeSetDocument,
    "\n  mutation CancelChangeSet($id: ID!) { cancelChangeSet(id: $id) { id status } }\n": types.CancelChangeSetDocument,
    "\n  mutation ApproveChangeSet($id: ID!, $diffHash: String!) { approveChangeSet(id: $id, diffHash: $diffHash) { id status } }\n": types.ApproveChangeSetDocument,
    "\n  mutation RejectChangeSet($id: ID!, $reason: String) { rejectChangeSet(id: $id, reason: $reason) { id status } }\n": types.RejectChangeSetDocument,
    "\n  mutation RetryPullRequest($id: ID!) { retryPullRequest(id: $id) { id status } }\n": types.RetryPullRequestDocument,
    "\n  mutation SyncPullRequest($id: ID!) { syncPullRequest(id: $id) { id status } }\n": types.SyncPullRequestDocument,
    "\n  mutation ReviseChangeSet($id: ID!) { reviseChangeSet(id: $id) { id } }\n": types.ReviseChangeSetDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Repositories {\n    repositories {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha }\n    }\n  }\n"): (typeof documents)["\n  query Repositories {\n    repositories {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ConnectRepository($cloneUrl: String!) {\n    connectRepository(cloneUrl: $cloneUrl) { id }\n  }\n"): (typeof documents)["\n  mutation ConnectRepository($cloneUrl: String!) {\n    connectRepository(cloneUrl: $cloneUrl) { id }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Repository($id: ID!) {\n    repository(id: $id) {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      testCommand\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha createdAt }\n      layout { key x y }\n      changeSets { id status requestText selectedKeys baseCommitSha createdAt }\n    }\n  }\n"): (typeof documents)["\n  query Repository($id: ID!) {\n    repository(id: $id) {\n      id\n      name\n      cloneUrl\n      defaultBranch\n      testCommand\n      latestSnapshot { id commitSha status error }\n      currentSnapshot { id commitSha createdAt }\n      layout { key x y }\n      changeSets { id status requestText selectedKeys baseCommitSha createdAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment GraphNodeFields on GraphNode {\n    id key kind name qualifiedName filePath startLine endLine parentKey meta\n  }\n"): (typeof documents)["\n  fragment GraphNodeFields on GraphNode {\n    id key kind name qualifiedName filePath startLine endLine parentKey meta\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment GraphEdgeFields on GraphEdge {\n    id sourceKey targetKey kind filePath line inferred\n  }\n"): (typeof documents)["\n  fragment GraphEdgeFields on GraphEdge {\n    id sourceKey targetKey kind filePath line inferred\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Graph($snapshotId: ID!, $filter: GraphFilter) {\n    graph(snapshotId: $snapshotId, filter: $filter) {\n      nodes { ...GraphNodeFields }\n      edges { ...GraphEdgeFields }\n      truncated\n    }\n  }\n"): (typeof documents)["\n  query Graph($snapshotId: ID!, $filter: GraphFilter) {\n    graph(snapshotId: $snapshotId, filter: $filter) {\n      nodes { ...GraphNodeFields }\n      edges { ...GraphEdgeFields }\n      truncated\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Node($snapshotId: ID!, $key: String!) {\n    node(snapshotId: $snapshotId, key: $key) {\n      ...GraphNodeFields\n      source\n      incoming { ...GraphEdgeFields }\n      outgoing { ...GraphEdgeFields }\n    }\n  }\n"): (typeof documents)["\n  query Node($snapshotId: ID!, $key: String!) {\n    node(snapshotId: $snapshotId, key: $key) {\n      ...GraphNodeFields\n      source\n      incoming { ...GraphEdgeFields }\n      outgoing { ...GraphEdgeFields }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation IndexRepository($id: ID!) { indexRepository(id: $id) { id } }\n"): (typeof documents)["\n  mutation IndexRepository($id: ID!) { indexRepository(id: $id) { id } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetTestCommand($id: ID!, $command: String!) { setTestCommand(id: $id, command: $command) { id testCommand } }\n"): (typeof documents)["\n  mutation SetTestCommand($id: ID!, $command: String!) { setTestCommand(id: $id, command: $command) { id testCommand } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SaveLayout($repositoryId: ID!, $positions: [PositionInput!]!) {\n    saveLayout(repositoryId: $repositoryId, positions: $positions)\n  }\n"): (typeof documents)["\n  mutation SaveLayout($repositoryId: ID!, $positions: [PositionInput!]!) {\n    saveLayout(repositoryId: $repositoryId, positions: $positions)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ClearLayout($repositoryId: ID!) { clearLayout(repositoryId: $repositoryId) }\n"): (typeof documents)["\n  mutation ClearLayout($repositoryId: ID!) { clearLayout(repositoryId: $repositoryId) }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateChangeSet($input: CreateChangeSetInput!) { createChangeSet(input: $input) { id } }\n"): (typeof documents)["\n  mutation CreateChangeSet($input: CreateChangeSetInput!) { createChangeSet(input: $input) { id } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ChangeSet($id: ID!) {\n    changeSet(id: $id) {\n      id\n      repositoryId\n      baseCommitSha\n      requestText\n      acceptanceCriteria\n      selectedKeys\n      status\n      branchName\n      resultCommitSha\n      prNumber\n      prUrl\n      revisionOf\n      createdAt\n      updatedAt\n      events { id type payload createdAt }\n      latestExecution { id attempt status diff diffHash testExitCode testOutput error startedAt finishedAt }\n      executions { id attempt status testExitCode error startedAt }\n    }\n  }\n"): (typeof documents)["\n  query ChangeSet($id: ID!) {\n    changeSet(id: $id) {\n      id\n      repositoryId\n      baseCommitSha\n      requestText\n      acceptanceCriteria\n      selectedKeys\n      status\n      branchName\n      resultCommitSha\n      prNumber\n      prUrl\n      revisionOf\n      createdAt\n      updatedAt\n      events { id type payload createdAt }\n      latestExecution { id attempt status diff diffHash testExitCode testOutput error startedAt finishedAt }\n      executions { id attempt status testExitCode error startedAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RunChangeSet($id: ID!) { runChangeSet(id: $id) { id status } }\n"): (typeof documents)["\n  mutation RunChangeSet($id: ID!) { runChangeSet(id: $id) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CancelChangeSet($id: ID!) { cancelChangeSet(id: $id) { id status } }\n"): (typeof documents)["\n  mutation CancelChangeSet($id: ID!) { cancelChangeSet(id: $id) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ApproveChangeSet($id: ID!, $diffHash: String!) { approveChangeSet(id: $id, diffHash: $diffHash) { id status } }\n"): (typeof documents)["\n  mutation ApproveChangeSet($id: ID!, $diffHash: String!) { approveChangeSet(id: $id, diffHash: $diffHash) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RejectChangeSet($id: ID!, $reason: String) { rejectChangeSet(id: $id, reason: $reason) { id status } }\n"): (typeof documents)["\n  mutation RejectChangeSet($id: ID!, $reason: String) { rejectChangeSet(id: $id, reason: $reason) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetryPullRequest($id: ID!) { retryPullRequest(id: $id) { id status } }\n"): (typeof documents)["\n  mutation RetryPullRequest($id: ID!) { retryPullRequest(id: $id) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SyncPullRequest($id: ID!) { syncPullRequest(id: $id) { id status } }\n"): (typeof documents)["\n  mutation SyncPullRequest($id: ID!) { syncPullRequest(id: $id) { id status } }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ReviseChangeSet($id: ID!) { reviseChangeSet(id: $id) { id } }\n"): (typeof documents)["\n  mutation ReviseChangeSet($id: ID!) { reviseChangeSet(id: $id) { id } }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;