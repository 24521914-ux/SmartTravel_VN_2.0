export const SECTION_PATHS = {
  'Khám phá': '/kham-pha',
  'Bản đồ': '/ban-do',
  'Bộ sưu tập': '/bo-suu-tap',
  'Chuyến đi': '/chuyen-di',
  'Thông báo': '/thong-bao',
  'Tài khoản': '/tai-khoan',
  'Doanh nghiệp': '/doanh-nghiep',
  'Kiểm duyệt': '/kiem-duyet',
  'Quản trị': '/quan-tri',
  'Đóng góp': '/dong-gop',
} as const;

export type Section = keyof typeof SECTION_PATHS;

export function isSection(section: string): section is Section {
  return Object.hasOwn(SECTION_PATHS, section);
}

/** Resolve application URLs without interpreting in-page anchors as routes. */
export function resolveRoute({ pathname, search, hash }: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const alias = path === '/' || path === '/app';
  const matched = (Object.entries(SECTION_PATHS) as [Section, string][])
    .find(([, routePath]) => routePath === path);

  if (!alias && !matched) return { section: null, canonicalUrl: null };

  let legacySection: Section | null = null;
  if (hash) {
    try {
      const decoded = decodeURIComponent(hash.replace(/^#\/?/, ''));
      if (isSection(decoded)) legacySection = decoded;
    } catch {
      // A malformed old bookmark must not prevent the application from loading.
    }
  }

  const section = legacySection ?? matched?.[0] ?? 'Khám phá';
  const canonicalUrl = SECTION_PATHS[section] + search + (legacySection ? '' : hash);
  return { section, canonicalUrl };
}
