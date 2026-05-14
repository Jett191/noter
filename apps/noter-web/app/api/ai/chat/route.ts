import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const AGENT_URL = process.env.NOTER_AGENT_URL || 'http://localhost:3002'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { documentId, messages } = body

    if (!documentId || !messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Verify document belongs to user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .eq('deleted', 0)
      .single()

    if (docError || !document) {
      return new Response(JSON.stringify({ error: '文档不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Forward to noter-agent
    const agentResponse = await fetch(`${AGENT_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, messages })
    })

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text()
      return new Response(JSON.stringify({ error: `Agent error: ${errorText}` }), {
        status: agentResponse.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Stream the SSE response through
    return new Response(agentResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器错误'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
