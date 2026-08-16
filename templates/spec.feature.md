---
name: spec.feature
description: 功能规格书——涉及接口、数据与错误路径的大任务
size: feature
fields: {"title":"规格标题","goal":"目标——要达成的结果（可观察、可度量）","in_scope":"范围内要做的（编号条目）","out_of_scope":"明确不做的（至少一条）","requirements":"需求条目（每条一个行为）","interfaces":"接口与数据（输入输出形状、数据结构、调用方式）","error_handling":"错误处理（每条错误路径的行为）","acceptance":"验收标准（每条可验证）","verification":"验证方法（命令、测试用例、人工步骤）"}
---

# 功能规格书：{{title}}

> 本文件由 keel 生成。填写全部字段后运行 keel_review，错误清零前禁止进入建造。

## 目标

{{goal}}

## 边界

**范围内**

{{in_scope}}

**范围外（明确不做的）**

{{out_of_scope}}

## 需求

{{requirements}}

## 接口与数据

{{interfaces}}

## 错误处理

{{error_handling}}

## 验收标准

{{acceptance}}

## 验证方法

{{verification}}
