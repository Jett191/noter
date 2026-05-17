-- Noter Agent Task 1.4: 新增 hybrid_search_scoped RPC，强制 user_id + document_id 过滤
-- 设计要点：
-- 1) 不修改现有 public.hybrid_search 函数（noter-document-management 仍在使用）
-- 2) 返回 per-chunk 结果（chunk_id / chunk_index / heading_path / content / score / match_type），
--    匹配 packages/agent-runtime ChunkSearchTool 的 ChunkHit 接口
-- 3) 所有 WHERE 强制 user_id = p_user_id AND document_id = p_document_id AND deleted = 0
-- 4) SECURITY INVOKER：user_id 由调用方显式传入，由 service_role 调用即可；避免 DEFINER 引入的越权风险
-- 5) 仅授予 service_role 执行权限，撤销 PUBLIC / authenticated / anon

CREATE OR REPLACE FUNCTION public.hybrid_search_scoped(
  p_query_text text,
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
  score double precision,
  match_type text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  -- 与 hybrid_search 行为一致：限制 match_count 上限为 50；同时确保 ≥ 1
  p_match_count := LEAST(GREATEST(COALESCE(p_match_count, 5), 1), 50);

  RETURN QUERY
  WITH keyword_results AS (
    SELECT
      ch.id,
      ch.chunk_index,
      ch.heading_path,
      ch.content,
      ts_rank_cd(
        to_tsvector('simple', ch.content),
        plainto_tsquery('simple', p_query_text)
      ) AS rank
    FROM document_chunks ch
    WHERE ch.user_id = p_user_id
      AND ch.document_id = p_document_id
      AND ch.deleted = 0
      AND to_tsvector('simple', ch.content)
          @@ plainto_tsquery('simple', p_query_text)
  ),
  vector_results AS (
    SELECT
      ch.id,
      ch.chunk_index,
      ch.heading_path,
      ch.content,
      1 - (ch.embedding <=> p_query_embedding) AS rank
    FROM document_chunks ch
    WHERE ch.user_id = p_user_id
      AND ch.document_id = p_document_id
      AND ch.deleted = 0
      AND ch.embedding IS NOT NULL
    ORDER BY ch.embedding <=> p_query_embedding
    LIMIT p_match_count
  ),
  combined AS (
    SELECT
      COALESCE(k.id, v.id)            AS id,
      COALESCE(k.chunk_index, v.chunk_index) AS chunk_index,
      COALESCE(k.heading_path, v.heading_path) AS heading_path,
      COALESCE(k.content, v.content)  AS content,
      (COALESCE(k.rank, 0) * 0.4 + COALESCE(v.rank, 0) * 0.6) AS score,
      CASE
        WHEN k.id IS NOT NULL AND v.id IS NOT NULL THEN 'hybrid'
        WHEN k.id IS NOT NULL THEN 'keyword'
        ELSE 'vector'
      END AS match_type
    FROM keyword_results k
    FULL OUTER JOIN vector_results v ON k.id = v.id
  )
  SELECT
    c.id          AS chunk_id,
    c.chunk_index AS chunk_index,
    c.heading_path AS heading_path,
    c.content     AS content,
    c.score       AS score,
    c.match_type  AS match_type
  FROM combined c
  ORDER BY c.score DESC
  LIMIT p_match_count;
END;
$function$;

COMMENT ON FUNCTION public.hybrid_search_scoped(text, vector, int, uuid, uuid) IS
  'Noter Agent: 单文档作用域内的混合搜索（向量 top-k + 关键词召回融合）。强制 WHERE user_id = p_user_id AND document_id = p_document_id AND deleted = 0。仅供 packages/agent-runtime 的 ChunkSearchTool.hybridSearch 调用。';

-- 权限：仅 service_role 可执行；撤销 PUBLIC / authenticated / anon
REVOKE ALL ON FUNCTION public.hybrid_search_scoped(text, vector, int, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hybrid_search_scoped(text, vector, int, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hybrid_search_scoped(text, vector, int, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hybrid_search_scoped(text, vector, int, uuid, uuid) TO service_role;
