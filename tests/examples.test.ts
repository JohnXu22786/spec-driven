import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { renderReport, reviewFile } from '../src/review.ts'

const EXAMPLES = join(import.meta.dirname, '..', 'examples')

const CONFIG = { strict: false, requireAssumptions: true, maxFindings: 100 }

describe('示例自洽性', () => {
  test('SPEC.example.md 零发现通过', () => {
    const report = reviewFile(join(EXAMPLES, 'SPEC.example.md'), CONFIG)
    assert.equal(report.passed, true, JSON.stringify(report.findings))
    assert.equal(report.findings.length, 0)
  })

  test('SPEC.example.md 在 strict 模式下同样零发现', () => {
    const report = reviewFile(join(EXAMPLES, 'SPEC.example.md'), { ...CONFIG, strict: true })
    assert.equal(report.passed, true)
  })

  test('ASSUMPTIONS.example.md 零发现通过', () => {
    const report = reviewFile(join(EXAMPLES, 'ASSUMPTIONS.example.md'), CONFIG)
    assert.equal(report.passed, true, JSON.stringify(report.findings))
    assert.equal(report.findings.length, 0)
  })

  test('AUDIT.example.md 零发现通过', () => {
    const report = reviewFile(join(EXAMPLES, 'AUDIT.example.md'), CONFIG)
    assert.equal(report.passed, true, JSON.stringify(report.findings))
    assert.equal(report.findings.length, 0)
  })

  test('SPEC.counterexample.md 被审查引擎标记', () => {
    const report = reviewFile(join(EXAMPLES, 'SPEC.counterexample.md'), CONFIG)
    assert.equal(report.passed, false)
    const rules = report.findings.map((f) => f.rule)
    assert.ok(rules.includes('KEEL-0101'), '缺少验收标准应报错')
    assert.ok(rules.includes('KEEL-0102'), '占位符残留应报错')
    assert.ok(rules.includes('KEEL-0203'), '边界缺失应警告')
    assert.ok(rules.includes('KEEL-0205'), '空需求应警告')
    assert.ok(report.findings.some((f) => f.rule === 'KEEL-0201' && f.severity === 'warning'))
  })

  test('审查报告文本渲染包含结论行', () => {
    const report = reviewFile(join(EXAMPLES, 'SPEC.counterexample.md'), CONFIG)
    const text = renderReport(report)
    assert.ok(text.includes('未通过'))
    assert.ok(text.includes('禁止进入建造'))
  })
})
