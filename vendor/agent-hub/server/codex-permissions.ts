import type { AgentMember } from '../src/domain/types.ts'

/** Hub stores the thread-level SandboxMode spelling, never SandboxPolicy.type. */
export function normalizeCodexSandboxMode(value: unknown): NonNullable<AgentMember['codexSandboxMode']> {
  if (value == null || value === '' || value === 'read-only' || value === 'readOnly') return 'read-only'
  if (value === 'workspace-write' || value === 'workspaceWrite') return 'workspace-write'
  throw new Error('Codex 文件权限无效，请选择“只读”或“可修改本项目文件”。')
}
