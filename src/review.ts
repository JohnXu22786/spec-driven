/**
 * 规格审查引擎
 *
 * 把纪律写成代码：对规格书（SPEC*）、假设登记表（ASSUMPTIONS*）、
 * 验收审计（AUDIT*）执行确定性检查，产出带规则编号、行号与严重度的发现列表。
 *
 * 设计要点：
 * - 行号以规范化（CRLF→LF）后的文本为准，从 1 起；
 * - 文件头部的 frontmatter 块（---…---）与代码围栏（``` / ~~~）内的内容
 *   不参与任何检查（不误报、不建节）；
 * - 错误（error）= 门禁项，禁止进入建造阶段；警告（warning）= 建议澄清项；
 * - strict 模式将全部警告升级为错误；
 * - maxFindings 限制报告展示规模，防止刷屏；通过/失败按全部发现判定，
 *   截断只影响展示，不影响门禁结论。
 *
 * 规则清单（与 docs/METHODOLOGY.md 保持同步）：
 *   KEEL-0101 必需小节缺失（目标/验收标准/验证方法）
 *   KEEL-0102 规格存在未填充占位符 {{...}}
 *   KEEL-0103 「验收标准」为空
 *   KEEL-0106 「目标」为空
 *   KEEL-0201 模糊表述词（给出确定数值或明确条件）
 *   KEEL-0202 范围蔓延信号词（移出正文，或显式列入范围外）
 *   KEEL-0203 「边界」小节缺失
 *   KEEL-0204 「范围外」未声明或其后无内容
 *   KEEL-0205 「需求」为空
 *   KEEL-0207 未发现假设登记表（受配置控制）
 *   KEEL-0208 「验证方法」为空
 *   KEEL-0209 代码围栏未闭合
 *   KEEL-0301 假设登记表为空
 *   KEEL-0302 假设条目未标注风险等级 [高]/[中]/[低]
 *   KEEL-0303 高风险假设未标记验证结论
 *   KEEL-0401 验收审计为空
 *   KEEL-0402 验收条目缺少结果标记
 *   KEEL-0403 验收结果存在 ❌ 未通过项
 *   KEEL-0001 文件不可读或不是受支持的对象
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, basename } from 'node:path'

export type Severity = 'error' | 'warning'
export type ReviewKind = 'spec' | 'assumptions' | 'audit'

export interface Finding {
  rule: string
  severity: Severity
  line: number
  message: string
}

export interface ReviewConfig {
  /** strict 模式下所有警告升级为错误。 */
  strict: boolean
  /** 审查规格时要求同目录存在假设登记表（ASSUMPTIONS*.md）。 */
  requireAssumptions: boolean
  /** 报告发现数量上限。 */
  maxFindings: number
}

export interface ReviewReport {
  path: string
  kind: ReviewKind | 'unknown'
  config: ReviewConfig
  findings: Finding[]
  errors: number
  warnings: number
  /** 错误数为零即通过。 */
  passed: boolean
  /** 发现数超过上限被截断。 */
  truncated: boolean
}

/** 模糊表述词：出现在正文任意可见行时给出警告。词表可裁剪，勿用单字「等」（与「等级」等词冲突）。 */
export const VAGUE_WORDS = [
  '等等', '可能', '也许', '大概', '或许', '尽快', '尽量', '适当', '相应',
  '类似', '差不多', '若干', '优化', '改进', '应该', '最好', '比较', '非常',
  '很多', '不错', '不太', 'maybe', 'perhaps', 'roughly', 'approximately',
  'soon', 'various', 'someday', 'optimize', 'improve', 'properly', 'sufficiently',
]

/** 范围蔓延信号词：出现在规格正文时提示范围风险。 */
export const SCOPE_CREEP_WORDS = [
  '顺便', '顺手', '以后再加', '以后再说', '后续再说', '如果时间允许',
  '时间允许的话', '加分项', '未来说不定', '先简单做',
]

const REQUIRED_SECTIONS = ['目标', '验收标准', '验证方法']
const SECTION_PATTERN = /^##\s+(.+)$/
/** 围栏起始（可带 0–3 空格缩进与 info 字符串）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/
/** 围栏闭合候选（可带 0–3 空格缩进，不允许 info 字符串）。 */
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/
const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/
const RISK_PATTERN = /\[(高|中|低)\]/
const HIGH_RISK_PATTERN = /\[高\]/
const VERIFIED_PATTERN = /✅|❌|已验证|已证伪/
const RESULT_PATTERN = /✅|❌|通过|未通过|部分通过|跳过/

/** 文本的逐行视图：可见行（排除 frontmatter 块与代码围栏内容）。 */
interface ScanLine {
  index: number
  text: string
}

interface ScanResult {
  visible: ScanLine[]
  /** 代码围栏到文件末尾仍未闭合。 */
  unclosedFence: boolean
}

/** 文件头部 frontmatter 块（---…---）的行号集合；不以 --- 开头时为空，起始后未闭合则整文件视为块。 */
function frontmatterHiddenIndices(lines: string[]): ReadonlySet<number> {
  if ((lines[0] ?? '').trim() !== '---') return new Set()
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      return new Set(Array.from({ length: i + 1 }, (_, n) => n))
    }
  }
  return new Set(Array.from({ length: lines.length }, (_, n) => n))
}

function scanLines(text: string, hidden?: ReadonlySet<number>): ScanResult {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const hiddenLines = hidden ?? frontmatterHiddenIndices(lines)
  const visible: ScanLine[] = []
  // 围栏状态机：闭合行必须与起始行同字符、长度不小于起始，且缩进不超过 3 格
  let fence: { char: string; length: number } | undefined
  for (let i = 0; i < lines.length; i++) {
    if (hiddenLines.has(i)) continue
    const line = lines[i] ?? ''
    if (fence !== undefined) {
      const close = FENCE_CLOSE.exec(line)
      if (close !== null && close[1] !== undefined && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = undefined
      }
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open !== null && open[1] !== undefined) {
      fence = { char: open[1][0] ?? '', length: open[1].length }
      continue
    }
    visible.push({ index: i, text: line })
  }
  return { visible, unclosedFence: fence !== undefined }
}

/** 小节视图：标题 → 该节的可视行（不含标题行）。 */
interface Section {
  name: string
  headingLine: number
  lines: ScanLine[]
}

function buildSections(visible: ScanLine[]): Section[] {
  const sections: Section[] = []
  let current: Section | undefined
  for (const line of visible) {
    const match = SECTION_PATTERN.exec(line.text)
    if (match) {
      current = { name: (match[1] ?? '').trim(), headingLine: line.index, lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return sections
}

function nonEmpty(lines: ScanLine[]): boolean {
  return lines.some((line) => line.text.trim() !== '')
}

function firstMatchLine(lines: ScanLine[], pattern: RegExp): number | undefined {
  for (const line of lines) {
    if (pattern.test(line.text)) return line.index
  }
  return undefined
}

export function detectKind(fileName: string): ReviewKind | 'unknown' {
  const upper = basename(fileName).toUpperCase()
  if (upper.startsWith('SPEC')) return 'spec'
  if (upper.startsWith('ASSUMPTIONS')) return 'assumptions'
  if (upper.startsWith('AUDIT')) return 'audit'
  return 'unknown'
}

function escalate(findings: Finding[], strict: boolean): Finding[] {
  if (!strict) return findings
  return findings.map((finding) =>
    finding.severity === 'warning' ? { ...finding, severity: 'error' as const } : finding,
  )
}

export function reviewSpecText(content: string, config: ReviewConfig): Finding[] {
  const findings: Finding[] = []
  const scanned = scanLines(content)
  const visible = scanned.visible
  const sections = buildSections(visible)

  const sectionNames = new Set(sections.map((section) => section.name))
  const missing = REQUIRED_SECTIONS.filter((name) => !sectionNames.has(name))
  if (missing.length > 0) {
    findings.push({
      rule: 'KEEL-0101',
      severity: 'error',
      line: 1,
      message: `缺少必需小节：${missing.join('、')}`,
    })
  }

  for (const section of sections) {
    if (section.name === '目标' && !nonEmpty(section.lines)) {
      findings.push({
        rule: 'KEEL-0106',
        severity: 'error',
        line: section.headingLine + 1,
        message: '「目标」为空：规格失去锚点，先写清要达成的结果',
      })
    }
    if (section.name === '验收标准' && !nonEmpty(section.lines)) {
      findings.push({
        rule: 'KEEL-0103',
        severity: 'error',
        line: section.headingLine + 1,
        message: '「验收标准」为空：至少列出一条可验证的验收标准',
      })
    }
    if (section.name === '需求' && !nonEmpty(section.lines)) {
      findings.push({
        rule: 'KEEL-0205',
        severity: 'warning',
        line: section.headingLine + 1,
        message: '「需求」为空：需求条目缺失，规格退化为口号',
      })
    }
    if (section.name === '验证方法' && !nonEmpty(section.lines)) {
      findings.push({
        rule: 'KEEL-0208',
        severity: 'warning',
        line: section.headingLine + 1,
        message: '「验证方法」为空：没有指明如何证明验收标准达成',
      })
    }
    if (section.name === '边界') {
      const outLine = firstMatchLine(section.lines, /范围外/)
      if (outLine === undefined) {
        findings.push({
          rule: 'KEEL-0204',
          severity: 'warning',
          line: section.headingLine + 1,
          message: '「边界」小节未声明「范围外」：明确不做什么，是防范围蔓延的第一道防线',
        })
      } else {
        const after = section.lines.filter((line) => line.index > outLine)
        if (!nonEmpty(after)) {
          findings.push({
            rule: 'KEEL-0204',
            severity: 'warning',
            line: outLine + 1,
            message: '「范围外」后没有内容：请列出明确不做的项',
          })
        }
      }
    }
  }

  if (scanned.unclosedFence) {
    findings.push({
      rule: 'KEEL-0209',
      severity: 'warning',
      line: 1,
      message: '代码围栏未闭合（缺少结束的 ``` 或 ~~~）：其后内容不参与检查，请补全围栏',
    })
  }

  if (!sectionNames.has('边界')) {
    findings.push({
      rule: 'KEEL-0203',
      severity: 'warning',
      line: 1,
      message: '缺少「边界」小节：建议声明范围内/范围外，约束任务与避免蔓延',
    })
  }

  for (const line of visible) {
    if (PLACEHOLDER_PATTERN.test(line.text)) {
      findings.push({
        rule: 'KEEL-0102',
        severity: 'error',
        line: line.index + 1,
        message: `存在未填充占位符：${PLACEHOLDER_PATTERN.exec(line.text)?.[0] ?? '{{...}}'}`,
      })
      continue
    }
    const vague = VAGUE_WORDS.find((word) => line.text.includes(word))
    if (vague !== undefined) {
      findings.push({
        rule: 'KEEL-0201',
        severity: 'warning',
        line: line.index + 1,
        message: `存在模糊表述「${vague}」：请改为确定数值、确定条件或确定动作`,
      })
    }
    const creep = SCOPE_CREEP_WORDS.find((word) => line.text.includes(word))
    if (creep !== undefined) {
      findings.push({
        rule: 'KEEL-0202',
        severity: 'warning',
        line: line.index + 1,
        message: `存在范围蔓延信号「${creep}」：移出规格正文，或显式列入范围外`,
      })
    }
  }

  return escalate(findings, config.strict)
}

/** 是否为表格分隔行（形如 | --- | --- |）。 */
function isSeparatorRow(text: string): boolean {
  return /^[\s|:-]+$/.test(text)
}

/** 按 | 切分表格行单元格；非表格行（列表写法）返回整行单元素。 */
function splitCells(text: string): string[] {
  if (!text.includes('|')) return [text]
  const cells = text
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '')
  return cells.length > 0 ? cells : [text]
}

/** 提取数据行：跳过空行、分隔行与表头行；保留表格行；列表行可选（假设登记表允许列表写法）。 */
function extractDataRows(content: string, allowBullets: boolean): ScanLine[] {
  const candidates = scanLines(content).visible.filter((line) => {
    const text = line.text.trim()
    if (text === '') return false
    if (text.startsWith('|')) return true
    return allowBullets && (text.startsWith('- ') || text.startsWith('* '))
  })
  const rows: ScanLine[] = []
  for (let i = 0; i < candidates.length; i++) {
    const line = candidates[i]!
    const text = line.text.trim()
    if (text.startsWith('|')) {
      if (isSeparatorRow(text)) continue
      const next = candidates[i + 1]
      if (next !== undefined && isSeparatorRow(next.text.trim())) continue // 表头行
    }
    rows.push(line)
  }
  return rows
}

export function reviewAssumptionsText(content: string, config: ReviewConfig): Finding[] {
  const findings: Finding[] = []
  const rows = extractDataRows(content, true)

  if (rows.length === 0) {
    findings.push({
      rule: 'KEEL-0301',
      severity: 'error',
      line: 1,
      message: '假设登记表为空：至少登记一条假设，无事可假设也应写明',
    })
    return escalate(findings, config.strict)
  }

  for (const row of rows) {
    const cells = splitCells(row.text)
    // 风险等级按任意列判定；验证结论按最后一列判定（模板列位：编号|假设|风险|验证方法|结论）
    if (!RISK_PATTERN.test(row.text)) {
      findings.push({
        rule: 'KEEL-0302',
        severity: 'error',
        line: row.index + 1,
        message:
          `假设条目未标注风险等级：请标记 [高]、[中] 或 [低]` +
          (cells.length >= 2 ? '（若此行是表头，请补上 | --- | 分隔行）' : ''),
      })
      continue
    }
    const lastCell = cells.length >= 2 ? (cells[cells.length - 1] ?? '') : row.text
    if (HIGH_RISK_PATTERN.test(row.text) && !VERIFIED_PATTERN.test(lastCell)) {
      findings.push({
        rule: 'KEEL-0303',
        severity: 'error',
        line: row.index + 1,
        message: `高风险假设未标记验证结论：建造前须完成验证并回填（✅ 已验证 / ❌ 已证伪）`,
      })
    }
  }
  return escalate(findings, config.strict)
}

export function reviewAuditText(content: string, config: ReviewConfig): Finding[] {
  const findings: Finding[] = []
  const rows = extractDataRows(content, false)

  if (rows.length === 0) {
    findings.push({
      rule: 'KEEL-0401',
      severity: 'error',
      line: 1,
      message: '验收审计为空：至少逐条核对一条验收标准',
    })
    return escalate(findings, config.strict)
  }
  for (const row of rows) {
    const cells = splitCells(row.text)
    // 结果按第二列判定（模板列位：验收标准|结果|证据），其余列不参与
    const resultCell = cells.length >= 2 ? (cells[1] ?? '') : row.text
    if (resultCell.includes('❌')) {
      findings.push({
        rule: 'KEEL-0403',
        severity: 'error',
        line: row.index + 1,
        message: '验收结果存在 ❌ 未通过项：先处置（修复或走变更单），再宣布完成',
      })
      continue
    }
    if (!RESULT_PATTERN.test(resultCell)) {
      findings.push({
        rule: 'KEEL-0402',
        severity: 'warning',
        line: row.index + 1,
        message:
          `验收条目缺少结果标记：请标注 ✅ 通过 / ❌ 未通过 / 跳过` +
          (cells.length >= 2 ? '（若此行是表头，请补上 | --- | 分隔行）' : ''),
      })
    }
  }
  return escalate(findings, config.strict)
}

/** 目录下是否存在假设登记表（ASSUMPTIONS 开头的 .md 文件）。 */
function hasAssumptionsFile(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => name.toUpperCase().startsWith('ASSUMPTIONS'))
  } catch {
    return false
  }
}

/** 按文件名判断种类并审查。spec 种类会按配置检查同目录假设登记表是否存在。 */
export function reviewFile(filePath: string, config: ReviewConfig): ReviewReport {
  const kind = detectKind(filePath)
  const findings: Finding[] = []
  let content = ''
  if (kind === 'unknown') {
    findings.push({
      rule: 'KEEL-0001',
      severity: 'error',
      line: 1,
      message: '不支持的审查对象：文件名应以 SPEC / ASSUMPTIONS / AUDIT 开头',
    })
  } else {
    try {
      content = readFileSync(filePath, 'utf8')
    } catch (error) {
      findings.push({
        rule: 'KEEL-0001',
        severity: 'error',
        line: 1,
        message: `无法读取文件：${(error as Error).message}`,
      })
      return finishReport(filePath, kind, findings, config)
    }
    if (kind === 'spec') {
      findings.push(...reviewSpecText(content, config))
      if (config.requireAssumptions && !hasAssumptionsFile(dirname(filePath))) {
        findings.push({
          rule: 'KEEL-0207',
          severity: 'warning',
          line: 1,
          message: '同目录未发现 ASSUMPTIONS*.md：建议用假设登记表承载假设，规格正文只写确定结论',
        })
      }
    } else if (kind === 'assumptions') {
      findings.push(...reviewAssumptionsText(content, config))
    } else {
      findings.push(...reviewAuditText(content, config))
    }
  }
  return finishReport(filePath, kind, findings, config)
}

function finishReport(
  path: string,
  kind: ReviewKind | 'unknown',
  findings: Finding[],
  config: ReviewConfig,
): ReviewReport {
  const sorted = [...findings].sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
  // 通过/失败与计数按全部发现判定；截断只影响展示，避免门禁被报告规模绕过。
  const errors = sorted.filter((finding) => finding.severity === 'error').length
  const warnings = sorted.length - errors
  const truncated = sorted.length > config.maxFindings
  const capped = truncated ? sorted.slice(0, config.maxFindings) : sorted
  return {
    path,
    kind,
    config,
    findings: capped,
    errors,
    warnings,
    passed: errors === 0,
    truncated,
  }
}

const KIND_LABEL: Record<ReviewKind | 'unknown', string> = {
  spec: '规格书',
  assumptions: '假设登记表',
  audit: '验收审计',
  unknown: '未知',
}

/** 将报告渲染为模型可见文本。 */
export function renderReport(report: ReviewReport): string {
  const severityLabel: Record<Severity, string> = { error: '错误', warning: '警告' }
  const lines: string[] = []
  lines.push(`审查对象: ${report.path}`)
  lines.push(`对象种类: ${KIND_LABEL[report.kind]}（严格度: ${report.config.strict ? 'strict' : 'relaxed'}）`)
  lines.push(`结果: ${report.passed ? '通过' : '未通过'}（${report.errors} 错误 / ${report.warnings} 警告）`)
  if (report.truncated) lines.push(`发现数超过上限，仅展示前 ${report.config.maxFindings} 条。`)
  for (const finding of report.findings) {
    lines.push(`[${severityLabel[finding.severity]}] ${finding.rule} 第 ${finding.line} 行: ${finding.message}`)
  }
  if (report.kind === 'spec') {
    lines.push(report.passed ? '结论: 规格合格，允许进入建造阶段。' : '结论: 规格未合格，禁止进入建造阶段；先修复全部错误。')
  } else {
    lines.push(report.passed ? '结论: 记录合格。' : '结论: 记录不合格，先修复全部错误。')
  }
  return lines.join('\n')
}
