import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-llm') return { url: 'data:text/javascript,export class LlmAdapter {}', shortCircuit: true }
    return next(specifier, context)
  }
})

test('native DSH adapter routes the latest user message through one Codex thread and streams its answer', async () => {
  const { CodexNativeAdapter, codexNativeModel, codexNativeProvider } = await import('../lib/codex-native-adapter.js')
  const cwd = path.join(tmpdir(), 'synthetic-codex-project')
  const runtime = new EventEmitter()
  const operationIds = []
  const sessionEvents = [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'step/start', seq: 1, data: { turn: 1, step: 1 } },
  ]
  const service = {
    async nativeThreadForSession(sessionId, actualCwd) {
      assert.equal(sessionId, 'dsh-synthetic-session')
      assert.equal(actualCwd, cwd)
      return 'codex-synthetic-thread'
    },
    requireRuntime() { return runtime },
    async operate(input) {
      assert.equal(input.action, 'thread.send')
      assert.equal(input.threadId, 'codex-synthetic-thread')
      assert.equal(input.content, 'first new prompt\n\ncontinue this task')
      operationIds.push(input.operationId)
      queueMicrotask(() => {
        runtime.emit('notification', { method: 'item/started', params: { threadId: input.threadId, item: { id: 'synthetic-command', type: 'commandExecution', command: 'npm test', cwd } } })
        runtime.emit('notification', { method: 'item/completed', params: { threadId: input.threadId, item: { id: 'synthetic-command', type: 'commandExecution', command: 'npm test', cwd, status: 'completed', exitCode: 0, aggregatedOutput: 'tests passed' } } })
        runtime.emit('notification', { method: 'item/completed', params: { threadId: input.threadId, item: { id: 'synthetic-file', type: 'fileChange', status: 'completed', changes: [{ path: 'src/app.ts', kind: 'update', diff: 'not included' }] } } })
        runtime.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: input.threadId, itemId: 'answer', delta: 'Synthetic ' } })
        runtime.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: input.threadId, itemId: 'answer', delta: 'reply' } })
        runtime.emit('notification', { method: 'turn/completed', params: { threadId: input.threadId, turn: { status: 'completed' } } })
      })
      return { accepted: true, turnId: 'synthetic-turn' }
    }
  }
  const ctx = { agents: { get(id) { return id === 'dsh-synthetic-session' ? { session: {
    header: { cwd }, snapshotEvents: () => sessionEvents,
    append(type, data, options = {}) { const event = { type, seq: sessionEvents.length, data, ...options }; sessionEvents.push(event); return event },
  } } : undefined } } }
  const adapter = new CodexNativeAdapter(ctx, service)
  assert.equal(codexNativeProvider, 'dkn-codex-agent')
  assert.equal((await adapter.listModels(codexNativeProvider))[0].id, codexNativeModel)
  const chunks = []
  for await (const chunk of adapter.stream({
    sessionId: 'dsh-synthetic-session', model: codexNativeModel,
    tools: [{ name: 'dsh_read', parameters: { type: 'object' } }],
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'earlier prompt' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'earlier answer' }] },
      { role: 'user', id: 'synthetic-user-message-1', content: [{ type: 'text', text: 'first new prompt' }] },
      { role: 'user', id: 'synthetic-user-message', content: [{ type: 'text', text: 'continue this task' }] },
    ],
  })) chunks.push(chunk)
  assert.deepEqual(chunks.map(chunk => chunk.type), ['block-start', 'text-delta', 'text-delta', 'block-end', 'finish'])
  assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), 'Synthetic reply')
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  const toolCalls = sessionEvents.filter(event => event.type === 'tool/call')
  const toolResults = sessionEvents.filter(event => event.type === 'tool/result')
  assert.deepEqual(toolCalls.map(event => event.data.name), ['codex.commandExecution', 'codex.fileChange'])
  assert.deepEqual(toolResults.map(event => event.data.message.content[0].text), ['tests passed', 'update: src/app.ts'])
  assert.deepEqual(toolResults.map(event => event.sourceEventSeqs), toolCalls.map(event => [event.seq]))
  assert.doesNotMatch(JSON.stringify(sessionEvents), /not included/)
  const retry = []
  for await (const chunk of adapter.stream({
    sessionId: 'dsh-synthetic-session', model: codexNativeModel,
    messages: [
      { role: 'user', id: 'synthetic-user-message-1', content: [{ type: 'text', text: 'first new prompt' }] },
      { role: 'user', id: 'synthetic-user-message', content: [{ type: 'text', text: 'continue this task' }] },
    ],
  })) retry.push(chunk)
  assert.equal(operationIds[0], operationIds[1], 'a replay of the same durable DSH user message reuses its Codex operation ID')
  assert.equal(retry.at(-1).reason.kind, 'stop')
})

test('native Codex thread mapping persists by synthetic DSH session id', async () => {
  const { CodexService } = await import('../lib/codex-service.js')
  const directory = await mkdtemp(path.join(tmpdir(), 'dkn-native-map-'))
  try {
    const service = new CodexService({ dataDirectory: directory })
    let calls = 0
    service.runtime = {
      connected: true,
      async call(method, params) {
        calls++
        assert.equal(method, 'thread/start')
        assert.equal(params.cwd, path.join(directory, 'synthetic-project'))
        return { thread: { id: 'codex-synthetic-thread', cwd: params.cwd } }
      },
    }
    assert.equal(await service.nativeThreadForSession('dsh-synthetic-session', path.join(directory, 'synthetic-project')), 'codex-synthetic-thread')
    assert.equal(calls, 1)
    const stored = JSON.parse(await readFile(path.join(directory, 'native-threads.json'), 'utf8'))
    assert.deepEqual(stored, { version: 2, sessions: { 'dsh-synthetic-session': { threadId: 'codex-synthetic-thread', seedVersion: 2 } } })

    const restored = new CodexService({ dataDirectory: directory })
    await restored.ready
    restored.runtime = {
      connected: true,
      async call(method, params) {
        assert.equal(method, 'thread/read')
        assert.equal(params.threadId, 'codex-synthetic-thread')
        return { thread: { id: params.threadId } }
      },
    }
    assert.equal(await restored.nativeThreadForSession('dsh-synthetic-session', 'unused'), 'codex-synthetic-thread')
    assert.equal(restored.loaded.has('codex-synthetic-thread'), true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
