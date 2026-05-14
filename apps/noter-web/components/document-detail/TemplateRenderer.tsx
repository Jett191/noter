'use client'

import { TemplateHost } from './core/TemplateHost'
import type { TemplateType } from '@/types/document'

interface TemplateRendererProps {
  markdownContent: string
  template: TemplateType
}

/**
 * 模板渲染器（向后兼容包装器）
 * 内部委托给新的 TemplateHost 架构
 */
export function TemplateRenderer({ markdownContent, template }: TemplateRendererProps) {
  return <TemplateHost markdownContent={markdownContent} template={template} />
}
