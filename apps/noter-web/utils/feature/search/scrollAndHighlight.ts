/**
 * 在指定根节点内查找首个匹配文本，返回该文本所属的最近块级元素。
 * 跨多个 inline 文本节点的匹配也能命中，因为我们把所有文本节点拼接成一个扁平字符串。
 */
export function findFirstMatchInDom(root: HTMLElement, phrase: string): HTMLElement | null {
  const target = phrase.trim()
  if (!target) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number; end: number }[] = []
  let flat = ''
  let n: Node | null = walker.nextNode()
  while (n) {
    const t = n as Text
    const text = t.nodeValue ?? ''
    nodes.push({ node: t, start: flat.length, end: flat.length + text.length })
    flat += text
    n = walker.nextNode()
  }

  const lower = flat.toLowerCase()
  const idx = lower.indexOf(target.toLowerCase())
  if (idx < 0) return null

  const startNode = nodes.find((it) => idx >= it.start && idx < it.end)
  if (!startNode) return null

  // 向上找最近的块级容器；如果一路都是 inline，退回到 root
  let el: HTMLElement | null = startNode.node.parentElement
  while (el && el !== root) {
    const display = window.getComputedStyle(el).display
    if (display && display !== 'inline' && display !== 'inline-block' && display !== 'contents') {
      break
    }
    el = el.parentElement
  }
  return el ?? root
}

/**
 * 平滑滚动到目标元素，并对其做两次黄色背景闪烁提示。
 * 通过保存原始内联样式实现无副作用还原，保证不污染主题色。
 */
export function scrollAndFlash(target: HTMLElement, offsetPx = 120): void {
  const top = target.getBoundingClientRect().top + window.scrollY - offsetPx
  window.scrollTo({ top, behavior: 'smooth' })

  const originalBg = target.style.backgroundColor
  const originalTransition = target.style.transition
  const originalRadius = target.style.borderRadius
  const originalBoxShadow = target.style.boxShadow

  target.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease'
  target.style.borderRadius = target.style.borderRadius || '6px'

  const apply = () => {
    target.style.backgroundColor = 'rgba(250, 204, 21, 0.45)'
    target.style.boxShadow = '0 0 0 6px rgba(250, 204, 21, 0.25)'
  }
  const clear = () => {
    target.style.backgroundColor = 'transparent'
    target.style.boxShadow = 'none'
  }
  const restore = () => {
    target.style.backgroundColor = originalBg
    target.style.transition = originalTransition
    target.style.borderRadius = originalRadius
    target.style.boxShadow = originalBoxShadow
  }

  // 两次闪烁：apply -> clear -> apply -> clear -> restore
  const blink = (count: number) => {
    if (count <= 0) {
      restore()
      return
    }
    apply()
    setTimeout(() => {
      clear()
      setTimeout(() => blink(count - 1), 280)
    }, 380)
  }

  // 等滚动开始一小会再闪，避免还在视口外就闪完了
  setTimeout(() => blink(2), 320)
}

/**
 * 从搜索结果片段中提取用于 DOM 定位的候选短语。
 * - 优先提取首个 <mark>...</mark> 内的纯文本
 * - 其次取片段开头一段纯文本
 */
export function buildMatchAnchor(rawSnippet: string): string {
  const stripped = stripForAnchor(rawSnippet)
  const markMatch = /<mark>([\s\S]*?)<\/mark>/i.exec(rawSnippet)
  const candidate = markMatch ? stripForAnchor(markMatch[1]) : stripped
  // 控制 URL 长度，且太长反而容易因换行/空白差异匹配不上
  return candidate.slice(0, 60)
}

function stripForAnchor(text: string): string {
  return text
    .replace(/<\/?[^>]+>/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)([^*_\n]+?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
