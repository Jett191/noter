// AI 模块类型定义

// 对话消息
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

// 对话请求
export interface ChatInput {
  documentId: string
  message: string
  conversationId?: string
}

// 对话响应
export interface ChatResponse {
  message: ChatMessage
  conversationId: string
}

// 文档摘要请求
export interface SummarizeInput {
  documentId: string
}

// 文档摘要响应
export interface SummaryResponse {
  summary: string
  keyPoints: string[]
}

// 内容解释请求
export interface ExplainInput {
  documentId: string
  selectedText: string
}

// 内容解释响应
export interface ExplainResponse {
  explanation: string
}

// AI 生成笔记请求
export interface GenerateNoteInput {
  documentId: string
  conversationId?: string
}

// AI 生成笔记响应
export interface GeneratedNote {
  content: string
  title: string
}

// 重点提炼请求
export interface KeyPointsInput {
  documentId: string
}

// 重点提炼响应
export interface KeyPointsResponse {
  keyPoints: string[]
}

// 逻辑梳理请求
export interface OutlineInput {
  documentId: string
}

// 逻辑梳理响应
export interface OutlineResponse {
  outline: string
}
