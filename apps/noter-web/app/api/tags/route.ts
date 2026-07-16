import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { createTagSchema } from '@/utils/feature/tags/schemas'

export const GET = handler(async () => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 查询用户所有未删除的标签
  const { data: tags, error: dbError } = await supabase
    .from('tags')
    .select('id, name, color, description, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .order('created_at', { ascending: false })

  if (dbError) {
    return error(dbError.message, 500)
  }

  // 查询每个标签关联的未删除文档数量
  const tagIds = (tags ?? []).map((tag) => tag.id)
  const documentCountMap: Record<string, number> = {}

  if (tagIds.length > 0) {
    const { data: docTags, error: countError } = await supabase
      .from('document_tags')
      .select('tag_id, document_id, documents!inner(deleted)')
      .eq('deleted', 0)
      .in('tag_id', tagIds)

    if (countError) {
      return error(countError.message, 500)
    }

    if (docTags) {
      for (const row of docTags) {
        const doc = row.documents as unknown as { deleted: number } | null
        if (doc && doc.deleted === 0) {
          const tagId = row.tag_id as string
          documentCountMap[tagId] = (documentCountMap[tagId] ?? 0) + 1
        }
      }
    }
  }

  // 组装返回数据
  const result = (tags ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    description: tag.description,
    documentCount: documentCountMap[tag.id] ?? 0,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at
  }))

  return success(result)
})

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 解析请求体
  const body = await request.json()
  const { name } = createTagSchema.parse(body)

  // 唯一约束 (user_id, name) 不区分 deleted，所以查同名记录时不能加 deleted=0
  // 否则用户创建过又删除的同名标签会触发 23505 唯一冲突
  const { data: existing } = await supabase
    .from('tags')
    .select('id, name, color, description, deleted, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('name', name)
    .maybeSingle()

  if (existing) {
    if (existing.deleted === 0) {
      return error('标签名称已存在', 400)
    }

    // 复活软删除的标签
    const { data: revived, error: reviveError } = await supabase
      .from('tags')
      .update({ deleted: 0 })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id, name, color, description, created_at, updated_at')
      .single()

    if (reviveError || !revived) {
      return error(reviveError?.message ?? '复活标签失败', 500)
    }

    return success(
      {
        id: revived.id,
        name: revived.name,
        color: revived.color,
        description: revived.description,
        documentCount: 0,
        createdAt: revived.created_at,
        updatedAt: revived.updated_at
      },
      '创建标签成功',
      201
    )
  }

  // 创建标签
  const { data: tag, error: insertError } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      name,
      deleted: 0
    })
    .select('id, name, color, description, created_at, updated_at')
    .single()

  if (insertError) {
    return error(insertError.message, 500)
  }

  return success(
    {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      description: tag.description,
      documentCount: 0,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at
    },
    '创建标签成功',
    201
  )
})
