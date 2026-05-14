import type { TemplateConfig, TemplateType } from '@/types/template'
import { defaultTemplate } from '../templates/default'
import { academicTemplate } from '../templates/academic'
import { compactTemplate } from '../templates/compact'
import { cardTemplate } from '../templates/card'

const registry: Record<TemplateType, TemplateConfig> = {
  default: defaultTemplate,
  academic: academicTemplate,
  compact: compactTemplate,
  card: cardTemplate
}

export function getTemplateConfig(name: TemplateType): TemplateConfig {
  return registry[name] ?? registry.default
}

export function getAllTemplates(): TemplateConfig[] {
  return Object.values(registry)
}

export { registry as templateRegistry }
