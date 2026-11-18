"""Fast Geofabrik OpenStreetMap PBF extractor + Wikidata/Wikimedia Commons 1-to-1 enricher.

Extracts balanced travel POIs (Nhà hàng, Cà phê, Danh lam thắng cảnh, Bảo tàng, Ẩm thực)
across Hà Nội, Thành phố Hồ Chí Minh, Đà Nẵng, and France (Île-de-France / Paris),
preserving exact 1-to-1 name, coordinates, category, price (null if unavailable), and
Wikimedia Commons photo (null if unavailable).

Usage:
  python backend/infra/osm_importer.py extract-multi
  python backend/infra/osm_importer.py import --gateway http://127.0.0.1:58080 --input backend/infra/.local/osm-import/places-200.json
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
from html import unescape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
from itertools import islice
import json
import math
import os
from pathlib import Path
import re
import sys
import time
from typing import Any
from urllib.parse import parse_qs, quote, urlparse
import uuid

import osmium
from PIL import Image
import requests

ROOT = Path(__file__).resolve().parents[2]
LOCAL_DIR = ROOT / 'backend' / 'infra' / '.local' / 'osm-import'
FRONTEND_DATA_FILE = ROOT / 'frontend' / 'public' / 'data' / 'osm-places.json'

VN_PBF_URL = 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf'
FR_PBF_URL = 'https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf'
USER_AGENT = 'SmartTravelVN-OSM-Importer/1.0 (UIT Graduation Project; educational open-data ingestion)'
HTTP_TIMEOUT = 25
OSM_NAMESPACE = uuid.UUID('8f14e45f-ceea-467a-9b90-8c3b2c6f7d22')

# 5 requested categories with target quota per 50-place region
TARGET_QUOTAS: dict[str, int] = {
    'Nhà hàng': 10,
    'Cà phê': 10,
    'Danh lam thắng cảnh': 15,
    'Bảo tàng': 8,
    'Ẩm thực': 7,
}

REGION_CONFIGS: list[dict[str, Any]] = [
    {
        'key': 'ha-noi',
        'province': 'Hà Nội',
        'country': 'Việt Nam',
        'pbf_key': 'vietnam',
        'center': (21.0285, 105.8542),
        'radius_km': 20.0,
        'limit': 50,
    },
    {
        'key': 'ho-chi-minh',
        'province': 'Thành phố Hồ Chí Minh',
        'country': 'Việt Nam',
        'pbf_key': 'vietnam',
        'center': (10.7769, 106.7009),
        'radius_km': 20.0,
        'limit': 50,
    },
    {
        'key': 'da-nang',
        'province': 'Đà Nẵng',
        'country': 'Việt Nam',
        'pbf_key': 'vietnam',
        'center': (16.0544, 108.2022),
        'radius_km': 18.0,
        'limit': 50,
    },
    {
        'key': 'france',
        'province': 'Paris',
        'country': 'Pháp',
        'pbf_key': 'france',
        'center': (48.8566, 2.3522),
        'radius_km': 25.0,
        'limit': 50,
    },
]


def safe_osmium_path(path: Path) -> str:
    """Return an ASCII-safe path for libosmium C++ fopen on Windows paths containing Unicode."""
    try:
        rel = os.path.relpath(path, Path.cwd())
        if rel.isascii():
            return rel
    except ValueError:
        pass
    if os.name == 'nt':
        import ctypes
        buf = ctypes.create_unicode_buffer(1024)
        if ctypes.windll.kernel32.GetShortPathNameW(str(path.resolve()), buf, len(buf)):
            return buf.value
    return str(path)


def normalize_text(value: str) -> str:
    import unicodedata
    text = unicodedata.normalize('NFD', value.lower())
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return text.replace('đ', 'd').strip()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def strip_html(value: str) -> str:
    cleaned = re.sub(r'<[^>]+>', ' ', unescape(value))
    return re.sub(r'\s+', ' ', cleaned).strip()


def parse_osm_price(tags: dict[str, str], country: str) -> tuple[int | None, int | None, int | None]:
    """Return (price, price_min, price_max) in VND only when explicitly verifiable; else (None, None, None)."""
    charge = (tags.get('charge') or '').strip()
    fee = (tags.get('fee') or '').strip().lower()

    if charge and country == 'Việt Nam':
        lower = charge.lower()
        if not re.search(r'(\$|usd|eur|€)', lower):
            has_vnd = bool(re.search(r'(vnd|₫|đ|dong)\b', lower)) or re.fullmatch(r'[\d.,\s-]+', charge)
            if has_vnd:
                nums = []
                for raw in re.findall(r'\d+(?:[.,]\d{3})*', charge):
                    digits = re.sub(r'[.,]', '', raw)
                    if digits.isdigit():
                        val = int(digits)
                        if val == 0 or (1000 <= val <= 50_000_000):
                            nums.append(val)
                if nums:
                    lo, hi = min(nums), max(nums)
                    return lo, lo, hi if hi > lo else None

    if fee == 'no':
        return 0, 0, None

    return None, None, None


def parse_opening_hours(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    text = raw.strip()
    if text == '24/7':
        return [{'weekday': d, 'open': '00:00', 'close': '23:59', 'overnight': False} for d in range(7)]
    match = re.fullmatch(r'(?:Mo-Su\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)', text, re.I)
    if not match:
        return []
    open_t = f'{int(match.group(1)):02d}:{match.group(2)}'
    close_t = f'{int(match.group(3)):02d}:{match.group(4)}'
    if open_t == close_t:
        return []
    return [{'weekday': d, 'open': open_t, 'close': close_t, 'overnight': close_t <= open_t} for d in range(7)]


def build_address(tags: dict[str, str]) -> str | None:
    if tags.get('addr:full'):
        return tags['addr:full'].strip()
    street_part = ' '.join(p for p in [tags.get('addr:housenumber'), tags.get('addr:street')] if p)
    parts = [
        street_part,
        tags.get('addr:subdistrict') or tags.get('addr:quarter') or tags.get('addr:ward'),
        tags.get('addr:district'),
        tags.get('addr:city') or tags.get('addr:province'),
    ]
    joined = ', '.join(p.strip() for p in parts if p and p.strip())
    return joined or None


def classify_poi(tags: dict[str, str]) -> str | None:
    if tags.get('office') or tags.get('industrial') or tags.get('warehouse'):
        return None
    amenity = tags.get('amenity', '')
    tourism = tags.get('tourism', '')
    historic = tags.get('historic', '')
    natural = tags.get('natural', '')
    leisure = tags.get('leisure', '')
    shop = tags.get('shop', '')

    if tourism in ('museum', 'gallery'):
        return 'Bảo tàng'
    if amenity == 'cafe':
        return 'Cà phê'
    if amenity in ('food_court', 'marketplace', 'ice_cream') or shop in ('bakery', 'pastry', 'confectionery'):
        return 'Ẩm thực'
    if amenity == 'restaurant':
        return 'Nhà hàng'
    if natural in ('beach', 'bay', 'cape', 'waterfall', 'peak', 'cave_entrance'):
        return 'Danh lam thắng cảnh'
    if historic in ('monument', 'memorial', 'castle', 'ruins', 'archaeological_site', 'heritage'):
        return 'Danh lam thắng cảnh'
    if tourism in ('attraction', 'viewpoint', 'theme_park', 'zoo', 'aquarium'):
        return 'Danh lam thắng cảnh'
    if leisure in ('nature_reserve', 'park', 'garden') and (tags.get('wikidata') or tags.get('wikipedia')):
        return 'Danh lam thắng cảnh'
    if amenity == 'place_of_worship' and (tags.get('wikidata') or tags.get('tourism') or tags.get('historic')):
        return 'Danh lam thắng cảnh'
    return None


@dataclass
class RawOsmCandidate:
    external_id: str
    osm_type: str
    osm_id: int
    name_vi: str
    name_en: str | None
    category_name: str
    latitude: float
    longitude: float
    address: str | None
    province: str
    country: str
    price: int | None
    price_min: int | None
    price_max: int | None
    opening_hours: list[dict[str, Any]]
    wikidata_qid: str | None
    wikipedia_ref: str | None
    commons_tag: str | None
    osm_description: str | None


def download_geofabrik(pbf_url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f'Using cached Geofabrik PBF: {dest.name} ({dest.stat().st_size / (1024*1024):.1f} MB)', flush=True)
        return dest
    print(f'Downloading {pbf_url} ...', flush=True)
    part = dest.with_suffix('.osm.pbf.part')
    with requests.get(pbf_url, stream=True, timeout=60, headers={'User-Agent': USER_AGENT}) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get('Content-Length') or 0)
        downloaded = 0
        last_report = 0
        with part.open('wb') as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 512):
                if chunk:
                    fh.write(chunk)
                    downloaded += len(chunk)
                    if total and downloaded - last_report >= 40 * 1024 * 1024:
                        last_report = downloaded
                        print(f'  downloaded {downloaded / (1024*1024):.1f} / {total / (1024*1024):.1f} MB', flush=True)
    part.replace(dest)
    print(f'Saved Geofabrik PBF: {dest.name}', flush=True)
    return dest


def extract_region_candidates(pbf_path: Path, regions: list[dict[str, Any]]) -> dict[str, list[RawOsmCandidate]]:
    """Two-pass ultra-fast FileProcessor extraction (Nodes direct + Way centroids via IdFilter)."""
    safe_path = safe_osmium_path(pbf_path)
    key_filter = osmium.filter.KeyFilter('amenity', 'tourism', 'historic', 'natural', 'leisure', 'shop')

    node_records: list[tuple[int, dict[str, str], float, float]] = []
    way_records: list[tuple[int, dict[str, str], list[int]]] = []
    needed_node_ids: set[int] = set()

    print(f'Scanning {pbf_path.name} with KeyFilter ...', flush=True)
    for obj in osmium.FileProcessor(safe_path).with_filter(key_filter):
        if obj.is_node():
            if not obj.location.valid():
                continue
            tags = {t.k: t.v for t in obj.tags}
            if classify_poi(tags) and (tags.get('name:vi') or tags.get('name')):
                node_records.append((obj.id, tags, obj.location.lat, obj.location.lon))
        elif obj.is_way():
            tags = {t.k: t.v for t in obj.tags}
            if classify_poi(tags) and (tags.get('name:vi') or tags.get('name')) and len(obj.nodes) > 0:
                refs = [n.ref for n in islice(obj.nodes, 12)]
                way_records.append((obj.id, tags, refs))
                needed_node_ids.update(refs)

    # Pass 2: resolve node coordinates ONLY for matched ways (fast IdFilter)
    way_node_coords: dict[int, tuple[float, float]] = {}
    if needed_node_ids:
        print(f'Resolving {len(needed_node_ids)} boundary nodes for {len(way_records)} matched ways ...', flush=True)
        for obj in osmium.FileProcessor(safe_path).with_filter(osmium.filter.IdFilter(needed_node_ids)):
            if obj.is_node() and obj.location.valid():
                way_node_coords[obj.id] = (obj.location.lat, obj.location.lon)

    all_items: list[tuple[str, int, dict[str, str], float, float]] = [
        ('node', oid, tags, lat, lon) for oid, tags, lat, lon in node_records
    ]
    for wid, tags, refs in way_records:
        pts = [way_node_coords[r] for r in refs if r in way_node_coords]
        if pts:
            all_items.append(('way', wid, tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))

    by_region: dict[str, list[RawOsmCandidate]] = {r['key']: [] for r in regions}
    seen_per_region: dict[str, dict[str, list[tuple[float, float]]]] = {r['key']: {} for r in regions}

    for osm_type, oid, tags, lat, lon in all_items:
        name = (tags.get('name:vi') or tags.get('name') or '').strip()
        if len(name) < 2:
            continue
        norm_name = normalize_text(name)
        if re.search(r'\b(cong ty|tnhh|kho hang|chi nhanh|van phong|tru so)\b', norm_name):
            continue
        category = classify_poi(tags)
        if not category:
            continue

        # Assign to closest matching region within radius_km
        matched_region: dict[str, Any] | None = None
        best_dist = 1e9
        for reg in regions:
            clat, clon = reg['center']
            dist = haversine_km(lat, lon, clat, clon)
            if dist <= reg['radius_km'] and dist < best_dist:
                best_dist = dist
                matched_region = reg
        if not matched_region:
            continue

        reg_key = matched_region['key']
        prior = seen_per_region[reg_key].get(norm_name, [])
        if any(haversine_km(lat, lon, plat, plon) <= 0.8 for plat, plon in prior):
            continue
        prior.append((lat, lon))
        seen_per_region[reg_key][norm_name] = prior

        name_en = (tags.get('name:en') or '').strip() or None
        if name_en and name_en == name:
            name_en = None
        price, price_min, price_max = parse_osm_price(tags, matched_region['country'])
        wikidata = (tags.get('wikidata') or '').strip()
        if wikidata and not re.fullmatch(r'Q\d+', wikidata):
            wikidata = ''
        commons = (tags.get('wikimedia_commons') or '').strip() or None
        wikipedia = (tags.get('wikipedia') or '').strip() or None

        by_region[reg_key].append(
            RawOsmCandidate(
                external_id=f'osm:{osm_type}:{oid}',
                osm_type=osm_type,
                osm_id=oid,
                name_vi=name,
                name_en=name_en,
                category_name=category,
                latitude=round(lat, 6),
                longitude=round(lon, 6),
                address=build_address(tags),
                province=matched_region['province'],
                country=matched_region['country'],
                price=price,
                price_min=price_min,
                price_max=price_max,
                opening_hours=parse_opening_hours(tags.get('opening_hours')),
                wikidata_qid=wikidata or None,
                wikipedia_ref=wikipedia,
                commons_tag=commons,
                osm_description=(tags.get('description:vi') or tags.get('description') or '').strip() or None,
            )
        )
    return by_region


def select_balanced_region_places(candidates: list[RawOsmCandidate], limit: int = 50) -> list[RawOsmCandidate]:
    """Select ~50 places balanced across the 5 categories, prioritizing richer verified records."""
    def richness_key(c: RawOsmCandidate) -> tuple[int, int, int, int, str]:
        has_media_ref = 0 if (c.wikidata_qid or c.wikipedia_ref or (c.commons_tag and c.commons_tag.startswith('File:'))) else 1
        has_price = 0 if c.price is not None else 1
        has_addr = 0 if c.address else 1
        has_hours = 0 if c.opening_hours else 1
        return (has_media_ref, has_price, has_addr, has_hours, c.name_vi)

    by_cat: dict[str, list[RawOsmCandidate]] = {cat: [] for cat in TARGET_QUOTAS}
    for c in candidates:
        if c.category_name in by_cat:
            by_cat[c.category_name].append(c)
    for cat in by_cat:
        by_cat[cat].sort(key=richness_key)

    selected: list[RawOsmCandidate] = []
    selected_ids: set[str] = set()

    # Phase 1: fill category quotas (preserving mix of Wikidata-rich + non-Wikidata spots)
    for cat, quota in TARGET_QUOTAS.items():
        pool = by_cat[cat]
        # Keep ~70% from top richness (likely Wikidata/image/price) and ~30% general POIs so missing placeholders exist too
        with_ref = [c for c in pool if c.wikidata_qid or c.wikipedia_ref or (c.commons_tag and c.commons_tag.startswith('File:'))]
        without_ref = [c for c in pool if c not in with_ref]
        target_rich = min(len(with_ref), max(1, round(quota * 0.7)))
        picks = with_ref[:target_rich] + without_ref[:max(0, quota - target_rich)]
        if len(picks) < quota:
            rest = [c for c in pool if c not in picks]
            picks.extend(rest[:quota - len(picks)])
        for item in picks[:quota]:
            selected.append(item)
            selected_ids.add(item.external_id)

    # Phase 2: top up if any category had fewer than its quota
    if len(selected) < limit:
        remaining = sorted(
            [c for c in candidates if c.external_id not in selected_ids],
            key=richness_key,
        )
        for item in remaining:
            if len(selected) >= limit:
                break
            selected.append(item)
            selected_ids.add(item.external_id)

    return selected[:limit]


def resolve_wikipedia_qids(session: requests.Session, refs: list[str]) -> dict[str, str]:
    by_lang: dict[str, list[tuple[str, str]]] = {}
    for ref in refs:
        if ':' not in ref:
            continue
        lang, title = ref.split(':', 1)
        lang, title = lang.strip().lower(), title.strip()
        if lang in ('vi', 'en', 'fr') and title:
            by_lang.setdefault(lang, []).append((ref, title))

    resolved: dict[str, str] = {}
    for lang, pairs in by_lang.items():
        for i in range(0, len(pairs), 40):
            batch = pairs[i:i + 40]
            try:
                resp = session.get(
                    f'https://{lang}.wikipedia.org/w/api.php',
                    params={'action': 'query', 'prop': 'pageprops', 'ppprop': 'wikibase_item',
                            'titles': '|'.join(t for _, t in batch), 'redirects': 1, 'format': 'json'},
                    timeout=HTTP_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json().get('query', {})
                norm_map = {n['from']: n['to'] for n in data.get('normalized', [])}
                redir_map = {r['from']: r['to'] for r in data.get('redirects', [])}
                title_to_qid: dict[str, str] = {}
                for page in data.get('pages', {}).values():
                    qid = page.get('pageprops', {}).get('wikibase_item')
                    if qid and page.get('title'):
                        title_to_qid[page['title']] = qid
                for orig_ref, title in batch:
                    t = redir_map.get(norm_map.get(title, title), norm_map.get(title, title))
                    if t in title_to_qid:
                        resolved[orig_ref] = title_to_qid[t]
            except Exception:
                continue
    return resolved


def fetch_wikidata_entities(session: requests.Session, qids: list[str]) -> dict[str, dict[str, Any]]:
    entities: dict[str, dict[str, Any]] = {}
    unique_qids = sorted(set(qids))
    for i in range(0, len(unique_qids), 45):
        batch = unique_qids[i:i + 45]
        try:
            resp = session.get(
                'https://www.wikidata.org/w/api.php',
                params={'action': 'wbgetentities', 'ids': '|'.join(batch),
                        'props': 'claims|descriptions|labels', 'languages': 'vi|en|fr', 'format': 'json'},
                timeout=HTTP_TIMEOUT,
            )
            resp.raise_for_status()
            entities.update(resp.json().get('entities', {}))
        except Exception:
            continue
    return entities


def fetch_commons_metadata(session: requests.Session, filenames: list[str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    unique = sorted(set(filenames))
    for i in range(0, len(unique), 30):
        batch = unique[i:i + 30]
        titles = '|'.join(f'File:{fn}' if not fn.startswith('File:') else fn for fn in batch)
        try:
            resp = session.get(
                'https://commons.wikimedia.org/w/api.php',
                params={'action': 'query', 'titles': titles, 'prop': 'imageinfo',
                        'iiprop': 'url|mime|size|extmetadata', 'iiurlwidth': 960, 'format': 'json'},
                timeout=HTTP_TIMEOUT,
            )
            resp.raise_for_status()
            query = resp.json().get('query', {})
            norm = {n['from']: n['to'] for n in query.get('normalized', [])}
            pages_by_title = {
                page['title']: page['imageinfo'][0]
                for page in query.get('pages', {}).values()
                if page.get('title') and page.get('imageinfo')
            }
            for fn in batch:
                key = f'File:{fn}' if not fn.startswith('File:') else fn
                info = pages_by_title.get(norm.get(key, key))
                if info:
                    results[fn] = info
        except Exception:
            continue
    return results


def download_and_verify_image(session: requests.Session, url: str, dest: Path) -> Path | None:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        resp = session.get(url, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        with Image.open(io.BytesIO(resp.content)) as img:
            if img.width < 300 or img.height < 180:
                return None
            out = io.BytesIO()
            img.convert('RGB').save(out, format='JPEG', quality=84)
            data = out.getvalue()
        if len(data) > 9 * 1024 * 1024:
            return None
        dest.write_bytes(data)
        return dest
    except Exception:
        return None


def enrich_places(pois: list[RawOsmCandidate], download_images: bool, images_dir: Path) -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers.update({'User-Agent': USER_AGENT})

    wiki_refs = [p.wikipedia_ref for p in pois if not p.wikidata_qid and p.wikipedia_ref]
    wiki_qid_map = resolve_wikipedia_qids(session, wiki_refs)
    for p in pois:
        if not p.wikidata_qid and p.wikipedia_ref and p.wikipedia_ref in wiki_qid_map:
            p.wikidata_qid = wiki_qid_map[p.wikipedia_ref]

    wd_entities = fetch_wikidata_entities(session, [p.wikidata_qid for p in pois if p.wikidata_qid])

    poi_file_map: dict[str, str] = {}
    poi_desc_map: dict[str, str] = {}
    for p in pois:
        if p.commons_tag and p.commons_tag.startswith('File:'):
            poi_file_map[p.external_id] = p.commons_tag[len('File:'):].strip()

        if p.wikidata_qid and p.wikidata_qid in wd_entities:
            entity = wd_entities[p.wikidata_qid]
            claims = entity.get('claims', {})
            coord_ok = True
            p625 = claims.get('P625', [])
            if p625:
                val = p625[0].get('mainsnak', {}).get('datavalue', {}).get('value', {})
                wlat, wlon = val.get('latitude'), val.get('longitude')
                if isinstance(wlat, (int, float)) and isinstance(wlon, (int, float)):
                    if haversine_km(p.latitude, p.longitude, float(wlat), float(wlon)) > 3.0:
                        coord_ok = False
            if coord_ok:
                if p.external_id not in poi_file_map:
                    p18 = claims.get('P18', [])
                    if p18:
                        img_name = p18[0].get('mainsnak', {}).get('datavalue', {}).get('value')
                        if isinstance(img_name, str) and img_name.strip():
                            poi_file_map[p.external_id] = img_name.strip()
                descs = entity.get('descriptions', {})
                vi_desc = descs.get('vi', {}).get('value')
                en_desc = descs.get('en', {}).get('value')
                if isinstance(vi_desc, str) and vi_desc.strip():
                    poi_desc_map[p.external_id] = vi_desc.strip()
                elif isinstance(en_desc, str) and en_desc.strip() and not p.osm_description:
                    poi_desc_map[p.external_id] = en_desc.strip()

    commons_info = fetch_commons_metadata(session, list(poi_file_map.values()))

    records: list[dict[str, Any]] = []
    for p in pois:
        image_meta: dict[str, Any] | None = None
        fname = poi_file_map.get(p.external_id)
        if fname and fname in commons_info:
            info = commons_info[fname]
            mime = str(info.get('mime', ''))
            width = int(info.get('width') or 0)
            height = int(info.get('height') or 0)
            img_url = info.get('thumburl') or info.get('url')
            if mime in ('image/jpeg', 'image/png', 'image/webp') and width >= 300 and height >= 180 and img_url:
                ext = info.get('extmetadata', {})
                license_name = strip_html(str(ext.get('LicenseShortName', {}).get('value', ''))) or None
                artist = strip_html(str(ext.get('Artist', {}).get('value', ''))) or None
                local_file: str | None = None
                if download_images:
                    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', p.external_id) + '.jpg'
                    saved = download_and_verify_image(session, str(img_url), images_dir / safe_name)
                    if saved:
                        local_file = str(saved)
                image_meta = {
                    'commons_file': fname,
                    'commons_url': f'https://commons.wikimedia.org/wiki/File:{quote(fname.replace(" ", "_"))}',
                    'image_url': str(img_url),
                    'mime': mime,
                    'width': width,
                    'height': height,
                    'license': license_name,
                    'author': artist,
                    'local_jpeg': local_file,
                }

        place_uuid = str(uuid.uuid5(OSM_NAMESPACE, p.external_id))
        records.append({
            'place_id': place_uuid,
            'external_id': p.external_id,
            'name': p.name_vi,
            'name_vi': p.name_vi,
            'name_en': p.name_en,
            'category_name': p.category_name,
            'province': p.province,
            'country': p.country,
            'address': p.address,
            'latitude': p.latitude,
            'longitude': p.longitude,
            'description': p.osm_description or poi_desc_map.get(p.external_id),
            'price': p.price,
            'price_min': p.price_min,
            'price_max': p.price_max,
            'currency': 'VND',
            'opening_hours': p.opening_hours,
            'wikidata_qid': p.wikidata_qid,
            'image_url': image_meta['image_url'] if image_meta else None,
            'image': image_meta,
            'media_keys': [],
            'source': 'geofabrik-osm',
        })
    return records


def write_place_bundles(records: list[dict[str, Any]], out_path: Path, frontend_path: Path = FRONTEND_DATA_FILE) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')

    frontend_records = []
    for r in records:
        copy = {k: v for k, v in r.items() if k != 'image'}
        if isinstance(r.get('image'), dict) and r['image']:
            copy['image_author'] = r['image'].get('author')
            copy['image_license'] = r['image'].get('license')
            copy['commons_url'] = r['image'].get('commons_url')
            if r['image'].get('cloudinary_url'):
                copy['cloudinary_url'] = r['image']['cloudinary_url']
        frontend_records.append(copy)
    frontend_path.parent.mkdir(parents=True, exist_ok=True)
    frontend_path.write_text(json.dumps(frontend_records, ensure_ascii=False, indent=2), encoding='utf-8')


def cmd_extract_multi(args: argparse.Namespace) -> int:
    vn_pbf = download_geofabrik(VN_PBF_URL, LOCAL_DIR / 'vietnam-latest.osm.pbf')
    fr_pbf = download_geofabrik(FR_PBF_URL, LOCAL_DIR / 'ile-de-france-latest.osm.pbf')

    vn_regions = [r for r in REGION_CONFIGS if r['pbf_key'] == 'vietnam']
    fr_regions = [r for r in REGION_CONFIGS if r['pbf_key'] == 'france']

    vn_candidates = extract_region_candidates(vn_pbf, vn_regions)
    fr_candidates = extract_region_candidates(fr_pbf, fr_regions)
    all_by_region = {**vn_candidates, **fr_candidates}

    selected_all: list[RawOsmCandidate] = []
    for reg in REGION_CONFIGS:
        pool = all_by_region[reg['key']]
        picked = select_balanced_region_places(pool, reg['limit'])
        selected_all.extend(picked)
        cat_counts: dict[str, int] = {}
        for item in picked:
            cat_counts[item.category_name] = cat_counts.get(item.category_name, 0) + 1
        print(f"Region {reg['province']} ({reg['country']}): {len(picked)} selected -> {cat_counts}", flush=True)

    print(f'Enriching {len(selected_all)} places via Wikidata + Wikimedia Commons ...', flush=True)
    records = enrich_places(selected_all, download_images=not args.skip_image_download, images_dir=LOCAL_DIR / 'images')

    out_path = Path(args.output)
    write_place_bundles(records, out_path, FRONTEND_DATA_FILE)

    with_img = sum(1 for r in records if r['image_url'])
    with_price = sum(1 for r in records if r['price'] is not None)
    print(f'Done! {len(records)} places saved to {out_path} & {FRONTEND_DATA_FILE} (with image: {with_img}, with explicit price: {with_price})', flush=True)
    return 0


def gw_call(session: requests.Session, gateway: str, service: str, path: str, method: str = 'GET',
            body: Any = None, token: str | None = None, version: int | None = None) -> tuple[int, Any]:
    headers: dict[str, str] = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if version is not None:
        headers['If-Match'] = f'"{version}"'
    if method == 'POST':
        headers['Idempotency-Key'] = str(uuid.uuid4())
    url = f'{gateway.rstrip("/")}/api/{service}/api/v1{path}'
    resp = session.request(method, url, json=body, headers=headers, timeout=HTTP_TIMEOUT)
    try:
        payload = resp.json() if resp.content else None
    except Exception:
        payload = resp.text
    return resp.status_code, payload


def read_all(session: requests.Session, gateway: str, service: str, path: str, token: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        sep = '&' if '?' in path else '?'
        suffix = f'{sep}limit=100' + (f'&cursor={quote(cursor)}' if cursor else '')
        status, data = gw_call(session, gateway, service, path + suffix, token=token)
        if status != 200:
            raise RuntimeError(f'GET {service}{path} failed: HTTP {status}')
        items.extend(data.get('items', []))
        cursor = data.get('next_cursor')
        if not cursor:
            break
    return items


LEGACY_DEMO_PLACE_NAMES = {
    normalize_text(n) for n in (
        'Hồ Hoàn Kiếm', 'Văn Miếu Quốc Tử Giám', 'Bảo tàng Dân tộc học Việt Nam',
        'Chợ Đồng Xuân', 'Phố ẩm thực Tống Duy Tân', 'Dinh Độc Lập',
        'Bảo tàng Chứng tích Chiến tranh', 'Chợ Bến Thành', 'Phố đi bộ Nguyễn Huệ',
        'Bến Bạch Đằng', 'Bãi biển Mỹ Khê', 'Danh thắng Ngũ Hành Sơn', 'Cầu Rồng',
        'Chợ Hàn', 'Bảo tàng Điêu khắc Chăm Đà Nẵng', 'Phố cổ Hội An', 'Đại Nội Huế',
        'Chùa Thiên Mụ', 'Chợ Đông Ba', 'Làng hương Thủy Xuân', 'Hồ Xuân Hương',
        'Thác Datanla', 'Đồi chè Cầu Đất', 'Vườn hoa thành phố Đà Lạt', 'Vịnh Hạ Long',
        'Bảo tàng Quảng Ninh', 'Bãi biển Bãi Cháy', 'Làng chài Cửa Vạn', 'Nhà thờ Lớn Hà Nội',
    )
}


def admin_login(session: requests.Session, gateway: str, admin_email: str, admin_password: str) -> str:
    email = admin_email or os.environ.get('SMARTTRAVEL_ADMIN_EMAIL', '')
    password = admin_password or os.environ.get('SMARTTRAVEL_ADMIN_PASSWORD', '')
    if not email or not password:
        raise SystemExit(
            'Admin credentials required via --admin-email / --admin-password or '
            'SMARTTRAVEL_ADMIN_EMAIL / SMARTTRAVEL_ADMIN_PASSWORD env vars.'
        )
    status, auth = gw_call(session, gateway, 'identity', '/auth/login', 'POST', {'email': email, 'password': password})
    if status != 200 or not isinstance(auth, dict) or not auth.get('access_token'):
        raise SystemExit(f'Admin login failed: HTTP {status}')
    return auth['access_token']


def archive_legacy_demo_places(
    session: requests.Session,
    gateway: str,
    token: str,
    existing_places: list[dict[str, Any]],
) -> tuple[int, list[dict[str, Any]]]:
    archived = 0
    remaining: list[dict[str, Any]] = []
    for ep in existing_places:
        norm_name = normalize_text(str(ep.get('name', '')))
        status_val = str(ep.get('status', ''))
        is_legacy = norm_name in LEGACY_DEMO_PLACE_NAMES and not ep.get('media_keys')
        if is_legacy and status_val != 'ARCHIVED':
            pid = ep.get('place_id') or ep.get('id')
            ver = ep.get('version')
            st, _ = gw_call(session, gateway, 'catalog', f'/admin/places/{pid}', 'DELETE', token=token, version=ver)
            if st in (200, 204):
                archived += 1
                continue
        if status_val != 'ARCHIVED':
            remaining.append(ep)
    return archived, remaining


def load_dotenv_defaults(env_path: Path = ROOT / '.env') -> None:
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key and not os.environ.get(key):
            os.environ[key] = val


def cloudinary_signed_upload(
    session: requests.Session,
    file_path: Path,
    cloud_name: str,
    api_key: str,
    api_secret: str,
    folder: str,
    public_id: str,
) -> str:
    timestamp = str(int(time.time()))
    params = {'folder': folder, 'public_id': public_id, 'timestamp': timestamp}
    to_sign = '&'.join(f'{k}={params[k]}' for k in sorted(params)) + api_secret
    signature = hashlib.sha1(to_sign.encode('utf-8')).hexdigest()

    url = f'https://api.cloudinary.com/v1_1/{quote(cloud_name, safe="")}/image/upload'
    with file_path.open('rb') as handle:
        resp = session.post(
            url,
            data={**params, 'api_key': api_key, 'signature': signature},
            files={'file': (file_path.name, handle, 'image/jpeg')},
            timeout=HTTP_TIMEOUT,
        )
    if resp.status_code != 200:
        raise RuntimeError(f'Cloudinary upload HTTP {resp.status_code} for {public_id}')
    payload = resp.json()
    secure_url = payload.get('secure_url')
    if not isinstance(secure_url, str) or not secure_url.startswith(('https://', 'http://')):
        raise RuntimeError(f'Cloudinary response missing secure_url for {public_id}')
    return secure_url


def cmd_upload_cloudinary(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f'Input JSON not found: {input_path}. Run "extract-multi" first.')

    cloud_name = args.cloud_name or os.environ.get('CLOUDINARY_CLOUD_NAME', '').strip()
    api_key = args.api_key or os.environ.get('CLOUDINARY_API_KEY', '').strip()
    api_secret = args.api_secret or os.environ.get('CLOUDINARY_API_SECRET', '').strip()
    folder = (args.folder or os.environ.get('CLOUDINARY_FOLDER', '') or 'smarttravel').strip().strip('/') + '/places'
    if not (cloud_name and api_key and api_secret):
        raise SystemExit(
            'Cloudinary credentials required: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, '
            'and CLOUDINARY_API_SECRET in .env or environment variables.'
        )

    records: list[dict[str, Any]] = json.loads(input_path.read_text(encoding='utf-8'))
    session = requests.Session()
    uploaded, reused, missing_photo = 0, 0, 0

    for idx, rec in enumerate(records, start=1):
        img = rec.get('image')
        if not isinstance(img, dict) or not img.get('local_jpeg') or not Path(img['local_jpeg']).is_file():
            missing_photo += 1
            continue
        if img.get('cloudinary_url') and not args.force:
            rec['image_url'] = img['cloudinary_url']
            reused += 1
            continue
        secure_url = cloudinary_signed_upload(
            session=session,
            file_path=Path(img['local_jpeg']),
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            folder=folder,
            public_id=f"osm_{rec['place_id']}",
        )
        img['cloudinary_url'] = secure_url
        rec['image_url'] = secure_url
        uploaded += 1
        if uploaded % 10 == 0:
            print(f'Cloudinary upload progress: {uploaded} uploaded (record {idx}/{len(records)})', flush=True)

    write_place_bundles(records, input_path, FRONTEND_DATA_FILE)
    print(
        f'Cloudinary upload finished: uploaded={uploaded}, reused={reused}, '
        f'without_image={missing_photo}, updated={input_path} & {FRONTEND_DATA_FILE}',
        flush=True,
    )
    return 0


def cmd_archive_legacy_demo(args: argparse.Namespace) -> int:
    session = requests.Session()
    token = admin_login(session, args.gateway, args.admin_email, args.admin_password)
    existing_places = read_all(session, args.gateway, 'catalog', '/admin/places', token)
    archived, remaining = archive_legacy_demo_places(session, args.gateway, token, existing_places)
    print(f'Archived legacy demo places: archived={archived}, remaining_active={len(remaining)}', flush=True)
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f'Input JSON not found: {input_path}. Run "extract-multi" first.')
    records: list[dict[str, Any]] = json.loads(input_path.read_text(encoding='utf-8'))

    session = requests.Session()
    token = admin_login(session, args.gateway, args.admin_email, args.admin_password)

    cats = {}
    for c in read_all(session, args.gateway, 'catalog', '/admin/categories', token):
        cid = c.get('category_id') or c.get('id')
        for cname in (c.get('name'), c.get('name_vi')):
            if cname and cid:
                cats[normalize_text(str(cname))] = cid
    for cat_name in TARGET_QUOTAS:
        if normalize_text(cat_name) not in cats:
            st, created = gw_call(session, args.gateway, 'catalog', '/admin/categories', 'POST', {'name': cat_name, 'active': True}, token=token)
            if st in (200, 201):
                cats[normalize_text(cat_name)] = created.get('category_id') or created.get('id')

    geos = read_all(session, args.gateway, 'catalog', '/admin/geographic-units', token)
    country_by_name = {normalize_text(str(g.get('name', ''))): (g.get('geographic_unit_id') or g.get('id')) for g in geos if g.get('level') == 'COUNTRY'}
    geo_by_name = {normalize_text(str(g.get('name', ''))): (g.get('geographic_unit_id') or g.get('id')) for g in geos}

    existing_places = read_all(session, args.gateway, 'catalog', '/admin/places', token)
    if args.replace_legacy_demo:
        archived_legacy, existing_places = archive_legacy_demo_places(session, args.gateway, token, existing_places)
        print(f'Archived legacy demo places before import: {archived_legacy}', flush=True)
    else:
        existing_places = [ep for ep in existing_places if ep.get('status') != 'ARCHIVED']
    created_count, skipped_count, published_existing, failed_count, media_uploaded, media_approved, media_pending = 0, 0, 0, 0, 0, 0, 0
    scanner_unavailable = False

    def authed_call(service: str, path: str, method: str = 'GET', body: Any = None, version: int | None = None) -> tuple[int, Any]:
        nonlocal token
        st, resp_data = gw_call(session, args.gateway, service, path, method, body, token=token, version=version)
        if st == 401:
            token = admin_login(session, args.gateway, args.admin_email, args.admin_password)
            st, resp_data = gw_call(session, args.gateway, service, path, method, body, token=token, version=version)
        return st, resp_data

    for rec in records:
        country_name = rec.get('country') or 'Việt Nam'
        country_id = country_by_name.get(normalize_text(country_name))
        if not country_id:
            st, created_country = authed_call(
                'catalog', '/admin/geographic-units', 'POST',
                {'name': country_name, 'level': 'COUNTRY', 'parent_id': None, 'aliases': []},
            )
            if st in (200, 201):
                country_id = created_country.get('geographic_unit_id') or created_country.get('id')
                country_by_name[normalize_text(country_name)] = country_id

        prov_name = rec.get('province') or country_name
        geo_id = geo_by_name.get(normalize_text(prov_name))
        if not geo_id and prov_name != country_name and country_id:
            st, created_geo = authed_call(
                'catalog', '/admin/geographic-units', 'POST',
                {'name': prov_name, 'level': 'PROVINCE', 'parent_id': country_id, 'aliases': []},
            )
            if st in (200, 201):
                geo_id = created_geo.get('geographic_unit_id') or created_geo.get('id')
                geo_by_name[normalize_text(prov_name)] = geo_id
        geo_id = geo_id or country_id

        dup = next(
            (
                ep for ep in existing_places
                if normalize_text(str(ep.get('name', ''))) == normalize_text(rec['name'])
                and isinstance(ep.get('latitude'), (int, float))
                and haversine_km(rec['latitude'], rec['longitude'], float(ep['latitude']), float(ep['longitude'])) < 0.25
            ),
            None,
        )
        if dup:
            if dup.get('status') != 'PUBLISHED':
                pub_st, pub_place = authed_call(
                    'catalog', f"/admin/places/{dup['place_id']}/status", 'PUT', {'status': 'PUBLISHED'}, version=dup['version']
                )
                if pub_st == 200 and isinstance(pub_place, dict):
                    dup.update(pub_place)
                    published_existing += 1
            skipped_count += 1
            continue

        approved_media_keys: list[str] = []
        img = rec.get('image')
        if (
            not scanner_unavailable
            and not args.skip_media
            and isinstance(img, dict)
            and img.get('local_jpeg')
            and Path(img['local_jpeg']).is_file()
        ):
            img_bytes = Path(img['local_jpeg']).read_bytes()
            up_resp = session.post(
                f'{args.gateway.rstrip("/")}/api/catalog/api/v1/admin/media',
                files={'file': (Path(img['local_jpeg']).name, img_bytes, 'image/jpeg')},
                headers={'Authorization': f'Bearer {token}', 'Idempotency-Key': str(uuid.uuid4())},
                timeout=HTTP_TIMEOUT,
            )
            if up_resp.status_code == 201:
                media_uploaded += 1
                media_obj = up_resp.json()
                media_id = media_obj['media_id']
                rev_st, _ = authed_call(
                    'catalog', f'/admin/media/{media_id}/review', 'POST',
                    {'action': 'APPROVE', 'reason': f"Wikimedia Commons ({img.get('license') or 'open license'})"},
                )
                if rev_st == 202:
                    media_approved += 1
                    approved_media_keys.append(media_obj['object_key'])
                else:
                    media_pending += 1
                    if rev_st == 503:
                        scanner_unavailable = True

        cat_id = cats.get(normalize_text(rec['category_name']))
        place_body: dict[str, Any] = {
            'name': rec['name'],
            'address': rec.get('address') or f"{rec['name']}, {prov_name}, {country_name}",
            'latitude': rec['latitude'],
            'longitude': rec['longitude'],
            'category_ids': [cat_id] if cat_id else [],
            'tag_ids': [],
            'amenity_ids': [],
            'geographic_unit_id': geo_id,
            'destination_ids': [],
            'price': rec.get('price'),
            'currency': 'VND',
            'opening_hours': rec.get('opening_hours') or [],
            'media_keys': approved_media_keys,
        }
        if rec.get('description'):
            place_body['description'] = rec['description']

        st, created_place = authed_call('catalog', '/admin/places', 'POST', place_body)
        if st in (200, 201) and isinstance(created_place, dict):
            pid = created_place['place_id']
            ver = created_place['version']
            patch_fields: dict[str, Any] = {}
            if rec.get('name_en'):
                patch_fields['name_en'] = rec['name_en']
            if rec.get('price_max') is not None:
                patch_fields['price_max'] = rec.get('price_max')
            if patch_fields:
                p_st, patched = authed_call('catalog', f'/admin/places/{pid}', 'PATCH', patch_fields, version=ver)
                if p_st == 200 and isinstance(patched, dict):
                    created_place = patched
                    ver = patched['version']
            pub_st, pub_place = authed_call('catalog', f'/admin/places/{pid}/status', 'PUT', {'status': 'PUBLISHED'}, version=ver)
            if pub_st == 200 and isinstance(pub_place, dict):
                created_place = pub_place
            created_count += 1
            existing_places.append(created_place)
        else:
            failed_count += 1
            if failed_count <= 5:
                print(f'Import failed HTTP {st} for {rec["name"]}: {created_place}', flush=True)

    print(
        f'Import complete: created={created_count}, skipped_duplicates={skipped_count}, '
        f'published_existing={published_existing}, failed={failed_count}, '
        f'media_uploaded={media_uploaded}, media_approved={media_approved}, media_pending_scanner={media_pending}',
        flush=True,
    )
    return 1 if failed_count else 0


def cmd_serve_feed(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f'Input JSON not found: {input_path}. Run "extract-multi" first.')
    records: list[dict[str, Any]] = json.loads(input_path.read_text(encoding='utf-8'))

    class FeedHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            qs = parse_qs(urlparse(self.path).query)
            offset = int(qs.get('cursor', ['0'])[0] or '0')
            page_size = 50
            slice_items = records[offset:offset + page_size]
            next_cursor = str(offset + page_size) if offset + page_size < len(records) else None
            payload = {
                'records': [
                    {
                        'external_id': r['external_id'],
                        'name': r['name'],
                        'latitude': r['latitude'],
                        'longitude': r['longitude'],
                        'address': r.get('address') or r['name'],
                        'price': r.get('price'),
                        'currency': 'VND',
                        'category_ids': ['20000000-0000-0000-0000-000000000001'],
                        'opening_hours': r.get('opening_hours') or [],
                    }
                    for r in slice_items
                ],
                'next_cursor': next_cursor,
                'checkpoint': f'geofabrik-osm-{len(records)}',
            }
            data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_: Any) -> None:
            pass

    print(f'Serving {len(records)} OSM records at http://127.0.0.1:{args.port}/records ...', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), FeedHandler).serve_forever()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', default=str(ROOT / '.env'), help='Optional dotenv file to load missing env vars from')
    sub = parser.add_subparsers(dest='command', required=True)

    ext = sub.add_parser('extract-multi', help='Extract 50 places each for Ha Noi, HCMC, Da Nang, and France')
    ext.add_argument('--output', default=str(LOCAL_DIR / 'places-200.json'))
    ext.add_argument('--skip-image-download', action='store_true')

    cld = sub.add_parser('upload-cloudinary', help='Upload extracted 1-to-1 place photos to Cloudinary CDN')
    cld.add_argument('--input', default=str(LOCAL_DIR / 'places-200.json'))
    cld.add_argument('--cloud-name', default='')
    cld.add_argument('--api-key', default='')
    cld.add_argument('--api-secret', default='')
    cld.add_argument('--folder', default='')
    cld.add_argument('--force', action='store_true', help='Re-upload even if cloudinary_url already exists')

    imp = sub.add_parser('import', help='Import extracted JSON places into SmartTravel Gateway')
    imp.add_argument('--gateway', default='http://127.0.0.1:58080')
    imp.add_argument('--input', default=str(LOCAL_DIR / 'places-200.json'))
    imp.add_argument('--admin-email', default='')
    imp.add_argument('--admin-password', default='')
    imp.add_argument('--replace-legacy-demo', action='store_true', help='Archive the 29 legacy seed_demo places before importing')
    imp.add_argument('--skip-media', action='store_true', help='Skip /admin/media upload (use pre-uploaded Cloudinary CDN URLs)')

    arc = sub.add_parser('archive-legacy-demo', help='Archive the 29 legacy seed_demo places via Admin API')
    arc.add_argument('--gateway', default='http://127.0.0.1:58080')
    arc.add_argument('--admin-email', default='')
    arc.add_argument('--admin-password', default='')

    srv = sub.add_parser('serve-feed', help='Serve extracted JSON as an Ingestion Connector feed')
    srv.add_argument('--input', default=str(LOCAL_DIR / 'places-200.json'))
    srv.add_argument('--port', type=int, default=8090)

    args = parser.parse_args()
    load_dotenv_defaults(Path(args.env_file))
    if args.command == 'extract-multi':
        return cmd_extract_multi(args)
    if args.command == 'upload-cloudinary':
        return cmd_upload_cloudinary(args)
    if args.command == 'import':
        return cmd_import(args)
    if args.command == 'archive-legacy-demo':
        return cmd_archive_legacy_demo(args)
    return cmd_serve_feed(args)


if __name__ == '__main__':
    sys.exit(main())
