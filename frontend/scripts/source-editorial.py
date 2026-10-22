"""Download attributed, open-license editorial photography (not catalog data)."""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'images' / 'editorial'


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SmartTravelEditorial/1.0 (educational travel project)'}), timeout=60)


def search(query):
    params = dict(action='query', generator='search', gsrsearch=query + ' filetype:bitmap', gsrnamespace=6, gsrlimit=4, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1600, format='json')
    data = json.load(request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)))
    for page in data.get('query', {}).get('pages', {}).values():
        info = page['imageinfo'][0]
        meta = info['extmetadata']
        print(json.dumps(dict(title=page['title'], url=info.get('thumburl', info['url']), source=info['descriptionurl'], author=re.sub('<[^>]+>', '', meta.get('Artist', {}).get('value', '')), license=meta.get('LicenseShortName', {}).get('value'), license_url=meta.get('LicenseUrl', {}).get('value')), ensure_ascii=True))


if __name__ == '__main__':
    import sys
    if '--download' in sys.argv:
        from PIL import Image
        from io import BytesIO
        ROOT.mkdir(parents=True, exist_ok=True)
        selected = {'ninh-binh': 'File:Tam Coc Panorama (8604887215).jpg', 'hoi-an': 'File:Boats with lanterns on the Thu Bon river IMG 3864.jpg', 'ha-long': 'File:Ha Long Bay, Vietnam, Islands.jpg'}
        credits = []
        for name, title in selected.items():
            params = dict(action='query', titles=title, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1600, format='json')
            data = json.load(request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)))
            info = next(iter(data['query']['pages'].values()))['imageinfo'][0]
            meta = info['extmetadata']
            img = Image.open(BytesIO(request(info.get('thumburl', info['url'])).read())).convert('RGB')
            img.thumbnail((1600, 1600))
            img.save(ROOT / (name + '.webp'), 'WEBP', quality=84)
            credits.append(dict(file=name + '.webp', source=info['descriptionurl'], original=info['url'], author=re.sub('<[^>]+>', '', meta['Artist']['value']), license=meta['LicenseShortName']['value'], license_url=meta['LicenseUrl']['value'], modifications='Resized, WebP conversion; CSS crop in page', width=img.width, height=img.height))
            print(name, img.size)
        (ROOT / 'credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        sys.exit(0)
    for query in sys.argv[1:] or ['"Tam Coc" landscape', '"Hoi An" lanterns', '"Ha Long Bay" landscape']:
        search(query)
