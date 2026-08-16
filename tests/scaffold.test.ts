import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ScaffoldError, collectPlaceholders, renderTemplate, scaffoldToFile } from '../src/scaffold.ts'
import { createRegistry, findTemplate } from '../src/registry.ts'

const REPO_ROOT = join(import.meta.dirname, '..')

function specTemplate() {
  const registry = createRegistry(REPO_ROOT)
  const template = findTemplate(registry, 'spec')
  assert.ok(template !== undefined, 'spec 模板应存在')
  return template
}

describe('脚手架', () => {
  test('渲染替换全部占位符', () => {
    const template = specTemplate()
    const answers = {
      title: 'demo',
      goal: '目标文本',
      in_scope: '- 范围内',
      out_of_scope: '- 范围外',
      requirements: '- R-01',
      acceptance: '- AC-01',
      verification: '命令',
    }
    const content = renderTemplate(template, answers)
    assert.ok(!content.includes('{{'))
    assert.ok(content.includes('目标文本'))
    assert.ok(content.includes('规格书：demo'))
  })

  test('缺少任一字段即整体拒绝并列出缺失项', () => {
    const template = specTemplate()
    assert.throws(
      () => renderTemplate(template, { title: 'demo' }),
      (error: unknown) => {
        assert.ok(error instanceof ScaffoldError)
        assert.ok(error.missing.includes('goal'))
        assert.ok(error.missing.includes('acceptance'))
        assert.ok(error.missing.includes('verification'))
        return true
      },
    )
  })

  test('答案中的占位符形态文本不被递归替换', () => {
    const template = specTemplate()
    const answers = {
      title: 'demo',
      goal: '包含 {{x}} 字样的文本',
      in_scope: 'x',
      out_of_scope: 'x',
      requirements: 'x',
      acceptance: 'x',
      verification: 'x',
    }
    const content = renderTemplate(template, answers)
    assert.ok(content.includes('包含 {{x}} 字样的文本'))
  })

  test('collectPlaceholders 按出现顺序去重', () => {
    const template = { ...specTemplate(), content: '{{b}} {{a}} {{b}} {{c}}' }
    assert.deepEqual(collectPlaceholders(template), ['b', 'a', 'c'])
  })

  test('写出文件并创建父目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-scaffold-'))
    try {
      const template = specTemplate()
      const outPath = join(dir, 'sub', 'nested', 'SPEC.md')
      const answers = {
        title: 'demo',
        goal: '目标',
        in_scope: '- 范围内',
        out_of_scope: '- 范围外',
        requirements: '- R-01',
        acceptance: '- AC-01',
        verification: '命令',
      }
      const result = scaffoldToFile(template, answers, outPath)
      assert.equal(result.outPath, outPath)
      assert.ok(existsSync(outPath))
      assert.equal(readFileSync(outPath, 'utf8'), result.content)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('空字符串答案视为未作答', () => {
    const template = specTemplate()
    assert.throws(
      () => renderTemplate(template, { ...allAnswers(), goal: '   ' }),
      (error: unknown) => {
        assert.ok(error instanceof ScaffoldError)
        assert.ok(error.missing.includes('goal'))
        return true
      },
    )
  })

  test('原型链键名（如 constructor）不被当作已作答', () => {
    const template = { ...specTemplate(), content: '前 {{constructor}} 后' }
    assert.throws(
      () => renderTemplate(template, {}),
      (error: unknown) => {
        assert.ok(error instanceof ScaffoldError)
        assert.ok(error.missing.includes('constructor'))
        return true
      },
    )
  })

  test('minimal 变体只要求五个字段', () => {
    const registry = createRegistry(REPO_ROOT)
    const minimal = findTemplate(registry, 'spec.minimal')
    assert.ok(minimal !== undefined)
    const fields = collectPlaceholders(minimal)
    assert.deepEqual(fields.sort(), ['acceptance', 'goal', 'out_of_scope', 'title', 'verification'].sort())
  })
})

function allAnswers(): Record<string, string> {
  return {
    title: 'demo',
    goal: '目标',
    in_scope: '- 范围内',
    out_of_scope: '- 范围外',
    requirements: '- R-01',
    acceptance: '- AC-01',
    verification: '命令',
  }
}
