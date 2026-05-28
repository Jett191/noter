import {
  CurrentUser,
  GithubOAuthResult,
  LoginParams,
  LoginResult,
  RegisterParams,
  SignupResult,
  UpdateProfileParams,
  ChangePasswordParams,
  ChangeEmailParams
} from '@/types/auth'
import { http } from './client'

export const userApi = {
  // 登录
  login: (data: LoginParams) => http.post<LoginResult>('api/auth/signin', data),

  // 注册
  register: (data: RegisterParams) => http.postMeta<SignupResult>('api/auth/register', data),

  // 退出登录
  signout: () => http.post<void>('api/auth/signout'),

  // 获取当前用户信息
  getProfile: () => http.get<CurrentUser>('api/auth/profile'),

  // 更新用户信息（用户名）
  updateProfile: (data: UpdateProfileParams) => http.patch<CurrentUser>('api/auth/profile', data),

  // 上传头像
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return http.post<CurrentUser>('api/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  // 修改密码
  changePassword: (data: ChangePasswordParams) => http.post<void>('api/auth/change-password', data),

  // 修改邮箱
  changeEmail: (data: ChangeEmailParams) => http.post<void>('api/auth/change-email', data),

  // GitHub OAuth 登录 — 获取跳转 URL
  githubLogin: () => http.post<GithubOAuthResult>('api/auth/github')
}
