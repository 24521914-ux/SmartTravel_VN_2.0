import type { Resource } from '../../shared/api';

export function placeIdOf(place: Resource): string {
  return String(place.place_id ?? place.id ?? '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mediaUrl(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  const id = trimmed.split('/').at(-1);
  return id && UUID_RE.test(id)
    ? `/api/catalog/api/v1/media/${encodeURIComponent(id)}`
    : '';
}

function extractEntryUrls(entry: unknown): string[] {
  if (typeof entry === 'string') {
    const resolved = mediaUrl(entry);
    return resolved ? [resolved] : [];
  }
  if (!entry || typeof entry !== 'object') return [];
  const rec = entry as Resource;
  const found: string[] = [];
  for (const field of [rec.url, rec.image_url, rec.secure_url, rec.src, rec.object_key, rec.media_key]) {
    if (typeof field === 'string') {
      const resolved = mediaUrl(field);
      if (resolved) found.push(resolved);
    }
  }
  for (const idField of [rec.media_id, rec.id]) {
    if (typeof idField === 'string' && UUID_RE.test(idField.trim())) {
      found.push(`/api/catalog/api/v1/media/${encodeURIComponent(idField.trim())}`);
    }
  }
  return found;
}

/**
 * Only match explicit landmark names (never address/region/province) so a cafe,
 * restaurant, or neighborhood spot never receives another landmark's city cover photo.
 */
function localLandmarkImage(place: Resource): string {
  const raw = [place.name_en, place.name_vi, place.name]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join(' ')
    .toLocaleLowerCase();
  if (!raw) return '';
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const images: Array<[RegExp, string]> = [
    [/\bngu hanh son\b|\bmarble mountains\b/, 'marble-mountains.webp'],
    [/\bpho co hoi an\b|\bhoi an ancient town\b/, 'hoi-an.webp'],
    [/\btam coc\b|\btrang an\b/, 'ninh-binh.webp'],
    [/\bvinh ha long\b|\bha long bay\b|\bhalong bay\b/, 'ha-long.webp'],
    [/\bdai noi hue\b|\bhue imperial city\b|\bchua thien mu\b/, 'hue.webp'],
    [/\bbai bien my khe\b|\bcau rong\b|\bba na hills\b/, 'da-nang.webp'],
    [/\bho xuan huong\b|\bxuan huong lake\b/, 'da-lat.webp'],
    [/\bho hoan kiem\b|\bho guom\b|\bvan mieu\b|\bcau long bien\b/, 'ha-noi.webp'],
    [/\bdinh doc lap\b|\bindependence palace\b|\bcho ben thanh\b|\bpho di bo nguyen hue\b|\bnha tho duc ba\b/, 'ho-chi-minh.webp'],
  ];
  const match = images.find(([pattern]) => pattern.test(normalized));
  return match ? `/images/editorial/${match[1]}` : '';
}

export function placeImageCandidates(place: Resource, options: { allowEditorialLandmark?: boolean } = {}): string[] {
  const candidates: string[] = [];
  if (Array.isArray(place.media_keys)) {
    for (const key of place.media_keys) {
      candidates.push(...extractEntryUrls(key));
    }
  }
  if (Array.isArray(place.media)) {
    for (const entry of place.media) {
      candidates.push(...extractEntryUrls(entry));
    }
  }
  for (const field of [
    place.image_url,
    place.primary_image_url,
    place.cover_image,
    place.cover_image_url,
    place.thumbnail_url,
    place.photo_url,
    place.image,
  ]) {
    candidates.push(...extractEntryUrls(field));
  }
  if (Array.isArray(place.images)) {
    for (const entry of place.images) {
      candidates.push(...extractEntryUrls(entry));
    }
  }
  if (options.allowEditorialLandmark !== false) {
    const landmarkImage = localLandmarkImage(place);
    if (landmarkImage) candidates.push(landmarkImage);
  }
  return [...new Set(candidates)];
}

export function placeImage(place: Resource): string {
  return placeImageCandidates(place)[0] ?? '';
}
