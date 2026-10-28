'use client'

import { ErrorScreen } from '@/components/ui/ErrorScreen'

/* The site broke while drawing a page: see ErrorScreen. */
export default function SiteError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorScreen error={error} retry={unstable_retry} home={{ href: '/app', label: 'Open Acture' }} />
}
