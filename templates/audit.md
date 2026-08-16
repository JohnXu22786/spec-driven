---
name: audit
description: 验收审计表——对照验收标准逐条核对，记录结果、证据与偏差
fields: {"title":"审计标题（通常是任务或迭代名）","acceptance_item":"验收标准条目（引用规格书编号）","result":"结果（✅ 通过 / ❌ 未通过 / 跳过）","evidence":"证据（命令输出、测试结果、截图）","deviations":"偏差记录（未通过项、规格外代码、未回填假设）","retrospective":"复盘结论（下轮规格新增的边界或删除的守则例外）"}
---

# 验收审计：{{title}}

> 本文件由 keel 生成。逐条核对规格书验收标准；结果列填写 ✅ 通过 / ❌ 未通过 / 跳过（跳过须写理由）。

| 验收标准 | 结果 | 证据 |
| --- | --- | --- |
| {{acceptance_item}} | {{result}} | {{evidence}} |

## 偏差记录

{{deviations}}

## 复盘

{{retrospective}}
