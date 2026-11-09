export const reviewSchemaVersion = 'dkn.review.v1'
export interface ReviewReport { accepted: boolean; evidence: string | unknown[]; feedback?: unknown; [key: string]: unknown }
const generic = new Set(['通过', '未通过', '失败', '成功', 'pass', 'passed', 'fail', 'failed', 'ok', 'true', 'false', 'done'])
function meaningful(value: unknown): boolean {
  if (typeof value === 'string') return !!value.trim() && !generic.has(value.trim().toLowerCase())
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0 && value.some(meaningful)
  if (value && typeof value === 'object') return Object.values(value).some(meaningful)
  return false
}
function invalid(detail: string): never { throw new Error(`验收报告格式错误（${reviewSchemaVersion}）：${detail}`) }
function type(value: unknown) { return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value }
export function parseReviewReport(raw: string): ReviewReport {
  const blocks = [raw, ...[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(match => match[1])]
  let report: any
  for (const block of blocks) {
    try { const candidate = JSON.parse(block); if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) { report = candidate; break } } catch { /* Try a fenced final report. */ }
  }
  if (!report) invalid('JSON 无法解析；需要包含 accepted 和 evidence 实际证据的对象。')
  if (typeof report.accepted !== 'boolean') invalid(`accepted 期望 boolean，实际 ${type(report.accepted)}；false 是有效的不通过结论。`)
  for (const key of ['issues', 'unverified']) if (report[key] !== undefined && !Array.isArray(report[key])) invalid(`${key} 期望 array，实际 ${type(report[key])}。`)
  if (typeof report.evidence === 'string') {
    if (!meaningful(report.evidence)) invalid('evidence 实际证据为空或仅为“通过”等结论；请提供检查对象、方法和观察结果。')
  } else if (Array.isArray(report.evidence)) {
    if (!report.evidence.length) invalid('evidence 实际证据数组不能为空。')
    for (const [index, entry] of report.evidence.entries()) {
      if (typeof entry === 'string') { if (!meaningful(entry)) invalid(`evidence[${index}] 缺少实际检查证据。`); continue }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid(`evidence[${index}] 期望证据对象或说明文字，实际 ${type(entry)}。`)
      for (const key of ['object', 'check']) if (typeof entry[key] !== 'string' || !entry[key].trim()) invalid(`evidence[${index}].${key} 期望非空 string，实际 ${type(entry[key])}。`)
      if (!meaningful(entry.result)) invalid(`evidence[${index}].result 缺少实际观察结果；支持文字或非空结构化结果。`)
    }
  } else invalid(`evidence 期望 string 或 array 实际证据，实际 ${type(report.evidence)}。`)
  if (report.accepted && (Array.isArray(report.unverified) && report.unverified.length || Array.isArray(report.issues) && report.issues.some((issue: any) => issue?.severity === 'blocking'))) invalid('accepted=true 与未验证项或阻断问题冲突，不能作为通过报告接收。')
  return report as ReviewReport
}
export function reviewEvidenceText(evidence: ReviewReport['evidence']): string {
  return typeof evidence === 'string' ? evidence.trim() : evidence.map((entry: any, i) => typeof entry === 'string' ? `${i + 1}. ${entry}` : `${i + 1}. ${entry.object}\n检查：${entry.check}\n结果：${typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result)}`).join('\n\n')
}
export const reviewReportInstructions = `报告协议 ${reviewSchemaVersion}：只返回一个 JSON 对象。accepted 必须为布尔值 true 或 false；false 表示报告可接收但产品验收未通过，应沿配置的 failure 出口流转。evidence 推荐为非空数组，每项 {"object":"实际检查对象","check":"实际执行的检查","result":"实际观察结果，也可为非空结构化结果"}；兼容历史的非空证据字符串。issues、unverified、feedback 等字段会完整交给下一节点，不应丢弃。未验证内容放入 unverified；存在必需标准未验证或 blocking 问题时不得 accepted=true。空泛的“通过”不是证据。Hub 只核对报告格式，不代替独立验收或最终复核；下一节点按工作流设置决定。`
