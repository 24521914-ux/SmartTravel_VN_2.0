import type { Resource } from '../../shared/api';

export function mediaUrl(key: string): string {
  const id = key.split('/').at(-1);
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `/api/catalog/api/v1/media/${encodeURIComponent(id)}` : '';
}
export function placeImage(place: Resource): string {
  if (Array.isArray(place.media_keys)) {
    for (const key of place.media_keys) { const url = typeof key === 'string' ? mediaUrl(key) : ''; if (url) return url; }
  }
  return typeof place.image_url === 'string' ? place.image_url : typeof place.cover_image === 'string' ? place.cover_image : '';
}
