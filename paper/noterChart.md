# noter 论文配图清单

本文件集中收纳论文正文中所有 mermaid 配图。每条目按"图编号 / 图名 / 所在小节 / 简短解释 / mermaid 源代码"五要素组织，与 paper/noterPaper.md 中正文内嵌的 mermaid 代码块逐字一致。

## 总目录

1. 图 3.1 noter 系统总用例图
2. 图 3.2 文档生命周期子模块用例图
3. 图 3.3 Noter Agent 多轮 Skill 子模块用例图
4. 图 3.4 noter 系统总体数据流图
5. 图 3.5 文档上传与 RAG 解析流水线 1 层 DFD
6. 图 3.6 文档上传与 RAG 解析流水线 2 层 DFD
7. 图 3.7 AI 问答 SSE 流水线 1 层 DFD
8. 图 3.8 AI 问答 SSE 流水线 2 层 DFD
9. 图 4.1 noter 系统总体功能模块图
10. 图 4.2 文档主域与组织域实体关系图
11. 图 4.3 用户域与 Agent 域实体关系图
12. 图 4.4 管理后台域实体关系图
13. 图 5.1 文档上传与 RAG 解析流水线时序图
14. 图 5.4 Noter Agent 多轮 Skill 与 SSE 时序图
15. 图 6.1 noter 项目后端结构图
16. 图 6.2 noter 项目前端结构图

> 备注：图 5.2、图 5.3 为第五章 5.1.3 节的运行界面截图（上传弹窗与阅读页 AI 总结卡片），由 task 5.1.3 录入论文正文，本配图清单只收纳 mermaid 源图，因此此处不另起条目。

---

## 图 3.1 noter 系统总用例图

- 所在小节：第三章 3.2.1 总用例图
- 简短解释：以四档角色（未登录访客、普通用户、管理员、超级管理员）为执行者，按合并去重后的功能集合呈现 noter 系统总用例分布，超级管理员通过虚线继承管理员能力。

```mermaid
flowchart LR
    Guest((未登录访客))
    User((普通用户))
    Admin((管理员))
    SuperAdmin((超级管理员))

    subgraph System["noter 系统"]
        UC1(["注册与登录"])
        UC2(["上传文档"])
        UC3(["阅读文档"])
        UC4(["AI 提问"])
        UC5(["混合搜索"])
        UC6(["查看思维导图与 AI 总结"])
        UC7(["管理文件夹与标签"])
        UC8(["收藏与归档文档"])
        UC9(["浏览公共文档"])
        UC10(["编辑个人资料"])
        UC11(["登录管理后台"])
        UC12(["查看运营仪表盘"])
        UC13(["管理普通用户"])
        UC14(["维护公共文档"])
        UC15(["管理公共分类与标签"])
        UC16(["查询审计日志"])
        UC17(["切换管理员角色"])
        UC18(["维护系统访问开关"])
    end

    Guest --> UC1
    Guest --> UC9
    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    User --> UC5
    User --> UC6
    User --> UC7
    User --> UC8
    User --> UC9
    User --> UC10
    Admin --> UC11
    Admin --> UC12
    Admin --> UC13
    Admin --> UC14
    Admin --> UC15
    Admin --> UC16
    SuperAdmin -.->|继承管理员能力| Admin
    SuperAdmin --> UC17
    SuperAdmin --> UC18
```

## 图 3.2 文档生命周期子模块用例图

- 所在小节：第三章 3.2.2 子模块用例图与用例说明
- 简短解释：刻画 user 完成上传、阅读、检索、删除等私有动作，以及 admin 与 super_admin 在管理端维护公共文档与切换用户角色的关键用例。

```mermaid
flowchart LR
    Visitor[未登录访客]
    UserA[user]
    AdminA[admin]
    SuperA[super_admin]

    subgraph DocLife[文档生命周期子模块]
        UC1([UC-DOC-01 上传与解析文档])
        UC2([UC-DOC-02 浏览文档列表])
        UC3([UC-DOC-03 阅读文档详情与下载])
        UC4([UC-DOC-04 混合检索])
        UC5([UC-DOC-05 维护文件夹与标签])
        UC6([UC-DOC-06 删除私有文档])
        UC7([UC-DOC-07 维护公共文档])
        UC8([UC-DOC-08 切换用户角色])
    end

    Visitor -.被会话守卫拦截.-> DocLife
    UserA --> UC1
    UserA --> UC2
    UserA --> UC3
    UserA --> UC4
    UserA --> UC5
    UserA --> UC6
    AdminA --> UC2
    AdminA --> UC7
    SuperA --> UC7
    SuperA --> UC8
```

## 图 3.3 Noter Agent 多轮 Skill 子模块用例图

- 所在小节：第三章 3.2.2 子模块用例图与用例说明
- 简短解释：聚焦已登录 user 与 Noter Agent 的对话路径，覆盖五条 Skill 与启动入口、Skill 切换、SSE 接收三类公共用例。

```mermaid
flowchart LR
    UserB[user]

    subgraph Agent[Noter Agent 多轮 Skill 子模块]
        AG1([UC-AGT-01 启动 Skill 入口])
        AG2([UC-AGT-02 /brief 文档速览])
        AG3([UC-AGT-03 /tutor 章节私教])
        AG4([UC-AGT-04 /explain 概念释疑])
        AG5([UC-AGT-05 /actions 行动项提取])
        AG6([UC-AGT-06 /quiz 出题考我])
        AG7([UC-AGT-07 切换或中断 Skill])
        AG8([UC-AGT-08 接收 SSE 流与跟随建议])
    end

    UserB --> AG1
    UserB --> AG2
    UserB --> AG3
    UserB --> AG4
    UserB --> AG5
    UserB --> AG6
    UserB --> AG7
    UserB --> AG8
```

## 图 3.4 noter 系统总体数据流图

- 所在小节：第三章 3.3.1 总体数据流图
- 简短解释：以用户与管理员为源点和终点，把上传、解析向量化、总结与思维导图、阅读问答、管理后台审核五个处理串到 Storage、Postgres、pgvector、agent_skill_sessions 四类数据存储上。

```mermaid
flowchart LR
    U([用户])
    A([管理员])

    P1(P1 上传)
    P2(P2 解析与向量化)
    P3(P3 总结与思维导图)
    P4(P4 阅读与问答)
    P5(P5 管理后台审核)

    D1[(D1 Storage 桶 documents)]
    D2[(D2 Postgres 主库)]
    D3[(D3 pgvector 索引)]
    D4[(D4 agent_skill_sessions)]

    U -- 文件 --> P1
    P1 -- 原件 --> D1
    P1 -- 元数据 --> D2

    D1 -- 读取原件 --> P2
    P2 -- 正文与切片 --> D2
    P2 -- 768 维向量 --> D3

    D2 -- 正文 --> P3
    P3 -- 摘要与思维导图 --> D2

    U -- 阅读 / 提问 --> P4
    D2 -- 文档与切片 --> P4
    D3 -- 召回片段 --> P4
    P4 -- 多轮状态 --> D4
    D4 -- 历史状态 --> P4
    P4 -- SSE 流式响应 --> U

    A -- 审核 / 编辑 --> P5
    P5 -- 公共文档版本与审计 --> D2
    D2 -- 文档列表与日志 --> P5
```

## 图 3.5 文档上传与 RAG 解析流水线 1 层 DFD

- 所在小节：第三章 3.3.2 子模块 1、2 层数据流图
- 简短解释：把文档上传与 RAG 解析视为单一加工 P1，标注用户输入、Storage 桶、文档主域 Postgres 表与 document_processing_jobs 之间的数据流向。

```mermaid
flowchart LR
  User[用户]
  P1([P1 文档上传与 RAG 解析流水线])
  S1[(document-originals 原文件桶)]
  S2[(document-images 图片桶)]
  D[(Postgres 文档主域<br/>documents 等业务表)]
  J[(document_processing_jobs<br/>作业台账)]

  User -->|上传文件 + 元数据| P1
  P1 -->|状态轮询 / 阅读视图| User
  P1 -->|原始字节流| S1
  P1 -->|解析图片| S2
  P1 <-->|读写正文 / 分片 / 摘要 / 导图| D
  P1 <-->|读写作业状态与重试计数| J
```

## 图 3.6 文档上传与 RAG 解析流水线 2 层 DFD

- 所在小节：第三章 3.3.2 子模块 1、2 层数据流图
- 简短解释：把 P1 拆为接收上传、LlamaParse 解析、分片向量化、AI 总结、思维导图五个子加工，标注 documents 四个 status 字段与 document_processing_jobs 的双向流。

```mermaid
flowchart TB
  User[用户]

  subgraph P1[P1 文档上传与 RAG 解析流水线]
    direction TB
    P11([P1.1 接收上传与作业派发])
    P12([P1.2 LlamaParse 解析])
    P13([P1.3 分片与向量化])
    P14([P1.4 AI 总结生成])
    P15([P1.5 思维导图生成])
  end

  S1[(document-originals 桶)]
  S2[(document-images 桶)]
  D1[(documents)]
  D2[(document_contents)]
  D3[(document_assets)]
  D4[(document_chunks)]
  D5[(document_summaries)]
  D6[(document_mindmaps)]
  J[(document_processing_jobs)]

  User -->|上传文件| P11
  P11 -->|原始字节流| S1
  P11 -->|插入文档记录<br/>四类 status=pending| D1
  P11 -->|触发 parse| P12

  P12 -->|落 Markdown 正文| D2
  P12 -->|存图片资产| S2
  P12 -->|登记图片元数据| D3
  P12 -->|parse_status=ready| D1
  P12 -->|触发 vectorize| P13

  P13 -->|写 768 维向量| D4
  P13 -->|vector_status=ready| D1
  P13 -->|触发 summary| P14
  P13 -->|触发 mindmap| P15

  P14 -->|写摘要 / 关键要点 / 关键词| D5
  P14 -->|summary_status=ready| D1
  P15 -->|写思维导图 JSON| D6
  P15 -->|mindmap_status=ready| D1

  P11 <--> J
  P12 <--> J
  P13 <--> J
  P14 <--> J
  P15 <--> J

  D1 -->|状态回执| User
```

## 图 3.7 AI 问答 SSE 流水线 1 层 DFD

- 所在小节：第三章 3.3.2 子模块 1、2 层数据流图
- 简短解释：把 Noter Agent SSE 视为单一加工 P2，标注用户、文档主域 Postgres 与仅 service_role 可访问的 agent_skill_sessions 之间的输入输出。

```mermaid
flowchart LR
  User[用户]
  P2([P2 Noter Agent SSE 流水线])
  D1[(Postgres 文档主域<br/>documents / document_chunks 等)]
  D2[(agent_skill_sessions<br/>service_role only)]

  User -->|提问 / 命令 + sessionId| P2
  P2 -->|SSE 事件流 + done 终止帧| User
  P2 -->|读取文档与分片| D1
  P2 <-->|加载 / 续签 / 打断会话| D2
```

## 图 3.8 AI 问答 SSE 流水线 2 层 DFD

- 所在小节：第三章 3.3.2 子模块 1、2 层数据流图
- 简短解释：把 P2 拆为鉴权校验、Skill 路由决策、Skill 执行与工具调用、SSE 流式输出、会话状态回写五个子加工，标注与文档主域、pgvector 索引、agent_skill_sessions 及外部 LLM 之间的数据流。

```mermaid
flowchart TB
  User[用户]

  subgraph P2[P2 Noter Agent SSE 流水线]
    direction TB
    P21([P2.1 鉴权与文档 / 会话校验])
    P22([P2.2 Skill 路由决策])
    P23([P2.3 Skill 执行与工具调用])
    P24([P2.4 SSE 流式输出])
    P25([P2.5 会话状态回写])
  end

  D1[(documents / document_contents)]
  D2[(document_chunks<br/>pgvector 索引)]
  D3[(agent_skill_sessions)]
  EXT[/外部 LLM / Embedding API/]

  User -->|messages + command + sessionId| P21
  P21 -->|读归属与状态| D1
  P21 -->|加载活跃会话| D3
  P21 -->|路由入参| P22

  P22 -->|RouteDecision| P23

  P23 -->|向量 / 关键词 / 混合检索| D2
  P23 -->|读正文与大纲| D1
  P23 -->|调 LLM / Embedding| EXT
  P23 -->|content / session_banner| P24

  P23 -->|写 / 续签 / 打断 state| P25
  P25 <-->|jsonb state 合并| D3

  P24 -->|SSE 事件流 + done 终止帧| User
```

## 图 4.1 noter 系统总体功能模块图

- 所在小节：第四章 4.2.1 系统总体功能模块划分
- 简短解释：按部署形态把 noter 拆为用户端前端、管理端前端、共享 UI 与代码包、Supabase 后端四大模块，并标注前端两端经共享包按 RLS 与 service_role 直连后端的关系。

```mermaid
flowchart TB
    subgraph WEB[用户端前端 apps/noter-web]
        direction TB
        W1[阅读]
        W2[写作]
        W3[Agent 对话]
        W4[混合搜索]
        W5[收藏归档]
    end

    subgraph ADMIN[管理端前端 apps/noter-admin]
        direction TB
        A1[用户管理]
        A2[公共文档]
        A3[版本归档]
        A4[审计日志]
    end

    subgraph PKG[共享 UI 与代码包 packages/]
        direction TB
        P1[UI 组件 packages/ui]
        P2[API 客户端 packages/api]
        P3[agent-runtime 多轮 Skill 引擎]
    end

    subgraph BACK[Supabase 后端 supabase/]
        direction TB
        B1[迁移 migrations]
        B2[Edge Functions]
        B3[测试 tests]
    end

    WEB -->|调用 UI / API / Skill 引擎| PKG
    ADMIN -->|调用 UI / API| PKG
    PKG -->|读写 Postgres / Storage| BACK
    WEB -.SSR / RLS 直连.-> BACK
    ADMIN -.service_role 直连.-> BACK
```

## 图 4.2 文档主域与组织域实体关系图

- 所在小节：第四章 4.3.1 概念结构设计
- 简短解释：以 documents 为核心列出文档主域八张业务表与组织域三张表之间的一对一、一对多、多对多关系，document_tags 作为关联表承载 documents 与 tags 的多对多。

```mermaid
erDiagram
    documents ||--|| document_contents : "标准化正文"
    documents ||--|| document_summaries : "AI 总结"
    documents ||--|| document_mindmaps : "思维导图"
    documents ||--o{ document_assets : "图片资产"
    documents ||--o{ document_chunks : "向量分片"
    documents ||--o{ document_qa_records : "问答历史"
    documents ||--o{ document_processing_jobs : "处理任务"
    folders ||--o{ documents : "归档"
    folders ||--o{ folders : "父子目录"
    documents ||--o{ document_tags : "被打标"
    tags ||--o{ document_tags : "被引用"
    documents {
        uuid id PK
        uuid user_id FK
        uuid folder_id FK
        text title
        text status
        text document_scope
    }
    document_contents {
        uuid id PK
        uuid document_id FK
        text markdown_content
        jsonb outline
    }
    document_summaries {
        uuid id PK
        uuid document_id FK
        text summary
        jsonb key_points
    }
    document_mindmaps {
        uuid id PK
        uuid document_id FK
        jsonb mindmap_json
    }
    document_assets {
        uuid id PK
        uuid document_id FK
        text storage_path
        text public_url
    }
    document_chunks {
        uuid id PK
        uuid document_id FK
        int chunk_index
        text content
        vector embedding
    }
    document_qa_records {
        uuid id PK
        uuid document_id FK
        text question
        text answer
    }
    document_processing_jobs {
        uuid id PK
        uuid document_id FK
        text job_type
        text status
        int retry_count
    }
    folders {
        uuid id PK
        uuid user_id FK
        uuid parent_id FK
        text name
        bool is_system_folder
    }
    tags {
        uuid id PK
        uuid user_id FK
        text name
        bool is_official
    }
    document_tags {
        uuid document_id FK
        uuid tag_id FK
        uuid user_id FK
    }
```

## 图 4.3 用户域与 Agent 域实体关系图

- 所在小节：第四章 4.3.1 概念结构设计
- 简短解释：刻画用户域与 Agent 域两条主线，profiles 与 user_settings 一对一、与 agent_skill_sessions 一对多，agent_skill_sessions 跨域引用 documents 形成多对一。

```mermaid
erDiagram
    profiles ||--|| user_settings : "拥有偏好"
    profiles ||--o{ agent_skill_sessions : "发起会话"
    documents ||--o{ agent_skill_sessions : "承载于文档"
    profiles {
        uuid id PK
        text username
        text email
        text role
        bool is_system_account
    }
    user_settings {
        uuid user_id PK
        text default_reader_template
    }
    agent_skill_sessions {
        uuid id PK
        uuid user_id FK
        uuid document_id FK
        text skill
        jsonb state
        timestamptz expires_at
    }
    documents {
        uuid id PK
        text title
    }
```

## 图 4.4 管理后台域实体关系图

- 所在小节：第四章 4.3.1 概念结构设计
- 简短解释：以管理后台四张表为骨架，标注 public_categories、public_document_versions、admin_audit_logs、system_settings 与 documents、profiles 之间的归类、版本与审计引用关系。

```mermaid
erDiagram
    public_categories ||--o{ documents : "归类"
    documents ||--o{ public_document_versions : "归档版本"
    profiles ||--o{ public_document_versions : "编辑者"
    profiles ||--o{ admin_audit_logs : "操作者"
    profiles ||--o{ system_settings : "更新者"
    public_categories {
        uuid id PK
        text name
        text description
        int sort_order
    }
    public_document_versions {
        uuid id PK
        uuid document_id FK
        int version_no
        text markdown_content
        text change_note
        uuid editor_user_id FK
    }
    admin_audit_logs {
        uuid id PK
        uuid admin_user_id FK
        text admin_email
        text action_type
        text target_resource_type
    }
    system_settings {
        text key PK
        jsonb value
        uuid updated_by FK
        timestamptz updated_at
    }
    documents {
        uuid id PK
        uuid public_category_id FK
        text document_scope
    }
    profiles {
        uuid id PK
        text role
    }
```

## 图 5.1 文档上传与 RAG 解析流水线时序图

- 所在小节：第五章 5.1.2 内部处理逻辑
- 简短解释：以九类参与者串起从用户提交文件到前端轮询四类 status 字段的完整流水线，覆盖 LlamaParse 解析、向量切片、AI 总结与思维导图的并行触发以及状态回写返回路径。

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FE as 用户端 Web<br/>(UploadDialog / UploadProgress)
    participant RH as Next.js Route Handler<br/>(/api/documents/upload, /status)
    participant ST as Supabase Storage<br/>(document-originals / document-assets-public)
    participant PG as Postgres 主库<br/>(documents / document_contents / document_chunks 等)
    participant PD as parse-document<br/>Edge Function
    participant LP as LlamaParse<br/>外部服务
    participant VD as vectorize-document<br/>Edge Function
    participant GS as generate-summary<br/>Edge Function
    participant GM as generate-mindmap<br/>Edge Function

    U->>FE: 选择文件并提交
    FE->>RH: POST /api/documents/upload (FormData)
    RH->>ST: 上传原件到 document-originals
    ST-->>RH: storagePath
    RH->>PG: INSERT documents<br/>(四类 status=pending)
    PG-->>RH: document.id
    RH->>PD: invoke parse-document<br/>{documentId, userId, storagePath}
    RH-->>FE: 201 已创建 (返回 document)

    PD->>PG: UPDATE parse_status=running<br/>INSERT document_processing_jobs
    PD->>ST: createSignedUrl(原件)
    PD->>LP: 提交解析任务并轮询
    LP-->>PD: markdown + 图片清单
    PD->>ST: 转存解析图片到 document-assets-public
    PD->>PG: UPSERT document_contents<br/>INSERT document_assets
    PD->>PG: UPDATE parse_status=success,<br/>status=ready, word_count
    PD->>VD: invoke vectorize-document

    VD->>PG: UPDATE vector_status=running
    VD->>PG: DELETE document_chunks WHERE document_id
    VD->>VD: 切片 (1000 字符 / 200 字符重叠) + Gemini 768 维 batchEmbed
    VD->>PG: INSERT document_chunks (含 embedding)
    VD->>PG: UPDATE vector_status=success
    par 并行触发
        VD->>GS: invoke generate-summary
    and
        VD->>GM: invoke generate-mindmap
    end

    GS->>PG: UPDATE summary_status=running
    GS->>PG: UPSERT document_summaries
    GS->>PG: UPDATE summary_status=success
    GM->>PG: UPDATE mindmap_status=running
    GM->>PG: UPSERT document_mindmaps
    GM->>PG: UPDATE mindmap_status=success

    loop 每 3 秒一次,最长 5 分钟
        FE->>RH: GET /api/documents/[id]/status
        RH->>PG: SELECT 四类 status
        PG-->>RH: status / parseStatus / vectorStatus<br/>/ summaryStatus / mindmapStatus
        RH-->>FE: 四类状态字段
    end
    FE-->>U: 进度推进至「完成」
```

## 图 5.4 Noter Agent 多轮 Skill 与 SSE 时序图

- 所在小节：第五章 5.2.1 模块用途与内部处理逻辑
- 简短解释：刻画用户消息经 `/api/ai/chat/stream` 进入 orchestrator 后按 router → skill → tools → SSE 顺序调度，并把 `agent_skill_sessions.state` 演进与 `[DONE]` 终止帧的回写路径标出。

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant P as AIChatPanel
    participant RH as Route Handler<br/>/api/ai/chat/stream
    participant O as orchestrator
    participant R as skill-router
    participant S as Skill 实现
    participant T as tools 层<br/>(chunk-search / llm / session)
    participant SSE as SSE 通道
    participant DB as Postgres<br/>agent_skill_sessions

    U->>P: 输入消息或点击 Skill 卡片
    P->>RH: POST messages + command + sessionId
    RH->>RH: 鉴权 + 文档归属与 status=ready 校验
    RH->>DB: 校验 sessionId 归属与未过期 (service_role)
    DB-->>RH: 命中行或空
    RH->>O: runAgent 同步返回 ReadableStream
    RH-->>P: 200 text/event-stream
    O->>T: SessionTool.load(sessionId, userId, documentId)
    T->>DB: SELECT * WHERE deleted=0 AND expires_at>now()
    DB-->>T: SkillSession 或 null
    T-->>O: activeSession?
    O->>R: route(command, message, activeSession)
    R-->>O: RouteDecision(skill, mode, switchFromSession?)
    alt Skill 切换
        O->>T: SessionTool.interrupt(oldId, userId)
        T->>DB: UPDATE state.status=interrupted, expires_at=now()
        DB-->>T: rows=1
        T-->>O: 1
        O->>SSE: send session_banner(interrupted)
        O->>SSE: send content(系统提示文案)
    end
    O->>S: dispatchSkill(/brief 或 /tutor 或 /quiz 等)
    S->>T: chunk-search / llm 流式生成 / outline
    T-->>S: 召回片段与流式 token
    S->>SSE: send content / references / quiz_card
    SSE-->>P: data: { event, content, ... }
    P-->>U: 流式渲染
    S->>T: SessionTool.upsert(state)
    T->>DB: INSERT 或 UPDATE state 与 expires_at
    DB-->>T: SkillSession 落库回执
    T-->>S: 写回完成
    S-->>O: Skill 执行结束
    O-->>RH: runAgent Promise resolve
    RH->>SSE: sse.close() 写入 [DONE]
    SSE-->>P: data: [DONE]
    P-->>U: 状态回到 idle
```

## 图 6.1 noter 项目后端结构图

- 所在小节：第六章 6.1 项目后端结构
- 简短解释：以用户端 API、管理端 API、Edge Functions、迁移与表四块为骨架，标注用户端走 SSR + RLS、管理端走 service_role、Edge Functions 在 Deno 沙箱内链式 invoke、迁移按时间戳前缀演进的互通方式。

```mermaid
flowchart TB
    subgraph WebAPI["用户端 API<br/>apps/noter-web/app/api"]
        WAI[ai/chat、ai/sessions<br/>ai/regenerate-summary<br/>ai/regenerate-mindmap]
        WAU[auth/signin、register<br/>callback、profile]
        WAD[documents/upload<br/>documents/[id]]
        WAF[folders / search / tags]
    end

    subgraph AdminAPI["管理端 API<br/>apps/noter-admin/app/api/admin"]
        AAU[users / audit-logs]
        AAP[public-documents/upload<br/>public-documents/[id]<br/>public-categories<br/>public-tags]
        AAD[dashboard/metrics<br/>dashboard/trends<br/>dashboard/distributions<br/>documents]
        AAS[system-settings]
    end

    subgraph EF["Edge Functions<br/>supabase/functions（Deno）"]
        EP[parse-document]
        EV[vectorize-document]
        ES[generate-summary]
        EM[generate-mindmap]
    end

    subgraph MIG["迁移与表<br/>supabase/migrations"]
        M1[20260516175445<br/>agent_skill_sessions]
        M2[20260516180339 / 182557<br/>混合搜索 RPC]
        M3[20260517223443—223451<br/>admin platform 一系列]
        M4[20260517223452<br/>auto_version_v1_trigger]
    end

    WebAPI -->|@supabase/ssr<br/>anon key + RLS| MIG
    AdminAPI -->|service_role<br/>绕过 RLS| MIG
    WebAPI -.invoke('parse-document').-> EP
    EP -->|invoke| EV
    EV -->|invoke| ES
    EV -->|invoke| EM
    EF -->|service_role 读写| MIG
```

## 图 6.2 noter 项目前端结构图

- 所在小节：第六章 6.2 项目前端结构
- 简短解释：按 Next.js App Router 路由组划分用户端 `(auth)/(main)` 与管理端 `(admin)/(auth)`，标注 `provider/userProvider.ts` 注入容器布局、共享 UI 包同时被两端按需引用的关系。

```mermaid
flowchart TB
    subgraph WEB["用户端 apps/noter-web/app"]
        direction TB
        subgraph WEBAUTH["(auth) 路由组"]
            WA1[signin]
            WA2[signup]
            WA3[callback]
        end
        subgraph WEBMAIN["(main) 路由组<br/>layout.tsx + UserProvider"]
            WM1[home]
            WM2["documents / [id]"]
            WM3[notes]
            WM4[search]
            WM5[profile]
        end
        WEBPROV[provider/userProvider.ts]
    end

    subgraph ADMIN["管理端 apps/noter-admin/app"]
        direction TB
        subgraph ADMAUTH["(auth) 路由组"]
            AA1[sign-in]
        end
        subgraph ADMMAIN["(admin) 路由组<br/>layout.tsx 侧栏 + 鉴权"]
            AM1[dashboard]
            AM2["users / [id]"]
            AM3[documents]
            AM4["public-documents / [id]"]
            AM5[public-categories]
            AM6[public-tags]
            AM7[logs]
            AM8[settings]
        end
    end

    subgraph UI["共享 UI 包 packages/ui/src"]
        direction TB
        UC[components/* shadcn 4 原语]
        UL[lib/utils.ts cn 合并]
        US[styles/globals.css tailwind v4]
    end

    WEBPROV -.注入容器布局.-> WEBMAIN
    WEBAUTH -->|按需引用| UI
    WEBMAIN -->|按需引用| UI
    ADMAUTH -->|按需引用| UI
    ADMMAIN -->|按需引用| UI
```
