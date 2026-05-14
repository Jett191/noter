'use client'

import { Tabs, TabsList, TabsTrigger } from '@noter/ui/components/tabs'
import type { TemplateType } from '@/types/document'
import { getAllTemplates } from './core/template-registry'

interface TemplateSwitcherProps {
  template: TemplateType
  onTemplateChange: (template: TemplateType) => void
}

const templateOptions = getAllTemplates().map((t) => ({
  value: t.name,
  label: t.label
}))

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
