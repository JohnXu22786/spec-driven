# 龙骨（keel）——规格驱动开发纪律技能包

> 先立规格，再谈代码。把「防翻车」从口号变成技能、工具与门禁。

keel 是一个自包含的插件化技能包：以五个技能（锚定 → 立规 → 探针 → 建造 → 审计）
约束 agent 的编码行为，以三个工具提供规格生成与纪律审查，以模板变体适配任务规模。
适用于 dsh（DeepSeek Harness）等一切皆插件的 harness，也可脱离 harness 单独使用。

## 为什么需要它

编码翻车的三大主因：

1. **规格缺失**——需求含糊就动手，实现方向错了返工最贵；
2. **假设未验证**——把「以为」当「事实」，方案建在流沙上；
3. **工程失控**——做得太多（过度工程）或做得偏了（范围蔓延）。

keel 的应对：**先写规格并验证假设，规格不过门禁禁止动手；实现期间用守则防过度工程、
用变更单防范围蔓延；交付前逐条验收审计。** 纪律以技能/提示词形式约束 agent 行为，
以工具形式提供确定性检查，不以人的自觉为依赖。

## 五步纪律环

| 步骤 | 技能 | 动作 | 产物 | 门禁 |
| --- | --- | --- | --- | --- |
| 1 锚定 | keel-anchor | 边界三问：要做什么、不做什么、成功长什么样 | 三句话 | 三句话均可验证 |
| 2 立规 | keel-spec | 按规模选模板，生成规格书 | SPEC.md | keel_review 零错误 |
| 3 探针 | keel-probe | 登记假设、标注风险、高风险先行验证 | ASSUMPTIONS.md | [高] 假设全部有结论（KEEL-0303 强制） |
| 4 建造 | keel-build | 按规格实现，遵守十条守则与范围护栏 | 代码 | 规格冻结、变更走变更单 |
| 5 审计 | keel-audit | 逐条核对验收标准，记录偏差与复盘 | AUDIT.md | 无未处置的 ❌（KEEL-0403 强制） |

失败复盘也走同一套纪律：先写失败原因规格，再验证假设，再动手修。

## 快速开始

### 方式一：接入 dsh（插件化 harness）

1. 将本目录放入项目，或复制到任意位置；
2. 创建 `cordis.yml` 补丁（可复制仓库根目录的 `cordis.example.yml`），指向本插件入口：

```yaml
- insert:
    - id: keel
      name: '/绝对路径/spec-driven/src/index.ts'
```

3. 启动 harness 并加载补丁：

```sh
dsh web --patch ./cordis.yml
```

加载后模型获得三个工具（`keel_catalog`、`keel_spec`、`keel_review`）与
五个技能（keel-anchor、keel-spec、keel-probe、keel-build、keel-audit）。
详细说明见 [docs/INTEGRATION.md](docs/INTEGRATION.md)。

### 方式二：脱离 harness 裸用（CLI）

```sh
node src/cli.ts catalog
node src/cli.ts scaffold spec SPEC.md "--title=示例" "--goal=目标" "--in_scope=- 行为" "--out_of_scope=- 不做" "--requirements=- R-01" "--acceptance=- AC-01" "--verification=命令"
node src/cli.ts review SPEC.md
```

值含空格时须加引号（如上）。`review` 退出码 0 表示无错误（可接入 CI 门禁），
1 表示存在错误。零依赖，Node ≥ 22.18 直接运行。

## 工具接口

| 工具 | 作用 |
| --- | --- |
| `keel_catalog` | 列出技能与模板清单（路由入口） |
| `keel_spec` | 按模板生成规格类文件（template/path/fields 三个参数，缺字段整体拒绝） |
| `keel_review` | 审查 SPEC/ASSUMPTIONS/AUDIT 文件，输出带规则编号与行号的报告 |

## 规格模板（含变体）

| 模板 | 规模 | 用途 |
| --- | --- | --- |
| `spec.minimal` | 微任务 | 单文件、单行为、半小时内完成 |
| `spec` | 标准 | 常规功能任务 |
| `spec.feature` | 大任务 | 涉及接口、数据与错误路径 |
| `assumptions` | — | 假设登记表（风险分级 + 验证结论） |
| `audit` | — | 验收审计表（结果 + 证据 + 偏差 + 复盘） |
| `change-request` | — | 变更单（规格冻结后范围变化的唯一入口） |

## 配置项

通过宿主补丁行的 `config` 字段传入（无 harness 时使用默认值）：

```jsonc
{
  "strictness": "relaxed",        // relaxed | strict（strict 将警告升级为错误）
  "requireAssumptions": true,     // 审查规格书时要求同目录存在 ASSUMPTIONS*.md
  "maxFindings": 100              // 单次审查报告发现数量上限（1–1000）
}
```

非法配置在加载期直接报错，消息含修正指引。

## 文档索引

- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) —— 方法论总述：五步纪律环、防过度工程十条守则、范围蔓延护栏、审查规则清单（KEEL-*）
- [docs/INTEGRATION.md](docs/INTEGRATION.md) —— dsh 接入说明：加载方式、注册接口、技能加载的三种方式、卸载与重载
- [docs/PLANNING_BRIDGE.md](docs/PLANNING_BRIDGE.md) —— 与规划/任务拆解类技能的衔接：规格产物如何作为规划输入
- [examples/](examples/) —— 合格示例（规格/假设/审计）与反例（演示审查引擎的发现能力）

## 开发

```sh
npm test          # node --test 全部测试（零测试依赖）
npm run typecheck # tsc --noEmit
npm run cli       # 裸用 CLI
```

运行测试与类型检查要求 Node ≥ 22.18；`npm install` 仅安装开发期类型包（typescript、@types/node），
运行时零依赖。
