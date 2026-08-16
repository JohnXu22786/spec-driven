/**
 * 极简 frontmatter 解析器
 *
 * 支持语法（刻意收窄，保证可预测）：
 * - 文件以 `---` 单独成行开头，以 `---` 单独成行结束；
 * - 行格式 `key: value`，key 由字母/数字/连字符组成；
 * - value 支持四种形态：
 *     - 裸标量（字符串 / 整数 / 布尔 true|false）
 *     - 单引号或双引号包裹的字符串（内部允许冒号）
 *     - JSON 对象（以 `{` 开头，整体 JSON.parse）
 *     - 空值（`key:` 视为空字符串）
 * - `#` 开头的整行视为注释；
 * - 空行忽略。
 *
 * 不做的事（明确超出范围）：多行值、块序列（`- a`）、嵌套映射、转义规则全集。
 * 技能与模板的 frontmatter 字段均为上述子集，如未来需要复杂结构，
 * 应引入独立 YAML 库而不是扩写本解析器。
 *
 * 约定：未知/无法解析的行产生 warning，不中断整体解析；
 * 未闭合的 frontmatter 块产生 error（文件视为不可用）。
 */

export interface FrontmatterResult {
  /** 解析出的键值。重复键后者胜出，并记入 warnings。 */
  data: Record<string, unknown>
  /** 剥离 frontmatter 后的正文（保留原有换行风格）。 */
  body: string
  /** 是否有前导 frontmatter 块。 */
  hasFrontmatter: boolean
  /** 整体是否可用（未闭合视为不可用）。 */
  ok: boolean
  warnings: string[]
  error?: string
}

const KEY_PATTERN = /^[A-Za-z0-9_-]+$/
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/
const FRONTMATTER_MARKER = /^---\s*$/

function parseValue(raw: string): { value: unknown; warning?: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: '' }
  if (trimmed.startsWith('{')) {
    try {
      return { value: JSON.parse(trimmed) }
    } catch {
      return { value: trimmed, warning: `字段值不是合法 JSON，已按原样保留: ${truncate(trimmed, 40)}` }
    }
  }
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed)
  if (quoted) return { value: quoted[2] }
  if (trimmed === 'true') return { value: true }
  if (trimmed === 'false') return { value: false }
  if (NUMBER_PATTERN.test(trimmed)) return { value: Number(trimmed) }
  return { value: trimmed }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function parseFrontmatter(text: string): FrontmatterResult {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const data: Record<string, unknown> = {}
  const warnings: string[] = []

  if (lines.length === 0 || !FRONTMATTER_MARKER.test(lines[0] ?? '')) {
    return { data, body: normalized, hasFrontmatter: false, ok: true, warnings }
  }

  let closingIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_MARKER.test(lines[i] ?? '')) {
      closingIndex = i
      break
    }
  }
  if (closingIndex === -1) {
    return { data, body: normalized, hasFrontmatter: true, ok: false, warnings, error: 'frontmatter 块未闭合（缺少结束 `---`）' }
  }

  for (let i = 1; i < closingIndex; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed)
    if (!match) {
      warnings.push(`第 ${i + 1} 行无法解析，已忽略: ${truncate(trimmed, 40)}`)
      continue
    }
    const key = match[1] ?? ''
    if (!KEY_PATTERN.test(key)) {
      warnings.push(`第 ${i + 1} 行键名非法，已忽略: ${truncate(key, 40)}`)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      warnings.push(`键 ${key} 重复定义，后值覆盖前值`)
    }
    const parsed = parseValue(match[2] ?? '')
    if (parsed.warning) warnings.push(parsed.warning)
    data[key] = parsed.value
  }

  const body = lines.slice(closingIndex + 1).join('\n')
  return { data, body, hasFrontmatter: true, ok: true, warnings }
}
