import {OrcaTermAuthPlugin} from './orcaterm/vendor/index.mjs';
import {LlmAdapter,resolveRetryPolicy} from './zcode/dsh-llm-compat.js';
import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export const orcatermProvider = 'orcaterm';

async function protect(bytes, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('OrcaTerm 登录存储当前需要 Windows');
  const method = decrypt ? 'Unprotect' : 'Protect';
  const script = `Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Console]::Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::${method}($b,$null,'CurrentUser')))`;
  const value = await new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
  }, (error, stdout) => error ? reject(new Error('登录状态加密操作失败')) : resolve(stdout));
    child.stdin.on('error', reject);
    child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
  return Buffer.from(value.trim(), 'base64');
}

export class OrcaTermAdapter extends LlmAdapter {
  constructor(ctx = {}, config = {}, {directory, plugin} = {}) {
    super();
    this.ctx = ctx;
    this.config = config;
    this.directory = directory || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'state'), 'dsh-dkn-agent', 'orcaterm');
    this.plugin = Promise.resolve(plugin || OrcaTermAuthPlugin());
    this.connection = null;
    this.controllers = new Set();
    this.pendingLogin = null;
    this.inFlight = false;
    this.closed = false;
  }

  value(key, fallback = '') {
    const value = this.config[key];
    return (typeof value?.get === 'function' ? value.get() : value) ?? fallback;
  }

  async saveAuth(auth) {
    await mkdir(this.directory, {recursive: true});
    const file = join(this.directory, 'login.dpapi');
    const temporary = file + '.' + randomUUID() + '.tmp';
    const encrypted = await protect(Buffer.from(JSON.stringify(auth)));
    await writeFile(temporary, encrypted, {mode: 0o600});
    await rename(temporary, file);
    this.authBytes = encrypted;
    this.cachedAuth = auth;
  }

  async auth() {
    let auth;
    try {
      const encrypted = await readFile(join(this.directory, 'login.dpapi'));
      if (this.authBytes?.equals(encrypted)) auth = this.cachedAuth;
      else {
        auth = JSON.parse((await protect(encrypted, true)).toString());
        this.authBytes = encrypted;
        this.cachedAuth = auth;
      }
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('OrcaTerm 登录状态读取失败，请重新登录');
    }
    if (auth.expires < Date.now() + 60000) {
      const refreshed = await (await this.plugin).auth.refresh(auth);
      if (!refreshed) throw new Error('OrcaTerm 登录已过期，请重新登录');
      auth = {...auth, ...refreshed};
      await this.saveAuth(auth);
    }
    return auth;
  }

  async entries() {
    const config = {};
    await (await this.plugin).config(config);
    return Object.entries(config.provider.orcaterm.models).map(([id, model]) => ({id, name: model.name, context: {contextWindow: model.limit.context}, inputModalities: ['text']}));
  }

  async inspect() {
    const auth = await this.auth();
    return {state: auth ? 'found' : 'signed-out', enabled: String(this.value('orcatermEnabled', 'true')) === 'true', authenticated: !!auth,
      connection: this.connection, models: auth ? await this.entries() : [], login: this.pendingLogin ? 'waiting' : null,
      inputModalities: ['text'], checkin: 'unsupported'};
  }

  async login() {
    if (this.pendingLogin) return {url: this.pendingLogin.url};
    const login = await (await this.plugin).auth.methods[0].authorize();
    if (!login.url || new URL(login.url).hostname !== '127.0.0.1') throw new Error('OrcaTerm 扫码登录页创建失败，请重试');
    this.pendingLogin = login;
    this.loginTask = (async () => {
      try {
        const auth = await login.callback();
        if (auth.type !== 'success') throw new Error('扫码授权未完成，请重新登录');
        if (!this.closed && this.pendingLogin === login) {
          await this.saveAuth(auth);
          this.connection = null;
          this.ctx.emit?.('llm/models-updated', orcatermProvider);
        }
      } catch {
        this.connection = {state: 'error', error: '扫码授权未完成，请重新登录'};
      } finally {
        login.__cap?.close();
        if (this.pendingLogin === login) this.pendingLogin = null;
      }
    })();
    return {url: login.url};
  }

  async listModels(provider = orcatermProvider) {
    if (String(this.value('orcatermEnabled', 'true')) !== 'true' || !await this.auth()) return [];
    return (await this.entries()).map(model => ({...model, provider}));
  }

  providerInfo(provider) { return {id: provider, name: 'OrcaTerm'}; }
  providerRetryPolicy() { return resolveRetryPolicy({mode:'normal',maxRetries:0}, 'orcaterm.retryPolicy'); }
  imageRequestPricing() { return undefined; }
  async prepareCall(provider, model) {
    return {model: await this.resolveModel(provider, model), stream: options => this.stream(options)};
  }

  async resolveModel(provider, id) {
    const model = (await this.listModels(provider)).find(model => model.id === id || model.name === id);
    if (!model) throw new Error('OrcaTerm 模型不可用，请先登录并选择模型');
    return model;
  }

  async quota() {
    const auth = await this.auth();
    if (!auth) return {state: 'signed-out'};
    const usage = await (await this.plugin).auth.usage(async () => auth);
    const buckets = (usage.windows || []).filter(window => Number.isFinite(window.amount) && Number.isFinite(window.limit)).map(window => ({label: 'AI 问答', unit: '次', remaining: Math.max(0, window.limit - window.amount), total: window.limit}));
    return {state: buckets.length ? 'available' : 'unavailable', buckets, error: usage.error ? '账号额度暂不可读，请检查登录状态' : undefined};
  }

  async *stream(options) {
    if (this.closed) throw new Error('OrcaTerm 已卸载');
    if (this.inFlight) throw new Error('OrcaTerm 当前已有请求，请等待完成后重试');
    if (String(this.value('orcatermEnabled', 'true')) !== 'true') throw new Error('OrcaTerm 已关闭');
    const model = options.model || this.value('orcatermModel', 'TokenHub/deepseek-v4.1-flash');
    const messages = options.messages.map(message => ({role: message.role === 'tool' ? 'user' : message.role, content: typeof message.content === 'string' ? message.content : (message.content || []).map(block => {
      if (block.type === 'text') return block.text;
      if (block.type === 'reasoning') return '';
      if (block.type === 'tool-call') return '[历史工具调用] ' + JSON.stringify(block);
      if (block.type === 'tool-addition' || block.type === 'tool-removal') return '';
      throw new Error('OrcaTerm 当前验证通道仅支持文字，请移除图片或文件附件');
    }).join('\n')}));
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.throwIfAborted();
    options.signal?.addEventListener('abort', cancel, {once: true});
    const timeout = Math.min(300000, Math.max(1000, Number(this.value('orcatermTimeoutMs', 90000)) || 90000));
    const timer = setTimeout(cancel, timeout);
    this.inFlight = true;
    this.controllers.add(controller);
    try {
      const auth = await this.auth();
      if (!auth) throw new Error('请先扫码登录 OrcaTerm');
      await this.resolveModel(orcatermProvider, model);
      const loaded = await (await this.plugin).auth.loader(async () => auth);
      const response = await loaded.fetch('https://local.invalid/v1/chat/completions', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-orcaterm-session': options.sessionId || randomUUID()},
        body: JSON.stringify({model, messages, stream: false}), signal: controller.signal});
      const body = await response.json();
      if (!response.ok) throw new Error('OrcaTerm 请求失败（HTTP ' + response.status + '），请检查登录、模型或剩余额度');
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('OrcaTerm 未返回文字');
      controller.signal.throwIfAborted();
      yield {type: 'block-start', index: 0, blockType: 'text'};
      yield {type: 'text-delta', index: 0, text};
      yield {type: 'block-end', index: 0, block: {type: 'text', text}};
      yield {type: 'finish', reason: {kind: 'stop'}};
      this.connection = {state: 'ready', testedAt: Date.now()};
    } catch (error) {
      this.connection = {state: 'error', error: error.message, testedAt: Date.now()};
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      this.controllers.delete(controller);
      this.inFlight = false;
    }
  }

  async test(prompt = 'Reply with exactly OK. Do not use tools.') {
    let text = '';
    for await (const event of this.stream({model: this.value('orcatermModel', 'TokenHub/deepseek-v4.1-flash'), messages: [{role: 'user', content: prompt}]})) {
      if (event.type === 'block-end') text += event.block.text;
    }
    return {state: 'ready', text};
  }

  dispose() {
    this.closed = true;
    this.authBytes = null;
    this.cachedAuth = null;
    this.pendingLogin?.__cap?.close();
    for (const controller of this.controllers) controller.abort();
  }
}
