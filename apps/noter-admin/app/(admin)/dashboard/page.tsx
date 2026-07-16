'use client'

/**
 * Dashboard 仪表盘页
 *
 * 设计参见 design.md §8.1 (Dashboard):
 *   - 6 张 MetricCard:展示当前值 + 昨日同比
 *   - 2 张 TrendChart:注册趋势 + 文档趋势(Recharts LineChart)
 *   - 2 张 DistributionChart:文档状态饼图 + 公共标签 top 10 饼图(Recharts PieChart)
 *   - 骨架占位(loading 状态)
 *
 * Requirements: 4, 5, 6
 */

import { useState, useEffect } from 'react'
import httpClient from '@/lib/http/client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

// ─── 类型定义 ───

interface MetricValue {
  value: number
  yesterday: number
}

interface Metrics {
  totalUsers: MetricValue
  totalDocuments: MetricValue
  todayNewUsers: MetricValue
  todayNewDocuments: MetricValue
  activeUsers7d: MetricValue
  totalStorage: MetricValue
}

interface TrendPoint {
  date: string
  count: number
}

interface DistributionItem {
  status?: string
  name?: string
  count?: number
  documentCount?: number
}

// ─── 颜色常量 ───

const PIE_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1'
]

const STATUS_COLORS: Record<string, string> = {
  processing: '#f59e0b',
  ready: '#10b981',
  failed: '#ef4444'
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [registrations, setRegistrations] = useState<TrendPoint[]>([])
  const [documents, setDocuments] = useState<TrendPoint[]>([])
  const [documentStatus, setDocumentStatus] = useState<DistributionItem[]>([])
  const [topTags, setTopTags] = useState<DistributionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true)
      try {
        const [metricsRes, trendsRes, distRes] = await Promise.all([
          httpClient.get('/api/admin/dashboard/metrics'),
          httpClient.get('/api/admin/dashboard/trends', { params: { days: 30 } }),
          httpClient.get('/api/admin/dashboard/distributions')
        ])

        setMetrics(metricsRes.data.data.metrics)
        setRegistrations(trendsRes.data.data.registrations)
        setDocuments(trendsRes.data.data.documents)
        setDocumentStatus(distRes.data.data.documentStatus)
        setTopTags(distRes.data.data.topTags)
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className='space-y-6'>
      {/* 指标卡片 */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {metrics && (
          <>
            <MetricCard title='总用户数' metric={metrics.totalUsers} />
            <MetricCard title='总文档数' metric={metrics.totalDocuments} />
            <MetricCard title='今日新注册' metric={metrics.todayNewUsers} />
            <MetricCard title='今日新文档' metric={metrics.todayNewDocuments} />
            <MetricCard title='7日活跃用户' metric={metrics.activeUsers7d} />
            <MetricCard title='总存储' metric={metrics.totalStorage} format='storage' />
          </>
        )}
      </div>

      {/* 趋势图 */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <TrendChart title='用户注册趋势（近30天）' data={registrations} color='#3b82f6' />
        <TrendChart title='文档上传趋势（近30天）' data={documents} color='#10b981' />
      </div>

      {/* 分布图 */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <DistributionChart
          title='文档状态分布'
          data={documentStatus.map((d) => ({
            name: getStatusLabel(d.status || ''),
            value: d.count || 0,
            color: STATUS_COLORS[d.status || ''] || '#6b7280'
          }))}
        />
        <DistributionChart
          title='公共标签 Top 10'
          data={topTags.map((t, i) => ({
            name: t.name || '未知',
            value: t.documentCount || 0,
            color: PIE_COLORS[i % PIE_COLORS.length]
          }))}
        />
      </div>
    </div>
  )
}

// ─── MetricCard 组件 ───

function MetricCard({
  title,
  metric,
  format
}: {
  title: string
  metric: MetricValue
  format?: 'storage'
}) {
  const displayValue =
    format === 'storage' ? formatBytes(metric.value) : metric.value.toLocaleString()
  const diff = metric.value - metric.yesterday
  const isPositive = diff > 0
  const isNegative = diff < 0

  return (
    <div className='rounded-lg border border-gray-200 bg-white p-5'>
      <p className='text-sm font-medium text-gray-500'>{title}</p>
      <p className='mt-2 text-2xl font-bold text-gray-900'>{displayValue}</p>
      <div className='mt-1 flex items-center gap-1 text-xs'>
        <span className='text-gray-400'>较昨日</span>
        {isPositive && (
          <span className='text-green-600'>+{format === 'storage' ? formatBytes(diff) : diff}</span>
        )}
        {isNegative && (
          <span className='text-red-600'>
            {format === 'storage' ? `-${formatBytes(Math.abs(diff))}` : diff}
          </span>
        )}
        {!isPositive && !isNegative && <span className='text-gray-400'>持平</span>}
      </div>
    </div>
  )
}

// ─── TrendChart 组件 ───

function TrendChart({ title, data, color }: { title: string; data: TrendPoint[]; color: string }) {
  return (
    <div className='rounded-lg border border-gray-200 bg-white p-5'>
      <h3 className='mb-4 text-sm font-medium text-gray-700'>{title}</h3>
      <div className='h-64'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis
              dataKey='date'
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              labelFormatter={(label) => `日期: ${label}`}
              formatter={(value) => [value, '数量']}
            />
            <Line
              type='monotone'
              dataKey='count'
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── DistributionChart 组件 ───

function DistributionChart({
  title,
  data
}: {
  title: string
  data: { name: string; value: number; color: string }[]
}) {
  return (
    <div className='rounded-lg border border-gray-200 bg-white p-5'>
      <h3 className='mb-4 text-sm font-medium text-gray-700'>{title}</h3>
      <div className='h-64'>
        {data.length === 0 ? (
          <div className='flex h-full items-center justify-center text-sm text-gray-400'>
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Pie
                data={data}
                cx='50%'
                cy='50%'
                innerRadius={50}
                outerRadius={80}
                dataKey='value'
                nameKey='name'
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value, '数量']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── 骨架占位 ───

function DashboardSkeleton() {
  return (
    <div className='space-y-6'>
      {/* 指标卡片骨架 */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-lg border border-gray-200 bg-white p-5'>
            <div className='h-4 w-20 rounded bg-gray-200' />
            <div className='mt-3 h-7 w-24 rounded bg-gray-200' />
            <div className='mt-2 h-3 w-16 rounded bg-gray-200' />
          </div>
        ))}
      </div>

      {/* 趋势图骨架 */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-lg border border-gray-200 bg-white p-5'>
            <div className='h-4 w-40 rounded bg-gray-200' />
            <div className='mt-4 h-64 rounded bg-gray-100' />
          </div>
        ))}
      </div>

      {/* 分布图骨架 */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-lg border border-gray-200 bg-white p-5'>
            <div className='h-4 w-32 rounded bg-gray-200' />
            <div className='mt-4 h-64 rounded bg-gray-100' />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 辅助函数 ───

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'processing':
      return '处理中'
    case 'ready':
      return '正常'
    case 'failed':
      return '失败'
    default:
      return status
  }
}
