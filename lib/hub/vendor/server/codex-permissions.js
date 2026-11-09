export function normalizeCodexSandboxMode(value) {
    if (value == null || value === '' || value === 'read-only' || value === 'readOnly') return 'read-only';
    if (value === 'workspace-write' || value === 'workspaceWrite') return 'workspace-write';
    throw new Error('Codex 文件权限无效，请选择“只读”或“可修改本项目文件”。');
}
