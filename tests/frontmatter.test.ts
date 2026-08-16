import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter } from '../src/frontmatter.ts'

describe('frontmatter 解析', () => {
  test('裸标量：字符串、数字、布尔', () => {
    const text = '---\nname: keel-demo\ntimes: 3\nactive: true\n---\n正文'
    const result = parseFrontmatter(text)
    assert.equal(result.ok, true)
    assert.equal(result.hasFrontmatter, true)
    assert.equal(result.data['name'], 'keel-demo')
    assert.equal(result.data['times'], 3)
    assert.equal(result.data['active'], true)
    assert.equal(result.body, '正文')
  })

  test('值内允许冒号与中文标点', () => {
    const text = '---\nwhen-to-use: 任务开始：边界不清时\n---\n'
    const result = parseFrontmatter(text)
    assert.equal(result.ok, true)
    assert.equal(result.data['when-to-use'], '任务开始：边界不清时')
  })

  test('引号包裹的字符串保留内部冒号并去引号', () => {
    const text = "---\ndescription: \"带:冒号的文本\"\n---\n"
    const result = parseFrontmatter(text)
    assert.equal(result.data['description'], '带:冒号的文本')
  })

  test('JSON 对象值（fields）', () => {
    const text = '---\nfields: {"goal":"目标","acceptance":"验收标准"}\n---\n'
    const result = parseFrontmatter(text)
    assert.deepEqual(result.data['fields'], { goal: '目标', acceptance: '验收标准' })
  })

  test('注释行与空行被忽略', () => {
    const text = '---\n# 注释\n\nname: keel-demo\n---\n'
    const result = parseFrontmatter(text)
    assert.equal(result.data['name'], 'keel-demo')
    assert.equal(result.warnings.length, 0)
  })

  test('CRLF 输入正常解析', () => {
    const text = '---\r\nname: keel-demo\r\n---\r\n正文\r\n'
    const result = parseFrontmatter(text)
    assert.equal(result.ok, true)
    assert.equal(result.data['name'], 'keel-demo')
    assert.equal(result.body, '正文\n')
  })

  test('无 frontmatter 块：正文原样返回', () => {
    const text = '# 只有正文'
    const result = parseFrontmatter(text)
    assert.equal(result.hasFrontmatter, false)
    assert.equal(result.ok, true)
    assert.equal(result.body, '# 只有正文')
  })

  test('frontmatter 未闭合：ok 为 false 并给出错误', () => {
    const text = '---\nname: keel-demo\n# 缺少结束标记'
    const result = parseFrontmatter(text)
    assert.equal(result.ok, false)
    assert.ok(result.error !== undefined && result.error.includes('未闭合'))
  })

  test('重复键：后者胜出并记 warning', () => {
    const text = '---\nname: a\nname: b\n---\n'
    const result = parseFrontmatter(text)
    assert.equal(result.data['name'], 'b')
    assert.ok(result.warnings.some((w) => w.includes('重复')))
  })

  test('无法解析的行：记 warning 并继续', () => {
    const text = '---\nname: keel-demo\n这行不是键值对\n---\n'
    const result = parseFrontmatter(text)
    assert.equal(result.data['name'], 'keel-demo')
    assert.equal(result.warnings.length, 1)
  })

  test('非法 JSON 对象值：warning 且按原样保留', () => {
    const text = '---\nfields: {broken json}\n---\n'
    const result = parseFrontmatter(text)
    assert.equal(result.data['fields'], '{broken json}')
    assert.equal(result.warnings.length, 1)
  })
})
