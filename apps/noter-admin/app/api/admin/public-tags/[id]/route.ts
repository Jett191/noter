import 'server-only'

/**
 * PATCH /api/admin/public-tags/[id]
 *
 * 编辑公共标签:更新 name,写 audit log。
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 21:
 *   - 受 requireAdmin() 保护
 *   - 目标标签必须 is_official=true AND deleted=0,否则 404
 *   - name 在 is_official=true AND deleted=0 范围内唯一(数据库 partial unique index),冲突 → 409
 */

import { withRouteHandler, NotFoundError, ValidationError, ConflictError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

interface UpdateTagBody {
  name?: string
}

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: tagId } = await params

  // ─── 3. 解析请求体 ───
  const body = (await request.json()) as UpdateTagBody

  // ─── 4. 参数校验 ───
  if (body.name === undefined) {
    throw new ValidationError('至少需要提供 name 字段')
  }

  if (!body.name.trim()) {
    throw new ValidationError('name 不能为空')
  }

  // ─── 5. 校验标签存在且为公共标签(is_official=true AND deleted=0) ───
  const adminClient = getSupabaseAdmin()

  const { data: tag, error: tagError } = await adminClient
    .from('tags')
    .select('id, name')
    .eq('id', tagId)
    .eq('is_official', true)
    .eq('deleted', 0)
    .single()

  if (tagError || !tag) {
    throw new NotFoundError('公共标签不存在')
  }

  // ─── 6. 执行更新 ───
  const { error: updateError } = await adminClient
    .from('tags')
    .update({
      name: body.name.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', tagId)

  if (updateError) {
    // 23505 = unique_violation (name 重复)
    if ((updateError as { code?: string }).code === '23505') {
      throw new ConflictError('公共标签名称已存在')
    }
    throw new Error(`更新公共标签失败: ${updateError.message}`)
  }

  // ─── 7. 写 audit log ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_tag.update',
    targetResourceType: 'public_tag',
    targetResourceId: tagId,
    targetResourceLabel: body.name.trim(),
    metadata: {
      before: { name: tag.name },
      after: { name: body.name.trim() }
    },
    request
  })

  return success({ id: tagId, updated: true })
}

export const PATCH = withRouteHandler(handler, { timeoutMs: 10_000 })
