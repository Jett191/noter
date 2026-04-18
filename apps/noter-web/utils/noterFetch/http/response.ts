import { NextResponse } from 'next/server'

export function success<T>(data?: T, message = 'success', status = 200) {
  return NextResponse.json(
    {
      code: status,
      message,
      data: data ?? null
    },
    { status }
  )
}

export function error(message = 'failed', status = 400, data: unknown = null) {
  return NextResponse.json(
    {
      code: status,
      message,
      data
    },
    { status }
  )
}
