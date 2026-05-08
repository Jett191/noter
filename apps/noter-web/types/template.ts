import type { Components } from 'react-markdown'
import type { TemplateType } from './document'

export interface TemplateConfig {
  name: TemplateType
  label: string
  description: string
  wrapperClassName: string
  components: Partial<Components>
}

export type { TemplateType }
