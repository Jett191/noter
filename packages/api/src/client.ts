import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { CreateClientOptions } from './types'

/**
 * 创建一个配置好拦截器的 axios 实例
 * 每个 app 可以用不同的 baseURL / token 策略创建自己的 client
 */
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
