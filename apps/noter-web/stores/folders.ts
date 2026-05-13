import { create } from 'zustand'
import { folderApi } from '@/lib/axios/folders'
import type { Folder } from '@/types/folder'

interface FolderState {
  folders: Folder[]
  selectedFolderId: string | null // null = 全部文档
  loading: boolean
  fetchFolders: () => Promise<void>
  createFolder: (name: string, parentId?: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  setSelectedFolder: (id: string | null) => void
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  loading: false,

  fetchFolders: async () => {
    set({ loading: true })
    try {
      const folders = await folderApi.list()
      set({ folders: folders ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createFolder: async (name: string, parentId?: string) => {
    await folderApi.create({ name, parentId })
    await get().fetchFolders()
  },

  deleteFolder: async (id: string) => {
    await folderApi.delete(id)
    // 如果删除的是当前选中的文件夹，重置为全部
    if (get().selectedFolderId === id) {
      set({ selectedFolderId: null })
    }
    await get().fetchFolders()
  },

  renameFolder: async (id: string, name: string) => {
    await folderApi.update(id, { name })
    await get().fetchFolders()
  },

  setSelectedFolder: (id: string | null) => {
    set({ selectedFolderId: id })
  },
}))
