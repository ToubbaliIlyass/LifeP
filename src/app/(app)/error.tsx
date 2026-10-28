'use client'

import { ErrorScreen } from '@/components/ui/ErrorScreen'

/* The app broke while drawing a page: see ErrorScreen. */
export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ErrorScreen error={error} retry={unstable_retry} home={{ href: '/', label: 'Back to home' }} />
}
