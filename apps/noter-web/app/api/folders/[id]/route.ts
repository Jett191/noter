import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { folderIdSchema, updateFolderSchema } from '@/utils/feature/folders/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = handler(async (request: Request, { params }: RouteContext) => {
  const { id } = await params
  folderIdSchema.parse({ id })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  const body = await request.json()
  const updates = updateFolderSchema.parse(body)

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.parentId !== undefined) updateData.parent_id = updates.parentId

  const { error: updateError } = await supabase
    .from('folders')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)

  if (updateError) return error(updateError.message, 500)

  return success(null, '更新成功')
})

export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  folderIdSchema.parse({ id })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 检查文件夹是否存在
  const { data: folder } = await supabase
    .from('folders')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (!folder) return error('文件夹不存在', 404)

  // 软删除文件夹
  await supabase
    .from('folders')
    .update({ deleted: 1 })
    .eq('id', id)
    .eq('user_id', user.id)

  // 将该文件夹下的文档移到默认文件夹（设为 null）
  await supabase
    .from('documents')
    .update({ folder_id: null, updated_at: new Date().toISOString() })
    .eq('folder_id', id)
    .eq('user_id', user.id)

  return success(null, '删除成功')
})
