import { graphql } from "../gql";

export const RepositoriesQuery = graphql(`
  query Repositories {
    repositories {
      id
      name
      cloneUrl
      defaultBranch
      latestSnapshot { id commitSha status error }
      currentSnapshot { id commitSha }
    }
  }
`);

export const ConnectRepositoryMutation = graphql(`
  mutation ConnectRepository($cloneUrl: String!) {
    connectRepository(cloneUrl: $cloneUrl) { id }
  }
`);

export const RepositoryQuery = graphql(`
  query Repository($id: ID!) {
    repository(id: $id) {
      id
      name
      cloneUrl
      defaultBranch
      testCommand
      latestSnapshot { id commitSha status error }
      currentSnapshot { id commitSha createdAt }
      layout { key x y }
      changeSets { id status requestText selectedKeys baseCommitSha createdAt }
    }
  }
`);

export const GraphNodeFields = graphql(`
  fragment GraphNodeFields on GraphNode {
    id key kind name qualifiedName filePath startLine endLine parentKey meta
  }
`);

export const GraphEdgeFields = graphql(`
  fragment GraphEdgeFields on GraphEdge {
    id sourceKey targetKey kind filePath line inferred
  }
`);

export const GraphQuery = graphql(`
  query Graph($snapshotId: ID!, $filter: GraphFilter) {
    graph(snapshotId: $snapshotId, filter: $filter) {
      nodes { ...GraphNodeFields }
      edges { ...GraphEdgeFields }
      truncated
    }
  }
`);

export const NodeQuery = graphql(`
  query Node($snapshotId: ID!, $key: String!) {
    node(snapshotId: $snapshotId, key: $key) {
      ...GraphNodeFields
      source
      incoming { ...GraphEdgeFields }
      outgoing { ...GraphEdgeFields }
    }
  }
`);

export const IndexRepositoryMutation = graphql(`
  mutation IndexRepository($id: ID!) { indexRepository(id: $id) { id } }
`);

export const SetTestCommandMutation = graphql(`
  mutation SetTestCommand($id: ID!, $command: String!) { setTestCommand(id: $id, command: $command) { id testCommand } }
`);

export const SaveLayoutMutation = graphql(`
  mutation SaveLayout($repositoryId: ID!, $positions: [PositionInput!]!) {
    saveLayout(repositoryId: $repositoryId, positions: $positions)
  }
`);

export const ClearLayoutMutation = graphql(`
  mutation ClearLayout($repositoryId: ID!) { clearLayout(repositoryId: $repositoryId) }
`);

export const CreateChangeSetMutation = graphql(`
  mutation CreateChangeSet($input: CreateChangeSetInput!) { createChangeSet(input: $input) { id } }
`);

export const ChangeSetQuery = graphql(`
  query ChangeSet($id: ID!) {
    changeSet(id: $id) {
      id
      repositoryId
      baseCommitSha
      requestText
      acceptanceCriteria
      selectedKeys
      status
      branchName
      resultCommitSha
      prNumber
      prUrl
      revisionOf
      createdAt
      updatedAt
      events { id type payload createdAt }
      latestExecution { id attempt status diff diffHash testExitCode testOutput error startedAt finishedAt }
      executions { id attempt status testExitCode error startedAt }
    }
  }
`);


export const RunChangeSetMutation = graphql(`
  mutation RunChangeSet($id: ID!) { runChangeSet(id: $id) { id status } }
`);
export const CancelChangeSetMutation = graphql(`
  mutation CancelChangeSet($id: ID!) { cancelChangeSet(id: $id) { id status } }
`);
export const ApproveChangeSetMutation = graphql(`
  mutation ApproveChangeSet($id: ID!, $diffHash: String!) { approveChangeSet(id: $id, diffHash: $diffHash) { id status } }
`);
export const RejectChangeSetMutation = graphql(`
  mutation RejectChangeSet($id: ID!, $reason: String) { rejectChangeSet(id: $id, reason: $reason) { id status } }
`);
export const RetryPullRequestMutation = graphql(`
  mutation RetryPullRequest($id: ID!) { retryPullRequest(id: $id) { id status } }
`);
export const SyncPullRequestMutation = graphql(`
  mutation SyncPullRequest($id: ID!) { syncPullRequest(id: $id) { id status } }
`);
export const ReviseChangeSetMutation = graphql(`
  mutation ReviseChangeSet($id: ID!) { reviseChangeSet(id: $id) { id } }
`);
