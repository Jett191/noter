import { z } from 'zod'

// AI 对话校验
export const chatSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确'),
  message: z.string().min(1, '消息不能为空').max(2000, '消息不能超过 2000 字'),
  conversationId: z.string().uuid('对话 ID 格式不正确').optional()
})
export type ChatInput = z.infer<typeof chatSchema>

// 文档摘要校验
export const summarizeSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确')
})
export type SummarizeInput = z.infer<typeof summarizeSchema>

// 内容解释校验
export const explainSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确'),
  selectedText: z.string().min(1, '选中文本不能为空')
})
export type ExplainInput = z.infer<typeof explainSchema>

// AI 生成笔记校验
export const generateNoteSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确'),
  conversationId: z.string().uuid('对话 ID 格式不正确').optional()
})
export type GenerateNoteInput = z.infer<typeof generateNoteSchema>

// 重点提炼校验
export const keyPointsSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确')
})
export type KeyPointsInput = z.infer<typeof keyPointsSchema>

// 逻辑梳理校验
export const outlineSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确')
})
export type OutlineInput = z.infer<typeof outlineSchema>
