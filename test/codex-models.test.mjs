import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-llm') return { url: 'data:text/javascript,export class LlmAdapter {}', shortCircuit: true }
    return next(specifier, context)
  }
})

const cache = {
  models: [
    { slug: 'gpt-x-sol', display_name: 'GPT-X-Sol', description: 'Synthetic flagship', supported_in_api: true, visibility: 'list', supported_reasoning_levels: [{ effort: 'low', description: 'Fast' }, { effort: 'high', description: 'Deep' }], default_reasoning_level: 'low' },
    { slug: 'gpt-x-luna', display_name: 'GPT-X-Luna', supported_in_api: true, visibility: 'list' },
    { slug: 'hidden-model', display_name: 'Hidden model', supported_in_api: true, visibility: 'hide' },
    { slug: 'no-api-model', display_name: 'No API model', supported_in_api: false, visibility: 'list' }
  ]
}

async function syntheticHome() {
  const home = await mkdtemp(path.join(tmpdir(), 'dkn-codex-home-'))
  await writeFile(path.join(home, 'models_cache.json'), JSON.stringify(cache))
  return home
}

test('project mode advertises the visible local Codex cache models and resolves a selected one', async () => {
  const { CodexNativeAdapter, codexNativeProvider, codexNativeModel } = await import('../lib/codex-native-adapter.js')
  const home = await syntheticHome()
  try {
    const adapter = new CodexNativeAdapter({}, { options: { codexHome: home } })
    const models = await adapter.listModels(codexNativeProvider)
    assert.deepEqual(models.map(model => model.id), [codexNativeModel, 'gpt-x-sol', 'gpt-x-luna'])
    assert.equal(models[1].name, 'GPT-X-Sol')
    assert.equal(models[1].description, 'Synthetic flagship')
    assert.equal(models[1].reasoning, undefined)
    const resolved = await adapter.resolveModel(codexNativeProvider, 'gpt-x-sol')
    assert.equal(resolved.name, 'GPT-X-Sol')
    assert.deepEqual(resolved.reasoning.efforts.map(level => level.id), ['low', 'high'])
    assert.equal(resolved.reasoning.defaultEffort, 'low')
    assert.deepEqual(resolved.context, { contextWindow: 200000 })
    await assert.rejects(adapter.resolveModel(codexNativeProvider, 'not-a-model'), /不支持/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('project mode forwards the selected model and advertised effort, and refuses an unknown model', async () => {
  const { CodexNativeAdapter, codexNativeModel } = await import('../lib/codex-native-adapter.js')
  const home = await syntheticHome()
  const cwd = path.join(tmpdir(), 'synthetic-codex-project')
  const runtime = new EventEmitter()
  const sends = []
  const sessionEvents = [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'step/start', seq: 1, data: { turn: 1, step: 1 } }
  ]
  const service = {
    options: { codexHome: home },
    async nativeThreadForSession() { return 'codex-synthetic-thread' },
    requireRuntime() { return runtime },
    async operate(input) {
      sends.push(input)
      queueMicrotask(() => {
        runtime.emit('notification', { method: 'item/agentMessage/delta', params: { threadId: input.threadId, itemId: 'answer', delta: 'ok' } })
        runtime.emit('notification', { method: 'turn/completed', params: { threadId: input.threadId, turn: { status: 'completed' } } })
      })
      return { turnId: 'turn-' + sends.length }
    }
  }
  const ctx = { agents: { get() { return { session: {
    header: { cwd },
    snapshotEvents: () => sessionEvents,
    append(type, data, options = {}) { const event = { type, seq: sessionEvents.length, data, ...options }; sessionEvents.push(event); return event }
  } } } } }
  const adapter = new CodexNativeAdapter(ctx, service)
  const consume = async options => { for await (const chunk of adapter.stream(options)) void chunk }
  try {
    await consume({ sessionId: 'dsh-synthetic-session', model: 'gpt-x-sol', reasoningEffort: 'high', messages: [{ role: 'user', id: 'user-1', content: [{ type: 'text', text: 'hello' }] }] })
    assert.equal(sends[0].model, 'gpt-x-sol')
    assert.equal(sends[0].effort, 'high')
    await consume({ sessionId: 'dsh-synthetic-session', model: 'gpt-x-luna', reasoningEffort: 'high', messages: [{ role: 'user', id: 'user-2', content: [{ type: 'text', text: 'hello again' }] }] })
    assert.equal(sends[1].model, 'gpt-x-luna')
    assert.equal(sends[1].effort, undefined, 'a model without reasoning levels never receives an effort')
    await consume({ sessionId: 'dsh-synthetic-session', model: codexNativeModel, messages: [{ role: 'user', id: 'user-3', content: [{ type: 'text', text: 'default route' }] }] })
    assert.equal(sends[2].model, undefined, 'the virtual default lets Codex follow its own configured model')
    await assert.rejects(consume({ sessionId: 'dsh-synthetic-session', model: 'not-a-model', messages: [{ role: 'user', id: 'user-4', content: [{ type: 'text', text: 'x' }] }] }), /不支持/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
