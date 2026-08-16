/**
 * 插件清单与配置
 *
 * - 插件身份元数据（名称、版本、描述）作为唯一事实来源；
 * - 配置项与默认值；validateConfig 在加载期执行校验，
 *   非法配置直接抛错（fail loudly），错误消息给出可操作的修正提示。
 *
 * 配置来源：宿主 cordis.yml 补丁行中的 config 字段（见 docs/INTEGRATION.md）。
 */

export const PLUGIN_NAME = 'keel'
/** 与 package.json version 保持同步。 */
export const PLUGIN_VERSION = '1.0.0'
export const PLUGIN_DESCRIPTION =
  '龙骨（keel）——规格驱动开发纪律技能包：先立规格、验证假设、防止过度工程、防止范围蔓延。'

export type Strictness = 'relaxed' | 'strict'

export interface KeelConfig {
  /**
   * 审查严格度：
   * - relaxed：错误阻止建造，警告提示澄清；
   * - strict：警告一并升级为错误，规格合格门槛更高。
   */
  strictness: Strictness
  /** 审查规格书时要求同目录存在 ASSUMPTIONS.md（假设登记表）。 */
  requireAssumptions: boolean
  /** 单次审查报告的发现数量上限（1–1000）。 */
  maxFindings: number
}

export const DEFAULT_CONFIG: KeelConfig = {
  strictness: 'relaxed',
  requireAssumptions: true,
  maxFindings: 100,
}

const ALLOWED_KEYS = new Set(['strictness', 'requireAssumptions', 'maxFindings'])

/** 校验外部传入的配置；非法即抛 TypeError（消息包含修正指引）。 */
export function validateConfig(raw: unknown): KeelConfig {
  if (raw === undefined || raw === null) return { ...DEFAULT_CONFIG }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('keel 配置必须是对象（cordis.yml 中 config 字段），收到: ' + typeof raw)
  }
  const input = raw as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new TypeError(
        `keel 配置包含未知键「${key}」。允许的键: ${[...ALLOWED_KEYS].join(', ')}。` +
          '请修正 cordis.yml 中的 config 字段。',
      )
    }
  }
  const strictness = input['strictness'] ?? DEFAULT_CONFIG.strictness
  if (strictness !== 'relaxed' && strictness !== 'strict') {
    throw new TypeError(`keel 配置 strictness 非法: ${String(strictness)}（允许 relaxed | strict）`)
  }
  const requireAssumptions = input['requireAssumptions'] ?? DEFAULT_CONFIG.requireAssumptions
  if (typeof requireAssumptions !== 'boolean') {
    throw new TypeError(`keel 配置 requireAssumptions 非法: ${String(requireAssumptions)}（要求布尔值）`)
  }
  const maxFindings = input['maxFindings'] ?? DEFAULT_CONFIG.maxFindings
  if (typeof maxFindings !== 'number' || !Number.isInteger(maxFindings) || maxFindings < 1 || maxFindings > 1000) {
    throw new TypeError(`keel 配置 maxFindings 非法: ${String(maxFindings)}（要求 1–1000 的整数）`)
  }
  return { strictness, requireAssumptions, maxFindings }
}
