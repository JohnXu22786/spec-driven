---
name: spec.minimal
description: 微任务规格书——单文件、单行为、半小时内完成的任务也要立规格
size: minimal
fields: {"title":"规格标题","goal":"目标——要达成的结果","out_of_scope":"明确不做的（至少一条）","acceptance":"验收标准（每条可验证）","verification":"验证方法"}
---

# 规格书（微任务）：{{title}}

> 本文件由 keel 生成。微任务也要过门禁：运行 keel_review，错误清零后再动手。

## 目标

{{goal}}

## 边界

**范围内**

完成{{title}}所述行为。

**范围外（明确不做的）**

{{out_of_scope}}

## 验收标准

{{acceptance}}

## 验证方法

{{verification}}
