'use client'

import { useCallback, useRef, useState } from 'react'
import type { FileUIPart } from 'ai'
import { FileText, Paperclip, X } from 'lucide-react'

/**
 * Screenshots, photos and PDFs attached to a chat message.
 *
 * They exist only to be read: the file goes to the model with the message,
 * the assistant turns what matters into tasks, events or notes, and the file
 * itself is not stored anywhere. Only the message it was sent with carries
 * it — later turns replace it with a placeholder (see /api/chat) instead of
 * paying to resend it.
 */

export const MAX_ATTACHMENTS = 5
const MAX_PDF_BYTES = 8 * 1024 * 1024
/** Big enough that small text in a screenshot stays legible, small enough to upload quickly. */
const MAX_IMAGE_EDGE = 2000

export interface Attachment {
  id: string
  part: FileUIPart
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Phone photos arrive at 12MP; nothing the model reads needs that. */
async function shrinkImage(file: File): Promise<{ url: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close()
      return { url: await readAsDataUrl(file), mediaType: file.type }
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return { url: canvas.toDataURL('image/jpeg', 0.88), mediaType: 'image/jpeg' }
  } catch {
    // HEIC and friends the browser cannot decode: send as-is and let the model try.
    return { url: await readAsDataUrl(file), mediaType: file.type || 'image/jpeg' }
  }
}

export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const count = useRef(0)

  const add = useCallback(async (files: FileList | File[]) => {
    setError(null)
    for (const file of Array.from(files)) {
      if (count.current >= MAX_ATTACHMENTS) {
        setError(`Up to ${MAX_ATTACHMENTS} files per message.`)
        break
      }
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) {
        setError(`${file.name}: only images and PDFs can be read.`)
        continue
      }
      if (isPdf && file.size > MAX_PDF_BYTES) {
        setError(`${file.name} is over 8 MB. Try exporting just the pages you need.`)
        continue
      }
      count.current++
      try {
        const { url, mediaType } = isPdf
          ? { url: await readAsDataUrl(file), mediaType: 'application/pdf' }
          : await shrinkImage(file)
        const part: FileUIPart = { type: 'file', mediaType, filename: file.name || (isPdf ? 'document.pdf' : 'screenshot'), url }
        setItems((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, part }])
      } catch {
        count.current--
        setError(`Could not read ${file.name}.`)
      }
    }
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((a) => a.id !== id)
      count.current = next.length
      return next
    })
  }, [])

  const clear = useCallback(() => {
    count.current = 0
    setItems([])
    setError(null)
  }, [])

  return { items, error, add, remove, clear }
}

export function AttachButton({ onFiles, disabled, className = '' }: { onFiles: (files: FileList) => void; disabled?: boolean; className?: string }) {
  return (
    <label
      title="Attach a screenshot, photo or PDF"
      className={`shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      <Paperclip className="w-4 h-4" />
      <input
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}

export function AttachmentStrip({ items, onRemove, error }: { items: Attachment[]; onRemove: (id: string) => void; error: string | null }) {
  if (items.length === 0 && !error) return null
  return (
    <div className="mb-2">
      {items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((a) => (
            <div key={a.id} className="relative shrink-0">
              <FilePreview part={a.part} size="sm" />
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`Remove ${a.part.filename ?? 'attachment'}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  )
}

export function FilePreview({ part, size = 'md' }: { part: FileUIPart; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-14 max-w-[140px]' : 'h-28 max-w-[220px]'
  if (part.mediaType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimise
    return <img src={part.url} alt={part.filename ?? 'attachment'} className={`${box} w-auto rounded-lg border border-border/60 object-cover`} />
  }
  return (
    <div className={`${size === 'sm' ? 'h-14' : 'h-12'} flex items-center gap-2 px-3 rounded-lg border border-border/60 bg-muted/40 max-w-[220px]`}>
      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="text-[12px] truncate">{part.filename ?? 'document.pdf'}</span>
    </div>
  )
}
