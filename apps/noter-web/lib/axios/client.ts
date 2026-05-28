// apps/noter-web/services/client.ts
import { createClient, createRequest } from '@noter/api'

type HttpError = {
  response?: {
    status?: number
    msg?: string
  }
}

// 第一步：创建 axios 实例，配置前端特有的逻辑
const client = createClient({
  // 从环境变量读取 API 地址，Next.js 中 NEXT_PUBLIC_ 前缀的变量可在浏览器端访问
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',

  // // 请求拦截：自动注入 token
  // onRequest(config) {
  //   // 从 localStorage 读取登录时保存的 token
  //   const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  //   if (token) {
  //     config.headers.Authorization = `Bearer ${token}`
  //   }

  //   return config
  // },

  // 响应错误拦截：统一处理常见错误
  onResponseError(error) {
    const axiosError = error as HttpError
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
