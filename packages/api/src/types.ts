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
