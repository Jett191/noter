import { Pool } from '@db/postgres'

// 从环境变量读取数据库地址
const DATABASE_URL = Deno.env.get('DATABASE_IP')

export async function testDB() {
  const client = await pool.connect()

  try {
    const result = await client.queryObject('SELECT 1')
    console.log('数据库连接成功', result.rows)
  } finally {
    client.release()
  }
}

// 创建连接池
export const pool = new Pool(DATABASE_URL, 10, true)
