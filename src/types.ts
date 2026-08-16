/**
 * keel（龙骨）——最小结构类型声明
 *
 * 本插件零运行时依赖。此处声明的 Context / Tool / Skill 接口是宿主
 * （dsh / Cordis 系插件化 harness）对外服务面的结构近似：
 * - 插件入口 `apply(ctx)` 通过它获得类型；
 * - 宿主真实对象在结构上满足这些接口（鸭子类型），无需 import 任何宿主包。
 *
 * 若与宿主的完整类型库一起编译，可以把这些类型替换为宿主声明的 Context
 * （仅类型层替换，不影响运行时行为）。具体差异与取舍见 docs/INTEGRATION.md。
 */

/** 模型可见的工具执行结果片段（text 类型）。 */
export interface ToolResultText {
  type: 'text'
  text: string
}

/** 工具输出声明：canonical 值由 execute 返回，render 将其转为模型可见内容。 */
export interface ToolOutput {
  /** canonical 值使用的 JSON Schema。 */
  schema: Record<string, unknown>
  /** 将 execute 的返回值转为模型可见片段；缺省时由宿主自行呈现。 */
  render?: (args: unknown, value: unknown) => ToolResultText[]
}

/** 工具定义：与宿主工具注册表 `ctx.tools.register(definition)` 接受的形状一致。 */
export interface ToolDefinition {
  name: string
  description: string
  /** 参数 JSON Schema（object 类型）。 */
  parameters: Record<string, unknown>
  output?: ToolOutput
  /** 执行函数；返回 canonical 值（由 output.schema 声明），错误时抛出携带可读消息的异常。 */
  execute(args: Record<string, unknown>): unknown | Promise<unknown>
}

/** 宿主工具注册表服务面。 */
export interface ToolRegistry {
  register(definition: ToolDefinition): () => void
}

/** 运行时技能注册项（省略 invocation/provider 时宿主按默认策略处理）。 */
export interface SkillRegistration {
  /** kebab-case 技能名（与文件名主干一致）。 */
  name: string
  description: string
  /** 技能正文（markdown 指令）。 */
  content: string
  /** 补充的路由指引。 */
  whenToUse?: string
}

/** 宿主技能注册表服务面。 */
export interface SkillRegistry {
  register(skill: SkillRegistration): () => void
}

/** 宿主上下文：本插件仅消费 tools 与 skills 两个可选服务面。 */
export interface Context {
  tools?: ToolRegistry
  skills?: SkillRegistry
  /** 宿主日志对象；形状未承诺，使用前需防御。 */
  logger?: unknown
}
