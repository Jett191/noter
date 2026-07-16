import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { folderIdSchema, updateFolderSchema } from '@/utils/feature/folders/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/folders/[id]
 * 更新文件夹 (重命名 / 移动)。
 *
 * 系统文件夹保护 (admin-platform task 17.3 / Requirements 12.1):
 * 现有 RLS user_id=auth.uid() 已经能从 UPDATE 路径阻止普通用户改系统文件夹,
 * 但仅靠 RLS 拒绝时返回的是「修改了 0 行」的成功响应,体验差。这里在业务层
 * 显式查询 is_system_folder,命中时返回 403 + 友好错误信息。
 */
export const PATCH = handler(async (request: Request, { params }: RouteContext) => {
  const { id } = await params
  folderIdSchema.parse({ id })

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 显式拒绝对系统文件夹的修改 (RLS 是兜底,业务层先返回友好错误)
  const { data: target } = await supabase
    .from('folders')
    .select('id, is_system_folder')
    .eq('id', id)
    .eq('deleted', 0)
    .maybeSingle()

  if (target?.is_system_folder) {
    return error('系统文件夹不可修改', 403)
  }

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

/**
 * DELETE /api/folders/[id]
 * 软删除文件夹。
 *
 * 系统文件夹保护 (admin-platform task 17.3 / Requirements 12.1):
 * 同 PATCH,业务层显式拦截 + 返回 403。
 */
export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  folderIdSchema.parse({ id })

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 显式拒绝对系统文件夹的删除
  const { data: target } = await supabase
    .from('folders')
    .select('id, is_system_folder, user_id')
    .eq('id', id)
    .eq('deleted', 0)
    .maybeSingle()

  if (!target) return error('文件夹不存在', 404)
  if (target.is_system_folder) {
    return error('系统文件夹不可删除', 403)
  }

  // 检查文件夹是否属于当前用户
  if (target.user_id !== user.id) return error('文件夹不存在', 404)

  // 软删除文件夹
  await supabase.from('folders').update({ deleted: 1 }).eq('id', id).eq('user_id', user.id)

  // 将该文件夹下的文档移到默认文件夹（设为 null）
  await supabase
    .from('documents')
    .update({ folder_id: null, updated_at: new Date().toISOString() })
    .eq('folder_id', id)
    .eq('user_id', user.id)

  return success(null, '删除成功')
})
