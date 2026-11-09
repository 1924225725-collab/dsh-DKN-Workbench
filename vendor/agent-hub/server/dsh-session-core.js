function replyText(value) {
  const found = []
  const visited = new Set()
  const textKeys = new Set(['text', 'content', 'message', 'parts', 'blocks', 'response'])

  function visit(node, depth = 0) {
    if (depth > 12 || node == null) return
    if (typeof node === 'string') {
      found.push(node)
      return
    }
    if (typeof node !== 'object' || visited.has(node)) return
    // Model reasoning and tool arguments are not the assistant's public answer.
    if (node.type && !['text', 'output_text'].includes(node.type) && !Array.isArray(node)) return
    visited.add(node)
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (textKeys.has(key)) visit(child, depth + 1)
    }
  }

  visit(value)
  const output = [...new Set(found.map((part) => part.trim()).filter(Boolean))].join('\n')
  return output.length > 128_000 ? `${output.slice(0, 128_000)}\n[内容超过 128000 字符，已截断]` : output
}

const internalInputKinds = new Set(['runtime-context', 'time-context', 'skill-catalog', 'model-selection'])
function internalInput(event) {
  return event.type === 'user/message' && internalInputKinds.has(event.data?.source?.kind)
}

async function listSessionRows(controller, signal) {
  if (typeof controller.list !== 'function') throw new Error('sessionController.list is unavailable')
  const result = await controller.list({}, signal)
  const rows = Array.isArray(result) ? result : result?.items
  if (!Array.isArray(rows)) throw new Error('sessionController.list returned an unexpected result')
  return rows.filter((row) => typeof row?.sessionId === 'string' && row.sessionId.length > 0).map((row) => ({
    sessionId: row.sessionId,
    title: sessionTitle(row) ?? '未命名会话',
    running: typeof row.running === 'boolean' ? row.running : null,
    ...(typeof row.parentSessionId === 'string' ? { parentSessionId: row.parentSessionId } : {}),
    ...(typeof row.projections?.values?.modelSelection?.lastUsed?.model === 'string'
      ? { model: `${row.projections.values.modelSelection.lastUsed.provider}/${row.projections.values.modelSelection.lastUsed.model}` }
      : {}),
    ...(tokenUsageOf(row) ? { tokenUsage: tokenUsageOf(row) } : {}),
  }))
}

function projectedTitle(value, depth = 0) {
  if (depth > 5 || value == null) return null
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || Array.isArray(value)) return null
  for (const key of ['value', 'val', 'title', 'text', 'current']) {
    const title = projectedTitle(value[key], depth + 1)
    if (title !== null) return title
  }
  return null
}

function sessionTitle(summary) {
  for (const candidate of [
    summary?.title,
    summary?.projectionValues?.title,
    summary?.projections?.title,
    summary?.projections?.values?.title,
    summary?.projectionValues?.values?.title,
    summary?.projectionValues?.sessionTitle,
    summary?.sessionTitle,
  ]) {
    const title = projectedTitle(candidate)
    if (title !== null) return title
  }
  return null
}

function tokenUsageOf(summary) {
  const usage = summary?.projections?.values?.tokenUsage?.totals
    ?? summary?.projectionValues?.tokenUsage?.totals
    ?? summary?.projections?.tokenUsage?.totals
  if (!usage || !Number.isSafeInteger(usage.uncachedInputTokens) || !Number.isSafeInteger(usage.outputTokens)) return undefined
  const inputTokens = usage.uncachedInputTokens
  const outputTokens = usage.outputTokens
  const cacheReadTokens = Number.isSafeInteger(usage.cacheReadTokens) ? usage.cacheReadTokens : 0
  const cacheWriteTokens = Number.isSafeInteger(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0
  return { totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, source: 'provider-reported' }
}

function eventSequence(frame) {
  if (Number.isSafeInteger(frame?.cursor)) return frame.cursor
  if (Number.isSafeInteger(frame?.event?.seq)) return frame.event.seq
  return 0
}

async function openFollow(controller, sessionId, signal, maxMessages) {
  const linked = new AbortController()
  const abort = () => linked.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  const openingTimeout = setTimeout(() => linked.abort(new Error('DSH opening snapshot timed out')), 30_000)
  const frames = controller.follow({
    address: { kind: 'session', sessionId },
    assistantStream: true,
    ...(Number.isSafeInteger(maxMessages) ? { maxMessages } : {}),
  }, linked.signal)
  if (frames == null || typeof frames[Symbol.asyncIterator] !== 'function') {
    clearTimeout(openingTimeout)
    signal.removeEventListener('abort', abort)
    linked.abort()
    throw new Error('sessionController.follow did not return an async event stream')
  }
  const original = frames[Symbol.asyncIterator]()
  const iterator = {
    next: (...args) => original.next(...args),
    async return() {
      clearTimeout(openingTimeout)
      signal.removeEventListener('abort', abort)
      linked.abort()
      return original.return ? original.return() : { done: true }
    },
  }
  let opening
  try { opening = await iterator.next() }
  catch (error) { await iterator.return(); throw error }
  clearTimeout(openingTimeout)
  if (opening.done || opening.value?.type !== 'snapshot') {
    await iterator.return()
    throw new Error('sessionController.follow ended before its opening snapshot')
  }
  const afterSeq = opening.value.cursor
  if (!Number.isSafeInteger(afterSeq)) { await iterator.return(); throw new Error('sessionController.follow returned an invalid opening cursor') }
  return { iterator, afterSeq, snapshot: opening.value }
}

function historyEvents(records) {
  if (!Array.isArray(records)) return []
  return records.map((record) => record?.event ?? record).filter((event) => Number.isSafeInteger(event?.seq))
}

async function waitForAssistant(iterator, afterSeq, signal, requestId) {
  let addressed = !requestId
  let latestAnswer
  let lastSeq = afterSeq, currentTurn, addressedTurn
  while (!signal.aborted) {
    const next = await iterator.next()
    if (next.done) throw new Error('DSH follow stream ended before an assistant answer arrived')
    const frame = next.value
    const event = frame?.type === 'event' ? frame.event : null
    if (!event || event.seq <= lastSeq) continue
    lastSeq = event.seq
    if (event.type === 'turn/start') currentTurn = event.data?.turn
    if (requestId && event.type === 'user/message') {
      if (internalInput(event)) continue
      if (event.data?.source?.rpcId === requestId) { addressed = true; addressedTurn ??= currentTurn }
      else if (addressed) throw Object.assign(new Error('此会话同时收到其他用户输入，回复归属不再明确。请同步原生历史后人工处理，Hub 已停止自动转交。'), { code: 'dsh_input_conflict', conflictEventSeq: event.seq, conflictSourceKind: event.data?.source?.kind ?? 'unknown' })
      continue
    }
    if (!addressed) continue
    if (addressedTurn !== undefined && event.data?.turn !== undefined && event.data.turn !== addressedTurn) continue
    if (event.type === 'assistant/message') {
      const answer = replyText(event.data)
      if (answer) { latestAnswer = { answer, sequence: event.seq }; if (!requestId) return latestAnswer }
    }
    if (requestId && event.type === 'turn/end') {
      const reason = event.data?.reason
      if (reason?.kind === 'error') {
        const code = typeof reason.error?.code === 'string' ? `（${reason.error.code}）` : ''
        const message = typeof reason.error?.message === 'string' ? reason.error.message : '模型或调度器没有提供错误详情。'
        throw new Error(`DSH 回合失败${code}：${message}`)
      }
      if (latestAnswer) return latestAnswer
      if (reason?.kind === 'blocked') throw new Error('DSH 回合被权限或策略阻止，没有生成文字回答。请查看 DSH 原生窗口中的阻止原因。')
      if (reason?.kind === 'aborted') throw new Error('DSH 原生回合已中断，没有生成文字回答。请在原生窗口确认状态后再重试。')
      if (reason?.kind === 'max-tokens') throw new Error('DSH 回合达到模型输出上限，但没有提交可读取的文字回答。')
      throw new Error(`DSH 回合已结束（${reason?.kind || '原因未知'}），但没有该请求的文字回答。`)
    }
  }
  throw new Error('DSH follow stream was cancelled')
}


export {listSessionRows,openFollow,waitForAssistant,historyEvents,replyText,sessionTitle,tokenUsageOf};
