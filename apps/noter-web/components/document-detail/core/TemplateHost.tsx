'use client'

import { BaseMarkdownRenderer } from './BaseMarkdownRenderer'
import { getTemplateConfig } from './template-registry'
import type { TemplateType } from '@/types/template'

interface TemplateHostProps {
  markdownContent: string
  template: TemplateType
}

export function TemplateHost({ markdownContent, template }: TemplateHostProps) {
  const config = getTemplateConfig(template)

  return <BaseMarkdownRenderer content={markdownContent} config={config} />
}
