import type { Resource } from '../../shared/api';

export function mediaUrl(key: string): string {
  const id = key.split('/').at(-1);
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `/api/catalog/api/v1/media/${encodeURIComponent(id)}` : '';
}
function localEditorialImage(place: Resource): string {
  const raw = [place.name_en, place.name_vi, place.name, place.address, place.region, place.province].filter(value => typeof value === 'string').join(' ').toLocaleLowerCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const images: Array<[RegExp, string]> = [
    [/ngu hanh son|marble mountains/, 'marble-mountains.webp'],
    [/hoi an/, 'hoi-an.webp'],
    [/ninh binh|tam coc|trang an/, 'ninh-binh.webp'],
    [/ha long|halong/, 'ha-long.webp'],
    [/hue|thua thien|dai noi|thien mu/, 'hue.webp'],
    [/da nang|my khe|cau rong|ba na/, 'da-nang.webp'],
    [/da lat|xuan huong/, 'da-lat.webp'],
    [/ha noi|hanoi|hoan kiem|ho guom|van mieu|long bien|bao tang dan toc hoc|dong xuan/, 'ha-noi.webp'],
    [/ho chi minh|sai gon|ben thanh|ben bach dang|nguyen hue|independence palace|dinh doc lap|nha rong|nha tho duc ba/, 'ho-chi-minh.webp'],
  ];
  const match = images.find(([pattern]) => pattern.test(normalized));
  return match ? `/images/editorial/${match[1]}` : '';
}
export function placeImageCandidates(place: Resource): string[] {
  const candidates: string[] = [];
  if (Array.isArray(place.media_keys)) {
    for (const key of place.media_keys) { const url = typeof key === 'string' ? mediaUrl(key) : ''; if (url) candidates.push(url); }
  }
  const localImage = localEditorialImage(place);
  if (localImage) candidates.push(localImage);
  if (typeof place.image_url === 'string') candidates.push(place.image_url);
  if (typeof place.cover_image === 'string') candidates.push(place.cover_image);
  return [...new Set(candidates)];
}
export function placeImage(place: Resource): string {
  return placeImageCandidates(place)[0] ?? '';
}
