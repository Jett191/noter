# Noter `public` schema 字段级备忘

> 取材方式：通过 supabase MCP 工具 `list_tables`（`project_id=zadpcsjgsaapbhppaykg`、`schemas=["public"]`、`verbose=true`）+ `information_schema.columns` SQL 拉取，叠加 `supabase/migrations/*.sql` 中 `COMMENT ON ...` 文本核对。
>
> 用途：4.3.3 物理结构表（表 4.1—表 4.18）逐表展开的底稿；3.3.3 数据字典从中筛选与业务直接相关的存储项。
>
> 字段表统一八列：字段名 / 类型 / 长度 / 是否可空 / 主键 / 外键 / 默认值 / 含义。
> - 「长度」列：text / uuid / jsonb / 时间戳 / boolean 等无显式长度的类型记为 `-`，仅 vector 与定长类型记长度。
> - 「主键」「外键」列以 `Y` 标记；外键列同时给出引用目标。
> - 「是否可空」：`Y` 表示 NOT NULL，`N` 表示 NULL（沿用论文常见写法，避免与「是否」二字含义冲突可在论文里换成「允许为空 是/否」表头）。
> - 含义优先取迁移 `COMMENT` 文本；若迁移未补 COMMENT（如 `folders` 早期字段），按字段名与上下文给出业务释义并用 `※` 标注。

## 0. 总览表

> 行数为 2026 年最新一次拉取的快照值，仅供论文叙述与篇幅估算参考。

| 序号 | 表名                       | 行数 | 所属域           | 简短说明                                                                              |
| ---- | -------------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------- |
| 1    | `documents`                | 34   | 文档主域         | 文档主表，承载基础元数据、四类处理状态、归属、可见范围、收藏归档、软删                |
| 2    | `document_contents`        | 34   | 文档主域         | 解析后的标准 Markdown 正文 + 大纲 + 解析元数据（一对一）                              |
| 3    | `document_assets`          | 0    | 文档主域         | 解析过程产生的图片资源，落到 `document-assets-public` 桶                              |
| 4    | `document_chunks`          | 92   | 文档主域         | 文档分片表，含 768 维 pgvector embedding、token / 字符位置、heading_path              |
| 5    | `document_summaries`       | 31   | 文档主域         | AI 总结结果（一对一）：summary、key_points、todos、keywords、suitable_scenarios       |
| 6    | `document_mindmaps`        | 30   | 文档主域         | AI 思维导图结果（一对一）：mindmap_json、markdown_outline                             |
| 7    | `document_qa_records`      | 0    | 文档主域         | 围绕单个文档的 AI 问答历史                                                            |
| 8    | `document_processing_jobs` | 68   | 文档主域         | 解析 / 向量化 / 总结 / 思维导图四类处理任务流水                                       |
| 9    | `folders`                  | 4    | 组织域           | 文件夹（自引用，支持嵌套；含 Noter 官方系统文件夹）                                   |
| 10   | `tags`                     | 3    | 组织域           | 标签（区分用户私人标签与官方公共标签）                                                |
| 11   | `document_tags`            | 1    | 组织域           | 文档与标签多对多关联表                                                                |
| 12   | `profiles`                 | 2    | 用户域           | 用户资料（含 role：user / admin / super_admin、是否系统账号）                         |
| 13   | `user_settings`            | 0    | 用户域           | 用户偏好（当前承载默认阅读模板）                                                      |
| 14   | `agent_skill_sessions`     | 3    | Agent 会话域     | 多轮 Skill 会话状态（/tutor、/quiz），RLS 仅 service_role 可访问，默认 24 小时过期    |
| 15   | `public_categories`        | 0    | 管理后台域       | 公共文档扁平分类                                                                      |
| 16   | `public_document_versions` | 0    | 管理后台域       | 公共文档 Markdown 版本快照（version_no 在文档维度内严格自增）                         |
| 17   | `admin_audit_logs`         | 0    | 管理后台域       | 管理员后台操作审计日志（18 个 action_type、6 个 target_resource_type）                |
| 18   | `system_settings`          | 4    | 管理后台域       | 4 项最小访问控制开关（key/value 形式，value 为 boolean jsonb）                        |

合计 18 张表，与 design.md「Data Models」一节给出的清单一致。


## 一、文档主域（8 张）

### 1. `documents`（文档主表，34 行）

> 业务定位：所有文档的统一入口，承载基础元数据、四类异步处理状态（parse / vector / summary / mindmap）、归属用户与文件夹、可见范围（private / public）以及收藏归档与软删标志。
> 表注释：「文档主表，保存文档基础信息、文件信息和处理状态」。

| 字段名                  | 类型                     | 长度 | 是否可空 | 主键 | 外键 | 默认值                       | 含义 |
| ----------------------- | ------------------------ | ---- | -------- | ---- | ---- | ---------------------------- | ---- |
| `id`                    | uuid                     | -    | Y        | Y    |      | `gen_random_uuid()`          | 文档ID |
| `user_id`               | uuid                     | -    | Y        |      | Y → `profiles.id` | -                            | 所属用户ID |
| `title`                 | text                     | -    | Y        |      |      | -                            | 文档标题 |
| `original_filename`     | text                     | -    | Y        |      |      | -                            | 用户上传时的原始文件名 |
| `file_ext`              | text                     | -    | N        |      |      | -                            | 文件后缀（pdf、docx、md 等）|
| `mime_type`             | text                     | -    | N        |      |      | -                            | 文件 MIME 类型 |
| `file_size`             | bigint                   | -    | N        |      |      | -                            | 原始文件大小（字节）|
| `original_bucket`       | text                     | -    | Y        |      |      | `'document-originals'`       | 原始文件所在的 Storage 存储桶 |
| `original_storage_path` | text                     | -    | Y        |      |      | -                            | 原始文件在 Storage 中的存储路径 |
| `status`                | text                     | -    | Y        |      |      | `'uploaded'`                 | 文档整体处理状态（uploaded / parsing / parsed / vectorizing / ready / failed） |
| `parse_status`          | text                     | -    | Y        |      |      | `'pending'`                  | 文档解析状态（pending / running / success / failed） |
| `vector_status`         | text                     | -    | Y        |      |      | `'pending'`                  | 文档向量化状态 |
| `summary_status`        | text                     | -    | Y        |      |      | `'pending'`                  | AI 总结生成状态 |
| `mindmap_status`        | text                     | -    | Y        |      |      | `'pending'`                  | AI 思维导图生成状态 |
| `short_description`     | text                     | -    | N        |      |      | -                            | 文档简短描述或摘要片段，用于文档卡片展示 |
| `word_count`            | integer                  | -    | Y        |      |      | `0`                          | 文档字数 |
| `page_count`            | integer                  | -    | N        |      |      | -                            | 文档页数 |
| `language`              | text                     | -    | N        |      |      | -                            | 文档语言 |
| `is_favorite`           | integer                  | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）         | 是否收藏，0=未收藏，1=收藏 |
| `is_archived`           | integer                  | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）         | 是否归档，0=未归档，1=归档 |
| `deleted`               | integer                  | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）         | 软删标志，0=正常，1=已删除 |
| `deleted_at`            | timestamptz              | -    | N        |      |      | -                            | 删除时间 |
| `created_at`            | timestamptz              | -    | Y        |      |      | `now()`                      | 创建时间 |
| `updated_at`            | timestamptz              | -    | Y        |      |      | `now()`                      | 更新时间 |
| `folder_id`             | uuid                     | -    | N        |      | Y → `folders.id` | -                            | 所属文件夹ID（NULL 时归入默认文件夹）|
| `cover_url`             | text                     | -    | N        |      |      | -                            | 文档卡片自定义封面 URL（NULL 时前端使用默认封面）|
| `document_scope`        | text                     | -    | Y        |      |      | `'private'`（CHECK ∈ {private,public}） | 可见范围：private=私有；public=后台运营公共文档 |
| `public_category_id`    | uuid                     | -    | N        |      | Y → `public_categories.id` | -                            | 公共文档所属分类（仅 document_scope=public 时允许非 NULL）|

### 2. `document_contents`（文档内容表，34 行）

> 业务定位：与 `documents` 一对一的解析正文表，承载标准 Markdown 全文、大纲与解析元数据。
> 表注释：「文档内容表，保存解析后的标准 Markdown 内容」。

| 字段名             | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------ | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`               | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 文档内容ID |
| `user_id`          | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`      | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 对应的文档ID（unique，一对一）|
| `markdown_content` | text        | -    | Y        |      |      | -                   | 解析后的 Markdown 正文内容 |
| `outline`          | jsonb       | -    | N        |      |      | -                   | 根据 Markdown 标题生成的文档大纲 |
| `metadata`         | jsonb       | -    | N        |      |      | -                   | 文档解析过程中的额外元数据 |
| `deleted`          | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`       | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`       | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |

### 3. `document_assets`（文档资源表，0 行）

> 业务定位：解析过程中产生的图片等资源（落到 `document-assets-public` 桶），与 `documents` 多对一。
> 表注释：「文档资源表，保存文档解析后产生的图片资源信息」。

| 字段名         | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值                          | 含义 |
| -------------- | ----------- | ---- | -------- | ---- | ---- | ------------------------------- | ---- |
| `id`           | uuid        | -    | Y        | Y    |      | `gen_random_uuid()`             | 文档资源ID |
| `user_id`      | uuid        | -    | Y        |      | Y → `profiles.id` | -                               | 所属用户ID |
| `document_id`  | uuid        | -    | Y        |      | Y → `documents.id` | -                               | 所属文档ID |
| `bucket`       | text        | -    | Y        |      |      | `'document-assets-public'`      | 资源所在的 Storage 存储桶 |
| `storage_path` | text        | -    | Y        |      |      | -                               | 资源在 Storage 中的存储路径 |
| `public_url`   | text        | -    | Y        |      |      | -                               | 资源公开访问地址 |
| `original_url` | text        | -    | N        |      |      | -                               | 解析服务返回的原始资源地址 |
| `filename`     | text        | -    | N        |      |      | -                               | 资源文件名 |
| `mime_type`    | text        | -    | N        |      |      | -                               | 资源 MIME 类型 |
| `file_size`    | bigint      | -    | N        |      |      | -                               | 资源文件大小（字节）|
| `width`        | integer     | -    | N        |      |      | -                               | 图片宽度 |
| `height`       | integer     | -    | N        |      |      | -                               | 图片高度 |
| `sort_order`   | integer     | -    | N        |      |      | `0`                             | 资源排序序号 |
| `deleted`      | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）            | 软删标志 |
| `created_at`   | timestamptz | -    | Y        |      |      | `now()`                         | 创建时间 |

### 4. `document_chunks`（文档分片表，92 行）

> 业务定位：RAG 检索的核心载体；每条记录是文档的一段分片，含 768 维 pgvector embedding 与字符 / token 位置信息。
> 表注释：「文档分片表，保存文档分片内容和向量数据，用于搜索和 AI 问答」。

| 字段名         | 类型          | 长度    | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| -------------- | ------------- | ------- | -------- | ---- | ---- | ------------------- | ---- |
| `id`           | uuid          | -       | Y        | Y    |      | `gen_random_uuid()` | 文档分片ID |
| `user_id`      | uuid          | -       | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`  | uuid          | -       | Y        |      | Y → `documents.id` | -                   | 所属文档ID |
| `chunk_index`  | integer       | -       | Y        |      |      | -                   | 分片序号 |
| `content`      | text          | -       | Y        |      |      | -                   | 分片文本内容 |
| `heading_path` | jsonb         | -       | N        |      |      | -                   | 分片所在的标题层级路径 |
| `token_count`  | integer       | -       | N        |      |      | -                   | 分片 token 数量 |
| `char_start`   | integer       | -       | N        |      |      | -                   | 分片在原始 Markdown 中的开始字符位置 |
| `char_end`     | integer       | -       | N        |      |      | -                   | 分片在原始 Markdown 中的结束字符位置 |
| `embedding`    | vector        | 768 维  | N        |      |      | -                   | 分片向量数据（pgvector） |
| `metadata`     | jsonb         | -       | N        |      |      | -                   | 分片额外元数据 |
| `deleted`      | integer       | -       | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`   | timestamptz   | -       | Y        |      |      | `now()`             | 创建时间 |

### 5. `document_summaries`（AI 总结表，31 行）

> 业务定位：与 `documents` 一对一的 AI 总结结果，承载摘要、关键要点、待办、关键词、适用场景与所用模型。
> 表注释：「AI 总结表，保存文档的 AI 总结结果」。

| 字段名               | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| -------------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`                 | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | AI 总结ID |
| `user_id`            | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`        | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 所属文档ID（unique，一对一）|
| `summary`            | text        | -    | Y        |      |      | -                   | 文档摘要正文 |
| `key_points`         | jsonb       | -    | N        |      |      | -                   | 关键要点 |
| `todos`              | jsonb       | -    | N        |      |      | -                   | 待办事项 |
| `keywords`           | text[]      | -    | N        |      |      | -                   | 关键词数组 |
| `suitable_scenarios` | jsonb       | -    | N        |      |      | -                   | 适用场景 |
| `model_name`         | text        | -    | N        |      |      | -                   | 生成总结所用模型名称 |
| `deleted`            | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `generated_at`       | timestamptz | -    | Y        |      |      | `now()`             | 生成时间 |
| `created_at`         | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`         | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |

### 6. `document_mindmaps`（AI 思维导图表，30 行）

> 业务定位：与 `documents` 一对一的思维导图结果，承载结构化 JSON 与 Markdown 大纲两份数据。
> 表注释：「AI 思维导图表，保存文档的 AI 思维导图数据」。

| 字段名             | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------ | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`               | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | AI 思维导图ID |
| `user_id`          | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`      | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 所属文档ID（unique，一对一）|
| `mindmap_json`     | jsonb       | -    | Y        |      |      | -                   | 思维导图结构化 JSON 数据（@xyflow/react 节点）|
| `markdown_outline` | text        | -    | N        |      |      | -                   | Markdown 形式的大纲内容 |
| `model_name`       | text        | -    | N        |      |      | -                   | 生成思维导图所用模型名称 |
| `deleted`          | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `generated_at`     | timestamptz | -    | Y        |      |      | `now()`             | 生成时间 |
| `created_at`       | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`       | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |

### 7. `document_qa_records`（文档问答记录表，0 行）

> 业务定位：围绕单个文档的 AI 问答历史；记录问题、回答、检索到的分片 id 列表与上下文。
> 表注释：「文档问答记录表，保存用户围绕文档进行 AI 问答的历史记录」。

| 字段名                | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| --------------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`                  | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 文档问答记录ID |
| `user_id`             | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`         | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 所属文档ID |
| `question`            | text        | -    | Y        |      |      | -                   | 用户提出的问题 |
| `answer`              | text        | -    | Y        |      |      | -                   | AI 生成的回答 |
| `retrieved_chunk_ids` | uuid[]      | -    | N        |      |      | -                   | 本次问答检索到的文档分片ID列表 |
| `retrieval_context`   | jsonb       | -    | N        |      |      | -                   | 本次问答的检索上下文信息 |
| `model_name`          | text        | -    | N        |      |      | -                   | 生成回答所用模型名称 |
| `deleted`             | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`          | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |

### 8. `document_processing_jobs`（文档处理任务表，68 行）

> 业务定位：解析 / 向量化 / 总结 / 思维导图四类 Edge Function 任务的统一流水台账；驱动 documents 表的四个 *_status 字段。
> 表注释：「文档处理任务表，记录文档解析、向量化、AI总结、思维导图生成等任务状态」。

| 字段名           | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ---------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`             | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 文档处理任务ID |
| `user_id`        | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id`    | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 所属文档ID |
| `job_type`       | text        | -    | Y        |      |      | -                   | 任务类型（parse-document / vectorize-document / generate-summary / generate-mindmap）|
| `status`         | text        | -    | Y        |      |      | `'pending'`         | 任务状态（pending / running / success / failed）|
| `input_payload`  | jsonb       | -    | N        |      |      | -                   | 任务输入参数 |
| `output_payload` | jsonb       | -    | N        |      |      | -                   | 任务输出结果 |
| `error_message`  | text        | -    | N        |      |      | -                   | 任务失败时的错误信息 |
| `retry_count`    | integer     | -    | Y        |      |      | `0`                 | 任务重试次数 |
| `deleted`        | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `started_at`     | timestamptz | -    | N        |      |      | -                   | 任务开始时间 |
| `finished_at`    | timestamptz | -    | N        |      |      | -                   | 任务完成时间 |
| `created_at`     | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`     | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |



## 二、组织域（3 张）

### 9. `folders`（文件夹表，4 行）

> 业务定位：用户文件夹（自引用，支持嵌套）；同时承载「Noter 官方」系统级文件夹（用于公共文档归属）。
> 表注释：「文件夹表，支持嵌套文件夹结构」。早期建表未对部分字段写 COMMENT，下表中以 `※` 标注的字段含义按字段名与上下文给出。

| 字段名             | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------ | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`               | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | ※ 文件夹ID |
| `user_id`          | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | ※ 所属用户ID |
| `name`             | text        | -    | Y        |      |      | -                   | ※ 文件夹名称 |
| `parent_id`        | uuid        | -    | N        |      | Y → `folders.id`（自引用） | -                   | 父文件夹ID，为 NULL 表示根级文件夹 |
| `icon`             | text        | -    | N        |      |      | -                   | ※ 文件夹图标标识 |
| `sort_order`       | integer     | -    | N        |      |      | `0`                 | ※ 排序权重 |
| `deleted`          | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| ※ 软删标志 |
| `created_at`       | timestamptz | -    | Y        |      |      | `now()`             | ※ 创建时间 |
| `updated_at`       | timestamptz | -    | Y        |      |      | `now()`             | ※ 更新时间 |
| `is_system_folder` | boolean     | -    | Y        |      |      | `false`             | 是否为系统级文件夹，true 表示「Noter 官方」系统文件夹（承载公共文档），false 表示普通用户文件夹 |

### 10. `tags`（标签表，3 行）

> 业务定位：标签字典；区分用户私人标签与官方公共标签（`is_official`）。
> 表注释：「标签表，保存用户自定义的文档标签」。

| 字段名        | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`          | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 标签ID |
| `user_id`     | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `name`        | text        | -    | Y        |      |      | -                   | 标签名称 |
| `color`       | text        | -    | N        |      |      | -                   | 标签颜色 |
| `description` | text        | -    | N        |      |      | -                   | 标签描述 |
| `deleted`     | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`  | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`  | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |
| `is_official` | boolean     | -    | Y        |      |      | `false`             | 是否为官方公共标签（true=后台维护并被公共文档关联，false=用户私人标签）|

### 11. `document_tags`（文档标签关联表，1 行）

> 业务定位：文档与标签的多对多关系；冗余 `user_id` 便于 RLS 与查询。
> 表注释：「文档标签关联表，保存文档和标签之间的多对多关系」。

| 字段名        | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`          | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 关联ID |
| `user_id`     | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 所属用户ID |
| `document_id` | uuid        | -    | Y        |      | Y → `documents.id` | -                   | 文档ID |
| `tag_id`      | uuid        | -    | Y        |      | Y → `tags.id` | -                   | 标签ID |
| `deleted`     | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`  | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |



## 三、用户域（2 张）

### 12. `profiles`（用户资料表，2 行）

> 业务定位：与 `auth.users` 一一对应的应用层资料表；承载用户名、邮箱、头像、角色（user / admin / super_admin）、登录方式、是否为系统账号等。
> 表注释：「用户资料表，保存用户的基础账号信息」。

| 字段名              | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`                | uuid        | -    | Y        | Y    | Y → `auth.users.id` | -                   | 用户ID（与 Supabase Auth 用户ID 对应）|
| `username`          | text        | -    | N        |      |      | -                   | 用户名 |
| `email`             | text        | -    | Y（unique）|     |      | -                   | 用户邮箱 |
| `avatar_url`        | text        | -    | N        |      |      | -                   | 用户头像地址 |
| `role`              | text        | -    | N        |      |      | `'user'`            | 用户角色（user / admin / super_admin）|
| `created_at`        | timestamptz | -    | N        |      |      | `now()`             | 用户创建时间 |
| `updated_at`        | timestamptz | -    | N        |      |      | `now()`             | 用户资料更新时间 |
| `deleted`           | smallint    | -    | N        |      |      | `0`                 | 是否已注销或删除（0=正常，1=已删除）|
| `provider`          | text        | -    | N        |      |      | -                   | 登录方式（email、github 等）|
| `nike_name`         | text        | -    | N        |      |      | -                   | 用户昵称（仓库内字段名拼写为 `nike_name`，对应「nick name」语义）|
| `not_active`        | smallint    | -    | N        |      |      | `0`                 | 账号是否禁用（0=正常，1=禁用）|
| `is_system_account` | boolean     | -    | Y        |      |      | `false`             | 是否为系统内部账号（用于公共文档归属等场景）|

### 13. `user_settings`（用户设置表，0 行）

> 业务定位：用户偏好设置；当前承载默认阅读模板，后续可扩展。
> 表注释：「用户设置表，保存用户个人偏好设置」。

| 字段名                    | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`                      | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 设置记录ID |
| `user_id`                 | uuid        | -    | Y（unique）|     | Y → `profiles.id` | -                   | 所属用户ID |
| `default_reader_template` | text        | -    | Y        |      |      | `'default'`         | 用户默认阅读模板（default / academic / clean / card）|
| `deleted`                 | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删标志 |
| `created_at`              | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`              | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |



## 四、Agent 会话域（1 张）

### 14. `agent_skill_sessions`（Agent Skill 会话表，3 行）

> 业务定位：持久化 `/tutor` 与 `/quiz` 等多轮 Skill 的 session 状态（题组、答案、评分等）。
> RLS 仅 `service_role` 可访问；前端必须经 `/api/ai/sessions` Route Handler 间接访问，后端在投递前强制脱敏 `state.questions[i].correctAnswer`。
> 表注释：「Noter Agent 多轮 Skill 会话表……（详见迁移文件 `20260516175445_create_agent_skill_sessions_table.sql`）」。

| 字段名         | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值                                  | 含义 |
| -------------- | ----------- | ---- | -------- | ---- | ---- | --------------------------------------- | ---- |
| `id`           | uuid        | -    | Y        | Y    |      | `gen_random_uuid()`                     | 会话 ID |
| `user_id`      | uuid        | -    | Y        |      | Y → `profiles.id` | -                                       | 所属用户 ID |
| `document_id`  | uuid        | -    | Y        |      | Y → `documents.id` | -                                       | 关联文档 ID（每个 session 绑定单一文档）|
| `skill`        | text        | -    | Y        |      |      | -                                       | Skill 标识（/tutor、/quiz 等）|
| `state`        | jsonb       | -    | Y        |      |      | `'{}'::jsonb`                           | Skill 特定状态：/tutor 含 currentChapterIndex / exchangeHistory；/quiz 含 config / questions / userAnswers / gradingResult，其中 `questions[i].correctAnswer` 仅服务端可见 |
| `expires_at`   | timestamptz | -    | Y        |      |      | `now() + interval '24 hours'`           | 会话过期时间，默认创建后 24 小时 |
| `deleted`      | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）                    | 软删标志（与 documents 表一致）|
| `created_at`   | timestamptz | -    | Y        |      |      | `now()`                                 | 创建时间 |
| `updated_at`   | timestamptz | -    | Y        |      |      | `now()`                                 | 更新时间，由触发器自动维护 |



## 五、管理后台域（4 张）

### 15. `public_categories`（公共文档分类表，0 行）

> 业务定位：公共文档（document_scope='public'）的扁平运营分类。
> 表注释：「公共文档扁平分类表，承载 document_scope=public 的运营分类」。

| 字段名         | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| -------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`           | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 分类ID |
| `name`         | text        | -    | Y        |      |      | -                   | 分类名称（业务层去空白与非空校验；未删除范围内 LOWER(name) 全局唯一）|
| `description`  | text        | -    | N        |      |      | -                   | 分类描述，可空 |
| `sort_order`   | integer     | -    | Y        |      |      | `0`                 | 前端展示用排序权重，越小越靠前 |
| `deleted`      | integer     | -    | Y        |      |      | `0`（CHECK ∈ {0,1}）| 软删除标记（0=正常，1=已删除）|
| `created_at`   | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |
| `updated_at`   | timestamptz | -    | Y        |      |      | `now()`             | 更新时间 |

### 16. `public_document_versions`（公共文档版本快照表，0 行）

> 业务定位：公共文档 Markdown 版本归档；`version_no` 在 `document_id` 维度内严格自增（CHECK ≥ 1）；与 `document_id` 联合唯一；触发器在每次保存或回滚前归档「上一版」。
> 表注释：「公共文档 markdown 版本快照表，承载在线编辑/回滚的归档版本，version_no 在文档维度内严格自增」。

| 字段名             | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------------ | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`               | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 版本快照ID |
| `document_id`      | uuid        | -    | Y        |      | Y → `documents.id`（ON DELETE CASCADE） | -                   | 关联 documents.id（document_scope='public'）|
| `version_no`       | integer     | -    | Y        |      |      | -                   | 文档维度版本号，从 1 起递增（CHECK `version_no >= 1`）；与 document_id 联合唯一 |
| `markdown_content` | text        | -    | Y        |      |      | -                   | 该版本归档时的 markdown 全文快照（保存/回滚前的「上一版」内容）|
| `change_note`      | text        | -    | N        |      |      | -                   | 管理员保存/回滚时填写的变更说明，可空 |
| `editor_user_id`   | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 触发该次归档的管理员 profile id |
| `created_at`       | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |

### 17. `admin_audit_logs`（管理员审计日志表，0 行）

> 业务定位：管理员后台所有写操作的审计流水；写入受 `system_settings.audit_log_enabled` 控制，但「切换该开关本身」始终写日志。
> 表注释：「管理员后台操作审计日志表，记录所有写操作流水……」。

| 字段名                  | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ----------------------- | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `id`                    | uuid        | -    | Y        | Y    |      | `gen_random_uuid()` | 审计日志ID |
| `admin_user_id`         | uuid        | -    | Y        |      | Y → `profiles.id` | -                   | 实际触发操作的管理员 profile id（无级联，profile 软删/硬删时保留审计记录归属）|
| `admin_email`           | text        | -    | Y        |      |      | -                   | 冗余存储管理员邮箱，便于列表展示与 profile 硬删后追溯 |
| `action_type`           | text        | -    | Y        |      |      | -                   | 操作类型，受 `audit_action_chk` 白名单约束（18 个枚举：user.block/unblock/delete/send_password_reset/role_change，public_document.upload/metadata_update/content_update/rollback/delete，public_category.create/update/delete，public_tag.create/update/delete，document.force_delete，system_settings.update）|
| `target_resource_type`  | text        | -    | Y        |      |      | -                   | 目标资源类型，受 `audit_target_chk` 约束（user / document / public_document / public_category / public_tag / system_settings）|
| `target_resource_id`    | uuid        | -    | N        |      |      | -                   | 目标资源 id，可空（部分元操作不带具体 id；system_settings 场景按 key 定位）|
| `target_resource_label` | text        | -    | N        |      |      | -                   | 目标资源可读标识冗余（用户邮箱 / 文档标题 / 分类名 / 标签名 / 设置 key）|
| `request_ip`            | text        | -    | N        |      |      | -                   | 触发请求的来源 IP（X-Forwarded-For / 直连），可空以兼容内部脚本调用 |
| `metadata`              | jsonb       | -    | Y        |      |      | `'{}'::jsonb`       | 操作专属上下文 jsonb（密码重置不含 token、内容更新不含完整 markdown、设置更新含 before/after value 等）|
| `created_at`            | timestamptz | -    | Y        |      |      | `now()`             | 创建时间 |

### 18. `system_settings`（系统设置表，4 行）

> 业务定位：4 项最小访问控制开关（key/value 形式，value 为 boolean jsonb），被 noter-web 与 noter-admin 双端读取；写入仅经 `PATCH /api/admin/system-settings` 在事务内同步写 `admin_audit_logs`。
> 表注释：「管理员后台 4 项最小访问控制开关……」。

| 字段名       | 类型        | 长度 | 是否可空 | 主键 | 外键 | 默认值              | 含义 |
| ------------ | ----------- | ---- | -------- | ---- | ---- | ------------------- | ---- |
| `key`        | text        | -    | Y        | Y    |      | -                   | 设置项标识，受 `settings_key_chk` 白名单约束（4 个枚举：allow_user_upload / allow_user_delete_own / public_documents_visible / audit_log_enabled）|
| `value`      | jsonb       | -    | Y        |      |      | -                   | 设置项值（jsonb，当前 4 项均为 boolean），受 `settings_value_chk` 强制 `jsonb_typeof = 'boolean'` |
| `updated_at` | timestamptz | -    | Y        |      |      | `now()`             | 上次修改时间，前端「设置」页展示 |
| `updated_by` | uuid        | -    | N        |      | Y → `profiles.id` | -                   | 上次修改者 profile id（无级联，软删/硬删时保留来源痕迹；首次 seed 由迁移写入，故可空）|

---

## 备注

- 18 张表全部启用 `rls_enabled = true`；策略文件以 `supabase/migrations/20260517223451_admin_platform_rls_policies.sql` 与各表自带迁移为准，论文 4.3.3 物理结构表不复述策略，仅在 5.2.1 重点解释 `agent_skill_sessions` 的 service_role-only 设计。
- `documents` 表的 `parse_status` / `vector_status` / `summary_status` / `mindmap_status` 四个枚举字段，是 5.1.2 文档上传与 RAG 解析流水线时序图（图 5.1）的关键状态机；论文叙述时与 `document_processing_jobs.status` 对照阅读。
- `document_chunks.embedding` 在 supabase 中以 pgvector 扩展类型存储，长度 768 维（与 `vectorize-document` Edge Function 中模型输出维度一致）；混合搜索 RPC `vector_and_keyword_search_scoped` / `hybrid_search_scoped` 直接消费该字段。
- 公共文档全链路（`public_categories` ↔ `documents.public_category_id` ↔ `public_document_versions`）由迁移 `20260517223443`—`20260517223452` 共 10 个 admin_platform_* 文件依次建立，论文 6.3.2 关键功能简述将以这一链路为主线。
