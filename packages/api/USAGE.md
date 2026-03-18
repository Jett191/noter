# @noter/api — Axios 封装使用文档

## 目录

- [一、这个封装是什么？为什么需要它？](#一这个封装是什么为什么需要它)
- [二、文件结构总览](#二文件结构总览)
- [三、源码逐文件详解](#三源码逐文件详解)
  - [3.1 types.ts — 类型定义](#31-typests--类型定义)
  - [3.2 client.ts — 创建 axios 实例](#32-clientts--创建-axios-实例)
  - [3.3 request.ts — 请求方法封装](#33-requestts--请求方法封装)
  - [3.4 index.ts — 统一导出](#34-indexts--统一导出)
- [四、在前端（noter-web）中使用](#四在前端noter-web中使用)
  - [4.1 安装依赖](#41-安装依赖)
  - [4.2 创建前端专属的 client 实例](#42-创建前端专属的-client-实例)
  - [4.3 按业务模块组织接口](#43-按业务模块组织接口)
  - [4.4 在页面 / 组件中调用](#44-在页面--组件中调用)
  - [4.5 前端目录结构示例](#45-前端目录结构示例)
- [五、在后端（noter-deno / Node.js）中使用](#五在后端noter-deno--nodejs中使用)
  - [5.1 后端为什么也需要 HTTP 客户端？](#51-后端为什么也需要-http-客户端)
  - [5.2 创建后端专属的 client 实例](#52-创建后端专属的-client-实例)
  - [5.3 后端接口组织示例](#53-后端接口组织示例)
- [六、完整调用链路图解](#六完整调用链路图解)
- [七、进阶用法](#七进阶用法)
  - [7.1 跳过统一错误处理](#71-跳过统一错误处理)
  - [7.2 使用原始 request 方法](#72-使用原始-request-方法)
  - [7.3 上传文件](#73-上传文件)
  - [7.4 创建多个 client 实例](#74-创建多个-client-实例)
- [八、常见问题](#八常见问题)

---

## 一、这个封装是什么？为什么需要它？

### 原生 axios 的问题

假设你直接用 axios 发请求，代码会长这样：

```ts
import axios from 'axios'

// 每次都要写完整的 URL
const response = await axios.get('http://localhost:3001/api/documents')

// 每次都要手动加 token
const response2 = await axios.get('http://localhost:3001/api/documents', {
  headers: { Authorization: `Bearer ${token}` }
})

// 每次都要从 response.data 里取数据
const documents = response.data.data

// 每个文件都要处理错误
try {
  const res = await axios.get('http://localhost:3001/api/documents')
} catch (error) {
  if (error.response?.status === 401) {
    // 跳转登录...
  }
}
```

问题很明显：

1. `baseURL` 到处重复写
2. token 注入逻辑散落在每个请求里
3. 错误处理（比如 401 跳登录）每个地方都要写一遍
4. `response.data.data` 这种解包逻辑重复且容易忘
5. 没有类型提示，不知道接口返回什么

### 封装后的效果

```ts
import { documentApi } from '@/services/document'

// 一行搞定，自动带 token、自动解包、有完整类型提示
const documents = await documentApi.list({ page: 1 })
//    ^? Document[] — TypeScript 自动推断出类型
```

### 这个封装做了什么

`@noter/api` 是一个共享包，它提供两个核心函数：

| 函数 | 作用 |
|------|------|
| `createClient(options)` | 创建一个配置好拦截器的 axios 实例（处理 token、错误等） |
| `createRequest(client)` | 基于 axios 实例生成类型安全的 `get/post/put/patch/delete` 方法 |

它**不包含任何业务逻辑**，只做通用能力封装。具体的接口定义（比如"获取文档列表"）由各个 app 自己写。

---

## 二、文件结构总览

```
packages/api/
├── package.json          # 包配置，名称为 @noter/api
├── tsconfig.json         # TypeScript 配置
├── USAGE.md              # 本文档
└── src/
    ├── index.ts          # 统一导出入口
    ├── types.ts          # 所有 TypeScript 类型定义
    ├── client.ts         # createClient — 创建 axios 实例 + 拦截器
    └── request.ts        # createRequest — 封装 get/post/put/patch/delete
```

每个文件职责单一：

- `types.ts`：只定义类型，不包含任何运行时代码
- `client.ts`：只负责创建 axios 实例和挂载拦截器
- `request.ts`：只负责把 axios 实例包装成好用的方法
- `index.ts`：只负责把上面三个文件的导出汇总到一起

---

## 三、源码逐文件详解

### 3.1 types.ts — 类型定义

```ts
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

/** 后端统一响应结构 — 根据实际后端调整 */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}

/** 创建实例时的配置 */
export interface CreateClientOptions {
  baseURL: string
  timeout?: number
  /** 注入 token 等，返回修改后的 config */
  onRequest?: (
    config: InternalAxiosRequestConfig
  ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
  /** 统一处理响应（如 token 过期跳转登录） */
  onResponseError?: (error: unknown) => unknown
}

/** 请求配置扩展 */
export type RequestConfig = AxiosRequestConfig & {
  /** 是否跳过统一错误处理 */
  skipErrorHandler?: boolean
}

export type { AxiosResponse, AxiosRequestConfig }
```

逐个解释：

#### `ApiResponse<T>`

这是和后端约定的**统一响应格式**。假设后端所有接口都返回这样的 JSON：

```json
{
  "code": 200,
  "data": { "id": "1", "title": "我的文档" },
  "message": "success"
}
```

那么 `ApiResponse<Document>` 就表示 `data` 字段的类型是 `Document`。泛型 `T` 就是用来描述 `data` 里装的是什么。

> 如果你的后端返回格式不同（比如字段叫 `result` 而不是 `data`），直接改这个 interface 就行。

#### `CreateClientOptions`

创建 axios 实例时传入的配置：

| 字段 | 必填 | 说明 |
|------|------|------|
| `baseURL` | 是 | API 的基础地址，比如 `http://localhost:3001` |
| `timeout` | 否 | 请求超时时间，默认 15 秒（15000ms） |
| `onRequest` | 否 | 请求拦截器回调，常用于注入 token |
| `onResponseError` | 否 | 响应错误拦截器回调，常用于处理 401 等 |

`onRequest` 和 `onResponseError` 是**钩子函数**，让每个 app 可以注入自己的逻辑，而不用修改封装本身。

#### `RequestConfig`

继承了 axios 原生的 `AxiosRequestConfig`，额外加了一个 `skipErrorHandler` 字段。这个字段的用途后面在"进阶用法"里会讲。

---

### 3.2 client.ts — 创建 axios 实例

```ts
import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { CreateClientOptions } from './types'

export function createClient(options: CreateClientOptions): AxiosInstance {
  const { baseURL, timeout = 15_000, onRequest, onResponseError } = options

  const instance = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' }
  })

  // ---- 请求拦截 ----
  instance.interceptors.request.use(
    async (config) => {
      if (onRequest) {
        return await onRequest(config)
      }
      return config
    },
    (error) => Promise.reject(error)
  )

  // ---- 响应拦截 ----
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (onResponseError) {
        return onResponseError(error)
      }
      return Promise.reject(error)
    }
  )

  return instance
}
```

#### 这段代码做了什么？

1. **`axios.create()`** — 创建一个独立的 axios 实例。为什么不直接用 `axios.get()`？因为全局 axios 是共享的，如果你有多个后端服务（比如主 API 和文件服务），它们的 baseURL、token 策略都不同，用全局 axios 会互相干扰。

2. **请求拦截器** — 每次发请求之前，会先执行 `onRequest` 回调。典型用途：

   ```ts
   onRequest(config) {
     const token = localStorage.getItem('token')
     if (token) {
       config.headers.Authorization = `Bearer ${token}`
     }
     return config  // 必须返回 config，否则请求会丢失
   }
   ```

   这样你写业务代码时完全不用关心 token，拦截器会自动帮你加上。

3. **响应拦截器** — 当请求失败时（HTTP 状态码不是 2xx），会执行 `onResponseError` 回调。典型用途：

   ```ts
   onResponseError(error) {
     if (error.response?.status === 401) {
       // token 过期，跳转到登录页
       window.location.href = '/login'
     }
     return Promise.reject(error)  // 继续抛出错误，让调用方也能 catch
   }
   ```

#### 为什么用钩子而不是直接写死逻辑？

因为前端和后端的处理方式不同：

- 前端用 `localStorage` 存 token，用 `window.location` 跳转
- 后端可能用环境变量存 API Key，错误时写日志而不是跳转

把这些逻辑通过 `onRequest` / `onResponseError` 钩子暴露出去，每个 app 按自己的需求实现，封装层保持通用。

---

### 3.3 request.ts — 请求方法封装

```ts
import type { AxiosInstance } from 'axios'
import type { ApiResponse, RequestConfig } from './types'

export function createRequest(client: AxiosInstance) {
  async function request<T = unknown>(config: RequestConfig): Promise<T> {
    const response = await client.request<ApiResponse<T>>(config)
    return response.data.data
  }

  return {
    request,

    get<T = unknown>(url: string, params?: Record<string, unknown>, config?: RequestConfig) {
      return request<T>({ ...config, method: 'GET', url, params })
    },

    post<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'POST', url, data })
    },

    put<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'PUT', url, data })
    },

    patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'PATCH', url, data })
    },

    delete<T = unknown>(url: string, config?: RequestConfig) {
      return request<T>({ ...config, method: 'DELETE', url })
    }
  }
}

export type RequestMethods = ReturnType<typeof createRequest>
```

#### 核心：自动解包

注意这一行：

```ts
const response = await client.request<ApiResponse<T>>(config)
return response.data.data
```

axios 原生返回的是 `AxiosResponse` 对象，结构是：

```ts
{
  status: 200,
  headers: { ... },
  data: {                    // ← 这是 axios 的 data（HTTP 响应体）
    code: 200,
    data: { id: '1', ... }, // ← 这是后端 ApiResponse 的 data（真正的业务数据）
    message: 'success'
  }
}
```

所以 `response.data` 是 `ApiResponse<T>`，`response.data.data` 才是你真正要的业务数据。封装帮你做了这层解包，调用方直接拿到干净的数据。

#### 泛型 `<T>` 怎么用？

```ts
// 不传泛型 — 返回 unknown，需要自己断言
const data = await http.get('/documents')

// 传泛型 — 返回 Document[]，有完整类型提示
const documents = await http.get<Document[]>('/documents')
//    ^? Document[]
```

#### 各方法的参数说明

| 方法 | 参数 | 说明 |
|------|------|------|
| `get<T>(url, params?, config?)` | `params` 是 URL 查询参数 | `get('/docs', { page: 1 })` → `/docs?page=1` |
| `post<T>(url, data?, config?)` | `data` 是请求体 | `post('/docs', { title: '新文档' })` |
| `put<T>(url, data?, config?)` | `data` 是请求体 | `put('/docs/1', { title: '改名' })` |
| `patch<T>(url, data?, config?)` | `data` 是请求体 | `patch('/docs/1', { title: '改名' })` |
| `delete<T>(url, config?)` | 无请求体 | `delete('/docs/1')` |

`put` vs `patch`：`put` 通常表示整体替换，`patch` 表示部分更新。具体看后端怎么定义。

---

### 3.4 index.ts — 统一导出

```ts
export { createClient } from './client'
export { createRequest } from './request'
export type { RequestMethods } from './request'
export type { ApiResponse, CreateClientOptions, RequestConfig } from './types'
```

这个文件的作用是让外部只需要从一个入口导入：

```ts
// 好 — 从包入口导入
import { createClient, createRequest } from '@noter/api'

// 不好 — 直接引用内部文件路径（耦合内部结构）
import { createClient } from '@noter/api/src/client'
```

---

## 四、在前端（noter-web）中使用

### 4.1 安装依赖

在 `apps/noter-web` 目录下，添加对共享包的引用：

```bash
# 在项目根目录执行
pnpm --filter noter-web add @noter/api@workspace:*
```

或者手动在 `apps/noter-web/package.json` 的 `dependencies` 中添加：

```json
{
  "dependencies": {
    "@noter/api": "workspace:*"
  }
}
```

然后执行 `pnpm install`。

`workspace:*` 的意思是"使用本地 monorepo 中的 `@noter/api` 包"，不会从 npm 下载。

---

### 4.2 创建前端专属的 client 实例

在 `apps/noter-web/` 下创建 `services/client.ts`：

```ts
// apps/noter-web/services/client.ts
import { createClient, createRequest } from '@noter/api'

// 第一步：创建 axios 实例，配置前端特有的逻辑
const client = createClient({
  // 从环境变量读取 API 地址，Next.js 中 NEXT_PUBLIC_ 前缀的变量可在浏览器端访问
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',

  // 请求拦截：自动注入 token
  onRequest(config) {
    // 从 localStorage 读取登录时保存的 token
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },

  // 响应错误拦截：统一处理常见错误
  onResponseError(error) {
    const axiosError = error as import('axios').AxiosError

    switch (axiosError.response?.status) {
      case 401:
        // token 过期或未登录，清除本地 token 并跳转登录页
        localStorage.removeItem('token')
        window.location.href = '/login'
        break
      case 403:
        // 没有权限
        console.error('没有访问权限')
        break
      case 500:
        // 服务器错误
        console.error('服务器内部错误')
        break
    }

    // 继续抛出错误，让调用方的 try/catch 也能捕获
    return Promise.reject(error)
  }
})

// 第二步：基于实例创建请求方法
export const http = createRequest(client)
```

#### 为什么要 `typeof window !== 'undefined'`？

因为 Next.js 有服务端渲染（SSR），代码可能在 Node.js 环境执行，而 Node.js 没有 `localStorage`。这个判断确保只在浏览器端访问 `localStorage`。

#### 这个文件只需要创建一次

整个前端 app 只需要这一个 `client.ts`，所有业务接口都复用同一个 `http` 对象。

---

### 4.3 按业务模块组织接口

核心原则：**一个业务模块一个文件**。

#### 示例：用户模块

```ts
// apps/noter-web/services/user.ts
import { http } from './client'

// ---- 类型定义 ----

/** 用户信息 */
export interface User {
  id: string
  username: string
  email: string
  avatar: string
  createdAt: string
}

/** 登录请求参数 */
export interface LoginParams {
  email: string
  password: string
}

/** 登录响应 */
export interface LoginResult {
  token: string
  user: User
}

/** 注册请求参数 */
export interface RegisterParams {
  username: string
  email: string
  password: string
}

// ---- 接口定义 ----

export const userApi = {
  /** 登录 */
  login: (data: LoginParams) => http.post<LoginResult>('/auth/login', data),

  /** 注册 */
  register: (data: RegisterParams) => http.post<LoginResult>('/auth/register', data),

  /** 获取当前用户信息 */
  getProfile: () => http.get<User>('/user/profile'),

  /** 更新用户信息 */
  updateProfile: (data: Partial<Pick<User, 'username' | 'avatar'>>) =>
    http.patch<User>('/user/profile', data),

  /** 修改密码 */
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.post<void>('/user/change-password', data)
}
```

#### 示例：文档模块

```ts
// apps/noter-web/services/document.ts
import { http } from './client'

// ---- 类型定义 ----

export interface Document {
  id: string
  title: string
  content: string
  authorId: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface DocumentListParams {
  page?: number
  pageSize?: number
  keyword?: string
  tag?: string
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ---- 接口定义 ----

export const documentApi = {
  /** 获取文档列表（分页） */
  list: (params?: DocumentListParams) =>
    http.get<PaginatedResult<Document>>('/documents', params as Record<string, unknown>),

  /** 获取单个文档详情 */
  detail: (id: string) => http.get<Document>(`/documents/${id}`),

  /** 创建文档 */
  create: (data: Pick<Document, 'title' | 'content' | 'tags'>) =>
    http.post<Document>('/documents', data),

  /** 更新文档 */
  update: (id: string, data: Partial<Pick<Document, 'title' | 'content' | 'tags'>>) =>
    http.put<Document>(`/documents/${id}`, data),

  /** 删除文档 */
  delete: (id: string) => http.delete(`/documents/${id}`)
}
```

#### 统一导出

```ts
// apps/noter-web/services/index.ts
export { http } from './client'
export { userApi } from './user'
export { documentApi } from './document'

// 同时导出类型，方便其他地方使用
export type { User, LoginParams, LoginResult, RegisterParams } from './user'
export type { Document, DocumentListParams, PaginatedResult } from './document'
```

---

### 4.4 在页面 / 组件中调用

#### 示例 1：登录页面

```tsx
// apps/noter-web/app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { userApi } from '@/services'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')

    try {
      // 调用登录接口 — 返回值已经是 LoginResult 类型，不需要手动解包
      const result = await userApi.login({ email, password })

      // 保存 token
      localStorage.setItem('token', result.token)

      // 跳转到首页
      router.push('/')
    } catch (err) {
      setError('登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleLogin() }}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder='邮箱' />
      <input
        type='password'
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder='密码'
      />
      {error && <p>{error}</p>}
      <button type='submit' disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </button>
    </form>
  )
}
```

#### 示例 2：文档列表页面

```tsx
// apps/noter-web/app/documents/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { documentApi } from '@/services'
import type { Document, PaginatedResult } from '@/services'

export default function DocumentsPage() {
  const [data, setData] = useState<PaginatedResult<Document> | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    // 页码变化时重新请求
    documentApi.list({ page, pageSize: 10 }).then(setData)
  }, [page])

  if (!data) return <p>加载中...</p>

  return (
    <div>
      <h1>我的文档（共 {data.total} 篇）</h1>

      {data.list.map((doc) => (
        <div key={doc.id}>
          <h2>{doc.title}</h2>
          <p>更新于 {doc.updatedAt}</p>
        </div>
      ))}

      <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
        上一页
      </button>
      <span>第 {page} 页</span>
      <button onClick={() => setPage((p) => p + 1)}>下一页</button>
    </div>
  )
}
```

#### 示例 3：在 Next.js Server Component 中使用

```tsx
// apps/noter-web/app/documents/[id]/page.tsx
// 注意：这是 Server Component（没有 'use client'）
import { documentApi } from '@/services'

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  const doc = await documentApi.detail(params.id)

  return (
    <article>
      <h1>{doc.title}</h1>
      <div>{doc.content}</div>
    </article>
  )
}
```

> 注意：Server Component 中不能使用 `localStorage`，所以如果接口需要鉴权，你需要在 `onRequest` 中改用 cookie 或其他服务端可用的方式获取 token。

---

### 4.5 前端目录结构示例

```
apps/noter-web/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/
│   │   └── page.tsx
│   └── documents/
│       ├── page.tsx
│       └── [id]/
│           └── page.tsx
├── services/               # ← 所有接口都在这里
│   ├── client.ts           # axios 实例（只有一个）
│   ├── index.ts            # 统一导出
│   ├── user.ts             # 用户相关接口
│   └── document.ts         # 文档相关接口
├── components/             # 通用组件
├── package.json
└── tsconfig.json
```

---

## 五、在后端（noter-deno / Node.js）中使用

### 5.1 后端为什么也需要 HTTP 客户端？

后端不只是"被请求"的一方，很多场景下后端也需要主动发 HTTP 请求：

- 调用第三方 API（比如 OpenAI、微信支付、短信服务）
- 微服务之间互相调用
- Agent 调用外部工具 / 知识库接口

这些场景同样需要统一的 baseURL、超时、错误处理，所以复用 `@noter/api` 是合理的。

---

### 5.2 创建后端专属的 client 实例

```ts
// apps/noter-deno/src/lib/http-client.ts（或 apps/noter-node/src/lib/http-client.ts）
import { createClient, createRequest } from '@noter/api'

// ---- 调用自己后端的其他微服务 ----
const internalClient = createClient({
  baseURL: process.env.INTERNAL_API_URL || 'http://localhost:3002',
  timeout: 10_000,

  onRequest(config) {
    // 后端之间用内部 API Key 认证，而不是用户 token
    config.headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY || ''
    return config
  },

  onResponseError(error) {
    // 后端不跳转页面，而是记录日志
    console.error('[Internal API Error]', error)
    return Promise.reject(error)
  }
})

export const internalHttp = createRequest(internalClient)

// ---- 调用第三方 API（比如 OpenAI）----
const openaiClient = createClient({
  baseURL: 'https://api.openai.com/v1',
  timeout: 60_000, // AI 接口响应慢，超时设长一些

  onRequest(config) {
    config.headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`
    return config
  }
})

export const openaiHttp = createRequest(openaiClient)
```

注意和前端的区别：

| | 前端 | 后端 |
|---|---|---|
| token 来源 | `localStorage` | 环境变量 `process.env` |
| 错误处理 | 跳转登录页 | 记录日志 / 抛异常 |
| 实例数量 | 通常 1 个 | 可能多个（不同服务不同实例） |

---

### 5.3 后端接口组织示例

```ts
// apps/noter-deno/src/services/ai.ts
import { openaiHttp } from '../lib/http-client'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletion {
  id: string
  choices: { message: ChatMessage; finish_reason: string }[]
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export const aiService = {
  /** 调用 ChatGPT */
  chat: (messages: ChatMessage[]) =>
    openaiHttp.post<ChatCompletion>('/chat/completions', {
      model: 'gpt-4',
      messages
    }),

  /** 生成文本嵌入向量 */
  embedding: (input: string) =>
    openaiHttp.post<{ data: { embedding: number[] }[] }>('/embeddings', {
      model: 'text-embedding-3-small',
      input
    })
}
```

```ts
// apps/noter-deno/src/services/notification.ts
import { internalHttp } from '../lib/http-client'

export const notificationService = {
  /** 发送站内通知 */
  send: (userId: string, message: string) =>
    internalHttp.post('/notifications', { userId, message })
}
```

后端的目录结构：

```
apps/noter-deno/src/
├── lib/
│   └── http-client.ts      # axios 实例（可能多个）
├── services/
│   ├── ai.ts               # AI 相关外部接口
│   └── notification.ts     # 内部微服务接口
├── routes/                  # 路由 / 控制器
└── index.ts                 # 入口
```

---

## 六、完整调用链路图解

以前端调用"获取文档列表"为例，数据流经的每一层：

```
页面组件调用
  documentApi.list({ page: 1 })
        │
        ▼
services/document.ts
  http.get<PaginatedResult<Document>>('/documents', { page: 1 })
        │
        ▼
@noter/api — request.ts
  request<T>({ method: 'GET', url: '/documents', params: { page: 1 } })
  → 调用 client.request(config)
        │
        ▼
@noter/api — client.ts（请求拦截器）
  onRequest(config)
  → 注入 Authorization: Bearer xxx
  → 最终 config: { baseURL: 'http://localhost:3001', url: '/documents', params: { page: 1 }, headers: { Authorization: 'Bearer xxx' } }
        │
        ▼
axios 发出 HTTP 请求
  GET http://localhost:3001/documents?page=1
  Headers: { Authorization: 'Bearer xxx', Content-Type: 'application/json' }
        │
        ▼
后端返回响应
  {
    "code": 200,
    "data": { "list": [...], "total": 42, "page": 1, "pageSize": 10 },
    "message": "success"
  }
        │
        ▼
@noter/api — client.ts（响应拦截器）
  状态码 200 → 直接通过（不触发 onResponseError）
        │
        ▼
@noter/api — request.ts
  response.data.data → 自动解包，取出 { list: [...], total: 42, page: 1, pageSize: 10 }
        │
        ▼
页面组件拿到数据
  const data: PaginatedResult<Document> = { list: [...], total: 42, page: 1, pageSize: 10 }
```

如果请求失败（比如 401）：

```
后端返回 HTTP 401
        │
        ▼
@noter/api — client.ts（响应拦截器）
  onResponseError(error)
  → 清除 token，跳转 /login
  → return Promise.reject(error)
        │
        ▼
调用方的 catch 块
  catch (err) { setError('请求失败') }
```

---

## 七、进阶用法

### 7.1 跳过统一错误处理

有时候你不想让某个请求触发全局的错误处理（比如"检查用户名是否已存在"这种接口，404 是正常的）：

```ts
// RequestConfig 中有 skipErrorHandler 字段
try {
  const user = await http.get<User>('/users/check', { username: 'test' }, {
    skipErrorHandler: true
  })
  console.log('用户名已存在')
} catch {
  console.log('用户名可用')
}
```

要让这个生效，你需要在 `onResponseError` 中判断：

```ts
onResponseError(error) {
  const axiosError = error as import('axios').AxiosError<unknown, unknown> & {
    config?: { skipErrorHandler?: boolean }
  }

  // 如果标记了跳过，直接抛出，不做任何处理
  if (axiosError.config?.skipErrorHandler) {
    return Promise.reject(error)
  }

  // 否则执行统一错误处理...
  switch (axiosError.response?.status) {
    case 401:
      // ...
  }

  return Promise.reject(error)
}
```

---

### 7.2 使用原始 request 方法

`createRequest` 返回的对象中有一个 `request` 方法，它接受完整的 `RequestConfig`，适合不常见的请求方式：

```ts
// 比如 HEAD 请求
const result = await http.request<void>({
  method: 'HEAD',
  url: '/documents/1'
})
```

---

### 7.3 上传文件

上传文件需要用 `FormData`，并且修改 `Content-Type`：

```ts
export const fileApi = {
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return http.post<{ url: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
```

使用：

```tsx
const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  const { url } = await fileApi.upload(file)
  console.log('文件地址:', url)
}
```

---

### 7.4 创建多个 client 实例

如果你的前端需要同时对接多个后端服务：

```ts
// services/client.ts
import { createClient, createRequest } from '@noter/api'

// 主 API
const mainClient = createClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  onRequest(config) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  }
})

// 文件服务（独立的上传/下载服务）
const fileClient = createClient({
  baseURL: process.env.NEXT_PUBLIC_FILE_URL || 'http://localhost:3002',
  timeout: 60_000 // 上传大文件需要更长超时
})

export const http = createRequest(mainClient)
export const fileHttp = createRequest(fileClient)
```

---

## 八、常见问题

### Q: 后端返回的格式不是 `{ code, data, message }` 怎么办？

修改 `packages/api/src/types.ts` 中的 `ApiResponse` 接口，以及 `request.ts` 中的解包逻辑。

比如后端返回 `{ success: true, result: {...}, error: null }`：

```ts
// types.ts
export interface ApiResponse<T = unknown> {
  success: boolean
  result: T
  error: string | null
}

// request.ts 中对应修改
return response.data.result  // 而不是 response.data.data
```

### Q: 我想在请求时显示全局 loading，怎么做？

在 `onRequest` 和 `onResponseError` 中控制：

```ts
import { loadingStore } from '@/stores/loading' // 你的状态管理

createClient({
  baseURL: '...',
  onRequest(config) {
    loadingStore.show()
    return config
  },
  onResponseError(error) {
    loadingStore.hide()
    return Promise.reject(error)
  }
})
```

同时在响应成功时也要隐藏 loading。这需要在 `client.ts` 的响应成功拦截器中加逻辑，你可以扩展 `CreateClientOptions` 增加一个 `onResponse` 钩子。

### Q: 如何给所有请求加上自定义 header？

在 `onRequest` 中添加：

```ts
onRequest(config) {
  config.headers['X-App-Version'] = '1.0.0'
  config.headers['X-Platform'] = 'web'
  return config
}
```

### Q: 新增一个业务模块的接口，步骤是什么？

1. 在 `services/` 下新建文件，比如 `services/tag.ts`
2. 定义类型和接口方法（参考 `document.ts` 的写法）
3. 在 `services/index.ts` 中导出
4. 在页面中 `import { tagApi } from '@/services'` 使用

就这四步，不需要改 `@noter/api` 的任何代码。
