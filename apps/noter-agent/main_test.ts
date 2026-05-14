import { assertEquals } from '@std/assert'

Deno.test('health endpoint returns ok', async () => {
  // Import the server module to start it
  const port = 3099 // Use a different port for testing
  Deno.env.set('PORT', String(port))
  Deno.env.set('MIMO_API_KEY', 'test')
  Deno.env.set('MIMO_API_ENDPOINT', 'http://localhost:9999')
  Deno.env.set('MIMO_MODEL', 'test-model')
  Deno.env.set('SUPABASE_URL', 'http://localhost:9999')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test')
  Deno.env.set('EMBEDDING_API_KEY', 'test')

  const response = await fetch(`http://localhost:${port}/health`)
  const data = await response.json()
  assertEquals(data.status, 'ok')
})
