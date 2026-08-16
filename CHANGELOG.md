# 变更日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- `package.json` 声明 `dsh.bundle`，新增 `cordis.patch.yml`：支持
  `dsh plugin --profile demo add github:JohnXu22786/spec-driven` 一键安装；
- README 与 docs/INTEGRATION.md 补充插件化安装（dsh.bundle）说明。

### 修复

- CLI `scaffold` 缺少必填字段时输出友好错误并退出码 2，不再打印堆栈。

## [1.0.0] - 2026-08-16

初始版本：规格驱动开发纪律技能包（keel），可与 dsh 等 Cordis 系 harness 集成，
亦可脱离 harness 裸用。

### 新增

- 五个技能：keel-anchor / keel-spec / keel-probe / keel-build / keel-audit；
- 三个工具：keel_catalog / keel_spec / keel_review（JSON Schema 参数 + canonical 输出）；
- 六个规格模板：spec / spec.minimal / spec.feature / assumptions / audit / change-request；
- 确定性审查引擎（KEEL-01/02/03/04 规则系），strict 模式与 maxFindings 截断；
- 零依赖插件入口 `apply(ctx, config)` 与裸用 CLI（catalog / scaffold / review）；
- 中英双语 README 与 docs/（方法论、接入、规划衔接）文档。