-- 为 documents 表新增 cover_url 字段，存储用户自定义封面图的公开 URL。
-- 默认 NULL，前端会根据文档 ID 在五张内置封面间确定性地选一张作为兜底。
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.documents.cover_url IS
  '文档卡片自定义封面 URL（存储在 userResources/covers/{userId}/{docId}.{ext}），NULL 时前端使用默认封面';
