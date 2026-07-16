/**
 * Task 16.8 · 集成测试:RLS — anon session 能 SELECT 公共文档,不能 INSERT/UPDATE/DELETE
 *
 * 验证 design.md §Correctness Properties · Property 5 (noter-web 用户能看到公共文档但不能写)
 * 与 §5.4 RLS 策略。
 *
 * 测试矩阵:
 *
 *   | 表                            | SELECT (anon/auth) | INSERT/UPDATE/DELETE (anon/auth) |
 *   | ----------------------------- | ------------------ | -------------------------------- |
 *   | documents (scope=public)      | allowed            | denied                           |
 *   | folders   (is_system_folder)  | allowed            | denied (user_id != auth.uid())   |
 *   | tags      (is_official)       | allowed            | denied                           |
 *   | public_categories             | allowed            | denied                           |
 *   | system_settings               | allowed (SELECT 全员) | denied (UPDATE)                |
 *   | public_document_versions      | denied (no policy) | denied                           |
 *   | admin_audit_logs              | denied (no policy) | denied                           |
 *
 * 注:许多 noter-web RLS 策略要求 auth.role()='authenticated';故本测试以一个普通 user
 * 登录后获得的 access token 来代表"noter-web 端用户"——即"anon key + 用户 session"。
 * 完全的 anon 调用(无 token)在 RLS 下应当连 SELECT 公共文档都不被允许。
 *
 * 运行前提同 16.4(见 tests/README.md)。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  INTEGRATION_TESTS_ENABLED,
  SUPABASE_TEST_URL,
  SUPABASE_TEST_ANON_KEY,
  cleanupTestPublicDocument,
  createTestPublicCategory,
  createTestPublicDocument,
  createTestPublicTag,
  createTestUser,
  deleteTestUser,
  getAnonClient,
  getServiceClient,
  type TestUserHandle
} from './_helpers'
import { createClient } from '@supabase/supabase-js'

describe.skipIf(!INTEGRATION_TESTS_ENABLED)(
  'Integration · RLS · anon/authenticated session access control',
  () => {
    let webUser: TestUserHandle
    let webUserAccessToken: string
    let publicDocId: string
    let categoryId: string
    let tagId: string

    beforeAll(async () => {
      // 1. 创建一份公共文档 / 分类 / 公共标签 用于 SELECT
      const doc = await createTestPublicDocument({
        markdown: '# rls test',
        status: 'ready'
      })
      publicDocId = doc.id

      const cat = await createTestPublicCategory()
      categoryId = cat.id

      const tag = await createTestPublicTag()
      tagId = tag.id

      // 2. 创建一个普通 noter-web 用户,获得其 access token
      webUser = await createTestUser({ role: 'user', emailPrefix: 'web-user' })
      const anon = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
      const { data, error } = await anon.auth.signInWithPassword({
        email: webUser.email,
        password: webUser.password
      })
      if (error || !data.session) {
        throw new Error(`web user sign-in failed for RLS tests: ${error?.message}`)
      }
      webUserAccessToken = data.session.access_token
    }, 30_000)

    afterAll(async () => {
      await cleanupTestPublicDocument(publicDocId)
      const svc = getServiceClient()
      await svc.from('public_categories').delete().eq('id', categoryId)
      await svc.from('tags').delete().eq('id', tagId)
      await deleteTestUser(webUser.id)
    }, 30_000)

    // ────────────────────────────────────────────────────────
    // SELECT — should succeed for authenticated noter-web user
    // ────────────────────────────────────────────────────────

    describe('SELECT (authenticated user)', () => {
      it('can SELECT public documents (deleted=0)', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('documents')
          .select('id, document_scope, deleted')
          .eq('document_scope', 'public')
          .eq('deleted', 0)
          .limit(10)
        expect(error).toBeNull()
        expect(data).toBeTruthy()
        expect((data ?? []).length).toBeGreaterThanOrEqual(1)
      })

      it('does NOT see soft-deleted public documents', async () => {
        // 先把测试公共文档软删
        const svc = getServiceClient()
        const trashDoc = await createTestPublicDocument({
          markdown: '# soon to be trashed',
          status: 'ready'
        })
        try {
          await svc.from('documents').update({ deleted: 1 }).eq('id', trashDoc.id)

          const client = getAnonClient(webUserAccessToken)
          const { data } = await client.from('documents').select('id').eq('id', trashDoc.id)
          expect(data ?? []).toEqual([])
        } finally {
          await cleanupTestPublicDocument(trashDoc.id)
        }
      })

      it('can SELECT system folders (is_system_folder=true)', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('folders')
          .select('id, is_system_folder, name')
          .eq('is_system_folder', true)
        expect(error).toBeNull()
        expect((data ?? []).length).toBeGreaterThanOrEqual(1)
      })

      it('can SELECT official tags', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('tags')
          .select('id, is_official, deleted')
          .eq('is_official', true)
          .eq('deleted', 0)
        expect(error).toBeNull()
        expect((data ?? []).length).toBeGreaterThanOrEqual(1)
      })

      it('can SELECT public_categories', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client.from('public_categories').select('id, name')
        expect(error).toBeNull()
        expect((data ?? []).length).toBeGreaterThanOrEqual(1)
      })

      it('can SELECT system_settings (4 rows)', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client.from('system_settings').select('key, value')
        expect(error).toBeNull()
        const keys = (data ?? []).map((r: { key: string }) => r.key).sort()
        expect(keys).toEqual([
          'allow_user_delete_own',
          'allow_user_upload',
          'audit_log_enabled',
          'public_documents_visible'
        ])
      })
    })

    // ────────────────────────────────────────────────────────
    // INSERT/UPDATE/DELETE on public resources — should be denied
    // ────────────────────────────────────────────────────────

    describe('write operations on public resources (DENIED)', () => {
      it('cannot INSERT into documents with scope=public', async () => {
        const client = getAnonClient(webUserAccessToken)
        // 注:noter-web 现有 INSERT policy 是 user_id=auth.uid(),
        // 因此 scope=public 的 INSERT 因 user_id != auth.uid() 被拒。
        const { data, error } = await client
          .from('documents')
          .insert({
            title: 'rls hack',
            file_name: 'hack.md',
            document_scope: 'public',
            user_id: webUser.id, // 即使填自己的 id 也应该被某条 policy 拒绝
            status: 'ready'
          })
          .select()
        // 失败:要么直接 RLS error,要么 0 rows / data=null
        const denied = !!error || data === null || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot UPDATE public documents', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('documents')
          .update({ title: 'hacked' })
          .eq('id', publicDocId)
          .select()
        // RLS 拒绝时,data 应为空数组(silent failure),或返回 error
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot DELETE public documents', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('documents')
          .delete()
          .eq('id', publicDocId)
          .select()
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)

        // 真正的文档应仍存在
        const svc = getServiceClient()
        const { data: still } = await svc
          .from('documents')
          .select('id, deleted')
          .eq('id', publicDocId)
          .single()
        expect(still?.id).toBe(publicDocId)
      })

      it('cannot UPDATE system folders', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('folders')
          .update({ name: 'hacked' })
          .eq('is_system_folder', true)
          .select()
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot DELETE system folders', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('folders')
          .delete()
          .eq('is_system_folder', true)
          .select()
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })
    })

    // ────────────────────────────────────────────────────────
    // admin-only tables — RLS denies all auth role access
    // ────────────────────────────────────────────────────────

    describe('admin-only tables (DENIED for noter-web users)', () => {
      it('cannot SELECT admin_audit_logs', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client.from('admin_audit_logs').select('id').limit(1)
        // RLS 默认拒绝(无 policy);可能返回 error 或空数组
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot SELECT public_document_versions', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client.from('public_document_versions').select('id').limit(1)
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot UPDATE system_settings', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('system_settings')
          .update({ value: false })
          .eq('key', 'audit_log_enabled')
          .select()
        const denied = !!error || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })

      it('cannot INSERT into system_settings', async () => {
        const client = getAnonClient(webUserAccessToken)
        const { data, error } = await client
          .from('system_settings')
          .insert({ key: 'fake_key', value: true })
          .select()
        const denied = !!error || data === null || (Array.isArray(data) && data.length === 0)
        expect(denied).toBe(true)
      })
    })

    // ────────────────────────────────────────────────────────
    // Pure anon (no JWT) — even SELECT policies require authenticated
    // ────────────────────────────────────────────────────────

    describe('pure anon (no JWT) — even SELECT denied', () => {
      it('anon client without token cannot SELECT public documents', async () => {
        // 注:design.md §5.4 中的 SELECT policies 限定 TO authenticated。
        // 不带 access token 的请求应当返回空结果或被 RLS 拒绝。
        const anon = getAnonClient() // no token
        const { data } = await anon
          .from('documents')
          .select('id')
          .eq('document_scope', 'public')
          .limit(1)
        // 行为可能是 data=[] 或 data=null;无论哪个都视作拒绝
        expect(!data || data.length === 0).toBe(true)
      })
    })
  }
)
