import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../src/index.ts'
import type { Context, ToolDefinition, SkillRegistration } from '../src/types.ts'

interface FakeCtxResult {
  ctx: Context
  tools: ToolDefinition[]
  skills: SkillRegistration[]
}

function createFakeCtx(options: { withTools?: boolean; withSkills?: boolean } = {}): FakeCtxResult {
  const tools: ToolDefinition[] = []
  const skills: SkillRegistration[] = []
  const ctx: Context = {
    ...(options.withTools !== false
      ? {
          tools: {
            register: (definition: ToolDefinition): (() => void) => {
              tools.push(definition)
              return () => {}
            },
          },
        }
      : {}),
    ...(options.withSkills !== false
      ? {
          skills: {
            register: (skill: SkillRegistration): (() => void) => {
              skills.push(skill)
              return () => {}
            },
          },
        }
      : {}),
  }
  return { ctx, tools, skills }
}

describe('插件入口 apply', () => {
  test('注册三个工具：keel_catalog / keel_spec / keel_review', () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const names = fake.tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['keel_catalog', 'keel_review', 'keel_spec'])
    for (const tool of fake.tools) {
      assert.ok(tool.description.length > 0)
      assert.ok(tool.parameters !== undefined)
      assert.equal(typeof tool.execute, 'function')
    }
  })

  test('skills 服务存在时注册五个内置技能', () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const names = fake.skills.map((s) => s.name).sort()
    assert.deepEqual(names, ['keel-anchor', 'keel-audit', 'keel-build', 'keel-probe', 'keel-spec'])
    for (const skill of fake.skills) {
      assert.ok(skill.description.length > 0)
      assert.ok(skill.content.length > 0)
    }
  })

  test('skills 服务缺失时不崩溃，工具仍注册', () => {
    const fake = createFakeCtx({ withSkills: false })
    apply(fake.ctx)
    assert.equal(fake.tools.length, 3)
    assert.equal(fake.skills.length, 0)
  })

  test('tools 服务缺失时明确报错', () => {
    const fake = createFakeCtx({ withTools: false })
    assert.throws(() => apply(fake.ctx), /tools/)
  })

  test('非法配置拒绝加载', () => {
    const fake = createFakeCtx()
    assert.throws(() => apply(fake.ctx, { strictness: '疯狂' }), /strictness/)
    assert.throws(() => apply(fake.ctx, { unknownKey: 1 }), /未知键/)
    assert.throws(() => apply(fake.ctx, { requireAssumptions: 'yes' }), /requireAssumptions/)
    assert.throws(() => apply(fake.ctx, { maxFindings: 0 }), /maxFindings/)
    assert.throws(() => apply(fake.ctx, 'not-an-object'), /必须是对象/)
  })

  test('合法配置正常加载', () => {
    const fake = createFakeCtx()
    apply(fake.ctx, { strictness: 'strict', requireAssumptions: false, maxFindings: 50 })
    assert.equal(fake.tools.length, 3)
  })

  test('工具执行：keel_catalog 列出技能与模板', async () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const catalog = fake.tools.find((t) => t.name === 'keel_catalog')
    assert.ok(catalog !== undefined)
    const output = String(await catalog.execute({}))
    assert.ok(output.includes('keel-spec'))
    assert.ok(output.includes('spec.feature'))
  })

  test('工具执行：keel_spec 未知模板报错', async () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const specTool = fake.tools.find((t) => t.name === 'keel_spec')
    assert.ok(specTool !== undefined)
    await assert.rejects(
      async () => {
        await specTool.execute({ template: 'nope', fields: { a: 'b' } })
      },
      /不存在/,
    )
  })

  test('工具执行：keel_spec 缺字段报错', async () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const specTool = fake.tools.find((t) => t.name === 'keel_spec')
    assert.ok(specTool !== undefined)
    await assert.rejects(
      async () => {
        await specTool.execute({ template: 'spec', fields: { title: 'x' } })
      },
      /规格不完整/,
    )
  })

  test('工具执行：keel_spec 空字段值同样报错', async () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const specTool = fake.tools.find((t) => t.name === 'keel_spec')
    assert.ok(specTool !== undefined)
    await assert.rejects(
      async () => {
        await specTool.execute({
          template: 'spec',
          fields: { title: 'x', goal: '', in_scope: 'a', out_of_scope: 'b', requirements: 'c', acceptance: 'd', verification: 'e' },
        })
      },
      /goal/,
    )
  })

  test('工具执行：keel_spec 答案含占位符形态文本时写出并提示', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-plugin-'))
    try {
      const fake = createFakeCtx()
      apply(fake.ctx)
      const specTool = fake.tools.find((t) => t.name === 'keel_spec')
      assert.ok(specTool !== undefined)
      const output = String(
        await specTool.execute({
          template: 'spec.minimal',
          path: join(dir, 'SPEC.md'),
          fields: {
            title: 'demo',
            goal: '包含 {{x}} 的文本',
            out_of_scope: '- 不做',
            acceptance: '- AC-01',
            verification: '- 命令',
          },
        }),
      )
      assert.ok(output.includes('已生成'))
      assert.ok(output.includes('KEEL-0102'))
      const written = readFileSync(join(dir, 'SPEC.md'), 'utf8')
      assert.ok(written.includes('包含 {{x}} 的文本'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('工具执行：keel_review 缺 path 报错', async () => {
    const fake = createFakeCtx()
    apply(fake.ctx)
    const reviewTool = fake.tools.find((t) => t.name === 'keel_review')
    assert.ok(reviewTool !== undefined)
    await assert.rejects(
      async () => {
        await reviewTool.execute({})
      },
      /缺少必填参数 path/,
    )
  })
})
