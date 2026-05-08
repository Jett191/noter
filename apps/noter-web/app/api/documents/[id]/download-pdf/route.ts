import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { error } from '@/utils/http/response'
import { documentIdSchema } from '@/utils/feature/documents/schemas'

type RouteContext = { params: Promise<{ id: string }> }

// PDF 样式定义
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    lineHeight: 1.6
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 20,
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 6
  },
  content: {
    fontSize: 11,
    lineHeight: 1.8,
    marginBottom: 8
  },
  placeholder: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic'
  },
  keyPointItem: {
    fontSize: 11,
    marginBottom: 4,
    paddingLeft: 10
  },
  keywordContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6
  },
  keyword: {
    fontSize: 10,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center'
  }
})

/**
 * 构建 PDF 文档 React 元素
 */
function buildPdfDocument({
  title,
  markdownContent,
  summary,
  keyPoints,
  keywords,
  markdownOutline
}: {
  title: string
  markdownContent: string | null
  summary: string | null
  keyPoints: string[] | null
  keywords: string[] | null
  markdownOutline: string | null
}) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // 标题
      React.createElement(Text, { style: styles.title }, title),

      // 正文内容
      React.createElement(Text, { style: styles.sectionTitle }, '文档内容'),
      markdownContent
        ? React.createElement(Text, { style: styles.content }, markdownContent)
        : React.createElement(Text, { style: styles.placeholder }, '暂无内容'),

      // AI 总结
      React.createElement(Text, { style: styles.sectionTitle }, 'AI 总结'),
      summary
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.content }, summary),
            // 要点列表
            keyPoints && keyPoints.length > 0
              ? React.createElement(
                  View,
                  { style: { marginTop: 8 } },
                  React.createElement(
                    Text,
                    { style: { fontSize: 12, fontWeight: 700, marginBottom: 6 } },
                    '要点：'
                  ),
                  ...keyPoints.map((point, index) =>
                    React.createElement(
                      Text,
                      { key: String(index), style: styles.keyPointItem },
                      `• ${point}`
                    )
                  )
                )
              : null,
            // 关键词
            keywords && keywords.length > 0
              ? React.createElement(
                  View,
                  { style: { marginTop: 10 } },
                  React.createElement(
                    Text,
                    { style: { fontSize: 12, fontWeight: 700, marginBottom: 6 } },
                    '关键词：'
                  ),
                  React.createElement(
                    View,
                    { style: styles.keywordContainer },
                    ...keywords.map((kw, index) =>
                      React.createElement(Text, { key: String(index), style: styles.keyword }, kw)
                    )
                  )
                )
              : null
          )
        : React.createElement(Text, { style: styles.placeholder }, '暂无内容'),

      // 思维导图大纲
      React.createElement(Text, { style: styles.sectionTitle }, '思维导图大纲'),
      markdownOutline
        ? React.createElement(Text, { style: styles.content }, markdownOutline)
        : React.createElement(Text, { style: styles.placeholder }, '暂无内容'),

      // 页脚
      React.createElement(
        Text,
        {
          style: styles.footer,
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${pageNumber} / ${totalPages}`
        } as React.ComponentProps<typeof Text>,
        null
      )
    )
  )
}

/**
 * GET /api/documents/[id]/download-pdf
 * 生成并下载 PDF（包含文档正文、AI 总结、思维导图大纲）
 */
export const GET = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 查询文档主表
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, title')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (docError || !document) {
    return error('文档不存在', 404)
  }

  // 并行查询关联数据
  const [contentResult, summaryResult, mindmapResult] = await Promise.all([
    supabase
      .from('document_contents')
      .select('markdown_content')
      .eq('document_id', id)
      .eq('deleted', 0)
      .single(),
    supabase
      .from('document_summaries')
      .select('summary, key_points, keywords')
      .eq('document_id', id)
      .eq('deleted', 0)
      .single(),
    supabase
      .from('document_mindmaps')
      .select('markdown_outline')
      .eq('document_id', id)
      .eq('deleted', 0)
      .single()
  ])

  // 构建 PDF
  const pdfElement = buildPdfDocument({
    title: document.title,
    markdownContent: contentResult.data?.markdown_content ?? null,
    summary: summaryResult.data?.summary ?? null,
    keyPoints: summaryResult.data?.key_points ?? null,
    keywords: summaryResult.data?.keywords ?? null,
    markdownOutline: mindmapResult.data?.markdown_outline ?? null
  })

  try {
    const buffer = await renderToBuffer(pdfElement)

    // 生成文件名：{文档标题}_{YYYY-MM-DD}.pdf
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const filename = `${document.title}_${dateStr}.pdf`
    // RFC 5987 编码文件名以支持中文
    const encodedFilename = encodeURIComponent(filename)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      }
    })
  } catch (pdfError) {
    console.error('[download-pdf] renderToBuffer failed:', pdfError)
    return error(pdfError instanceof Error ? pdfError.message : 'PDF 生成失败', 500)
  }
})
