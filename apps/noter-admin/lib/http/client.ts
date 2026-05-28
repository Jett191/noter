'use client'

/**
 * axios 客户端 + 响应拦截器
 *
 * 设计参见 design.md §8.2:
 *   - HTTP 客户端:axios + 响应拦截器
 *   - 401 + code='admin_auth_required' → 自动跳转 /sign-in?reason=session_expired
 *   - 504 / 网络异常统一通过 toast 提示(由调用方处理)
 *
 * Requirements: 1, 2
 */

import axios from 'axios'

const httpClient = axios.create({
  baseURL: '',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 响应拦截器:捕获 401 admin_auth_required 自动跳转登录页
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response

      if (status === 401 && data?.code === 'admin_auth_required') {
        // 避免在服务端执行 window 操作
        if (typeof window !== 'undefined') {
          window.location.href = '/sign-in?reason=session_expired'
        }
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default httpClient
