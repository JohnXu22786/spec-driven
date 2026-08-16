import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  detectKind,
  reviewAssumptionsText,
  reviewAuditText,
  reviewFile,
  reviewSpecText,
  type ReviewConfig,
} from '../src/review.ts'

function config(overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  return { strict: false, requireAssumptions: false, maxFindings: 100, ...overrides }
}

function specText(body: string): string {
  return `# 规格书：测试\n\n${body}`
}

function goodSpec(): string {
  return specText(`## 目标\n\n完成一个示例功能。\n\n## 边界\n\n**范围内**\n\n- 行为 A\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 需求\n\n- R-01 行为 A\n\n## 验收标准\n\n- AC-01 执行后结果可见\n\n## 验证方法\n\n- 运行 npm test`)
}

describe('规格审查', () => {
  test('合格规格零发现', () => {
    assert.deepEqual(reviewSpecText(goodSpec(), config()), [])
  })

  test('缺少必需小节（验收标准）报 KEEL-0101 错误', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n## 验证方法\n\n方法。'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0101')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
    assert.ok(rule.message.includes('验收标准'))
  })

  test('占位符残留报 KEEL-0102 错误并给出行号', () => {
    const findings = reviewSpecText(specText('## 目标\n\n目标 {{goal}}。\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config())
    const rule = findings.find((f) => f.rule === 'KEEL-0102')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
    assert.equal(rule.line, 5)
  })

  test('空目标报 KEEL-0106 错误', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0106')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
  })

  test('空验收标准报 KEEL-0103 错误且行号正确', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n## 验收标准\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0103' && f.severity === 'error')
    assert.ok(rule !== undefined)
    assert.equal(rule.line, 6)
  })

  test('未闭合代码围栏报 KEEL-0209 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 验证方法\n\n```bash\necho hi\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0209')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'warning')
  })

  test('模糊词报 KEEL-0201 警告且行号正确', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n应尽快完成。\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0201')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'warning')
    assert.equal(rule.line, 5)
    assert.ok(rule.message.includes('尽快'))
  })

  test('范围蔓延词报 KEEL-0202 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n完成目标，顺便做点别的。\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0202' && f.message.includes('顺便')))
  })

  test('边界小节缺失报 KEEL-0203 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0203'))
  })

  test('边界小节内无范围外报 KEEL-0204 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围内**\n\n- 行为\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0204' && f.message.includes('范围外')))
  })

  test('范围外无内容报 KEEL-0204 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0204')
    assert.ok(rule !== undefined)
    assert.ok(rule.message.includes('没有内容'))
  })

  test('空需求报 KEEL-0205 警告，空验证方法报 KEEL-0208 警告', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 需求\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n'),
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0205'))
    assert.ok(findings.some((f) => f.rule === 'KEEL-0208'))
  })

  test('frontmatter 块内的行不参与词检查', () => {
    const findings = reviewSpecText(
      '---\ndescription: 应尽快完成\n---\n' + specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('闭合围栏短于起始围栏时不闭合，报 KEEL-0209', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验证方法\n\n- 运行命令\n\n````\n```\n内容\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0209')
    assert.ok(rule !== undefined, JSON.stringify(findings))
    assert.equal(rule.severity, 'warning')
    assert.ok(findings.some((f) => f.rule === 'KEEL-0101'), '围栏未闭合时其内小节不建节，应报缺少必需小节')
  })

  test('嵌套围栏（外层更长）不误报未闭合', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验证方法\n\n- 运行命令\n\n````\n```bash\n内部内容\n```\n````\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('围栏内缩进的围栏行不参与闭合判定', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验证方法\n\n- 运行命令\n\n```\n    ```\n内容\n```\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('围栏内混用不同字符不闭合原围栏', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验证方法\n\n- 运行命令\n\n```\n~~~\n内容\n```\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('frontmatter 起始行带尾随空格同样被隐藏', () => {
    const findings = reviewSpecText(
      '--- \ndescription: 应尽快完成\n---\n' + specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('未闭合 frontmatter：整文件隐藏，只报小节缺失', () => {
    const findings = reviewSpecText(
      '---\ndescription: 应尽快完成 {{goal}}\n## 目标\n\n目标。',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0101'))
    assert.ok(!findings.some((f) => f.rule === 'KEEL-0102' || f.rule === 'KEEL-0201'))
  })

  test('strict 模式将警告升级为错误', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n应尽快完成。\n\n## 验收标准\n\n- AC-01 可验证\n\n## 验证方法\n\n- 命令'),
      config({ strict: true }),
    )
    assert.ok(findings.length > 0)
    for (const finding of findings) {
      assert.equal(finding.severity, 'error')
    }
  })

  test('代码围栏内的词与占位符不误报', () => {
    const findings = reviewSpecText(
      specText('## 目标\n\n目标。\n\n## 边界\n\n**范围外（明确不做的）**\n\n- 不做行为 B\n\n## 验证方法\n\n- 运行命令\n\n```bash\necho "应尽快完成 {{goal}}"\n```\n\n## 验收标准\n\n- AC-01 可验证'),
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('围栏内的小节标题不建节', () => {
    const findings = reviewSpecText(
      specText('```\n## 验收标准\n```\n\n## 目标\n\n目标。\n\n## 验证方法\n\n- 命令'),
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0101' && f.message.includes('验收标准')))
  })
})

describe('假设登记表审查', () => {
  test('空表报 KEEL-0301 错误', () => {
    const findings = reviewAssumptionsText('# 假设登记表\n\n（空）', config())
    assert.ok(findings.some((f) => f.rule === 'KEEL-0301' && f.severity === 'error'))
  })

  test('未标注风险等级报 KEEL-0302 错误', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n| 编号 | 假设 |\n| --- | --- |\n| A-01 | 框架支持批量写入 |',
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0302')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
  })

  test('高风险未验证报 KEEL-0303 错误', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n| 假设 | 风险 |\n| --- | --- |\n| 框架支持批量写入 | [高] |',
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0303')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
  })

  test('合格登记表零发现', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n| 假设 | 风险 | 结论 |\n| --- | --- | --- |\n| 框架支持批量写入 | [高] | ✅ 已验证 |\n| 数据量不大 | [低] | ✅ 已验证 |',
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('列表写法：高风险条目内联验证结论即通过', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n- A-01 框架支持批量写入 [高] ✅ 已验证\n- A-02 数据量不大 [低]',
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('列表写法：未标注风险等级报 KEEL-0302', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n- A-01 框架支持批量写入',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0302' && f.severity === 'error'))
  })

  test('列表写法：高风险未回填结论报 KEEL-0303', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n- A-01 框架支持批量写入 [高]',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0303' && f.severity === 'error'))
  })
})

describe('验收审计审查', () => {
  test('空审计报 KEEL-0401 错误', () => {
    assert.ok(reviewAuditText('# 验收审计\n\n（空）', config()).some((f) => f.rule === 'KEEL-0401'))
  })

  test('缺结果标记报 KEEL-0402 警告', () => {
    const findings = reviewAuditText(
      '# 验收审计\n\n| 验收标准 | 结果 |\n| --- | --- |\n| AC-01 目标达成 | 结果未知 |',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0402'))
  })

  test('存在 ❌ 未通过项报 KEEL-0403 错误', () => {
    const findings = reviewAuditText(
      '# 验收审计\n\n| 验收标准 | 结果 |\n| --- | --- |\n| AC-01 目标达成 | ❌ 未通过 |',
      config(),
    )
    const rule = findings.find((f) => f.rule === 'KEEL-0403')
    assert.ok(rule !== undefined)
    assert.equal(rule.severity, 'error')
  })

  test('证据列提及 ❌ 而结果列为 ✅ 时不计为未通过', () => {
    const findings = reviewAuditText(
      '# 验收审计\n\n| 验收标准 | 结果 | 证据 |\n| --- | --- | --- |\n| AC-01 目标达成 | ✅ 通过 | 首轮输出 ❌ 乱码，修复后通过 |',
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('假设表验证标记在中间列、结论列未回填时仍报 KEEL-0303', () => {
    const findings = reviewAssumptionsText(
      '# 假设登记表\n\n| 假设 | 验证记录 | 风险 |\n| --- | --- | --- |\n| 框架支持批量写入 | ✅ 已验证 | [高] |',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0303'))
  })

  test('合格审计零发现', () => {
    const findings = reviewAuditText(
      '# 验收审计\n\n| 验收标准 | 结果 |\n| --- | --- |\n| AC-01 目标达成 | ✅ 通过 |\n| AC-02 边界正确 | 跳过（无此场景） |',
      config(),
    )
    assert.deepEqual(findings, [])
  })

  test('列表行不参与审计数据行（审计只认表格行）', () => {
    const findings = reviewAuditText(
      '# 验收审计\n\n- AC-01 目标达成 ✅ 通过',
      config(),
    )
    assert.ok(findings.some((f) => f.rule === 'KEEL-0401'), '仅列表行时审计应视为空')
  })
})

describe('文件级审查与种类识别', () => {
  test('种类识别', () => {
    assert.equal(detectKind('SPEC.md'), 'spec')
    assert.equal(detectKind('SPEC-2024.md'), 'spec')
    assert.equal(detectKind('ASSUMPTIONS.md'), 'assumptions')
    assert.equal(detectKind('AUDIT.example.md'), 'audit')
    assert.equal(detectKind('README.md'), 'unknown')
  })

  test('未知种类报 KEEL-0001 错误', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-review-'))
    try {
      const path = join(dir, 'README.md')
      writeFileSync(path, '内容')
      const report = reviewFile(path, config())
      assert.equal(report.passed, false)
      assert.ok(report.findings.some((f) => f.rule === 'KEEL-0001'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('文件不可读报 KEEL-0001 错误', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-review-'))
    try {
      const path = join(dir, 'SPEC-missing.md')
      const report = reviewFile(path, config())
      assert.equal(report.passed, false)
      assert.ok(report.findings.some((f) => f.rule === 'KEEL-0001'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('requireAssumptions：无登记表时报 KEEL-0207 警告', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-review-'))
    try {
      const path = join(dir, 'SPEC.md')
      writeFileSync(path, goodSpec())
      const report = reviewFile(path, config({ requireAssumptions: true }))
      assert.ok(report.findings.some((f) => f.rule === 'KEEL-0207'))
      writeFileSync(join(dir, 'ASSUMPTIONS.md'), '# 假设登记表\n')
      const reportWith = reviewFile(path, config({ requireAssumptions: true }))
      assert.ok(!reportWith.findings.some((f) => f.rule === 'KEEL-0207'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('maxFindings 截断展示但不翻转门禁结论', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-review-'))
    try {
      // 12 行模糊词警告 + 末尾 1 个占位符错误（按行号排序后落在截断窗口之外），maxFindings=5
      const lines: string[] = ['# 规格书：测试', '', '## 目标', '', '目标。', '']
      for (let i = 0; i < 12; i++) {
        lines.push(`应尽快完成第 ${i} 项。`, '')
      }
      lines.push(
        '## 验收标准', '', '- AC-01 可验证', '',
        '## 验证方法', '', '- 命令', '',
        '## 边界', '', '**范围外（明确不做的）**', '',
        '- 不做行为 B', '',
        '残留占位符 {{goal}}',
      )
      const path = join(dir, 'SPEC.md')
      writeFileSync(path, lines.join('\n'))
      const report = reviewFile(path, config({ maxFindings: 5 }))
      assert.equal(report.truncated, true)
      assert.equal(report.findings.length, 5)
      assert.equal(report.passed, false, '截断不应让含错误的规格显示为通过')
      assert.ok(report.errors >= 1, '错误计数应按全部发现判定')
      assert.ok(report.warnings >= 12)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
