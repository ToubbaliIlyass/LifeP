import { notFound } from 'next/navigation'
import { ToastLab } from './ToastLab'

/*
 * Development only: every toast the app can show, played one after another
 * (or one at a time), so the island can be looked at without having to
 * trigger each from the app. Not found in production.
 *
 *   /dev/toasts
 */
export default function ToastsPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ToastLab />
}
