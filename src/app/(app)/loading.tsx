import { AppLoading } from '@/components/AppLoading'

/*
 * What a page of the app shows while it is on its way: Tuck, digging. The
 * lists themselves are a client page that holds its own loader (AppLoading,
 * until settings arrive), so this one is for the navigation in between.
 */
export default function Loading() {
  return <AppLoading />
}
