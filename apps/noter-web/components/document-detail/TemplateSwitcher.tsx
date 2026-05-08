'use client'

import { Tabs, TabsList, TabsTrigger } from '@noter/ui/components/tabs'
import type { TemplateType } from '@/types/document'

interface TemplateSwitcherProps {
  template: TemplateType
  onTemplateChange: (template: TemplateType) => void
}

const templateOptions: { value: TemplateType; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'academic', label: '学术' },
  { value: 'clean', label: '简洁' },
  { value: 'card', label: '卡片' }
]

export function TemplateSwitcher({ template, onTemplateChange }: TemplateSwitcherProps) {
  return (
    <Tabs value={template} onValueChange={(value) => onTemplateChange(value as TemplateType)}>
      <TabsList>
        {templateOptions.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
