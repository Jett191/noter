import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { createFolderSchema } from '@/utils/feature/folders/schemas'

export const GET = handler(async () => {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 获取所有文件夹:用户私有文件夹 ∪ 系统文件夹 (is_system_folder=true)
  // 系统文件夹由管理员维护(挂在系统账号下),普通用户只读可见。RLS 策略
  // (folders_select_system) 已放开 authenticated 用户对 is_system_folder=true 的
  // SELECT,但应用层仍需显式 OR 上 is_system_folder=true,因为现有 user_id 过滤
  // 与 RLS 是 AND 关系,单独 user_id=auth.uid() 会把系统文件夹过滤掉。
  // 详见 admin-platform tasks 17.1 / 17.2 与 design.md §5.4。
  const { data: folders, error: dbError } = await supabase
    .from('folders')
    .select('*')
    .or(`user_id.eq.${user.id},is_system_folder.eq.true`)
    .eq('deleted', 0)
    .order('is_system_folder', { ascending: false }) // 系统文件夹置顶
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (dbError) return error(dbError.message, 500)

  // 统计每个文件夹的文档数量
  // - 用户私有文件夹: 数自己的文档 (user_id=user.id)
  // - 系统文件夹:    数所有公共文档 (document_scope='public', RLS 已放开 SELECT)
  const folderRows = folders ?? []
  const userFolderIds = folderRows.filter((f) => !f.is_system_folder).map((f) => f.id)
  const systemFolderIds = folderRows.filter((f) => f.is_system_folder).map((f) => f.id)

  const countMap: Record<string, number> = {}

  if (userFolderIds.length > 0) {
    const { data: userDocCounts } = await supabase
      .from('documents')
      .select('folder_id')
      .eq('user_id', user.id)
      .eq('deleted', 0)
      .in('folder_id', userFolderIds)

    for (const doc of userDocCounts ?? []) {
      if (doc.folder_id) {
        countMap[doc.folder_id] = (countMap[doc.folder_id] ?? 0) + 1
      }
    }
  }

  if (systemFolderIds.length > 0) {
    const { data: publicDocCounts } = await supabase
      .from('documents')
      .select('folder_id')
      .eq('document_scope', 'public')
      .eq('deleted', 0)
      .in('folder_id', systemFolderIds)

    for (const doc of publicDocCounts ?? []) {
      if (doc.folder_id) {
        countMap[doc.folder_id] = (countMap[doc.folder_id] ?? 0) + 1
      }
    }
  }

  const result = folderRows.map((f) => ({
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
    // 标记系统文件夹,前端可据此渲染只读样式
    isSystemFolder: f.is_system_folder ?? false
  }))

  return success(result)
})

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  const body = await request.json()
  const { name, parentId } = createFolderSchema.parse(body)

  const { data: folder, error: insertError } = await supabase
    .from('folders')
    .insert({
      user_id: user.id,
      name,
      parent_id: parentId ?? null,
      deleted: 0
    })
    .select()
    .single()

  if (insertError) return error(insertError.message, 500)

  return success(
    {
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
      isSystemFolder: false
    },
    '创建成功',
    201
  )
})
