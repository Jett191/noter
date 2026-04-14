import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  try {
    const body = await request.json()

    const email = body.email?.trim()
    const password = body.password?.trim()

    if (!email || !password) {
      return NextResponse.json({ code: 400, message: '参数不完整' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) {
      return NextResponse.json({ code: 400, message: error.message }, { status: 400 })
    }

    return NextResponse.json({
      code: 200,
      message: '登陆成功',
      data
    })
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : '服务器错误'
      },
      { status: 500 }
    )
  }
}
