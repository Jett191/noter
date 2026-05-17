'use client'

/**
 * QuizGroupCard —— `/quiz` 第二阶段（answering）的题组答题卡。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` `/quiz` 一节与 requirements 7.6 / 7.7 / 7.10 / 7.11。
 *
 * 渲染 questions 数组（**已脱敏，不含 correctAnswer**），每题独立填写答案：
 *   - single → radio 单选（选项原文字符串）
 *   - multi  → checkbox 多选（选项原文字符串数组）
 *   - fill   → 单行 input 短答
 *   - short  → textarea 简答
 *
 * 全部作答后一次性提交：仅向上层 caller 传 answers（key=index → 用户答案）；
 * caller（AIChatPanel）负责从 chatSession store 读 sessionId、构造
 * `{ documentId, sessionId, params: { answers } }` 经 useChatStream 发出，
 * **不**附带 command（前端拦截 `/quiz` 重复 command 以保护多轮状态机）。
 *
 * 安全约束：本组件 props 只接收 `QuizQuestion`（前端公开类型），永不应该看到
 * correctAnswer 字段；如收到 → 视为后端漏脱敏，不渲染。
 */

import { useId, useMemo, useState } from 'react'
import { ClipboardCheck, Loader2, Send } from 'lucide-react'

import { Badge } from '@noter/ui/components/badge'
import { Button } from '@noter/ui/components/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Checkbox } from '@noter/ui/components/checkbox'
import { Input } from '@noter/ui/components/input'
import { Label } from '@noter/ui/components/label'
import { Textarea } from '@noter/ui/components/textarea'
import { cn } from '@noter/ui/lib/utils'

import type {
  QuizDifficulty,
  QuizGroupPayload,
  QuizQuestion,
  QuizQuestionType
} from '@/types/agent'

export interface QuizGroupCardProps {
  payload: QuizGroupPayload
  /**
   * 提交回调；caller 负责附加 sessionId、构造请求体、调用 useChatStream.sendMessage。
   * answers 形如 `{ [questionIndex]: answer }`：
   *   - single → string（选项原文）
   *   - multi  → string[]（选项原文数组）
   *   - fill / short → string
   */
  onSubmit: (answers: Record<number, unknown>) => void
  /** caller 透传的提交中状态。可选。 */
  submitting?: boolean
}

const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  single: '单选',
  multi: '多选',
  fill: '填空',
  short: '简答'
}

const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  recall: '记忆',
  understand: '理解',
  apply: '应用'
}

/** answers state：key 为题号 index，value 为对应类型答案。 */
type AnswerMap = Record<number, unknown>

/** 判断单题是否已作答：用于「全部作答后才允许提交」。 */
function isQuestionAnswered(q: QuizQuestion, value: unknown): boolean {
  if (q.type === 'single') {
    return typeof value === 'string' && value.length > 0
  }
  if (q.type === 'multi') {
    return Array.isArray(value) && value.length > 0
  }
  // fill / short
  return typeof value === 'string' && value.trim().length > 0
}

export function QuizGroupCard({ payload, onSubmit, submitting = false }: QuizGroupCardProps) {
  const reactId = useId()
  const { questions } = payload

  const [answers, setAnswers] = useState<AnswerMap>({})

  const allAnswered = useMemo(
    () => questions.every((q) => isQuestionAnswered(q, answers[q.index])),
    [questions, answers]
  )

  const answeredCount = useMemo(
    () => questions.filter((q) => isQuestionAnswered(q, answers[q.index])).length,
    [questions, answers]
  )

  const setAnswer = (index: number, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [index]: value }))
  }

  const toggleMulti = (index: number, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[index]) ? (prev[index] as string[]) : []
      const next = current.includes(option)
        ? current.filter((x) => x !== option)
        : [...current, option]
      return { ...prev, [index]: next }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!allAnswered || submitting) return
    onSubmit(answers)
  }

  return (
    <Card className='border-primary/20 w-full'>
      <CardHeader className='space-y-2 pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <ClipboardCheck className='text-primary h-4 w-4' />
          答题卡
        </CardTitle>
        <p className='text-muted-foreground text-xs'>
          共 {questions.length} 题，全部作答后一次性提交。
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-5' id={`${reactId}-form`}>
          {questions.map((q, displayIdx) => (
            <QuestionItem
              key={q.index}
              question={q}
              displayNumber={displayIdx + 1}
              answer={answers[q.index]}
              onSingleSelect={(opt) => setAnswer(q.index, opt)}
              onMultiToggle={(opt) => toggleMulti(q.index, opt)}
              onTextChange={(text) => setAnswer(q.index, text)}
              disabled={submitting}
              fieldIdPrefix={`${reactId}-q${q.index}`}
            />
          ))}
        </form>
      </CardContent>

      <CardFooter className='flex items-center justify-between gap-3 border-t pt-3'>
        <div className='text-muted-foreground text-xs'>
          已作答 <span className='text-foreground font-medium'>{answeredCount}</span>
          <span className='text-muted-foreground/60'> / {questions.length}</span>
        </div>
        <Button
          type='submit'
          size='sm'
          form={`${reactId}-form`}
          disabled={!allAnswered || submitting}
          className='shrink-0 gap-1.5'>
          {submitting ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <Send className='h-3.5 w-3.5' />
          )}
          提交答卷
        </Button>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Question item
// ---------------------------------------------------------------------------

interface QuestionItemProps {
  question: QuizQuestion
  displayNumber: number
  answer: unknown
  onSingleSelect: (option: string) => void
  onMultiToggle: (option: string) => void
  onTextChange: (text: string) => void
  disabled: boolean
  fieldIdPrefix: string
}

function QuestionItem({
  question,
  displayNumber,
  answer,
  onSingleSelect,
  onMultiToggle,
  onTextChange,
  disabled,
  fieldIdPrefix
}: QuestionItemProps) {
  const typeLabel = QUESTION_TYPE_LABEL[question.type] ?? question.type
  const diffLabel = DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty

  return (
    <div className='space-y-3 rounded-md border p-3'>
      {/* 题号 + 题型 + 难度 */}
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <span className='bg-primary/10 text-primary inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold'>
            {displayNumber}
          </span>
          <Badge variant='secondary' className='text-xs'>
            {typeLabel}
          </Badge>
          <Badge variant='outline' className='text-xs'>
            {diffLabel}
          </Badge>
        </div>
      </div>

      {/* 题干 */}
      <p className='text-foreground text-sm leading-relaxed break-words'>{question.question}</p>

      {/* 答题区 */}
      {question.type === 'single' && (
        <SingleChoice
          options={question.options ?? []}
          value={typeof answer === 'string' ? answer : ''}
          onSelect={onSingleSelect}
          disabled={disabled}
          name={fieldIdPrefix}
        />
      )}

      {question.type === 'multi' && (
        <MultiChoice
          options={question.options ?? []}
          value={Array.isArray(answer) ? (answer as string[]) : []}
          onToggle={onMultiToggle}
          disabled={disabled}
          fieldIdPrefix={fieldIdPrefix}
        />
      )}

      {question.type === 'fill' && (
        <Input
          id={`${fieldIdPrefix}-fill`}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder='填写答案...'
          disabled={disabled}
          className='h-9 text-sm'
        />
      )}

      {question.type === 'short' && (
        <Textarea
          id={`${fieldIdPrefix}-short`}
          value={typeof answer === 'string' ? answer : ''}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder='请简要作答...'
          disabled={disabled}
          rows={3}
          className='text-sm'
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 子组件：single / multi 选项渲染
// ---------------------------------------------------------------------------

interface SingleChoiceProps {
  options: string[]
  value: string
  onSelect: (option: string) => void
  disabled: boolean
  name: string
}

function SingleChoice({ options, value, onSelect, disabled, name }: SingleChoiceProps) {
  return (
    <div className='flex flex-col gap-1.5'>
      {options.map((opt, idx) => {
        const id = `${name}-opt-${idx}`
        const checked = value === opt
        return (
          <Label
            key={id}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm leading-relaxed transition-colors',
              checked
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-input bg-background hover:bg-muted'
            )}>
            <input
              id={id}
              type='radio'
              name={name}
              value={opt}
              checked={checked}
              onChange={() => onSelect(opt)}
              disabled={disabled}
              className='accent-primary mt-0.5 h-3.5 w-3.5 shrink-0'
            />
            <span className='break-words'>{opt}</span>
          </Label>
        )
      })}
    </div>
  )
}

interface MultiChoiceProps {
  options: string[]
  value: string[]
  onToggle: (option: string) => void
  disabled: boolean
  fieldIdPrefix: string
}

function MultiChoice({ options, value, onToggle, disabled, fieldIdPrefix }: MultiChoiceProps) {
  return (
    <div className='flex flex-col gap-1.5'>
      {options.map((opt, idx) => {
        const id = `${fieldIdPrefix}-opt-${idx}`
        const checked = value.includes(opt)
        return (
          <Label
            key={id}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm leading-relaxed transition-colors',
              checked
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-input bg-background hover:bg-muted'
            )}>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => onToggle(opt)}
              disabled={disabled}
              className='mt-0.5'
            />
            <span className='break-words'>{opt}</span>
          </Label>
        )
      })}
    </div>
  )
}
