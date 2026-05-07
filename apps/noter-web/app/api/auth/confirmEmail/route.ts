import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { emailConfirmSchema } from '@/utils/feature/auth/schmas'
import { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const validTypes: EmailOtpType[] = ['email', 'signup', 'invite', 'recovery', 'email_change']

export const GET = handler(async (request: Request) => {
  const supabase = await createClient()
  const { searchParams, origin } = new URL(request.url)

  const params = {
    type: searchParams.get('type'),
    token_hash: searchParams.get('token_hash')
  }

  const { type, token_hash } = emailConfirmSchema.parse(params)

  if (!token_hash || !type || !validTypes.includes(type as EmailOtpType)) {
    return NextResponse.redirect(new URL('/login?error=invalid_callback_params', origin))
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as EmailOtpType
  })

  if (verifyError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(verifyError.message)}`, origin)
    )
  }

  return NextResponse.redirect(new URL('/notes', origin))
})
