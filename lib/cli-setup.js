import {createHash} from 'node:crypto';
import {execFile, spawn} from 'node:child_process';
import {createReadStream, statSync} from 'node:fs';
import {mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const codexRegistry = 'https://registry.npmjs.org/@openai/codex/-/';
const zcodeRelease = 'https://cdn-zcode.z.ai/zcode/electron/releases/4.0.0';
const packages = {
  codex: {
    version: '0.172.0', entry: 'bin/codex.exe', archive: 'tar.gz', digest: 'sha512',
    x64: [codexRegistry + 'codex-0.172.0-win32-x64.tgz', '48pULjlTwpBZ/TfbOnpnmloHaTQAYELbaiKHEX7qmrtLFIcnPigaNN3omyetPdAuvrRXrmNFRlKfvQme19ZmRA==', 'package/vendor/x86_64-pc-windows-msvc'],
    arm64: [codexRegistry + 'codex-0.172.0-win32-arm64.tgz', 'lO+hS8rLV3xS5ZZZCBVfPTAqpI1VENId12qhzZ1jNPUBSzKQBOGKs+GHNplak1RHXXXpgK9UHkPQ3A2IvQ8lJg==', 'package/vendor/aarch64-pc-windows-msvc'],
  },
  qoder: {
    version: '1.1.87', entry: 'qodercli.exe', archive: 'zip',
    x64: ['https://qoder-ide.oss-accelerate.aliyuncs.com/qodercli/releases/1.1.87/qodercli-windows-x64.zip', 'a23933e8f82b1a7238a0d12a5c0a94f96beace6928b33da7322f44344515f9d5'],
  },
  antigravity: {
    version: '1.5.9', entry: 'agy.exe', digest: 'sha512',
    x64: ['https://storage.googleapis.com/antigravity-public/antigravity-cli/1.5.9-4515810895593472/windows-x64/cli_windows_x64.exe', '539a9415a686d9ec45f5c59fe7d32c485c6fa9abaea50208ae8ede4ed3622b9fb2bfd6680c87dc52344981172a96ddacb261ff4231276b5572fb5b62a9b0221e'],
  },
  zcode: {
    version: '4.0.0', entry: 'ZCodeSetup.exe', wizard: true, digest: 'sha512',
    x64: [zcodeRelease + '/windows-x64/ZCode-4.0.0-win-x64.exe', '1dlpycr3bKAhCN1jxJRv4Ith1NahmhpEkInR5zls3YFcjARwOgBZ4sA87X2lEaY5VhgSswETGzu7p6dT3fbSYA=='],
    arm64: [zcodeRelease + '/windows-arm64/ZCode-4.0.0-win-arm64.exe', 'pBxaFlovZn+VWYkP4G59stcu9pUAFYjRpPpiqTP+qZofFT0u/Yq7SjRqejabB+5So+byk6EaJjcDbBrHIszpfA=='],
  },
};

function spec(provider) {
  return Object.hasOwn(packages, provider) ? packages[provider] : null;
}

function installRoot(provider, dataDirectory) {
  return join(dataDirectory, 'managed-cli', provider, spec(provider).version + '-' + process.arch);
}

export function managedCliPath(provider) {
  const definition = spec(provider);
  if (process.platform !== 'win32' || !definition?.[process.arch] || definition.wizard) return '';
  const dataDirectory = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'state'), 'dsh-dkn-agent');
  const path = join(installRoot(provider, dataDirectory), definition.entry);
  return statSync(path, {throwIfNoEntry:false})?.isFile() ? path : '';
}

async function verifyDigest(file, algorithm, expected) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest(algorithm === 'sha512' && expected.endsWith('=') ? 'base64' : 'hex') !== expected) {
    throw new Error('安装包校验失败，请重试或使用官方安装指南。');
  }
}

function windowsTool(name) {
  return join(process.env.SystemRoot || 'C:/Windows', 'System32', name);
}

async function download(url, path) {
  for (let attempt=0; attempt<3; attempt++) {
    try {
      await exec(windowsTool('curl.exe'), ['--fail', '--location', '--silent', '--show-error',
        '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20',
        '--max-time', '240', '--max-filesize', '1073741824', '--continue-at', '-', '--output', path, url],
      {windowsHide:true, timeout:250000, maxBuffer:8192});
      return;
    } catch(error) {
      // Retry interrupted HTTPS transfers. Other errors need a network or system change.
      if (![18,28,56].includes(error.code)) break;
    }
  }
  throw new Error('官方下载失败，请检查网络或代理，或打开官方安装指南。');
}

async function probe(path, expectedVersion) {
  const {stdout} = await exec(path, ['--version'], {windowsHide:true, timeout:15000, maxBuffer:8192});
  if (!stdout.includes(expectedVersion)) throw new Error('CLI 已解包，但版本检测没有通过。');
}

async function deploy(provider, definition, dataDirectory) {
  const root = installRoot(provider, dataDirectory);
  const parent = join(dataDirectory, 'managed-cli', provider);
  const installed = join(root, definition.entry);
  if (statSync(installed, {throwIfNoEntry:false})?.isFile()) {
    if (definition.wizard) await verifyDigest(installed, definition.digest || 'sha256', definition[process.arch][1]);
    else await probe(installed, definition.version);
    return installed;
  }
  await mkdir(parent, {recursive:true});
  const stage = await mkdtemp(join(parent, '.install-'));
  try {
    const payload = join(stage, 'payload');
    await mkdir(payload);
    const file = definition.archive ? join(stage, 'download.' + definition.archive) : join(payload, definition.entry);
    const [url, digest, subtree] = definition[process.arch];
    await download(url, file);
    await verifyDigest(file, definition.digest || 'sha256', digest);
    if (definition.archive) {
      const args = ['-xf', file, '-C', payload];
      if (subtree) args.push('--strip-components', '3', subtree);
      await exec(windowsTool('tar.exe'), args, {windowsHide:true, timeout:120000, maxBuffer:16384});
    }
    if (!definition.wizard) await probe(join(payload, definition.entry), definition.version);
    await rename(payload, root);
    return installed;
  } finally {
    await rm(stage, {recursive:true, force:true}).catch(()=>{});
  }
}

export class CliSetup {
  constructor(dataDirectory, onReady) {
    this.dataDirectory = dataDirectory;
    this.onReady = onReady;
    this.jobs = new Map();
  }

  status(provider) {
    const definition = spec(provider);
    if (!definition) throw new Error('此平台没有可部署的 CLI。');
    const supported = process.platform === 'win32' && !!definition[process.arch];
    return {supported, wizard:!!definition.wizard, version:definition.version, ...this.jobs.get(provider)};
  }

  start(provider) {
    const current = this.status(provider);
    if (!current.supported) throw new Error('当前系统请使用官方安装指南。');
    if (current.state === 'installing' || current.state === 'wizard') return current;
    const definition = spec(provider);
    this.jobs.set(provider, {state:'installing'});
    void this.install(provider, definition).catch(error=>{
      this.jobs.set(provider, {state:'error', error:error.message});
    });
    return this.status(provider);
  }

  async install(provider, definition) {
    const path = await deploy(provider, definition, this.dataDirectory);
    if (!definition.wizard) {
      this.jobs.set(provider, {state:'ready', path});
      this.onReady?.();
      return;
    }
    await new Promise((resolve, reject)=>{
      const child = spawn(path, [], {stdio:'ignore', windowsHide:false});
      child.once('spawn', ()=>this.jobs.set(provider, {state:'wizard'}));
      child.once('error', reject);
      child.once('exit', code=>code === 0 ? resolve() : reject(new Error('安装向导已取消或未成功完成。')));
    });
    this.jobs.set(provider, {state:'wizard-closed'});
    this.onReady?.();
  }
}
