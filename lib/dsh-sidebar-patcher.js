import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, normalize, relative } from 'node:path'
import { Readable } from 'node:stream'

const require = createRequire(import.meta.url)
const bundledAsar = require('./vendor-electron-asar.cjs')
// Electron's normal fs treats app.asar as a virtual directory; patch the physical archive.
const physicalFs = require(process.versions.electron ? 'original-fs' : 'node:fs')
const { createReadStream } = physicalFs
const { access, readFile, writeFile, copyFile, rm } = physicalFs.promises
const { commit } = require('./dsh-patch-helper.cjs')

const HOST_CLIENT = normalize('dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js')
const HOST_MANIFEST = normalize('dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json')
const PATCH_VERSION = 'dsh-0.2.2-rc.1-sidebar-addon-v3'
const OLD_SLOT_RENDER = 'renderSlot("sidebar.workspaces.after", { wide })'
const SLOT_RENDER_MARK = 'renderSlot("sidebar.workspaces.after", { wide, nativeAppearance: { browser: WorkspaceBrowser_module_css_default, rows: Rows_module_css_default, primitives: _deepseek_ai_dsh_client_ui_primitives, ProjectRowItem } })'
const SHARED_SCROLL_MARK = '"data-dkn-workspace-scroll": true'
const SLOT_DECL_MARK = '"sidebar.workspaces.after": {'

const PATCHES = new Map([
  ['0.2.2-rc.1', patchRc1],
])

/** Apply the version-matched sidebar compatibility patch to the packaged DSH runtime. */
export async function ensureDshSidebarPatch({ resourcesPath = process.resourcesPath, argv = process.argv, execPath = process.execPath, asar: suppliedAsar, commitArchive = commit, schedulePatch = scheduleAfterExit } = {}) {
  const candidates = [
    ...argv.map(asarFromRuntimeArgument).filter(Boolean),
    ...(typeof resourcesPath === 'string' && resourcesPath !== '' ? [join(resourcesPath, 'app.asar')] : []),
    ...(typeof execPath === 'string' && execPath !== '' ? [join(dirname(execPath), 'resources', 'app.asar')] : []),
  ]
  let appAsar
  const attempts = []
  for (const candidate of [...new Set(candidates)]) {
    try { await access(candidate); appAsar = candidate; break }
    catch (error) { attempts.push({ path: candidate, code: error.code || 'UNKNOWN' }) }
  }
  if (appAsar === undefined) {
    return { status: 'unsupported', reason: '尚未定位到 DSH 程序归档，请查看定位诊断', attempts }
  }

  const loadedAsar = suppliedAsar ?? bundledAsar
  const asar = loadedAsar.default ?? loadedAsar
  let manifest
  let client
  try {
    manifest = JSON.parse(asar.extractFile(appAsar, HOST_MANIFEST).toString('utf8'))
    client = asar.extractFile(appAsar, HOST_CLIENT).toString('utf8')
  }
  catch {
    return { status: 'unsupported', reason: '此 DSH 安装包的界面文件布局暂不受支持' }
  }

  const patch = PATCHES.get(manifest.version)
  if (patch === undefined) return { status: 'unsupported-version', dshVersion: manifest.version }
  if (client.includes(SLOT_RENDER_MARK) && client.includes(SLOT_DECL_MARK) && client.includes(SHARED_SCROLL_MARK)) {
    return { status: 'ready', dshVersion: manifest.version, patchVersion: PATCH_VERSION }
  }

  const patched = patch(client)
  if (patched === undefined) return { status: 'unsupported-layout', dshVersion: manifest.version }

  const pendingPath = appAsar + '.dkn-agent-pending.json'
  try {
    const pending = JSON.parse(await readFile(pendingPath, 'utf8'))
    if (pending.status === 'waiting-exit' && processAlive(pending.helperPid)) return {status:'exit-required',dshVersion:manifest.version}
  } catch {}

  try {
    const result = await replaceAsarFile({ appAsar, asar, target: HOST_CLIENT, contents: Buffer.from(patched), commitArchive, schedulePatch })
    if (result.deferred) return {status:'exit-required',dshVersion:manifest.version,patchVersion:PATCH_VERSION}
    asar.uncache?.(appAsar)
    return { status: 'restart-required', dshVersion: manifest.version, patchVersion: PATCH_VERSION }
  }
  catch (error) {
    return { status: 'failed', reason: safeError(error) }
  }
}

function asarFromRuntimeArgument(argument) {
  if (typeof argument !== 'string') return undefined
  return argument.match(/^(.+?\.asar)(?:[\\/]|$)/i)?.[1]
}

function patchRc1(source) {
  if (source.includes(SHARED_SCROLL_MARK)) return undefined
  const declaration = '\t\t\t\t\t"sidebar.workspaces.directoryFlow": {'
  const render = '\t\t\t\t\tworkspaceActionRequest !== null && (0, react_jsx_runtime.jsx)(WorkspaceDialogs, {'
  let result = source
  if (!result.includes(SLOT_RENDER_MARK)) {
    if (result.includes(SLOT_DECL_MARK)) {
      if (count(result, OLD_SLOT_RENDER) !== 1) return undefined
      result = result.replace(OLD_SLOT_RENDER,SLOT_RENDER_MARK)
    } else {
      if (count(result,declaration)!==1 || count(result,render)!==1) return undefined
      result = result.replace(declaration,'\t\t\t\t\t"sidebar.workspaces.after": {kind: "list", scope: "root"},\n'+declaration)
        .replace(render,'\t\t\t\t\t'+SLOT_RENDER_MARK+',\n'+render)
    }
  }
  const begin = '\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.listArea,\n\t\t\t\t\t\tchildren: wide &&'
  const end = '\t\t\t\t\t\t}))\n\t\t\t\t\t}),\n\t\t\t\t\t'+SLOT_RENDER_MARK+','
  if(count(result,begin)!==1 || count(result,end)!==1) return undefined
  return result.replace(begin,'\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.listArea,\n\t\t\t\t\t\t'+SHARED_SCROLL_MARK+',\n\t\t\t\t\t\tstyle: { overflowY: "auto", display: "block", minHeight: 0, scrollbarGutter: "stable" },\n\t\t\t\t\t\tchildren: [wide &&')
    .replace(end,'\t\t\t\t\t\t})),\n\t\t\t\t\t\t'+SLOT_RENDER_MARK+'\n\t\t\t\t\t\t]\n\t\t\t\t\t}),')
}

function count(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) { count++; offset += needle.length }
  return count
}

async function replaceAsarFile({ appAsar, asar, target, contents, commitArchive, schedulePatch }) {
  const token = `${process.pid}-${Date.now()}`
  const tempAsar = `${appAsar}.dkn-agent-${token}.tmp`
  const tempUnpacked = `${tempAsar}.unpacked`
  const unpacked = `${appAsar}.unpacked`
  const entries = []

  for (const listed of asar.listPackage(appAsar, { isPack: false })) {
    const path = normalize(listed.replace(/^[\\/]+/, ''))
    const metadata = asar.statFile(appAsar, path, false)
    if ('files' in metadata) {
      entries.push({ type: 'directory', path, unpacked: metadata.unpacked === true })
    }
    else if ('link' in metadata) {
      entries.push({ type: 'link', path, unpacked: metadata.unpacked === true, symlink: relative(dirname(path), metadata.link), stat: { mode: 0o777, size: 0 }, streamGenerator: () => Readable.from([]) })
    }
    else {
      entries.push({
        type: 'file', path, unpacked: metadata.unpacked === true,
        stat: { mode: metadata.executable ? 0o755 : 0o644, size: path === target ? contents.length : metadata.size },
        streamGenerator: () => Readable.from([path === target ? contents : asar.extractFile(appAsar, path, false)]),
      })
    }
  }

  try { await asar.createPackageFromStreams(tempAsar, entries) }
  catch (error) { await unlinkIfExists(tempAsar); await unlinkIfExists(tempUnpacked); throw error }
  let staged
  try { staged = asar.extractFile(tempAsar, target).toString('utf8') }
  catch (error) {
    await unlinkIfExists(tempAsar)
    await unlinkIfExists(tempUnpacked)
    throw error
  }
  if (staged !== contents.toString('utf8')) {
    await unlinkIfExists(tempAsar)
    await unlinkIfExists(tempUnpacked)
    throw new Error('新归档校验失败，原始 DSH 文件未修改')
  }
  const sourceHash = await sha256File(appAsar)
  const job = { archive: appAsar, staged: tempAsar, sourceHash,
    stagedHash: await sha256File(tempAsar), backup: appAsar+'.dkn-agent-'+sourceHash.slice(0,16)+'.bak',
    parentPid: process.pid, status: 'waiting-exit', createdAt: Date.now() }
  let deferred = false
  try {
    await commitArchive(job)
  } catch(error) {
    if (!['EBUSY','EPERM','EACCES'].includes(error.code)) throw error
    await schedulePatch(job)
    deferred = true
  } finally {
    if (!deferred) { await unlinkIfExists(tempAsar); await unlinkIfExists(tempUnpacked) }
  }
  return {deferred}
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false
  try { process.kill(pid,0); return true } catch(error) { return error.code !== 'ESRCH' }
}

async function scheduleAfterExit(job) {
  const helperPath = job.staged + '.helper.cjs'
  const jobPath = job.archive + '.dkn-agent-pending.json'
  await copyFile(new URL('./dsh-patch-helper.cjs',import.meta.url), helperPath)
  await writeFile(jobPath,JSON.stringify(job))
  const child = spawn(process.execPath,[helperPath,jobPath],{
    detached:true,stdio:'ignore',windowsHide:true,cwd:dirname(job.archive),
    env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''},
  })
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
  job.helperPid = child.pid
  await writeFile(jobPath,JSON.stringify(job))
  child.unref()
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function unlinkIfExists(path) {
  await rm(path, { recursive: true, force: true })
}

function safeError(error) {
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return '没有权限修改 DSH 程序文件'
  if (error?.code === 'ENOSPC') return '磁盘空间不足，DSH 原文件已保留'
  return error instanceof Error ? error.message.slice(0, 300) : '自动适配 DSH 失败'
}
