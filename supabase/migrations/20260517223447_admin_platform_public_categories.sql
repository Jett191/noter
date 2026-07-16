-- Admin Platform · Task 1.5
-- 新建 public_categories 表（公共文档扁平分类），并补齐 documents.public_category_id
-- 在 task 1.2 中预埋的外键约束。
--
-- 设计要点（详见 design.md §5.2）:
--   - public_categories:扁平结构（无 parent_id），承载公共文档（document_scope='public'）
--     的运营分类。列设计与现有 tags / folders 等业务表风格保持一致：
--       * id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--       * name text NOT NULL（业务层校验非空与去空白；DB 层不做 length CHECK，
--         留给 application layer，与 tags 表风格一致）
--       * description text NULLABLE（分类描述，可空）
--       * sort_order int NOT NULL DEFAULT 0（前端排序展示用，越小越靠前）
--       * deleted int NOT NULL DEFAULT 0 with CHECK (deleted IN (0, 1))
--         → 与 tags / documents / folders 等表的软删字段类型与取值范围保持一致
--       * created_at / updated_at timestamptz NOT NULL DEFAULT now()
--   - 唯一性:partial unique index `public_categories_name_uniq` 在
--     `LOWER(name) WHERE deleted = 0` 上强制，保证未删除分类按大小写不敏感的 name
--     全局唯一；软删后释放 name，与 tags_official_name_uniq 风格一致。
--   - 外键:documents.public_category_id → public_categories(id) ON DELETE SET NULL。
--     task 1.2 已新增 documents.public_category_id 列与相关 CHECK，但出于"避免顺序耦合"
--     的考虑未引入 FK；本 migration 在 public_categories 创建后补齐 FK，使用 DO 块 +
--     pg_constraint 守卫保证幂等（重复执行不报错）。
--   - 该表是后续 task 1.9 RLS 策略（pc_select_all: 对 authenticated 全员开放 SELECT）
--     与 task 8 公共分类 CRUD API、task 5 公共文档列表/元数据接口的依赖。

-- 1. 创建 public_categories 表（公共文档扁平分类）。
CREATE TABLE IF NOT EXISTS public.public_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  deleted int NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_categories IS
  '公共文档扁平分类表，承载 document_scope=public 的运营分类';
COMMENT ON COLUMN public.public_categories.name IS
  '分类名称（业务层去空白与非空校验；未删除范围内 LOWER(name) 全局唯一）';
COMMENT ON COLUMN public.public_categories.description IS
  '分类描述，可空';
COMMENT ON COLUMN public.public_categories.sort_order IS
  '前端展示用排序权重，越小越靠前，默认 0';
COMMENT ON COLUMN public.public_categories.deleted IS
  '软删除标记：0=正常，1=已删除（与 tags/documents 等业务表风格保持一致）';

-- 2. 部分唯一索引：未删除分类按 LOWER(name) 全局唯一
--    （大小写不敏感；软删后释放 name 以便重建）。
CREATE UNIQUE INDEX IF NOT EXISTS public_categories_name_uniq
  ON public.public_categories (LOWER(name))
  WHERE deleted = 0;

COMMENT ON INDEX public.public_categories_name_uniq IS
  '公共分类 name 唯一性约束（LOWER(name) 大小写不敏感，仅作用于 deleted=0 的行）';

-- 3. 补齐 documents.public_category_id 外键（task 1.2 预埋列，本 migration 接上 FK）。
--    ON DELETE SET NULL:分类被硬删除时，关联公共文档的 public_category_id 自动置 NULL。
--    注:软删除（deleted=1）不会触发 ON DELETE SET NULL，需由 task 8.4 在
--       软删除事务内显式将 documents.public_category_id 置为 NULL。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_public_category_fk'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_public_category_fk
      FOREIGN KEY (public_category_id)
      REFERENCES public.public_categories(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
