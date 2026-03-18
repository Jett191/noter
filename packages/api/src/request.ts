import type { AxiosInstance } from 'axios'
import type { ApiResponse, RequestConfig } from './types'

/**
 * 基于 axios 实例创建类型安全的请求方法集合
 * 所有方法自动解包 ApiResponse，直接返回 data
 */
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
