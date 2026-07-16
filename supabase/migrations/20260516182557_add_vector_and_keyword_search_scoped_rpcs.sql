-- Noter Agent Task 3.3: 新增 vector_search_scoped / keyword_search_scoped RPC
-- 设计要点：
-- 1) 与 hybrid_search_scoped 同 schema：返回 (chunk_id, chunk_index, heading_path, content, score)
--    （vector / keyword 单源不需要 match_type 字段，省略以保持最小）
-- 2) WHERE 强制 user_id = p_user_id AND document_id = p_document_id AND deleted = 0
-- 3) SECURITY INVOKER：user_id 由调用方显式传入，由 service_role 调用即可
-- 4) 仅授予 service_role 执行权限，撤销 PUBLIC / authenticated / anon
-- 5) match_count 范围限制在 [1, 50]，与 hybrid_search_scoped 保持一致

-- ============================================================================
-- vector_search_scoped: 纯向量搜索，按 cosine distance 升序取 top-k
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vector_search_scoped(
  p_query_embedding vector,
  p_match_count int,
  p_user_id uuid,
  p_document_id uuid
)
RETURNS TABLE(
  chunk_id uuid,
  chunk_index int,
  heading_path jsonb,
  content text,
  score double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  p_match_count := LEAST(GREATEST(COALESCE(p_match_count, 5), 1), 50);

  RETURN QUERY
  SELECT
    ch.id          AS chunk_id,
    ch.chunk_index AS chunk_index,
    ch.heading_path AS heading_path,
    ch.content     AS content,
    (1 - (ch.embedding <=> p_query_embedding))::double precision AS score
  FROM document_chunks ch
  WHERE ch.user_id = p_user_id
    AND ch.document_id = p_document_id
    AND ch.deleted = 0
    AND ch.embedding IS NOT NULL
  ORDER BY ch.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$function$;

COMMENT ON FUNCTION public.vector_search_scoped(vector, int, uuid, uuid) IS
  'Noter Agent: 单文档作用域内的纯向量搜索（cosine distance top-k）。强制 WHERE user_id = p_user_id AND document_id = p_document_id AND deleted = 0。仅供 packages/agent-runtime 的 ChunkSearchTool.vectorSearch 调用。';

REVOKE ALL ON FUNCTION public.vector_search_scoped(vector, int, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vector_search_scoped(vector, int, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.vector_search_scoped(vector, int, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vector_search_scoped(vector, int, uuid, uuid) TO service_role;

-- ============================================================================
-- keyword_search_scoped: 纯关键词搜索（PostgreSQL full-text），按 ts_rank_cd 排序
-- ============================================================================
CREATE OR REPLACE FUNCTION public.keyword_search_scoped(
  p_query_text text,
  p_match_count int,
  p_user_id uuid,
  p_document_id uuid
)
RETURNS TABLE(
  chunk_id uuid,
  chunk_index int,
  heading_path jsonb,
  content text,
  score double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  p_match_count := LEAST(GREATEST(COALESCE(p_match_count, 3), 1), 50);

  RETURN QUERY
  SELECT
    ch.id          AS chunk_id,
    ch.chunk_index AS chunk_index,
    ch.heading_path AS heading_path,
    ch.content     AS content,
    ts_rank_cd(
      to_tsvector('simple', ch.content),
      plainto_tsquery('simple', p_query_text)
    )::double precision AS score
  FROM document_chunks ch
  WHERE ch.user_id = p_user_id
    AND ch.document_id = p_document_id
    AND ch.deleted = 0
    AND to_tsvector('simple', ch.content)
        @@ plainto_tsquery('simple', p_query_text)
  ORDER BY score DESC
  LIMIT p_match_count;
END;
$function$;

COMMENT ON FUNCTION public.keyword_search_scoped(text, int, uuid, uuid) IS
  'Noter Agent: 单文档作用域内的纯关键词搜索（PostgreSQL full-text，ts_rank_cd 排序）。强制 WHERE user_id = p_user_id AND document_id = p_document_id AND deleted = 0。仅供 packages/agent-runtime 的 ChunkSearchTool.keywordSearch 调用。';

REVOKE ALL ON FUNCTION public.keyword_search_scoped(text, int, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.keyword_search_scoped(text, int, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.keyword_search_scoped(text, int, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.keyword_search_scoped(text, int, uuid, uuid) TO service_role;
