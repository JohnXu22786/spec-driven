/**
 * 规格脚手架
 *
 * 将模板中的 `{{key}}` 占位符替换为答案并写出文件。
 * 纪律要求：规格不允许「半成品」——缺少任何一个占位符的答案即整体拒绝
 * （抛出 ScaffoldError，列出全部缺失字段），由调用方决定是补答还是换更小的模板变体。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Template } from './registry.ts'

/** 占位符模式：{{key}}，key 内不允许再出现花括号。 */
const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/g

export class ScaffoldError extends Error {
  /** 缺失的占位符键（按出现顺序去重）。 */
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`规格不完整：缺少以下字段的答案：${missing.join('、')}`)
    this.name = 'ScaffoldError'
    this.missing = missing
  }
}

/** 收集模板正文中出现的全部占位符键（去重，按出现顺序）。 */
export function collectPlaceholders(template: Template): string[] {
  const seen: string[] = []
  const used = new Set<string>()
  for (const match of template.content.matchAll(PLACEHOLDER_PATTERN)) {
    const key = (match[1] ?? '').trim()
    if (key !== '' && !used.has(key)) {
      used.add(key)
      seen.push(key)
    }
  }
  return seen
}

/**
 * 严格渲染：所有占位符必须有答案（空字符串视为未作答），缺一即抛 ScaffoldError。
 * 答案中若再含占位符形态的文本，按原样输出（不递归替换）；
 * 这类残留会在 keel_review 的 KEEL-0102 中被拦截，由审查门禁把关。
 */
export function renderTemplate(template: Template, answers: Record<string, string>): string {
  const missing = collectPlaceholders(template).filter((key) => {
    if (!Object.hasOwn(answers, key)) return true
    const value = answers[key]
    return typeof value !== 'string' || value.trim() === ''
  })
  if (missing.length > 0) throw new ScaffoldError(missing)
  return template.content.replace(PLACEHOLDER_PATTERN, (_whole, rawKey: string) => {
    const key = rawKey.trim()
    return Object.hasOwn(answers, key) ? (answers[key] ?? '') : `{{${rawKey}}}`
  })
}

/** 渲染并写出文件；父目录不存在时逐级创建。返回渲染后的正文与写出路径。 */
export function scaffoldToFile(
  template: Template,
  answers: Record<string, string>,
  outPath: string,
): { content: string; outPath: string } {
  const content = renderTemplate(template, answers)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, content, 'utf8')
  return { content, outPath }
}
