import type { MetadataRoute } from 'next'
import { PUBLIC_PATHS, url } from '@/lib/site'

/*
 * The indexable pages only. No lastModified: none of these has a true edit
 * date in data, and a build time on every URL teaches Google to ignore the
 * field. Add it per page if a page ever gets a real "updated" date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: url(path) }))
}
