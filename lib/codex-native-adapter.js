import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

const PROVIDER = 'dkn-codex-agent'
const MODEL = 'codex-default'

function latestUserText(messages) {
  const history=messages||[],lastAssistant=history.findLastIndex(item=>item?.role==='assistant')
  const pending=history.slice(lastAssistant+1).filter(item=>item?.role==='user')
  if (!pending.length) throw new Error('DSH 会话中没有可转交给 Codex 的用户消息')
  const content=pending.map(message=>{
    const value=typeof message.content==='string'?message.content:(message.content||[]).map(block=>{
      if(block?.type==='text')return block.text||''
      if(block?.type==='image')throw new Error('Codex 原生会话暂不支持从 DSH 输入图片')
      if(block?.type==='file')throw new Error('Codex 原生会话暂不支持从 DSH 输入文件附件')
      return ''
    }).join('')
    return value
  }).filter(Boolean).join('\n\n')
  if(!content.trim())throw new Error('没有可转交给 Codex 的文本消息')
  return { content, messageId: pending.map(message=>message.id).filter(Boolean).join('|')||undefined }
}

function nativeActivity(agent, item, pending, complete = false) {
  if (!['commandExecution', 'fileChange'].includes(item?.type) || typeof item.id !== 'string' || !item.id) return
  let activity = pending.get(item.id)
  const callId = `codex-${createHash('sha256').update(item.id).digest('hex').slice(0, 32)}`
  const changes = Array.isArray(item.changes) ? item.changes : []
  const name = item.type === 'commandExecution' ? 'codex.commandExecution' : 'codex.fileChange'
  const args = item.type === 'commandExecution'
    ? { command: String(item.command || ''), ...(item.cwd ? { cwd: String(item.cwd) } : {}) }
    : { changes: changes.map(change => ({ path: String(change.path || ''), ...(change.kind ? { kind: String(change.kind) } : {}) })) }
  if (!activity) {
    const events = agent.session.snapshotEvents()
    let turn, step
    for (const event of events) {
      if (event.type === 'turn/start') turn = event.data.turn
      if (event.type === 'step/start') step = event.data.step
      if (event.type === 'turn/end') { turn = undefined; step = undefined }
    }
    if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return
    const argumentsText = JSON.stringify(args)
    agent.session.append('assistant/message', {
      turn, step, stream: [],
      message: {
        id: randomUUID(), role: 'assistant',
        content: [{ type: 'tool-call', id: callId, name, arguments: argumentsText }],
        source: { kind: 'model', provider: codexNativeProvider, model: codexNativeModel },
      },
    }, { surfaceOp: 'append' })
    const call = agent.session.append('tool/call', { turn, step, callId, name, arguments: argumentsText })
    activity = { turn, step, callId, callSeq: call.seq, name }
    pending.set(item.id, activity)
  }
  if (!complete) return
  let text
  let isError = item.status === 'failed' || item.status === 'declined' || item.status === 'interrupted'
  if (item.type === 'commandExecution') {
    text = String(item.aggregatedOutput || '(无输出)')
    if (typeof item.exitCode === 'number' && item.exitCode !== 0) isError = true
  } else {
    text = changes.length
      ? changes.map(change => `${change.kind || 'changed'}: ${change.path || '(unknown path)'}`).join('\n')
      : 'Codex recorded a file-change item without path details'
  }
  if (text.length > 200000) text = `${text.slice(0, 200000)}\n[DSH 仅显示前 200000 个字符]`
  agent.session.append('tool/result', {
    turn: activity.turn, step: activity.step,
    message: {
      id: randomUUID(), role: 'tool', toolCallId: activity.callId, isError,
      source: { kind: 'tool', callId: activity.callId }, content: [{ type: 'text', text }],
    },
  }, { surfaceOp: 'append', sourceEventSeqs: [activity.callSeq] })
  pending.delete(item.id)
}

/** Route DSH's native Agent loop into one persistent Codex app-server thread. */
export class CodexNativeAdapter extends LlmAdapter {
  constructor(ctx, service) {
    super()
    this.ctx = ctx
    this.service = service
    this.turns = new Map()
  }

  providerInfo(provider) {
    return { id: provider, name: 'Codex Agent（项目模式）' }
  }

  providerRetryPolicy() { return undefined }

  async prepareCall(provider, model, signal) {
    return { model: await this.resolveModel(provider, model, signal), stream: options => this.stream(options) }
  }

  imageRequestPricing() { return undefined }

  imageRequestTarget(_provider, _model, image) {
    return { width: Number(image?.width) || 0, height: Number(image?.height) || 0, maxBytes: Number(image?.bytes) || 0 }
  }

  async listModels(provider) {
    return [{ provider, id: MODEL, name: 'Codex Agent 默认模型（项目模式）', inputModalities: ['text'], context: { contextWindow: 200000 } }]
  }

  async resolveModel(provider, model) {
    if (model !== MODEL) throw new Error(`Codex Agent 不支持模型：${model}`)
    return { provider, id: MODEL, name: 'Codex Agent 默认模型（项目模式）', inputModalities: ['text'], context: { contextWindow: 200000 } }
  }

  async *stream(options) {
    if (!options.sessionId) throw new Error('Codex Agent 需要 DSH 会话编号')
    if (options.model !== MODEL) throw new Error(`Codex Agent 不支持模型：${options.model}`)
    // DSH passes its available-tool catalog to every LLM adapter.  Codex is a
    // complete Agent runtime and must not receive that catalog, but rejecting
    // the request here makes an otherwise valid DSH turn fail before it can
    // reach Codex.  Ignore the catalog; the runtime owns tools and approvals.
    const agent = this.ctx.agents?.get(options.sessionId)
    if (this.turns.has(options.sessionId)) throw new Error('这个 DSH 会话仍有一个 Codex 回合正在写入，请等待它结束或先中断；不会重复发送')
    let releaseTurn
    this.turns.set(options.sessionId, new Promise(resolve => { releaseTurn = resolve }))
    const rawCwd = agent?.session?.header?.cwd
    if (typeof rawCwd !== 'string' || !isAbsolute(rawCwd)) {
      throw new Error('当前 DSH 会话没有有效的项目目录，请先在项目目录中创建会话')
    }
    const latest = latestUserText(options.messages)
    const threadId = await this.service.nativeThreadForSession(options.sessionId, resolve(rawCwd))
    const runtime = this.service.requireRuntime()
    const deltas = new Map()
    const pendingActivities = new Map()
    const pending = []
    let responseText = ''
    let wake
    let settled = false
    const push = value => {
      pending.push(value)
      wake?.()
      wake = undefined
    }
    const onNotification = message => {
      const params = message?.params || {}
      if (params.threadId !== threadId) return
      if (message.method === 'item/agentMessage/delta') {
        const itemId = String(params.itemId || 'assistant')
        const text = String(params.delta || '')
        deltas.set(itemId, (deltas.get(itemId) || '') + text)
        responseText += text
        push({ kind: 'delta', text })
      } else if (message.method === 'turn/completed') {
        for (const [itemId, activity] of pendingActivities) {
          try {
            nativeActivity(agent, { id: itemId, type: activity.name === 'codex.commandExecution' ? 'commandExecution' : 'fileChange', status: 'interrupted' }, pendingActivities, true)
          } catch { this.service.lastError = '部分 Codex 工具活动没有写入 DSH 会话' }
        }
        push({ kind: 'complete', status: params.turn?.status || 'completed', error: params.turn?.error?.message })
      } else if (message.method === 'item/started' && params.item) {
        try { nativeActivity(agent, params.item, pendingActivities) }
        catch { this.service.lastError = 'Codex 工具活动没有写入 DSH 会话' }
      } else if (message.method === 'item/completed' && params.item) {
        try { nativeActivity(agent, params.item, pendingActivities, true) }
        catch { this.service.lastError = 'Codex 工具活动没有写入 DSH 会话' }
      }
    }
    const onDisconnected = error => push({ kind: 'error', message: String(error || 'Codex 协议连接已断开') })
    runtime.on('notification', onNotification)
    runtime.on('disconnected', onDisconnected)
    const signal = options.signal
    const onAbort = () => push({ kind: 'abort' })
    signal?.addEventListener('abort', onAbort, { once: true })
    let turnId
    let emittedText = false
    try {
      if (signal?.aborted) throw new Error('Codex 请求已取消')
      const sent = await this.service.operate({
        action: 'thread.send',
        threadId,
        content: latest.content,
        operationId: typeof latest.messageId === 'string'
          ? `dsh-native-${createHash('sha256').update(`${options.sessionId}\0${latest.messageId}`).digest('hex')}`
          : `dsh-native-${randomUUID()}`,
      })
      turnId = sent.turnId
      yield { type: 'block-start', index: 0, blockType: 'text' }
      while (!settled) {
        if (pending.length === 0) await new Promise(resolveWake => { wake = resolveWake })
        while (pending.length) {
          const event = pending.shift()
          if (event.kind === 'delta') {
            if (event.text) {
              emittedText = true
              yield { type: 'text-delta', index: 0, text: event.text }
            }
          } else if (event.kind === 'complete') {
            settled = true
            if (event.status !== 'completed' && event.status !== 'complete') {
              throw new Error(event.error || `Codex 回合结束状态：${event.status}`)
            }
            if (!emittedText) {
              const history = await this.service.history({ threadId })
              const last = [...history.items].reverse().find(item => item.type === 'assistant' && item.text)
              if (last?.text) {
                emittedText = true
                responseText = last.text
                yield { type: 'text-delta', index: 0, text: last.text }
              }
            }
          } else if (event.kind === 'abort') {
            settled = true
            if (turnId) await runtime.call('turn/interrupt', { threadId, turnId }, { mutation: true }).catch(() => {})
            throw new Error('Codex 请求已取消')
          } else if (event.kind === 'error') {
            settled = true
            throw new Error(event.message)
          }
        }
      }
      if (!emittedText) throw new Error('Codex 已结束，但没有返回可显示的文字内容')
      yield { type: 'block-end', index: 0, block: { type: 'text', text: responseText } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } finally {
      runtime.off('notification', onNotification)
      runtime.off('disconnected', onDisconnected)
      signal?.removeEventListener('abort', onAbort)
      if (!settled) {
        settled = true
        wake?.()
      }
      if (this.turns.get(options.sessionId)) { this.turns.delete(options.sessionId); releaseTurn?.() }
    }
  }
}

export const codexNativeProvider = PROVIDER
export const codexNativeModel = MODEL
