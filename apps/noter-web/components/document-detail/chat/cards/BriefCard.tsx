'use client'

/**
 * BriefCard —— `/brief` Skill 输出的结构化卡片。
 *
 * 渲染 BriefPayload 五区块：
 *   1) docType        文档类型（论文 / 教程 / 报告 / ...）
 *   2) thesis         核心主张（一句话）
 *   3) chapterMap     章节地图（取 outline 前两层，按 level 缩进）
 *   4) audience       适合谁读
 *   5) readingPath    推荐阅读路径（sequential / skim / deep_dive
 *                     → 顺读 / 跳读 / 精读）
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` `/brief` Skill 一节
 * 与 requirements.md 需求 3.4：单轮 Skill，纯展示卡片，不可编辑。
 */

import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Badge } from '@noter/ui/components/badge'
import { cn } from '@noter/ui/lib/utils'
import { BookOpen, Compass, FileText, ListTree, Quote, Users } from 'lucide-react'
import type { BriefPayload, BriefReadingPath } from '@/types/agent'

interface BriefCardProps {
  payload: BriefPayload
}

/** 阅读路径英文枚举 → 中文标签 + 简介。 */
const READING_PATH_META: Record<BriefReadingPath, { label: string; hint: string }> = {
  sequential: { label: '顺读', hint: '从头到尾依次阅读' },
  skim: { label: '跳读', hint: '挑核心章节快速过一遍' },
  deep_dive: { label: '精读', hint: '逐段深读、配合笔记' }
}

export function BriefCard({ payload }: BriefCardProps) {
  const { docType, thesis, chapterMap, audience, readingPath } = payload
  const readingPathMeta = READING_PATH_META[readingPath] ??
    // 兜底：后端返回未知枚举值时不崩溃
    { label: readingPath, hint: '' }

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <BookOpen className='text-primary h-4 w-4' />
          文档速览
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        {/* 1) 文档类型 */}
        <Section icon={<FileText className='h-3.5 w-3.5' />} title='文档类型'>
          <Badge variant='secondary'>{docType}</Badge>
        </Section>

        {/* 2) 核心主张 */}
        <Section icon={<Quote className='h-3.5 w-3.5' />} title='核心主张'>
          <p className='text-foreground text-sm leading-relaxed'>{thesis}</p>
        </Section>

        {/* 3) 章节地图（按 level 缩进） */}
        <Section icon={<ListTree className='h-3.5 w-3.5' />} title='章节地图'>
          {chapterMap.length > 0 ? (
            <ul className='space-y-1'>
              {chapterMap.map((entry, index) => (
                <li
                  key={`${index}-${entry.title}`}
                  className='flex items-start gap-2 text-sm leading-relaxed'
                  // level 1 不缩进，每多一级缩进 12px；最大缩进到 level 6
                  style={{
                    paddingLeft: `${Math.max(0, Math.min(entry.level, 6) - 1) * 12}px`
                  }}>
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      entry.level <= 1 ? 'bg-primary' : 'bg-muted-foreground/40'
                    )}
                  />
                  <span
                    className={cn(
                      entry.level <= 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                    )}>
                    {entry.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-muted-foreground text-sm'>暂无章节信息</p>
          )}
        </Section>

        {/* 4) 适合谁读 */}
        <Section icon={<Users className='h-3.5 w-3.5' />} title='适合谁读'>
          <p className='text-foreground text-sm leading-relaxed'>{audience}</p>
        </Section>

        {/* 5) 推荐阅读路径 */}
        <Section icon={<Compass className='h-3.5 w-3.5' />} title='推荐阅读路径'>
          <div className='flex items-center gap-2'>
            <Badge variant='default'>{readingPathMeta.label}</Badge>
            {readingPathMeta.hint && (
              <span className='text-muted-foreground text-xs'>{readingPathMeta.hint}</span>
            )}
          </div>
        </Section>
      </CardContent>
    </Card>
  )
}

interface SectionProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

/** 五区块统一的小标题样式。 */
function Section({ icon, title, children }: SectionProps) {
  return (
    <div className='space-y-2'>
      <h4 className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase'>
        {icon}
        {title}
      </h4>
      <div>{children}</div>
    </div>
  )
}
