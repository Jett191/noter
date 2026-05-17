/**
 * LLMTool 单测：
 *   - completeJson 第一次非法 JSON / Zod 校验失败时自动重试一次
 *   - 重试后仍失败 → 抛 LLMValidationError
 *   - 提取 JSON 字符串：支持 ```json ``` 围栏 + 裸 JSON
 *   - JSON system 提示注入不破坏现有 system message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// 直接 stub 全局 fetch；MIMO_API_KEY 设个假值即可
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.MIMO_API_KEY = 'test-key'
  // 清理可能残留的 BASE_URL
  delete process.env.MIMO_BASE_URL
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

import { afterEach } from 'vitest'
import { completeJson, LLMValidationError, extractJsonString } from '../../src/tools/llm'

function mockFetchOnce(payload: { content: string }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: payload.content } }]
    }),
    text: async () => ''
  } as Response
}

describe('extractJsonString', () => {
  it('extracts JSON inside ```json ... ``` fence', () => {
    expect(extractJsonString('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('extracts JSON inside ``` ... ``` fence', () => {
    expect(extractJsonString('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('extracts first {...} from prose', () => {
    expect(extractJsonString('preface {"a":1} trailing')).toBe('{"a":1}')
  })

  it('extracts first [...] from prose', () => {
    expect(extractJsonString('xx [1, 2, 3] yy')).toBe('[1, 2, 3]')
  })

  it('returns trimmed input when no JSON pattern found', () => {
    expect(extractJsonString('  no json  ')).toBe('no json')
  })
})

describe('LLMTool.completeJson retry behavior', () => {
  it('returns parsed JSON on first attempt success', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockFetchOnce({ content: '{"x": 42}' }))
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    const result = await completeJson('hi', schema, { timeoutMs: 5000 })
    expect(result).toEqual({ x: 42 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('retries once when first response is invalid JSON', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockFetchOnce({ content: 'not json at all' }))
      .mockResolvedValueOnce(mockFetchOnce({ content: '{"x": 7}' }))
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    const result = await completeJson('hi', schema, { timeoutMs: 5000 })
    expect(result).toEqual({ x: 7 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('retries once when first response fails Zod validation', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockFetchOnce({ content: '{"y": 1}' }))
      .mockResolvedValueOnce(mockFetchOnce({ content: '{"x": 99}' }))
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    const result = await completeJson('hi', schema, { timeoutMs: 5000 })
    expect(result).toEqual({ x: 99 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('throws LLMValidationError after one retry still fails', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(mockFetchOnce({ content: 'garbage 1' }))
      .mockResolvedValueOnce(mockFetchOnce({ content: 'garbage 2' }))
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    await expect(completeJson('hi', schema, { timeoutMs: 5000 })).rejects.toBeInstanceOf(
      LLMValidationError
    )
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('does NOT retry more than once', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(mockFetchOnce({ content: 'always-bad' }))
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    await expect(completeJson('hi', schema, { timeoutMs: 5000 })).rejects.toThrow()
    // 1 次首发 + 1 次重试 = 2 次；不应该 3 次以上
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('preserves caller-provided system message and merges JSON hint', async () => {
    let capturedBody: string | undefined
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedBody = (init as RequestInit).body as string
      return mockFetchOnce({ content: '{"x":1}' })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const schema = z.object({ x: z.number() })
    await completeJson(
      [
        { role: 'system', content: 'you are an expert' },
        { role: 'user', content: 'q' }
      ],
      schema,
      { timeoutMs: 5000 }
    )
    expect(capturedBody).toBeDefined()
    const body = JSON.parse(capturedBody!)
    // system 角色第一条；内容包含原 system + JSON 强约束 hint
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('you are an expert')
    expect(body.messages[0].content).toMatch(/JSON/i)

    vi.unstubAllGlobals()
  })
})
