'use client'

import { BookOpen, FileText, Files, LayoutGrid, Type } from 'lucide-react'
import { Button } from '@noter/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@noter/ui/components/dropdown-menu'
import type { TemplateType } from '@/types/document'
import { getAllTemplates } from './core/template-registry'

interface TemplateSwitcherProps {
  template: TemplateType
  onTemplateChange: (template: TemplateType) => void
}

const TEMPLATE_ICONS: Record<TemplateType, React.ComponentType<{ className?: string }>> = {
  default: FileText,
  academic: BookOpen,
  compact: Files,
  card: LayoutGrid
}

const templates = getAllTemplates()

export function TemplateSwitcher({ template, onTemplateChange }: TemplateSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          className='rounded-full'
          aria-label='切换阅读样式'
          title='切换阅读样式'>
          <Type className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel className='text-muted-foreground text-xs font-normal'>
          阅读样式
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((t) => {
          const Icon = TEMPLATE_ICONS[t.name] ?? Type
          const active = t.name === template
          return (
            <DropdownMenuItem
              key={t.name}
              onSelect={() => onTemplateChange(t.name)}
              className='gap-3 py-2'>
              <Icon className='text-muted-foreground h-4 w-4 shrink-0' />
              <div className='flex min-w-0 flex-1 flex-col'>
                <span className='text-foreground text-sm leading-tight'>{t.label}</span>
                {t.description && (
                  <span className='text-muted-foreground text-xs'>{t.description}</span>
                )}
              </div>
              {active && (
                <span
                  aria-hidden
                  className='bg-chart-1 ring-chart-1/30 h-2.5 w-2.5 shrink-0 rounded-full ring-4'
                />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
