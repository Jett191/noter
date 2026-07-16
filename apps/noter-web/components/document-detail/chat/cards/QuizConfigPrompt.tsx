'use client'

/**
 * QuizConfigPrompt —— `/quiz` 第一阶段（configuring）的结构化配置表单。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` `/quiz` 一节与 requirements 7.1 / 7.3 / 7.4 / 7.5。
 *
 * 用户在此选择：
 *   - 题型：多选 checkbox（single / multi / fill / short），至少选一项
 *   - 题量：number input，UI 限制 [1, maxCount]，**仅 UI 限制**
 *   - 难度：单选（含 'mixed'），默认 mixed
 *
 * 重要安全约束（与后端契合）：
 *   - 表单 `count` 的 min=1, max=10 仅作 UI 限制，**后端不依赖前端校验**：
 *     `agent-runtime/src/skills/quiz.ts` 在进入 answering 阶段前会再次严格校验
 *     `count ∈ [1, 10]` 闭区间整数，超出区间直接发 SSE error 拒绝整个请求。
 *   - 提交时仅向上层 caller 传 config；**不**直接调 sendMessage。caller
 *     （AIChatPanel）负责从 chatSession store 读取 sessionId、构造
 *     `{ documentId, sessionId, params: { config } }` 并经 useChatStream 发出，
 *     **不**附带 command='/quiz'（前端拦截 `/quiz` 重复 command 以保护多轮状态机）。
 */

import { useId, useState } from 'react'
import { ClipboardList, ListChecks, ListOrdered, Loader2, Send } from 'lucide-react'

import { Badge } from '@noter/ui/components/badge'
import { Button } from '@noter/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Checkbox } from '@noter/ui/components/checkbox'
import { Input } from '@noter/ui/components/input'
import { Label } from '@noter/ui/components/label'
import { cn } from '@noter/ui/lib/utils'

import type {
  QuizConfig,
  QuizConfigDifficulty,
  QuizConfigPayload,
  QuizQuestionType
} from '@/types/agent'

export interface QuizConfigPromptProps {
  payload: QuizConfigPayload
  /**
   * 提交回调；caller 负责附加 sessionId、构造请求体、调用 useChatStream.sendMessage。
   * 本组件不直接读 store / 不直接发请求。
   */
  onSubmit: (config: QuizConfig) => void
  /** 是否处于提交中（caller 透传），用于禁用按钮。可选。 */
  submitting?: boolean
}

/** 题型 → 中文标签 */
const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  single: '单选',
  multi: '多选',
  fill: '填空',
  short: '简答'
}

/** 难度 → 中文标签 + 简介 */
const DIFFICULTY_META: Record<QuizConfigDifficulty, { label: string; hint: string }> = {
  recall: { label: '记忆', hint: '考察术语、定义的回忆' },
  understand: { label: '理解', hint: '考察概念之间的关系' },
  apply: { label: '应用', hint: '场景化、迁移性题目' },
  mixed: { label: '混合', hint: '记忆 / 理解 / 应用按比例混合' }
}

/** 默认题量。最小为 1（在 maxCount=10 时为 5）。 */
function defaultCount(maxCount: number): number {
  return Math.max(1, Math.min(5, maxCount))
}

export function QuizConfigPrompt({ payload, onSubmit, submitting = false }: QuizConfigPromptProps) {
  const reactId = useId()
  const { availableTypes, maxCount, difficulties } = payload

  const [selectedTypes, setSelectedTypes] = useState<QuizQuestionType[]>(() => {
    // 默认勾选首个题型，避免空提交
    return availableTypes.length > 0 ? [availableTypes[0]] : []
  })
  const [count, setCount] = useState<number>(() => defaultCount(maxCount))
  const [difficulty, setDifficulty] = useState<QuizConfigDifficulty>(() => {
    // 默认 mixed；若不在选项里则回落到第一个可用难度
    return difficulties.includes('mixed') ? 'mixed' : (difficulties[0] ?? 'mixed')
  })

  const toggleType = (type: QuizQuestionType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  // 提交按钮启用条件：至少一个题型 + count 在 [1, maxCount] 闭区间整数
  const isCountValid = Number.isInteger(count) && count >= 1 && count <= maxCount
  const isFormValid = selectedTypes.length > 0 && isCountValid && !submitting

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return
    onSubmit({
      questionTypes: selectedTypes,
      count,
      difficulty
    })
  }

  return (
    <Card className='border-primary/20 w-full'>
      <CardHeader className='space-y-2 pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <ClipboardList className='text-primary h-4 w-4' />
          配置测验
        </CardTitle>
        <p className='text-muted-foreground text-xs'>
          选择题型、题量和难度，点击「开始出题」生成题组。
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-5'>
          {/* 题型多选 */}
          <fieldset className='space-y-2'>
            <legend className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
              <ListChecks className='h-3.5 w-3.5' />
              题型 <span className='text-muted-foreground/70 text-xs font-normal'>(至少一项)</span>
            </legend>
            <div className='flex flex-wrap gap-2'>
              {availableTypes.map((type) => {
                const checkboxId = `${reactId}-type-${type}`
                const checked = selectedTypes.includes(type)
                return (
                  <label
                    key={type}
                    htmlFor={checkboxId}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                      checked
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted'
                    )}>
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      onCheckedChange={() => toggleType(type)}
                      disabled={submitting}
                    />
                    <span>{QUESTION_TYPE_LABEL[type] ?? type}</span>
                  </label>
                )
              })}
            </div>
            {selectedTypes.length === 0 && (
              <p className='text-destructive text-xs'>至少选择一种题型</p>
            )}
          </fieldset>

          {/* 题量 number input */}
          <div className='space-y-2'>
            <Label htmlFor={`${reactId}-count`} className='gap-1.5'>
              <ListOrdered className='h-3.5 w-3.5' />
              题量
              <span className='text-muted-foreground/70 text-xs font-normal'>(1 - {maxCount})</span>
            </Label>
            <Input
              id={`${reactId}-count`}
              type='number'
              inputMode='numeric'
              min={1}
              max={maxCount}
              step={1}
              value={count}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10)
                // 允许临时空值（设为 NaN）让用户清空再输入；提交时由 isCountValid 拦截
                setCount(Number.isNaN(next) ? 0 : next)
              }}
              disabled={submitting}
              className='h-9 w-28 text-sm'
              aria-invalid={!isCountValid}
            />
            {!isCountValid && (
              <p className='text-destructive text-xs'>请输入 1 至 {maxCount} 之间的整数</p>
            )}
          </div>

          {/* 难度单选 */}
          <fieldset className='space-y-2'>
            <legend className='text-foreground text-sm font-medium'>
              难度 <span className='text-muted-foreground/70 text-xs font-normal'>(默认混合)</span>
            </legend>
            <div className='flex flex-wrap gap-2'>
              {difficulties.map((d) => {
                const radioId = `${reactId}-diff-${d}`
                const meta = DIFFICULTY_META[d] ?? { label: d, hint: '' }
                const checked = difficulty === d
                return (
                  <label
                    key={d}
                    htmlFor={radioId}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                      checked
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted'
                    )}>
                    <input
                      id={radioId}
                      type='radio'
                      name={`${reactId}-difficulty`}
                      value={d}
                      checked={checked}
                      onChange={() => setDifficulty(d)}
                      disabled={submitting}
                      className='accent-primary h-3.5 w-3.5'
                    />
                    <span className='font-medium'>{meta.label}</span>
                    {meta.hint && (
                      <span className='text-muted-foreground/70 text-xs'>{meta.hint}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* 当前选择摘要 + 提交按钮 */}
          <div className='flex items-center justify-between gap-3 border-t pt-3'>
            <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
              <Badge variant='secondary'>{count} 题</Badge>
              <Badge variant='secondary'>{DIFFICULTY_META[difficulty]?.label ?? difficulty}</Badge>
              {selectedTypes.map((t) => (
                <Badge key={t} variant='outline'>
                  {QUESTION_TYPE_LABEL[t] ?? t}
                </Badge>
              ))}
            </div>
            <Button type='submit' size='sm' disabled={!isFormValid} className='shrink-0 gap-1.5'>
              {submitting ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Send className='h-3.5 w-3.5' />
              )}
              开始出题
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
