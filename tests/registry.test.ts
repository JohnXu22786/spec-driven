import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRegistry, loadSkillsDir, loadTemplatesDir } from '../src/registry.ts'

const REPO_ROOT = join(import.meta.dirname, '..')

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'keel-registry-'))
  return dir
}

describe('注册表：真实目录', () => {
  test('发现 5 个技能与 6 个模板，且无 issue', () => {
    const registry = createRegistry(REPO_ROOT)
    assert.equal(registry.skills.length, 5)
    assert.equal(registry.templates.length, 6)
    assert.deepEqual(registry.issues, [])
  })

  test('技能名与文件名主干一致且为 kebab-case', () => {
    const registry = createRegistry(REPO_ROOT)
    for (const skill of registry.skills) {
      assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      assert.equal(skill.path, join(REPO_ROOT, 'skills', `${skill.name}.md`))
    }
    const names = registry.skills.map((s) => s.name).sort()
    assert.deepEqual(names, ['keel-anchor', 'keel-audit', 'keel-build', 'keel-probe', 'keel-spec'])
  })

  test('技能正文非空且 description 非空', () => {
    const registry = createRegistry(REPO_ROOT)
    for (const skill of registry.skills) {
      assert.ok(skill.content.length > 200, `技能 ${skill.name} 正文过短`)
      assert.ok(skill.description.length > 0)
      assert.ok(skill.whenToUse !== undefined, `技能 ${skill.name} 缺少 when-to-use`)
    }
  })

  test('模板 fields 解析为键值对象', () => {
    const registry = createRegistry(REPO_ROOT)
    const spec = registry.templates.find((t) => t.name === 'spec')
    assert.ok(spec !== undefined)
    assert.ok(Object.keys(spec.fields).length >= 5)
    const minimal = registry.templates.find((t) => t.name === 'spec.minimal')
    assert.ok(minimal !== undefined)
    assert.equal(minimal.size, 'minimal')
  })

  test('模板正文含占位符且不含模糊词（模板自身干净）', () => {
    const registry = createRegistry(REPO_ROOT)
    const vague = ['等等', '可能', '应该', '尽量', '适当', '相应', '类似', '差不多', '优化', '改进', '比较', '最好']
    for (const template of registry.templates) {
      for (const word of vague) {
        assert.ok(!template.content.includes(word), `模板 ${template.name} 含模糊词「${word}」`)
      }
      assert.ok(template.content.includes('{{'), `模板 ${template.name} 无占位符`)
    }
  })
})

describe('注册表：异常输入', () => {
  test('name 与文件名不一致的技能被跳过并记录 issue', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'mismatch.md'), '---\nname: other-name\ndescription: 描述\n---\n正文')
    const result = loadSkillsDir(dir)
    assert.equal(result.skills.length, 0)
    assert.equal(result.issues.length, 1)
    assert.ok(result.issues[0]!.includes('不一致'))
    rmSync(dir, { recursive: true, force: true })
  })

  test('缺少 description 的技能被跳过', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'keel-x.md'), '---\nname: keel-x\n---\n正文')
    const result = loadSkillsDir(dir)
    assert.equal(result.skills.length, 0)
    assert.ok(result.issues[0]!.includes('description'))
    rmSync(dir, { recursive: true, force: true })
  })

  test('非法 kebab 名（大写）被跳过', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'Keel-X.md'), '---\nname: Keel-X\ndescription: 描述\n---\n正文')
    const result = loadSkillsDir(dir)
    assert.equal(result.skills.length, 0)
    assert.ok(result.issues[0]!.includes('kebab'))
    rmSync(dir, { recursive: true, force: true })
  })

  test('frontmatter 未闭合的文件被跳过', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'keel-broken.md'), '---\nname: keel-broken\ndescription: 描述\n正文未闭合')
    const result = loadSkillsDir(dir)
    assert.equal(result.skills.length, 0)
    assert.equal(result.issues.length, 1)
    rmSync(dir, { recursive: true, force: true })
  })

  test('非 md 文件被忽略', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'notes.txt'), '不是技能')
    const result = loadSkillsDir(dir)
    assert.equal(result.skills.length, 0)
    assert.equal(result.issues.length, 0)
    rmSync(dir, { recursive: true, force: true })
  })

  test('目录缺失：空结果加 issue，不抛异常', () => {
    const missing = join(tempDir(), 'nope')
    const skills = loadSkillsDir(missing)
    assert.equal(skills.skills.length, 0)
    assert.equal(skills.issues.length, 1)
    const templates = loadTemplatesDir(missing)
    assert.equal(templates.templates.length, 0)
    assert.equal(templates.issues.length, 1)
  })

  test('同名模板重复：后者被跳过并记录 issue', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'a.md'), '---\nname: dup\n---\n正文 A')
    writeFileSync(join(dir, 'b.md'), '---\nname: dup\n---\n正文 B')
    const result = loadTemplatesDir(dir)
    assert.equal(result.templates.length, 1)
    assert.ok(result.templates[0]!.content.includes('A'))
    assert.equal(result.issues.length, 1)
    assert.ok(result.issues[0]!.includes('重复'))
    rmSync(dir, { recursive: true, force: true })
  })

  test('fields 非法（数组）时模板被跳过', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'bad.md'), '---\nname: bad\nfields: [1, 2]\n---\n正文')
    const result = loadTemplatesDir(dir)
    assert.equal(result.templates.length, 0)
    assert.ok(result.issues[0]!.includes('fields'))
    rmSync(dir, { recursive: true, force: true })
  })

  test('空目录合法：零技能零模板零 issue', () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'skills'))
    mkdirSync(join(dir, 'templates'))
    const registry = createRegistry(dir)
    assert.equal(registry.skills.length, 0)
    assert.equal(registry.templates.length, 0)
    assert.equal(registry.issues.length, 0)
    rmSync(dir, { recursive: true, force: true })
  })
})
