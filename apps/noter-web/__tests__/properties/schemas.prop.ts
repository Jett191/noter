import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  signUpSchema,
  signInSchema,
  emailConfirmSchema
} from '@/utils/noterFetch/feature/auth/schmas'
import {
  uploadSchema,
  updateDocSchema,
  visibilitySchema
} from '@/utils/noterFetch/feature/documents/schemas'
import {
  createAnnotationSchema,
  updateAnnotationSchema
} from '@/utils/noterFetch/feature/annotations/schemas'
import {
  chatSchema,
  summarizeSchema,
  explainSchema,
  generateNoteSchema,
  keyPointsSchema,
  outlineSchema
} from '@/utils/noterFetch/feature/ai/schemas'
import { searchSchema } from '@/utils/noterFetch/feature/search/schemas'

// Feature: smart-document-library, Property 26: 全局输入校验
// 对所有 schema 使用 fast-check 生成随机非法输入，验证 safeParse 返回失败
// 验证: 需求 1.2, 21.4

// --- 通用非法值生成器 ---

/** 生成非字符串类型的值 */
const nonStringArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.integer()),
  fc.dictionary(fc.string(), fc.integer())
)

/** 生成非法邮箱（不含 @，或格式明显错误） */
const invalidEmailArb = fc.oneof(
  fc.constant(''),
  fc.constant('plaintext'),
  fc.constant('missing-at.com'),
  fc.constant('@no-local.com'),
  fc.constant('spaces in@email.com'),
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('@'))
)

/** 生成过短密码（少于 6 位） */
const shortPasswordArb = fc.string({ minLength: 0, maxLength: 5 })

/** 生成非 UUID 字符串 */
const invalidUuidArb = fc.oneof(
  fc.constant(''),
  fc.constant('not-a-uuid'),
  fc.constant('12345'),
  fc.constant('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'),
  fc.string({ minLength: 1, maxLength: 10 })
)

/** 生成非法颜色值（不匹配 #RRGGBB） */
const invalidColorArb = fc.oneof(
  fc.constant(''),
  fc.constant('red'),
  fc.constant('#GGG'),
  fc.constant('#12345'),
  fc.constant('#1234567'),
  fc.constant('123456'),
  fc.constant('#ZZZZZZ')
)

describe('Property 26: 全局输入校验 — Auth Schemas', () => {
  it('signUpSchema: 非法邮箱应被拒绝', () => {
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        const result = signUpSchema.safeParse({
          email,
          password: 'validpass123',
          username: 'validuser'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('signUpSchema: 过短密码应被拒绝', () => {
    fc.assert(
      fc.property(shortPasswordArb, (password) => {
        const result = signUpSchema.safeParse({
          email: 'test@example.com',
          password,
          username: 'validuser'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('signUpSchema: 过短用户名应被拒绝', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1 }), (username) => {
        const result = signUpSchema.safeParse({
          email: 'test@example.com',
          password: 'validpass123',
          username
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('signUpSchema: 非字符串类型字段应被拒绝', () => {
    fc.assert(
      fc.property(nonStringArb, nonStringArb, nonStringArb, (email, password, username) => {
        const result = signUpSchema.safeParse({ email, password, username })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('signInSchema: 非法邮箱应被拒绝', () => {
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        const result = signInSchema.safeParse({
          email,
          password: 'validpass123'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('signInSchema: 过短密码应被拒绝', () => {
    fc.assert(
      fc.property(shortPasswordArb, (password) => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('emailConfirmSchema: 非法 type 应被拒绝', () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter((s) => !['email', 'signup', 'invite', 'recovery', 'email_change'].includes(s)),
        (type) => {
          const result = emailConfirmSchema.safeParse({
            type,
            token_hash: 'valid-token'
          })
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('emailConfirmSchema: 空 token_hash 应被拒绝', () => {
    const result = emailConfirmSchema.safeParse({
      type: 'email',
      token_hash: ''
    })
    expect(result.success).toBe(false)
  })
})

describe('Property 26: 全局输入校验 — Document Schemas', () => {
  it('uploadSchema: 描述超过 500 字应被拒绝', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 501, maxLength: 600 }), (description) => {
        const result = uploadSchema.safeParse({ description })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('updateDocSchema: 描述超过 500 字应被拒绝', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 501, maxLength: 600 }), (description) => {
        const result = updateDocSchema.safeParse({ description })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('visibilitySchema: 非法可见性值应被拒绝', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'private' && s !== 'shared'),
        (visibility) => {
          const result = visibilitySchema.safeParse({ visibility })
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('visibilitySchema: 非字符串类型应被拒绝', () => {
    fc.assert(
      fc.property(nonStringArb, (visibility) => {
        const result = visibilitySchema.safeParse({ visibility })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property 26: 全局输入校验 — Annotation Schemas', () => {
  it('createAnnotationSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = createAnnotationSchema.safeParse({
          documentId,
          snapshotId: '550e8400-e29b-41d4-a716-446655440000',
          annotationType: 'highlight',
          anchor: { blockId: '550e8400-e29b-41d4-a716-446655440000', charStart: 0, charEnd: 10 },
          selectedText: 'some text'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('createAnnotationSchema: 非法 annotationType 应被拒绝', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['underline', 'highlight', 'note'].includes(s)),
        (annotationType) => {
          const result = createAnnotationSchema.safeParse({
            documentId: '550e8400-e29b-41d4-a716-446655440000',
            snapshotId: '550e8400-e29b-41d4-a716-446655440000',
            annotationType,
            anchor: { blockId: '550e8400-e29b-41d4-a716-446655440000', charStart: 0, charEnd: 10 },
            selectedText: 'some text'
          })
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('createAnnotationSchema: 非法颜色格式应被拒绝', () => {
    fc.assert(
      fc.property(invalidColorArb, (color) => {
        const result = createAnnotationSchema.safeParse({
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          snapshotId: '550e8400-e29b-41d4-a716-446655440000',
          annotationType: 'highlight',
          color,
          anchor: { blockId: '550e8400-e29b-41d4-a716-446655440000', charStart: 0, charEnd: 10 },
          selectedText: 'some text'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('createAnnotationSchema: 负数 charStart/charEnd 应被拒绝', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: -1 }), (negVal) => {
        const result = createAnnotationSchema.safeParse({
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          snapshotId: '550e8400-e29b-41d4-a716-446655440000',
          annotationType: 'highlight',
          anchor: {
            blockId: '550e8400-e29b-41d4-a716-446655440000',
            charStart: negVal,
            charEnd: 10
          },
          selectedText: 'some text'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('createAnnotationSchema: 空 selectedText 应被拒绝', () => {
    const result = createAnnotationSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      snapshotId: '550e8400-e29b-41d4-a716-446655440000',
      annotationType: 'highlight',
      anchor: { blockId: '550e8400-e29b-41d4-a716-446655440000', charStart: 0, charEnd: 10 },
      selectedText: ''
    })
    expect(result.success).toBe(false)
  })

  it('updateAnnotationSchema: 空内容应被拒绝', () => {
    const result = updateAnnotationSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })

  it('updateAnnotationSchema: 非字符串 content 应被拒绝', () => {
    fc.assert(
      fc.property(nonStringArb, (content) => {
        const result = updateAnnotationSchema.safeParse({ content })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property 26: 全局输入校验 — AI Schemas', () => {
  it('chatSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = chatSchema.safeParse({
          documentId,
          message: 'hello'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('chatSchema: 空消息应被拒绝', () => {
    const result = chatSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      message: ''
    })
    expect(result.success).toBe(false)
  })

  it('chatSchema: 超长消息（>2000 字）应被拒绝', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 2001, maxLength: 2100 }), (message) => {
        const result = chatSchema.safeParse({
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          message
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('chatSchema: 非法 conversationId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (conversationId) => {
        const result = chatSchema.safeParse({
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'hello',
          conversationId
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('summarizeSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = summarizeSchema.safeParse({ documentId })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('explainSchema: 空 selectedText 应被拒绝', () => {
    const result = explainSchema.safeParse({
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      selectedText: ''
    })
    expect(result.success).toBe(false)
  })

  it('explainSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = explainSchema.safeParse({
          documentId,
          selectedText: 'some text'
        })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('generateNoteSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = generateNoteSchema.safeParse({ documentId })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('keyPointsSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = keyPointsSchema.safeParse({ documentId })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('outlineSchema: 非法 documentId 应被拒绝', () => {
    fc.assert(
      fc.property(invalidUuidArb, (documentId) => {
        const result = outlineSchema.safeParse({ documentId })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property 26: 全局输入校验 — Search Schema', () => {
  it('searchSchema: 空搜索关键词应被拒绝', () => {
    const result = searchSchema.safeParse({ q: '' })
    expect(result.success).toBe(false)
  })

  it('searchSchema: 超长关键词（>200 字）应被拒绝', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 201, maxLength: 300 }), (q) => {
        const result = searchSchema.safeParse({ q })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('searchSchema: 非法 mode 应被拒绝', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['keyword', 'semantic', 'hybrid'].includes(s)),
        (mode) => {
          const result = searchSchema.safeParse({ q: 'test', mode })
          expect(result.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('searchSchema: 非法 page 值应被拒绝', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 0 }), (page) => {
        const result = searchSchema.safeParse({ q: 'test', page })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('searchSchema: pageSize 超过 50 应被拒绝', () => {
    fc.assert(
      fc.property(fc.integer({ min: 51, max: 200 }), (pageSize) => {
        const result = searchSchema.safeParse({ q: 'test', pageSize })
        expect(result.success).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Property 26: 全局输入校验 — 完全随机输入', () => {
  const schemas = [
    { name: 'signUpSchema', schema: signUpSchema },
    { name: 'signInSchema', schema: signInSchema },
    { name: 'emailConfirmSchema', schema: emailConfirmSchema },
    { name: 'visibilitySchema', schema: visibilitySchema },
    { name: 'createAnnotationSchema', schema: createAnnotationSchema },
    { name: 'updateAnnotationSchema', schema: updateAnnotationSchema },
    { name: 'chatSchema', schema: chatSchema },
    { name: 'summarizeSchema', schema: summarizeSchema },
    { name: 'explainSchema', schema: explainSchema },
    { name: 'generateNoteSchema', schema: generateNoteSchema },
    { name: 'keyPointsSchema', schema: keyPointsSchema },
    { name: 'outlineSchema', schema: outlineSchema },
    { name: 'searchSchema', schema: searchSchema }
  ]

  for (const { name, schema } of schemas) {
    it(`${name}: 随机非对象输入应被拒绝`, () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.string(),
            fc.constant(null),
            fc.constant(undefined)
          ),
          (input) => {
            const result = schema.safeParse(input)
            expect(result.success).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  }
})
