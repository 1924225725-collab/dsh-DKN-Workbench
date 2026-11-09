export type AgentStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'interrupted' | 'unknown'
export type TaskStatus = 'queued' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'blocked'
export type MessageStatus = 'local' | 'queued' | 'delivered' | 'failed'
export type EventOrigin = 'human' | 'simulation' | 'system' | 'adapter'

export interface Project {
  id: string
  pinned?: boolean
  sortOrder?: number
  name: string
  path?: string
  description: string
  stack: string[]
  updatedAt: string
  goal?: string
  progress?: string
  risks?: string
  milestones?: string
}

export interface AgentMember {
  id: string
  avatar?: string
  workingDirectory?: string
  directorySource?: 'created' | 'reported'
  /** Projects this exact software session has been explicitly added to. */
  projectIds: string[]
  displayName: string
  software: string
  sessionId: string
  role: string
  status: AgentStatus
  currentTaskId?: string
  lastActivityAt: string
  connectionMode: 'simulation' | 'existing-window' | 'runtime' | 'plugin-bridge' | 'new-session' | 'window-automation'
  instructions?: string
  allowSend?: boolean
  allowAutomation?: boolean
  allowRelay?: boolean
  model?: string
  selectedModel?: string
  selectedModelLabel?: string
  reasoningEffort?: string
  /** Codex App Server sandbox for Hub-owned sessions; does not affect native-window sessions. */
  codexSandboxMode?: 'read-only' | 'workspace-write'
  /** User approval flow for Hub-owned Codex App Server sessions. */
  codexApprovalMode?: 'manual' | 'auto-review'
  historyCursor?: string | null
  error?: string
  nativeParentSessionId?: string
  promptAssistant?: boolean
  contextInitializedProjectIds?: string[]
  tokenUsage?: TokenUsage
}

export interface TokenUsage {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  source: 'provider-reported'
}

export interface GroupMessage {
  id: string
  kind?: 'content' | 'handoff' | 'notice' | 'workflow'
  purpose?: string
  workflowRunId?: string
  workflowNodeId?: string
  projectId: string
  senderId: string
  recipientIds: string[]
  body: string
  createdAt: string
  status: MessageStatus
  origin: EventOrigin
  correlationId?: string
  sourceEventId?: string
  error?: string
  replyToId?: string
  nativeTimestampUnknown?: boolean
  nativeBody?: string
  rawNativeReply?: string
  nativeBodies?: Record<string, string>
  sourceEventIds?: Record<string, string>
  taskId?: string
  promptAssistantRequest?: boolean
  discussionId?: string
  discussionTurn?: number
  handoffEventId?: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  detail: string
  status: TaskStatus
  parentTaskId?: string
  assigneeId?: string
  reviewerId?: string
  dependsOn: string[]
  retryCount: number
  maxRetries: number
  updatedAt: string
  acceptanceCriteria?: string
  selfTestEvidence?: string
  reviewEvidence?: string
  workflow?: 'manual' | 'develop-review'
  acceptedArtifactIds?: string[]
  lastError?: string
}

export interface Artifact {
  linkedMessageIds?: string[]
  id: string
  projectId: string
  taskId?: string
  name: string
  kind: 'document' | 'code' | 'report' | 'image' | 'build'
  location: string
  createdAt: string
  origin: EventOrigin
  memberId?: string
  sessionId?: string
  version?: string
  messageId?: string
  observedMemberId?: string
  attribution?: 'reported-path' | 'observed-during-turn'
}

export interface HubEvent {
  id: string
  type: 'message.created' | 'task.created' | 'task.status_changed' | 'task.assignment_changed' | 'artifact.registered' | 'member.registered' | 'member.status_changed' | 'project.updated' | 'permission.changed' | 'job.updated' | 'issue.updated' | 'workspace.imported'
  projectId: string
  actorId: string
  origin: EventOrigin
  occurredAt: string
  entityId: string
  summary: string
  data?: Record<string, string | number | boolean | null>
}

export interface PermissionGrant {
  id: string
  memberId: string
  resourceKind: 'global' | 'project' | 'session' | 'task' | 'artifact'
  resourceId?: string
  actions: string[]
  grantedBy: string
  grantedAt: string
  expiresAt?: string
  source: 'local-policy' | 'host-policy'
}

export interface HubSnapshot {
  projects: Project[]
  members: AgentMember[]
  messages: GroupMessage[]
  tasks: Task[]
  artifacts: Artifact[]
  events: HubEvent[]
  permissionGrants: PermissionGrant[]
  jobs?: ExecutionJob[]
  issues?: KnownIssue[]
  revision?: number
  discussions?: Discussion[]
  relays?: RelayProposal[]
  workflowTemplates?: WorkflowTemplate[]
  workflowRuns?: WorkflowRun[]
  workflowDrafts?: WorkflowDraft[]
  workflowGenerator?: WorkflowGenerator
}

export interface Discussion {
  id: string
  projectId: string
  memberIds: string[]
  mode: 'approval' | 'automatic'
  status: 'active' | 'stopped'
  topic: string
  maxMessages: number
  sentCount: number
  createdAt: string
  memberOrder?: string[]
  introIndex?: number
  introductionsComplete?: boolean
  introducedMemberIds?: string[]
  endedNoticesQueued?: boolean
  endReason?: string
}

export interface RelayProposal {
  id: string
  discussionId: string
  projectId: string
  fromMemberId: string
  toMemberId: string
  message: string
  expectation: string
  sourceJobId: string
  sourceMessageId?: string
  sourceEventId?: string
  handoffEventId?: string
  turnIndex?: number
  status: 'pending' | 'sending' | 'sent' | 'rejected' | 'failed'
  createdAt: string
  error?: string
}

export interface ExecutionJob {
  submissionUncertain?: boolean
  nativeTimings?: Record<string, number | boolean | undefined>
  id: string
  projectId: string
  taskId?: string
  memberId: string
  kind: 'message' | 'workflow'
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted'
  stage: string
  startedAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
  cancelRequested?: boolean
  correlationId: string
  messageSent?: boolean
  turnEnded?: boolean
  parentJobId?: string
  rootJobId?: string
  discussionId?: string
  discussionStep?: 'introduction' | 'kickoff' | 'conversation' | 'closure'
  discussionTurn?: number
  handoffEventId?: string
  purpose?: 'member-onboarding' | 'roster-update' | 'prompt-assistant' | 'discussion-closure'
  workflowRunId?: string
  workflowNodeId?: string
}

export interface WorkflowRole { id: string; name: string; instructions: string }
export interface WorkflowNode {
  id: string; title: string; type: 'agent' | 'review' | 'approval' | 'end'
  roleId?: string; instructions: string; maxVisits: number
}
export interface WorkflowEdge { from: string; to: string; outcome: 'success' | 'failure' }
export interface WorkflowTemplate {
  pinned?: boolean; sortOrder?: number
  id: string; name: string; description: string; version: number; updatedAt: string
  entry: string; roles: WorkflowRole[]; nodes: WorkflowNode[]; edges: WorkflowEdge[]
}
export interface WorkflowStep {
  rawOutput?: string
  reviewValidation?: { schemaVersion: string; valid: boolean; accepted?: boolean; error?: string }
  id: string; nodeId: string; status: 'running' | 'waiting' | 'completed' | 'failed'
  startedAt: string; finishedAt?: string; memberId?: string; jobId?: string; messageId?: string
  input: string; output?: string; evidence?: string; outcome?: 'success' | 'failure'; error?: string
}
export interface WorkflowRun {
  name?: string; pinned?: boolean; sortOrder?: number
  id: string; projectId: string; taskId: string; template: WorkflowTemplate
  bindings: Record<string, string>; status: 'running' | 'paused' | 'waiting' | 'blocked' | 'completed' | 'stopped'
  currentNodeId: string; input: string; steps: WorkflowStep[]; handoffMode: 'automatic' | 'approval'
  createdAt: string; updatedAt: string; error?: string; pendingAdvance?: boolean; authorizedNodeId?: string
  interventions?: { createdAt: string; note: string }[]
}
export interface WorkflowGenerator { software: string; sessionId: string; mode: AgentMember['connectionMode']; model?: string; effort?: string }
export interface WorkflowDraft {
  id: string; requirement: string; status: 'running' | 'ready' | 'failed'; createdAt: string
  raw?: string; error?: string; template?: WorkflowTemplate; sessionId: string
}

export interface KnownIssue {
  id: string
  title: string
  detail: string
  status: 'open' | 'resolved' | 'deferred'
  blocking: boolean
  updatedAt: string
}

export type AdapterConnectionKind = AgentMember['connectionMode']

export interface AdapterDescriptor {
  id: string
  displayName: string
  connectionKind: AdapterConnectionKind
  status: 'unavailable' | 'available' | 'connected' | 'error'
  evidence?: string
}

export interface AgentAdapter {
  readonly descriptor: AdapterDescriptor
  listSessions(signal?: AbortSignal): Promise<readonly { sessionId: string; title?: string }[]>
  sendMessage(sessionId: string, message: string, signal?: AbortSignal): Promise<{ accepted: boolean; correlationId?: string }>
  subscribe(sessionId: string, onEvent: (event: HubEvent) => void, signal?: AbortSignal): Promise<() => void>
}
