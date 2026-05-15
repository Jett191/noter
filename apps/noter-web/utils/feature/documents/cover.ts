/**
 * 文档卡片自定义封面：把用户上传的图片以 dataURL 形式存到 localStorage，
 * key = `noter:cover:${docId}`。删除文档时一并清理。
 *
 * 注：localStorage 容量约 5MB，单图压缩到 800px 以下、小于 ~500KB。
 */

const KEY_PREFIX = 'noter:cover:'

export function getCustomCover(documentId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(KEY_PREFIX + documentId)
  } catch {
    return null
  }
}

export function setCustomCover(documentId: string, dataUrl: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY_PREFIX + documentId, dataUrl)
    // 通知同一标签页其他卡片刷新
    window.dispatchEvent(new CustomEvent('noter:cover-updated', { detail: { documentId } }))
  } catch (err) {
    console.error('Failed to save custom cover:', err)
    throw err
  }
}

export function removeCustomCover(documentId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY_PREFIX + documentId)
    window.dispatchEvent(new CustomEvent('noter:cover-updated', { detail: { documentId } }))
  } catch {
    // ignore
  }
}

/**
 * 把用户选择的图片文件压缩成 dataURL，最长边不超过 maxSize。
 * 默认 800px。
 */
export async function compressImageToDataURL(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          } else {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建 canvas 上下文'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        // 0.85 的 JPEG 质量在大多数封面图上效果好且体积小
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
