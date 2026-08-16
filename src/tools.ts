/**
 * 工具装配
 *
 * 本插件向宿主注册三个模型可见工具：
 * - keel_catalog —— 列出技能与模板清单（路由入口）；
 * - keel_spec —— 按模板生成规格/假设/审计文件（脚手架）；
 * - keel_review —— 审查规格类文件（纪律门禁）。
 *
 * forgeTool 是宿主 defineTool 助手的本地等价物：只做形状校验与透传，
 * 避免引入宿主工具包依赖。工具定义形状与宿主 `ctx.tools.register`
 * 接受的 ToolDefinition 一致（JSON Schema 参数 + canonical 输出 + render）。
 */

import type { Registry, Template } from './registry.ts'
import type { ToolDefinition } from './types.ts'
import { scaffoldToFile } from './scaffold.ts'
import { renderReport, reviewFile, type ReviewConfig } from './review.ts'
import type { KeelConfig } from './manifest.ts'

/** 形状校验 + 透传。参数非法（缺 name/description/parameters）时抛 TypeError。 */
export function forgeTool(definition: ToolDefinition): ToolDefinition {
  if (typeof definition.name !== 'string' || definition.name.trim() === '') {
    throw new TypeError('工具缺少合法的 name')
  }
  if (typeof definition.description !== 'string' || definition.description.trim() === '') {
    throw new TypeError(`工具 ${definition.name} 缺少 description`)
  }
  if (typeof definition.parameters !== 'object' || definition.parameters === null) {
    throw new TypeError(`工具 ${definition.name} 缺少 parameters（JSON Schema 对象）`)
  }
  return definition
}

function asString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function asBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

function toReviewConfig(config: KeelConfig): ReviewConfig {
  return {
    strict: config.strictness === 'strict',
    requireAssumptions: config.requireAssumptions,
    maxFindings: config.maxFindings,
  }
}

/** 注册全部工具；registry 与 config 由 apply 注入。 */
export function registerTools(
  registry: Registry,
  config: KeelConfig,
  tools: { register(definition: ToolDefinition): () => void },
): void {
  tools.register(forgeTool(catalogTool(registry)))
  tools.register(forgeTool(specTool(registry)))
  tools.register(forgeTool(reviewTool(config)))
}

function catalogTool(registry: Registry): ToolDefinition {
  return {
    name: 'keel_catalog',
    description: '列出 keel 插件提供的技能与规格模板清单（技能名、模板名与用途），用于选择后续工具参数。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute() {
      const lines: string[] = ['## keel 技能']
      for (const skill of registry.skills) {
        lines.push(`- ${skill.name}: ${skill.description}`)
      }
      lines.push('', '## keel 模板')
      for (const template of registry.templates) {
        const size = template.size !== undefined ? `（${template.size}）` : ''
        lines.push(`- ${template.name}${size}: ${template.description ?? '（无描述）'}`)
      }
      return lines.join('\n')
    },
  }
}

function specTool(registry: Registry): ToolDefinition {
  return {
    name: 'keel_spec',
    description:
      '按模板生成规格类文件（规格书/假设登记表/验收审计/变更单）。' +
      '参数 template 指定模板名，fields 提供全部占位符的答案；缺少任一字段会整体拒绝并列出缺失项。',
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          description: '模板名（先调用 keel_catalog 查看可用模板）',
        },
        path: {
          type: 'string',
          description: '输出文件路径（相对当前工作目录），缺省为 SPEC.md',
        },
        fields: {
          type: 'object',
          description: '占位符答案：键为模板占位符名，值为填入文本',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['template', 'fields'],
      additionalProperties: false,
    },
    execute(args) {
      const templateName = asString(args, 'template')
      if (templateName === undefined) throw new Error('keel_spec 缺少必填参数 template')
      const template: Template | undefined = registry.templates.find((item) => item.name === templateName)
      if (template === undefined) {
        const names = registry.templates.map((item) => item.name).join('、')
        throw new Error(`模板「${templateName}」不存在。可用模板: ${names}（可用 keel_catalog 查看详情）`)
      }
      const rawFields = args['fields']
      if (typeof rawFields !== 'object' || rawFields === null || Array.isArray(rawFields)) {
        throw new Error('keel_spec 缺少必填参数 fields（对象，键为占位符名）')
      }
      const answers: Record<string, string> = {}
      for (const [key, value] of Object.entries(rawFields)) {
        if (typeof value === 'string') answers[key] = value
      }
      const outPath = asString(args, 'path') ?? 'SPEC.md'
      const { content, outPath: writtenPath } = scaffoldToFile(template, answers, outPath)
      const residue = (content.match(/\{\{([^{}]+)\}\}/g) ?? []).length
      const note =
        residue > 0
          ? `\n注意：内容中仍有 ${residue} 个 {{...}} 占位符（来自字段答案本身），keel_review 会报 KEEL-0102，请修正对应答案后重新生成。`
          : ''
      return `已生成 ${writtenPath}（模板: ${template.name}）。下一步：调用 keel_review 检查该文件，全部错误清零后再进入建造。${note}`
    },
  }
}

function reviewTool(config: KeelConfig): ToolDefinition {
  return {
    name: 'keel_review',
    description:
      '审查规格类文件（SPEC*/ASSUMPTIONS*/AUDIT*）：检查必需小节、占位符残留、模糊表述、范围蔓延信号、假设风险标注等。' +
      '返回带规则编号与行号的报告；错误数不为零时结论为「禁止进入建造」。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '待审查文件路径（相对当前工作目录）',
        },
        strict: {
          type: 'boolean',
          description: '严格模式：警告升级为错误（缺省跟随插件配置）',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    execute(args) {
      const path = asString(args, 'path')
      if (path === undefined) throw new Error('keel_review 缺少必填参数 path')
      const reviewConfig = toReviewConfig(config)
      if (asBoolean(args, 'strict') === true) reviewConfig.strict = true
      return renderReport(reviewFile(path, reviewConfig))
    },
  }
}
