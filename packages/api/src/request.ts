import type { AxiosInstance } from 'axios'
import type { ApiResponse, RequestConfig } from './types'

export function createRequest(client: AxiosInstance) {
  async function request<T = unknown>(config: RequestConfig): Promise<T | null> {
    const response = await client.request<ApiResponse<T>>(config)
    return response.data.data
  }

  async function requestMeta<T = unknown>(config: RequestConfig): Promise<ApiResponse<T>> {
    const response = await client.request<ApiResponse<T>>(config)
    return response.data
  }

  return {
    request,
    requestMeta,

    get<T = unknown>(url: string, params?: Record<string, unknown>, config?: RequestConfig) {
      return request<T>({ ...config, method: 'GET', url, params })
    },

    getMeta<T = unknown>(url: string, params?: Record<string, unknown>, config?: RequestConfig) {
      return requestMeta<T>({ ...config, method: 'GET', url, params })
    },

    post<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'POST', url, data })
    },

    postMeta<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return requestMeta<T>({ ...config, method: 'POST', url, data })
    },

    put<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'PUT', url, data })
    },

    putMeta<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return requestMeta<T>({ ...config, method: 'PUT', url, data })
    },

    patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return request<T>({ ...config, method: 'PATCH', url, data })
    },

    patchMeta<T = unknown>(url: string, data?: unknown, config?: RequestConfig) {
      return requestMeta<T>({ ...config, method: 'PATCH', url, data })
    },

    delete<T = unknown>(url: string, config?: RequestConfig) {
      return request<T>({ ...config, method: 'DELETE', url })
    },

    deleteMeta<T = unknown>(url: string, config?: RequestConfig) {
      return requestMeta<T>({ ...config, method: 'DELETE', url })
    }
  }
}

export type RequestMethods = ReturnType<typeof createRequest>
