import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO_ROOT = join(import.meta.dirname, '..')
const CLI = join(REPO_ROOT, 'src', 'cli.ts')

function runCli(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('CLI 冒烟', () => {
  test('catalog 列出技能与模板', () => {
    const result = runCli(['catalog'], REPO_ROOT)
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes('keel-spec'))
    assert.ok(result.stdout.includes('spec.feature'))
  })

  test('scaffold 生成规格文件，review 零错误通过', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-cli-'))
    try {
      const scaffold = runCli(
        [
          'scaffold', 'spec', 'SPEC.md',
          '--title=demo',
          '--goal=目标',
          '--in_scope=- 范围内',
          '--out_of_scope=- 范围外',
          '--requirements=- R-01',
          '--acceptance=- AC-01',
          '--verification=命令',
        ],
        dir,
      )
      assert.equal(scaffold.status, 0, scaffold.stderr)
      assert.ok(existsSync(join(dir, 'SPEC.md')))
      assert.ok(readFileSync(join(dir, 'SPEC.md'), 'utf8').includes('规格书：demo'))

      const review = runCli(['review', 'SPEC.md'], dir)
      assert.equal(review.status, 0, review.stdout + review.stderr)
      assert.ok(review.stdout.includes('通过'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('review 不合格规格退出码为 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-cli-'))
    try {
      const counter = join(REPO_ROOT, 'examples', 'SPEC.counterexample.md')
      const result = runCli(['review', counter], dir)
      assert.equal(result.status, 1)
      assert.ok(result.stdout.includes('未通过'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('未知命令退出码为 2', () => {
    const result = runCli(['frobnicate'], REPO_ROOT)
    assert.equal(result.status, 2)
  })

  test('scaffold 缺字段：状态码 2 且消息列出缺失项，无堆栈', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-cli-'))
    try {
      const scaffold = runCli(['scaffold', 'spec', 'SPEC.md', '--title=demo'], dir)
      assert.equal(scaffold.status, 2)
      assert.ok(scaffold.stderr.includes('缺少以下字段'), scaffold.stderr)
      assert.ok(scaffold.stderr.includes('requirements'), scaffold.stderr)
      assert.ok(scaffold.stderr.includes('acceptance'), scaffold.stderr)
      assert.ok(!scaffold.stderr.includes('\n    at '), '不应输出堆栈')
      assert.ok(!existsSync(join(dir, 'SPEC.md')), '缺字段不应写出文件')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
