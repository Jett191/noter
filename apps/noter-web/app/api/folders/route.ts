import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { createFolderSchema } from '@/utils/feature/folders/schemas'

export const GET = handler(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 获取所有文件夹
  const { data: folders, error: dbError } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (dbError) return error(dbError.message, 500)

  // 统计每个文件夹的文档数量
  const { data: docCounts } = await supabase
    .from('documents')
    .select('folder_id')
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .not('folder_id', 'is', null)

  const countMap: Record<string, number> = {}
  for (const doc of docCounts ?? []) {
    if (doc.folder_id) {
      countMap[doc.folder_id] = (countMap[doc.folder_id] ?? 0) + 1
    }
  }

  const result = (folders ?? []).map((f) => ({
    id: f.id,
    userId: f.user_id,
    name: f.name,
    parentId: f.parent_id,
    icon: f.icon,
    sortOrder: f.sort_order,
    deleted: f.deleted,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
    documentCount: countMap[f.id] ?? 0,
  }))

  return success(result)
})

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  const body = await request.json()
  const { name, parentId } = createFolderSchema.parse(body)

  const { data: folder, error: insertError } = await supabase
    .from('folders')
    .insert({
      user_id: user.id,
      name,
      parent_id: parentId ?? null,
      deleted: 0,
    })
    .select()
    .single()

  if (insertError) return error(insertError.message, 500)

  return success({
    id: folder.id,
    userId: folder.user_id,
    name: folder.name,
    parentId: folder.parent_id,
    icon: folder.icon,
    sortOrder: folder.sort_order,
    deleted: folder.deleted,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
    documentCount: 0,
  }, '创建成功', 201)
})
