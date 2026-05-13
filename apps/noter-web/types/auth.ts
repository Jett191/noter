// ⽤户信息
export interface User {
  id: string
  username: string
  email: string
  password?: string
}

export interface CurrentUser {
  id: string
  username: string
  email: string
  avatarUrl: string | null
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
}
// 登录请求参数
export interface LoginParams {
  email: string
  password: string
}
// 登录响应
export interface LoginResult {
  token: string
  user: User
}
// 注册请求参数
export interface RegisterParams {
  username: string
  email: string
  password: string
}
// 注册响应
export interface SignupResult {
  code: number
  data: object
  message: string
}

export interface EmailConfirmParams {
  type: string
  token_hash: string
}

export interface UpdateProfileParams {
  username?: string
  avatarUrl?: string | null
}

export interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
}

export interface ChangeEmailParams {
  newEmail: string
}

export interface GithubOAuthResult {
  url: string
}
