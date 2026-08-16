---
name: change-request
description: 变更单——规格冻结后范围变化的唯一合法入口
fields: {"title":"变更单标题","requester":"请求人","created":"日期","spec_section":"原规格位置（小节或条目编号）","change":"变更内容","reason":"理由","impact":"影响范围（需求、验收标准、工作量）","decision":"决策（批准 / 驳回 / 推迟）","deferred_to":"推迟到（决策为推迟时填写）","approver":"批准人"}
---

# 变更单：{{title}}

> 本文件由 keel 生成。规格冻结后的一切新增与修改都必须先填本单，
> 批准后更新规格书，再继续实现。

| 字段 | 内容 |
| --- | --- |
| 请求人 | {{requester}} |
| 日期 | {{created}} |
| 原规格位置 | {{spec_section}} |
| 变更内容 | {{change}} |
| 理由 | {{reason}} |
| 影响范围 | {{impact}} |
| 决策 | {{decision}} |
| 推迟到 | {{deferred_to}} |
| 批准人 | {{approver}} |
