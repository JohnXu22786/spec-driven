# 变更日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- `package.json` 声明 `dsh.bundle`，新增 `cordis.patch.yml`：支持
  `dsh plugin --profile demo add github:JohnXu22786/spec-driven` 一键安装；
- README 与 docs/INTEGRATION.md 补充插件化安装（dsh.bundle）说明；
- `package.json` 补齐 `author` / `repository` / `homepage` / `bugs` 四项 npm 元数据；
- `cordis.example.yml` 中的硬编码个人绝对路径改为 `/绝对路径/...` 占位符，与其他文档保持一致；
- `package-lock.json` 根节点 `engines` 与 `package.json` 同步（原锁文件仍为 `node >=22.6.0`，缺少 `engines.dsh`）。

### 修复

- CLI `scaffold` 缺少必填字段时输出友好错误并退出码 2，不再打印堆栈；
- **strict 模式对 `KEEL-0207`（缺假设登记表）不生效**：该发现由 `reviewFile` 直接追加，绕过了各审查函数的警告升级路径。现在统一在报告收尾处按 `strict` 升级，与文档「strict 将全部警告升级为错误」一致。修复前 `strict` 下仍为「通过（0 错误 / 1 警告）」，修复后为「未通过（1 错误 / 0 警告）」并以退出码 1 拦截。

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