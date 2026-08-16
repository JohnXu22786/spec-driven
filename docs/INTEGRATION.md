# dsh 接入说明

本插件面向 dsh（DeepSeek Harness）等 Cordis 系插件化 harness 设计：
**插件 = TypeScript 模块导出 apply(ctx)，harness 加载后调用 apply 完成能力注册。**
本文说明清单与入口、加载方式、注册接口、配置、卸载与重载。

## 1. 清单与入口

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 插件清单（manifest） | `package.json` | 声明 name/version/type/module 与开发脚本；keywords 含 `dsh-plugin` 便于生态发现 |
| 插件入口 | `src/index.ts` | 导出 `name`、`inject`、`apply(ctx, config)` |
| 技能文件 | `skills/*.md` | 五个技能，frontmatter 声明 name（kebab-case）/description/when-to-use |
| 规格模板 | `templates/*.md` | 六个模板，frontmatter 声明 name/size/fields |
| 接入示例 | `cordis.example.yml` | 可直接改路径使用的加载补丁 |

## 2. 加载方式

### 2.1 通过 cordis.yml 补丁挂载本地插件

创建 `cordis.yml`（可从仓库根目录的 `cordis.example.yml` 复制）：

```yaml
- insert:
    - id: keel
      name: '/绝对路径/spec-driven/src/index.ts'
```

启动 harness 时加载补丁：

```sh
dsh web --patch ./cordis.yml
# 或：dsh --profile web --patch ./cordis.yml
```

加载成功时日志输出「已加载：注册 N 个技能、M 个模板」。

### 2.2 入口契约

harness 加载 `src/index.ts` 后执行以下步骤：

1. 读取导出 `name`（keel）与 `inject`（`['tools']`），等待 tools 服务就绪；
2. 调用 `apply(ctx, config)`；
3. `apply` 内完成全部注册（工具、技能）并立即返回——无异步初始化、无后台任务；
4. 插件卸载时，注册自动撤销（Cordis 效果机制），无需手工清理。

### 2.3 服务依赖

- `tools`（必需）：已在 `inject` 声明，加载前就绪；
- `skills`（可选）：未声明为必需。存在时注册运行时技能；不存在时插件照常加载，
  技能改走文件发现路径（见第 4 节「项目文件发现」方式），日志给出提示。

## 3. 注册接口

### 3.1 工具（ctx.tools.register）

`apply` 内调用三次 `ctx.tools.register(toolDefinition)`，定义形状与宿主一致
（JSON Schema 参数 + canonical 输出 + render）：

| 工具 | 参数（JSON Schema） | 返回 |
| --- | --- | --- |
| `keel_catalog` | 无 | 技能与模板清单文本 |
| `keel_spec` | template（必填）、path（缺省 SPEC.md）、fields（必填对象） | 生成结果与下一步提示 |
| `keel_review` | path（必填）、strict（可选布尔） | 审查报告文本 |

工具名带 `keel_` 前缀以避免与宿主其他工具冲突。

### 3.2 技能（ctx.skills.register）

`apply` 内将 `skills/` 目录解析结果逐条注册：

```ts
ctx.skills.register({
  name: 'keel-anchor',
  description: '锚定——动手前收敛目标与边界……',
  content: '…技能正文…',
  whenToUse: '…',
})
```

### 3.3 事件

本插件不声明自定义事件、不监听宿主事件。技能/模板内容变化后重启即可生效；
若宿主技能注册表提供 `skills/change` 失效通知，运行时注册随插件重载自动重建。

## 4. 技能加载的三种方式

| 方式 | 做法 | 适用 |
| --- | --- | --- |
| 运行时注册 | 插件 apply 内 ctx.skills.register（默认行为） | dsh 主环境 |
| 项目文件发现 | 将 `skills/` 下五个文件复制到 `<项目根>/.dsh/skills/` | 项目级独立安装，不加载插件 |
| 自定义目录 | 配置宿主 customSkillDirs 指向本插件 `skills/` 目录 | 不想复制文件时 |

技能文件名即技能名（`keel-anchor.md`），与 frontmatter 的 name 必须一致，
这一约定与宿主技能发现机制兼容。

## 5. 配置

### 5.1 配置字段

```jsonc
// cordis.yml 补丁行的 config 字段
config: {
  "strictness": "relaxed",      // relaxed | strict
  "requireAssumptions": true,   // 审查规格书时要求同目录存在 ASSUMPTIONS*.md
  "maxFindings": 100            // 单次审查报告发现数量上限（1–1000）
}
```

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| strictness | string | relaxed | strict 将全部警告升级为错误 |
| requireAssumptions | boolean | true | 控制 KEEL-0207 检查 |
| maxFindings | number | 100 | 防止报告刷屏 |

### 5.2 校验行为

- 配置在加载期校验（src/manifest.ts 的 validateConfig）；
- 未知键、类型错误、越界值一律抛错拒绝加载，错误消息含修正指引；
- 未传 config 时使用默认值。

### 5.3 零依赖与类型说明

- 运行时零依赖：工具定义由本地 `forgeTool` 装配（src/tools.ts），
  不 import 宿主工具包；
- `src/types.ts` 提供宿主服务面的最小结构类型（Context/Tool/Skill），
  宿主真实对象在结构上满足这些接口；
- 若与完整类型库一同编译，可把 `src/types.ts` 的导入替换为
  `@deepseek-ai/cordis` 的 `Context`（仅类型层替换，不影响运行时）；
- 要求 ESM：package.json 声明 `"type": "module"`；Node ≥ 22.18（类型剥离默认开启，
  22.6–22.17 需附加 `--experimental-strip-types` 标志）。

## 6. 卸载与重载

- 卸载：从补丁中移除 keel 行（或禁用对应行）并重启 harness；
  注册的工具与技能随插件卸载自动撤销；
- 重载：修改 `skills/`、`templates/` 或 `src/` 后重载插件（配置热替换同样触发
  重载）；技能正文变更不改变目录结构，无需额外步骤；
- 发布形态：本目录整体即为可分发插件包（files 字段已列出发布内容），
  以 npm 包或目录复制两种形式安装均可。

## 7. 最小自检

接入后向模型询问「列出 keel 提供的技能与模板」，模型应调用 `keel_catalog` 并返回
五个技能与六个模板；再让模型对 `examples/SPEC.example.md` 运行 `keel_review`，
应返回「通过（0 错误 / 0 警告）」。
