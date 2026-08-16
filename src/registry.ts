/**
 * 技能与模板注册表
 *
 * 负责从插件目录读取并校验：
 * - skills/*.md —— 技能文件（frontmatter 必须含 kebab-case 的 name 与 description，
 *   且 name 必须与文件主干一致，这一约定与宿主技能发现机制兼容）；
 * - templates/*.md —— 规格模板（frontmatter 必须含 name，可选 description/size/fields）。
 *
 * 发现结果带 issue 列表：不合规的文件被跳过并说明原因，不中断整体加载。
 * 目录缺失、空目录均视为合法状态（仅记录提示），保证插件在精简安装下仍可加载。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.ts'

/** 技能文件名的 kebab-case 规则（与宿主技能名规则一致）。 */
const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface Skill {
  name: string
  description: string
  whenToUse?: string
  /** 剥离 frontmatter 后的技能正文。 */
  content: string
  /** 技能文件绝对路径。 */
  path: string
}

export interface Template {
  name: string
  description?: string
  /** 模板规模标记（minimal / standard / feature 等），仅作元数据。 */
  size?: string
  /** 模板字段 → 问询提示，供脚手架工具提示需要填写的答案。 */
  fields: Record<string, string>
  /** 剥离 frontmatter 后的模板正文。 */
  content: string
  path: string
}

export interface Registry {
  /** 插件根目录（skills/ 与 templates/ 的父目录）。 */
  root: string
  skills: Skill[]
  templates: Template[]
  /** 加载过程中产生的问题说明（按目录、文件顺序排列）。 */
  issues: string[]
}

export function loadSkillsDir(dir: string): { skills: Skill[]; issues: string[] } {
  const skills: Skill[] = []
  const issues: string[] = []
  const seen = new Set<string>()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return { skills, issues: [`技能目录不存在: ${dir}`] }
  }
  const files = entries.filter((name) => name.endsWith('.md')).sort()
  for (const file of files) {
    const stem = file.slice(0, -3)
    const path = join(dir, file)
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (error) {
      issues.push(`无法读取技能文件 ${file}: ${(error as Error).message}`)
      continue
    }
    const parsed = parseSkillFile(stem, text, path)
    if ('error' in parsed) {
      issues.push(`${file}: ${parsed.error}`)
      continue
    }
    if (parsed.warnings.length > 0) {
      issues.push(`${file}: ${parsed.warnings.join('；')}`)
    }
    if (seen.has(parsed.skill.name)) {
      // 扁平目录布局下 stem===name 已排除了同目录重名；此检查为防御性
      // （例如未来扩展为嵌套目录发现时仍然安全）。
      issues.push(`${file}: 技能名 ${parsed.skill.name} 重复，已跳过（保留先加载的同名技能）`)
      continue
    }
    seen.add(parsed.skill.name)
    skills.push(parsed.skill)
  }
  return { skills, issues }
}

export function parseSkillFile(
  stem: string,
  text: string,
  path: string,
): { skill: Skill; warnings: string[] } | { error: string } {
  const fm = parseFrontmatter(text)
  if (!fm.ok) return { error: fm.error ?? 'frontmatter 解析失败' }
  const name = fm.data['name']
  const description = fm.data['description']
  if (typeof name !== 'string' || !KEBAB_PATTERN.test(name)) {
    return { error: `name 缺失或不是 kebab-case（要求形如 a-b-c）` }
  }
  if (name !== stem) {
    return { error: `frontmatter 的 name（${name}）与文件名主干（${stem}）不一致` }
  }
  if (typeof description !== 'string' || description.trim() === '') {
    return { error: `description 缺失或为空` }
  }
  const whenToUse = typeof fm.data['when-to-use'] === 'string' ? fm.data['when-to-use'] : undefined
  return {
    skill: {
      name,
      description: description.trim(),
      ...(whenToUse !== undefined ? { whenToUse } : {}),
      content: fm.body.trim(),
      path,
    },
    warnings: fm.warnings,
  }
}

export function loadTemplatesDir(dir: string): { templates: Template[]; issues: string[] } {
  const templates: Template[] = []
  const issues: string[] = []
  const seen = new Set<string>()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return { templates, issues: [`模板目录不存在: ${dir}`] }
  }
  const files = entries.filter((name) => name.endsWith('.md')).sort()
  for (const file of files) {
    const stem = file.slice(0, -3)
    const path = join(dir, file)
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (error) {
      issues.push(`无法读取模板文件 ${file}: ${(error as Error).message}`)
      continue
    }
    const parsed = parseTemplateFile(stem, text, path)
    if ('error' in parsed) {
      issues.push(`${file}: ${parsed.error}`)
      continue
    }
    if (parsed.warnings.length > 0) {
      issues.push(`${file}: ${parsed.warnings.join('；')}`)
    }
    if (seen.has(parsed.template.name)) {
      issues.push(`${file}: 模板名 ${parsed.template.name} 重复，已跳过（保留先加载的同名模板）`)
      continue
    }
    seen.add(parsed.template.name)
    templates.push(parsed.template)
  }
  return { templates, issues }
}

export function parseTemplateFile(
  stem: string,
  text: string,
  path: string,
): { template: Template; warnings: string[] } | { error: string } {
  const fm = parseFrontmatter(text)
  if (!fm.ok) return { error: fm.error ?? 'frontmatter 解析失败' }
  const name = fm.data['name']
  if (typeof name !== 'string' || name.trim() === '') {
    return { error: `name 缺失或为空（文件名主干: ${stem}）` }
  }
  const description = typeof fm.data['description'] === 'string' ? fm.data['description'] : undefined
  const size = typeof fm.data['size'] === 'string' ? fm.data['size'] : undefined
  let fields: Record<string, string> = {}
  const rawFields = fm.data['fields']
  if (rawFields !== undefined) {
    if (typeof rawFields !== 'object' || rawFields === null || Array.isArray(rawFields)) {
      return { error: `fields 必须是 JSON 对象（键为占位符名，值为问询提示）` }
    }
    for (const [key, value] of Object.entries(rawFields)) {
      fields[key] = typeof value === 'string' ? value : String(value)
    }
  }
  return {
    template: {
      name,
      ...(description !== undefined ? { description } : {}),
      ...(size !== undefined ? { size } : {}),
      fields,
      content: fm.body.trim(),
      path,
    },
    warnings: fm.warnings,
  }
}

/** 从插件根目录构造注册表（加载所有技能与模板）。 */
export function createRegistry(root: string): Registry {
  const skillsResult = loadSkillsDir(join(root, 'skills'))
  const templatesResult = loadTemplatesDir(join(root, 'templates'))
  return {
    root,
    skills: skillsResult.skills,
    templates: templatesResult.templates,
    issues: [...skillsResult.issues, ...templatesResult.issues],
  }
}

/** 按名称查找模板；缺失返回 undefined。 */
export function findTemplate(registry: Registry, name: string): Template | undefined {
  return registry.templates.find((template) => template.name === name)
}
