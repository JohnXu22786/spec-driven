/**
 * keel（龙骨）——插件入口
 *
 * 宿主（dsh / Cordis 系 harness）加载本模块时调用 apply(ctx, config)：
 * - ctx.tools.register —— 注册 keel_catalog / keel_spec / keel_review 三个工具；
 * - ctx.skills.register —— 注册内置技能（keel-anchor / keel-spec / keel-probe /
 *   keel-build / keel-audit），供技能发现机制直接取用；
 * - config —— 来自宿主补丁行 config 字段，加载期校验，非法即拒绝加载。
 *
 * 兼容性约定：
 * - 仅声明必需服务 tools；skills 为可选服务面，缺失时跳过注册并提示
 *   改用文件发现路径（见 docs/INTEGRATION.md「技能加载的三种方式」）；
 * - 不声明自定义事件、不持有全局状态、不做异步初始化；
 * - 所有注册都是宿主效果（effect），插件卸载时自动撤销。
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRegistry } from './registry.ts'
import { registerTools } from './tools.ts'
import {
  PLUGIN_DESCRIPTION,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  validateConfig,
  type KeelConfig,
} from './manifest.ts'
import type { Context, SkillRegistration } from './types.ts'

export const name = PLUGIN_NAME
export const version = PLUGIN_VERSION

/** 宿主等待 tools 服务就绪后才加载本插件。skills 按可选服务面防御处理。 */
export const inject = ['tools']

/** 插件根目录（skills/ 与 templates/ 的父目录），以本模块自身位置为起点解析。 */
export function pluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

/** 防御式日志：宿主 logger 形状未承诺（可能是工厂函数），任何失败都不影响加载。 */
function safeLog(ctx: Context, level: 'info' | 'warn', message: string): void {
  try {
    const logger = ctx.logger
    if (typeof logger === 'function') {
      const instance = (logger as (label: string) => { info?: (msg: string) => void; warn?: (msg: string) => void })(PLUGIN_NAME)
      instance[level]?.(message)
    } else if (logger !== undefined && typeof logger === 'object') {
      const method = (logger as { info?: (msg: string) => void; warn?: (msg: string) => void })[level]
      method?.(`[${PLUGIN_NAME}] ${message}`)
    }
  } catch {
    // 日志失败不影响插件功能。
  }
}

export function apply(ctx: Context, rawConfig?: unknown): void {
  const config: KeelConfig = validateConfig(rawConfig)
  const tools = ctx.tools
  if (!tools) {
    throw new Error('keel 需要 tools 服务（已声明 inject: [\'tools\']），但加载时该服务未就绪')
  }
  const root = pluginRoot()
  const registry = createRegistry(root)

  for (const issue of registry.issues) {
    safeLog(ctx, 'warn', issue)
  }

  registerTools(registry, config, { register: (definition) => tools.register(definition) })

  if (ctx.skills?.register) {
    const registrations: SkillRegistration[] = registry.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    }))
    for (const registration of registrations) {
      ctx.skills.register(registration)
    }
    safeLog(ctx, 'info', `${PLUGIN_DESCRIPTION} 已加载：注册 ${registrations.length} 个技能、${registry.templates.length} 个模板。`)
  } else {
    safeLog(
      ctx,
      'warn',
      '未发现 ctx.skills 服务，技能不进行运行时注册。可将 skills/ 目录下的技能文件放入 ' +
        '.dsh/skills（项目级）或配置 customSkillDirs 指向本插件 skills/ 目录，见 docs/INTEGRATION.md。',
    )
  }
}
