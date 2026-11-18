// Read only durable, session-scoped facts. Never estimate tokens from characters.
export function pluginPerformanceReading(node) {
  const provider = node?.requestConfig?.provider || node?.providerMetadata?.provider;
  if (node?.kind !== 'assistant' || !['trae-cn','codebuddy-cli-cn', 'codebuddy-cli-intl', 'codex-cli', 'qoder-acp', 'zcode-cli', 'antigravity-acp'].includes(provider)) return null;
  const output = node.usage?.outputTokens;
  if (!Number.isSafeInteger(output) || output < 0) return { text: '速度未提供', title: '当前平台没有返回真实输出 token 用量，无法计算速度。' };
  const start = node.timing?.stepStartTime, end = node.timing?.completedTime, first = node.timing?.firstTokenTime;
  if (typeof first === 'number' && Number.isFinite(first) && typeof end === 'number' && Number.isFinite(end) && first < end && first >= start) return null;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { text: '速度暂无数据', title: '已记录输出用量，但缺少完整调用时间；不会使用虚构的时间。' };
  const speed = output / ((end - start) / 1000);
  return { text: '平均 ' + speed.toFixed(1) + ' tok/s', title: '最近一步：' + output + ' 个输出 token / ' + ((end - start) / 1000).toFixed(2) + ' 秒完整调用耗时（含等待与启动），并非首 token 后的解码速度。' };
}
