/**
 * keel 命令行入口（无 harness 环境的裸用路径）
 *
 * 用法：
 *   node src/cli.ts catalog
 *   node src/cli.ts scaffold <模板名> <输出路径> [--字段=值 ...]
 *   node src/cli.ts review <文件路径> [--strict]
 *
 * review 退出码：0 = 无错误（通过）；1 = 存在错误或文件不可用。
 * 该退出码可接入 CI 门禁。CLI 与插件共用同一套 registry/scaffold/review 实现，
 * 保证手工使用与 harness 内使用行为一致。
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRegistry, findTemplate } from './registry.ts'
import { ScaffoldError, scaffoldToFile } from './scaffold.ts'
import { reviewFile, renderReport, type ReviewConfig } from './review.ts'
import { DEFAULT_CONFIG } from './manifest.ts'

function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function fail(message: string): never {
  console.error(`keel: ${message}`)
  process.exit(2)
}

function usage(): never {
  console.error(`用法:
  node src/cli.ts catalog
  node src/cli.ts scaffold <模板名> <输出路径> [--字段=值 ...]
  node src/cli.ts review <文件路径> [--strict]`)
  process.exit(2)
}

function commandCatalog(): void {
  const registry = createRegistry(pluginRoot())
  for (const issue of registry.issues) console.warn(`keel: ${issue}`)
  console.log('技能:')
  for (const skill of registry.skills) console.log(`  ${skill.name} — ${skill.description}`)
  console.log('模板:')
  for (const template of registry.templates) {
    console.log(`  ${template.name}${template.size !== undefined ? ` (${template.size})` : ''} — ${template.description ?? ''}`)
  }
}

function commandScaffold(args: string[]): void {
  if (args.length < 2) usage()
  const templateName = args[0]!
  const outPath = resolve(args[1]!)
  const fields: Record<string, string> = {}
  for (const arg of args.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (!match) fail(`无法解析参数: ${arg}（要求 --字段=值）`)
    fields[match[1]!] = match[2]!
  }
  const registry = createRegistry(pluginRoot())
  const template = findTemplate(registry, templateName)
  if (template === undefined) {
    fail(`模板「${templateName}」不存在。可用: ${registry.templates.map((t) => t.name).join('、')}`)
  }
  let written: string
  try {
    written = scaffoldToFile(template, fields, outPath).outPath
  } catch (error) {
    if (error instanceof ScaffoldError) {
      fail(`scaffold 失败：${error.message}（用 --字段=值 补齐后重试）`)
    }
    throw error
  }
  console.log(`已生成 ${written}（模板: ${template.name}）。下一步: node src/cli.ts review ${written}`)
}

function commandReview(args: string[]): void {
  if (args.length < 1) usage()
  const path = resolve(args[0]!)
  const strict = args.includes('--strict')
  const config: ReviewConfig = {
    strict: strict || DEFAULT_CONFIG.strictness === 'strict',
    requireAssumptions: DEFAULT_CONFIG.requireAssumptions,
    maxFindings: DEFAULT_CONFIG.maxFindings,
  }
  const report = reviewFile(path, config)
  console.log(renderReport(report))
  process.exit(report.passed ? 0 : 1)
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const [command, ...rest] = process.argv.slice(2)
  switch (command) {
    case 'catalog':
      commandCatalog()
      break
    case 'scaffold':
      commandScaffold(rest)
      break
    case 'review':
      commandReview(rest)
      break
    case undefined:
      usage()
      break
    default:
      fail(`未知命令: ${command}`)
  }
}
