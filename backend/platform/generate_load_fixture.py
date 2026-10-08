"""Generate deterministic synthetic P03 load data; never production seeds.
Output is a NEW directory, not committed DB credentials or real personal data.
python backend/platform/generate_load_fixture.py --output /tmp/p00-load-data
"""
import argparse
import hashlib
import json
import random
import uuid
from pathlib import Path

PROFILE=Path(__file__).resolve().parents[1]/'contracts/fixtures/load-profile.json'

def identifier(kind,index): return str(uuid.uuid5(uuid.NAMESPACE_URL,f'smarttravel-synthetic:{kind}:{index}'))

def generate(output):
    profile=json.loads(PROFILE.read_text(encoding='utf-8'))
    output.mkdir(parents=True,exist_ok=False)
    rng=random.Random(profile['seed']); hashes={}
    for kind in ['places','users','reviews','trips','interactions']:
        path=output/f'{kind}.jsonl'
        with path.open('w',encoding='utf-8',newline='\n') as stream:
            for i in range(profile[kind]):
                row={'id':identifier(kind,i),'synthetic':True}
                if kind=='places': row.update(name=f'Synthetic Place {i}',latitude=10.7+rng.random()*0.1,longitude=106.6+rng.random()*0.1,status=['PUBLISHED','HIDDEN','ARCHIVED'][i%3])
                elif kind=='users': row.update(alias=f'Synthetic User {i}',consent=i%2==0)
                elif kind=='reviews': row.update(user_id=identifier('users',i%profile['users']),place_id=identifier('places',i//profile['users']),rating=i%5+1,status='APPROVED')
                elif kind=='trips': row.update(owner_id=identifier('users',i%profile['users']),place_id=identifier('places',i%profile['places']))
                else: row.update(user_id=identifier('users',i%profile['users']),place_id=identifier('places',i%profile['places']),type=['SEARCH','PLACE_VIEW'][i%2])
                stream.write(json.dumps(row,sort_keys=True)+'\n')
        hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    (output/'manifest.json').write_text(json.dumps({'profile':profile,'hashes':hashes,'production_eligible':False},indent=2)+'\n',encoding='utf-8')
    print(f'Generated deterministic synthetic load fixture: {sum(profile[k] for k in ["places","users","reviews","trips","interactions"])} records. Not domain seeds or ML quality evidence.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,required=True)
    generate(parser.parse_args().output)
