import { create } from 'zustand'
import { tagApi } from '@/lib/axios/tags'
import type { Tag } from '@/types/document'

interface TagState {
  tags: Tag[]
  loading: boolean
  fetchTags: () => Promise<void>
  createTag: (name: string) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  loading: false,

  fetchTags: async () => {
    set({ loading: true })
    try {
      const tags = await tagApi.list()
      set({ tags: tags ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createTag: async (name: string) => {
    await tagApi.create({ name })
    await get().fetchTags()
  },

  deleteTag: async (id: string) => {
    await tagApi.delete(id)
    await get().fetchTags()
  }
}))
