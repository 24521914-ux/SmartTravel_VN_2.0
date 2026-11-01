"""Build deterministic P00 contract candidate v1, examples and message registry.
Generated files are owned by this script. Run with --write to intentionally
replace the previous generated drafts; this never touches shared.json or docs.
"""
import argparse
import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'contracts'
SERVICES = ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']
U = {'type': 'string', 'format': 'uuid'}
S = {'type': 'string', 'minLength': 1, 'maxLength': 1024}
V = {'type': 'integer', 'minimum': 1}
B = {'type': 'boolean'}
T = {'type': 'string', 'format': 'date-time'}
D = {'type': 'string', 'format': 'date'}
N = {'type': 'number', 'minimum': 0}

def enum(*values): return {'type': 'string', 'enum': list(values)}
def arr(item, limit=100): return {'type': 'array', 'items': item, 'maxItems': limit}
def obj(props, required=None):
    return {'type': 'object', 'properties': props, 'required': list(props) if required is None else required, 'additionalProperties': False}
def patch(model, exclude=()):
    props = {k: v for k, v in model['properties'].items() if k not in set(exclude) | {'version', 'created_at', 'updated_at', 'snapshot', 'source_version', 'distance_m', 'duration_seconds', 'fallback'}}
    return dict(obj(props, []), minProperties=1)
def page(model): return obj({'items': arr(model), 'next_cursor': {'type': ['string', 'null']}, 'as_of': T, 'watermark': V})
def batch(model): return obj({'items': arr(model), 'missing_ids': arr(U)})
IDS = obj({'ids': dict(arr(U), minItems=1, uniqueItems=True)})
ERROR = obj({'code': S, 'message': S, 'traceId': S, 'fieldErrors': arr(obj({'field': S, 'message': S}))})
ACK = obj({'request_id': U, 'status': enum('ACCEPTED', 'PENDING', 'COMPLETED'), 'version': V})
REPORT_QUEUE = obj({**ACK['properties'], 'review_id': U, 'reason': S, 'report_status': enum('OPEN','RESOLVED','DISMISSED'), 'review_content': S, 'place_id': U}, ACK['required'])
POINT = obj({'latitude': {'type': 'number', 'minimum': -90, 'maximum': 90}, 'longitude': {'type': 'number', 'minimum': -180, 'maximum': 180}})
PREF = obj({'category_ids': arr(U), 'travel_style_ids': arr(U), 'food_preference_ids': arr(U), 'budget_level': enum('LOW','MID','HIGH','CUSTOM'), 'budget_min': {'type':['number','null'],'minimum':0}, 'budget_max': {'type':['number','null'],'minimum':0}, 'currency': enum('VND'), 'personalization_enabled': B, 'consent_version': V, 'version': V})
USER = obj({'user_id': U, 'display_name': S, 'status': enum('ACTIVE', 'DISABLED', 'DELETED'), 'roles': arr(enum('USER', 'BUSINESS', 'ADMIN')), 'version': V})
STATUS = obj({'user_id': U, 'status': enum('ACTIVE', 'DISABLED', 'DELETED'), 'version': V})
TOKEN = obj({'access_token': S, 'refresh_token': S, 'token_type': enum('Bearer'), 'expires_in': {'type':'integer','minimum':1}})
TAXON = obj({'id': U, 'name': S, 'active': B, 'version': V})
GEO = obj({'id': U, 'name': S, 'parent_id': {'type':['string','null'],'format':'uuid'}, 'level': enum('COUNTRY','PROVINCE','DISTRICT','WARD'), 'aliases': arr(S), 'version': V})
DEST = obj({'destination_id': U, 'name': S, 'status': enum('ACTIVE','INACTIVE'), 'geographic_unit_ids': arr(U), 'version': V})
HOURS = obj({'weekday': {'type':'integer','minimum':0,'maximum':6}, 'open': {'type':'string','pattern':'^([01][0-9]|2[0-3]):[0-5][0-9]$'}, 'close': {'type':'string','pattern':'^([01][0-9]|2[0-3]):[0-5][0-9]$'}, 'overnight': B})
PLACE = obj({'place_id': U, 'name': S, 'status': enum('DRAFT','PUBLISHED','HIDDEN','ARCHIVED'), 'version': V,
    **POINT['properties'], 'category_ids': arr(U), 'tag_ids': arr(U), 'amenity_ids': arr(U), 'geographic_unit_id': U,
    'destination_ids': arr(U), 'price': {'type':['number','null'],'minimum':0}, 'currency': enum('VND'),
    'opening_hours': arr(HOURS, 28), 'media_keys': arr(S), 'source_version': V})
PUBLIC_PLACE = obj({**PLACE['properties'], 'status': enum('PUBLISHED')})
OFFER = obj({'offering_id':U,'place_id':U,'type':enum('SERVICE','TOUR','EVENT','ACTIVITY','EXPERIENCE'),'name':S,'price':{'type':['number','null'],'minimum':0},'currency':enum('VND'),'version':V})
BUSINESS = obj({'business_id':U,'name':S,'status':enum('PENDING','VERIFIED','SUSPENDED'),'version':V})
CLAIM = obj({'claim_id':U,'business_id':U,'place_id':U,'owner_user_id':U,'status':enum('PENDING','APPROVED','REJECTED','REVOKED'),'version':V})
REVIEW = obj({'review_id':U,'user_id':U,'place_id':U,'rating':{'type':'integer','minimum':1,'maximum':5},'content':S,'media_keys':arr(S),'status':enum('PENDING','APPROVED','REJECTED','HIDDEN','DELETED'),'version':V})
RATING = obj({'place_id':U,'count':{'type':'integer','minimum':0},'sum':{'type':'integer','minimum':0},'version':V,'as_of':T})
COLLECTION = obj({'collection_id':U,'owner_id':U,'name':S,'visibility':enum('PUBLIC','PRIVATE'),'version':V})
COLLECTION_ITEM = obj({'item_id':U,'place_id':U,'note':S,'rank':N,'version':V})
# Explicit whitelist: arbitrary JSON cannot change protected canonical fields.
FIELDS = obj({'name':S,'category_ids':arr(U),**POINT['properties'],'opening_hours':arr(HOURS,28),'price':{'type':['number','null'],'minimum':0},'currency':enum('VND')}, [])
FIELDS['minProperties'] = 1
CONTRIBUTION = obj({'contribution_id':U,'user_id':U,'type':enum('ADD','EDIT'),'target_id':{'type':['string','null'],'format':'uuid'},'expected_version':{'type':'integer','minimum':0},'fields':FIELDS,'status':enum('PENDING','APPROVED','APPLYING','APPLIED','APPLY_FAILED','REJECTED','WITHDRAWN'),'version':V})
TRIP = obj({'trip_id':U,'owner_id':U,'name':S,'start_date':D,'end_date':D,'timezone':enum('Asia/Ho_Chi_Minh'),'currency':enum('VND'),'budget':N,'state':enum('DRAFT','PLANNED','COMPLETED','CANCELLED'),'version':V})
SEGMENT = obj({'segment_id':U,'destination_id':U,'start_date':D,'end_date':D,'version':V})
DAY = obj({'day_id':U,'date':D,'version':V})
ITEM = obj({'item_id':U,'place_id':U,'note':S,'duration_minutes':{'type':'integer','minimum':0},'locked':B,'rank':N,'source_version':V,'snapshot':PLACE,'version':V})
TRANSFER = obj({'transfer_id':U,'from_item_id':U,'to_item_id':U,'mode':enum('WALK','DRIVE','BICYCLE'),'distance_m':N,'duration_seconds':{'type':['integer','null'],'minimum':0},'fallback':B,'version':V})
POLICY = obj({'source_id':U,'source_version':V,'license_version':S,'allow_storage':B,'allow_training':B,'status':enum('PERMITTED','REVOKED')})
SOURCE = obj({**POLICY['properties'],'name':S,'uri':{'type':'string','format':'uri'},'secret_reference':S,'version':V})
JOB = obj({'job_id':U,'source_id':U,'status':enum('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'),'mode':enum('FULL','INCREMENTAL','REPLAY'),'checkpoint':{'type':['string','null']},'version':V})
IMPORT_ITEM = obj({'item_id':U,'command_id':U,'status':enum('PENDING','NEEDS_REVIEW','APPLIED','REJECTED','FAILED'),'proposed_place_id':U,'error_code':{'type':['string','null']},'version':V})
INTERACTION = obj({'event_id':U,'session_id':U,'type':enum('SEARCH','PLACE_VIEW'),'place_id':{'type':['string','null'],'format':'uuid'},'query':{'type':['string','null'],'maxLength':512},'occurred_at':T})
RECOMMEND_REQUEST = obj({'topN':{'type':'integer','minimum':1,'maximum':50},'currency':enum('VND'),'category_ids':arr(U),'budget':N,**POINT['properties'],'radius_m':{'type':'number','minimum':1,'maximum':100000}}, ['topN','currency'])
RECOMMEND_RESPONSE = obj({'request_id':U,'version':S,'data_as_of':T,'fallback':B,'items':arr(obj({'place_id':U,'score':{'type':'number'},'explanation':S}),50)})
DATASET = obj({'dataset_id':U,'version':V,'checksum':{'type':'string','pattern':'^[a-f0-9]{64}$'},'feature_schema_version':V,'source_ids':arr(U),'status':enum('BUILDING','READY','REVOKED','FAILED')})
TRAIN = obj({'job_id':U,'dataset_id':U,'status':enum('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED'),'seed':{'type':'integer','minimum':0},'code_revision':S,'version':V})
MODEL = obj({'model_id':U,'model_version_id':U,'status':enum('TRAINED','VALIDATED','ACTIVE','REVOKED'),'metrics':obj({'precision_at_10':{'type':'number','minimum':0,'maximum':1},'ndcg_at_10':{'type':'number','minimum':0,'maximum':1}}),'version':V})
NOTIFICATION = obj({'notification_id':U,'user_id':U,'title':S,'read':B,'version':V})

specs = {s:{'openapi':'3.1.0','info':{'title':f'SmartTravel {s}', 'version':'1.0.0-candidate', 'description':'P00 contract candidate. Technical validation is not human approval.'},'paths':{},'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer','bearerFormat':'JWT'}}}} for s in SERVICES}
examples = {s:{} for s in SERVICES}

def sample(schema, name=''):
    if 'const' in schema: return schema['const']
    if 'enum' in schema: return schema['enum'][0]
    kind = schema.get('type')
    if isinstance(kind,list):
        if name in ['parent_id','target_id','budget_min','budget_max','recommendation_request_id','next_cursor']: return None
        kind = next(t for t in kind if t != 'null')
    if kind == 'object': return {k:sample(v,k) for k,v in schema.get('properties',{}).items()}
    if kind == 'array':
        if name in ['travel_style_ids','food_preference_ids']: return []
        return [sample(schema['items'], name[:-1] if name.endswith('s') else name)] if schema.get('maxItems',1) else []
    if kind in ['number','integer']:
        if name=='latitude': return 10.762622
        if name=='longitude': return 106.660172
        return schema.get('minimum', 1)
    if kind == 'boolean': return name=='active'
    if schema.get('format') == 'uuid':
        prefix = {'place_id':'10000000','category_id':'20000000','source_id':'30000000','trip_id':'40000000','model_id':'50000000','model_version_id':'50000000'}.get(name, '00000000')
        return prefix + '-0000-4000-8000-000000000001'
    if schema.get('format') == 'date-time': return '2026-10-08T00:00:00Z'
    if schema.get('format') == 'date': return '2026-10-08'
    if schema.get('format') == 'uri': return 'https://example.invalid/synthetic'
    if schema.get('format') == 'email': return 'fixture@example.invalid'
    if 'pattern' in schema:
        if '[a-f0-9]{64}' in schema['pattern']: return 'a'*64
        if 'trace' == name: return '00-'+'a'*32+'-'+'b'*16+'-01'
        if '[0-9]' in schema['pattern']: return '17:00' if name=='close' else '09:00'
    if name in ['access_token','refresh_token','password','token']: return 'synthetic-not-a-credential'
    return 'synthetic' + 'x' * max(0, schema.get('minLength', 1) - len('synthetic'))

def op(service, path, method, name, request=None, response=None, code=200, public=False, scope=None, version=False, idem=False, queries=None):
    params = [{'name':match,'in':'path','required':True,'schema':U} for match in re.findall(r'\{(\w+)\}',path)]
    params.append({'name':'X-Correlation-ID','in':'header','required':False,'schema':U})
    if version: params.append({'name':'If-Match','in':'header','required':True,'schema':{'type':'string','pattern':'^"[1-9][0-9]*"$'},'example':'"1"'})
    if idem: params.append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':1,'maxLength':128}})
    if response and 'next_cursor' in response.get('properties',{}):
        params += [{'name':'cursor','in':'query','required':False,'schema':S},{'name':'limit','in':'query','required':False,'schema':{'type':'integer','minimum':1,'maximum':100,'default':20}}]
    for key, schema in (queries or {}).items(): params.append({'name':key,'in':'query','required':False,'schema':schema})
    operation = {'operationId':name,'security':[] if public else [{'bearerAuth':[]}], 'x-required-scope':scope or (f'{service}:admin' if '/admin/' in path else f'{service}:{"read" if method=="get" else "write"}'), 'parameters':params,
        'responses':{str(code):{'description':'Success',**({'content':{'application/json':{'schema':response}}} if response else {})},
        **{str(c):{'description':reason,'content':{'application/json':{'schema':ERROR}}} for c,reason in [(400,'Invalid input'),(401,'Invalid JWT'),(403,'Insufficient permission'),(404,'Not found or not visible'),(409,'Version/idempotency conflict'),(422,'Business invariant'),(428,'Missing precondition'),(429,'Rate limit'),(503,'Dependency unavailable')]}}}
    if request: operation['requestBody']={'required':True,'content':{'application/json':{'schema':request}}}
    specs[service]['paths'].setdefault(path,{})[method] = operation
    case = {'path':re.sub(r'\{(\w+)\}',lambda m:sample(U,m.group(1)),path),'method':method.upper(),'status':code,'headers':{'If-Match':'"1"','Idempotency-Key':'synthetic-fixed-key'}}
    if request: case['request']=sample(request)
    if response: case['response']=sample(response)
    if request is IDS and response and 'items' in response.get('properties',{}):
        item_schema=response['properties']['items']['items']
        key=next(iter(item_schema['properties']))
        case['request']['ids']=[sample(U,key)]
        case['response']['missing_ids']=[]
    if name=='public_categories': case['response']['items'][0]['id']=sample(U,'category_id')
    examples[service][name] = case

def crud(service,path,model,id_field,create=None,public_read=False):
    tag = service + '_' + re.sub(r'[^a-zA-Z0-9]+','_',path).strip('_')
    op(service,path,'get',tag+'_list',response=page(model),public=public_read)
    op(service,path,'post',tag+'_create',request=create or patch(model,[id_field,'owner_id','user_id','status','state']),response=model,code=201,idem=True,version='{' in path)
    detail = path + '/{' + id_field + '}'
    op(service,detail,'get',tag+'_get',response=model,public=public_read)
    op(service,detail,'patch',tag+'_update',request=patch(model,[id_field,'owner_id','user_id','status','state']),response=model,version=True,idem=True)
    op(service,detail,'delete',tag+'_delete',code=204,version=True,idem=True)

# Identity: no client role/owner override on public registration/profile.
EMAIL={'type':'string','format':'email','maxLength':254}
PASSWORD={'type':'string','minLength':12,'maxLength':128}
op('identity','/api/v1/auth/register','post','register',obj({'email':EMAIL,'password':PASSWORD,'display_name':S}),ACK,202,public=True,idem=True)
op('identity','/api/v1/auth/login','post','login',obj({'email':EMAIL,'password':PASSWORD}),TOKEN,public=True)
for route in ['refresh','logout']:
    op('identity','/api/v1/auth/'+route,'post',route,obj({'refresh_token':S}),TOKEN if route=='refresh' else None,200 if route=='refresh' else 204,public=True)
for route, request in [('verify-email',obj({'token':S})),('forgot-password',obj({'email':EMAIL})),('reset-password',obj({'token':S,'password':PASSWORD}))]:
    op('identity','/api/v1/auth/'+route,'post',route.replace('-','_'),request,ACK,202,public=True)
op('identity','/api/v1/me','get','profile',response=USER)
op('identity','/api/v1/me','patch','updateProfile',obj({'display_name':S}),USER,version=True)
op('identity','/api/v1/me/password','put','changePassword',obj({'current_password':PASSWORD,'new_password':PASSWORD}),code=204)
op('identity','/api/v1/me/preferences','get','getPreferences',response=PREF)
op('identity','/api/v1/me/preferences','put','putPreferences',patch(PREF),PREF,version=True,idem=True)
op('identity','/api/v1/preference-options','get','preferenceOptions',response=page(obj({'option_id':U,'kind':enum('TRAVEL_STYLE','FOOD_PREFERENCE'),'name':S,'active':B,'version':V})),public=True)
SESSION=obj({'session_id':U,'created_at':T,'expires_at':T})
op('identity','/api/v1/me/sessions','get','listSessions',response=page(SESSION))
op('identity','/api/v1/me/sessions/{session_id}','delete','revokeSession',code=204)
op('identity','/api/v1/me/notifications','get','listNotifications',response=page(NOTIFICATION))
op('identity','/api/v1/me/notifications/{notification_id}/read','patch','readNotification',response=NOTIFICATION,idem=True)
op('identity','/api/v1/me/deletion-requests','post','requestDeletion',obj({'policy_version':V}),ACK,202,idem=True)
op('identity','/api/v1/admin/users','get','adminUsers',response=page(USER),scope='identity:admin')
op('identity','/api/v1/admin/users/{user_id}/status','patch','adminUserStatus',obj({'status':enum('ACTIVE','DISABLED')}),USER,scope='identity:admin',version=True)
op('identity','/api/v1/admin/users/{user_id}/roles','put','adminUserRoles',obj({'roles':arr(enum('USER','BUSINESS','ADMIN'))}),USER,scope='identity:admin',version=True)
op('identity','/.well-known/jwks.json','get','jwks',response=obj({'keys':arr(obj({'kty':enum('RSA'),'use':enum('sig'),'alg':enum('RS256'),'kid':S,'n':S,'e':S}))}),public=True)
op('identity','/internal/v1/users/status/batch','post','userStatusBatch',IDS,batch(STATUS),scope='identity:status:read')
op('identity','/internal/v1/users/preferences/batch','post','preferencesBatch',IDS,batch(obj({'user_id':U,**PREF['properties']})),scope='identity:preferences:read')
op('identity','/internal/v1/deletion-requests/{request_id}','get','deletionStatus',response=ACK,scope='identity:deletion:read')
# Catalog public reads and protected administration.
crud('catalog','/api/v1/admin/places',PLACE,'place_id')
op('catalog','/api/v1/places','get','searchPlaces',response=page(PUBLIC_PLACE),public=True,queries={'q':S,'categoryId':U,'geographicUnitId':U,'destinationId':U,'minPrice':N,'maxPrice':N,'minRating':{'type':'number','minimum':0,'maximum':5},'lat':POINT['properties']['latitude'],'lon':POINT['properties']['longitude'],'radiusM':{'type':'number','minimum':1},'type':S})
op('catalog','/api/v1/places/{place_id}','get','getPlace',response=PUBLIC_PLACE,public=True)
op('catalog','/api/v1/admin/places/{place_id}/status','put','placeStatus',obj({'status':enum('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')}),PLACE,scope='catalog:admin',version=True)
for name, model, key in [('geographic-units',GEO,'id'),('destinations',DEST,'destination_id'),('categories',TAXON,'id'),('tags',TAXON,'id'),('amenities',TAXON,'id'),('offerings',OFFER,'offering_id')]:
    crud('catalog','/api/v1/admin/'+name,model,key)
    op('catalog','/api/v1/'+name,'get','public_'+name.replace('-','_'),response=page(model),public=True)
# Unknown persisted offering prices are null, never an invented zero. Keep
# existing write schemas unchanged: supplied prices must remain numeric.
for method, path in [('post','/api/v1/admin/offerings'),('patch','/api/v1/admin/offerings/{offering_id}')]:
    specs['catalog']['paths'][path][method]['requestBody']['content']['application/json']['schema']['properties']['price'] = N
# Preserve the existing additive P03 publication PATCH when regenerating drafts.
offering_patch = specs['catalog']['paths']['/api/v1/admin/offerings/{offering_id}']['patch']
offering_patch['requestBody']['content']['application/json']['schema']['properties']['status'] = enum('DRAFT','PUBLISHED','HIDDEN','ARCHIVED')
offering_patch['description'] = 'Additive P03 revision: optional status controls publication. Existing PATCH fields and clients remain compatible; publication validates anchor visibility and event schedules.'
op('catalog','/api/v1/places/{place_id}/offerings','get','placeOfferings',response=page(OFFER),public=True)
crud('catalog','/api/v1/businesses',BUSINESS,'business_id')
MEMBER=obj({'member_id':U,'user_id':U,'role':enum('OWNER','EDITOR'),'version':V})
crud('catalog','/api/v1/businesses/{business_id}/members',MEMBER,'member_id')
op('catalog','/api/v1/businesses/{business_id}/verification','post','verifyBusiness',obj({'evidence_keys':arr(S)}),ACK,202,idem=True)
op('catalog','/api/v1/businesses/{business_id}/claims','post','createClaim',obj({'place_id':U,'evidence_keys':arr(S)}),CLAIM,201,idem=True)
CHANGE=obj({'change_request_id':U,'claim_id':U,'fields':FIELDS,'expected_version':V,'status':enum('PENDING','APPLIED','REJECTED'),'version':V})
op('catalog','/api/v1/claims/{claim_id}/change-requests','post','changeRequest',obj({'fields':FIELDS,'expected_version':V}),CHANGE,202,idem=True)
for resource in ['claims','change-requests','business-verifications','media']:
    op('catalog',f'/api/v1/admin/{resource}/{{id}}/review','post','adminReview_'+resource.replace('-','_'),obj({'action':enum('APPROVE','REJECT','REVOKE'),'reason':S}),ACK,202,scope='catalog:admin',version=True,idem=True)
op('catalog','/internal/v1/places/batch','post','placeBatch',IDS,batch(PUBLIC_PLACE),scope='catalog:places:read')
op('catalog','/internal/v1/places/validate','post','validatePlaces',IDS,batch(obj({'place_id':U,'public':B,'version':V})),scope='catalog:places:read')
op('catalog','/internal/v1/places/snapshot','get','placeSnapshot',response=page(PLACE),scope='catalog:places:read')
op('catalog','/internal/v1/places/candidates','post','placeCandidates',obj({'name':S,**POINT['properties']}),batch(PLACE),scope='catalog:candidates:read')
# Community: content moderation is separate from owner edits.
op('community','/api/v1/places/{place_id}/reviews','get','placeReviews',response=page(REVIEW),public=True)
op('community','/api/v1/places/{place_id}/reviews','post','createReview',obj({'rating':REVIEW['properties']['rating'],'content':S,'media_keys':arr(S)}),REVIEW,201,idem=True)
op('community','/api/v1/reviews/{review_id}','patch','editReview',obj({'rating':REVIEW['properties']['rating'],'content':S,'media_keys':arr(S)}),REVIEW,version=True)
op('community','/api/v1/reviews/{review_id}','delete','deleteReview',code=204,version=True)
op('community','/api/v1/reviews/{review_id}/reports','post','reportReview',obj({'reason':S}),ACK,202,idem=True)
op('community','/api/v1/me/favorites','get','listFavorites',response=page(obj({'place_id':U,'created_at':T})))
for method in ['put','delete']: op('community','/api/v1/me/favorites/{place_id}',method,method+'Favorite',code=204)
crud('community','/api/v1/me/collections',COLLECTION,'collection_id',obj({'name':S,'visibility':enum('PUBLIC','PRIVATE')}))
op('community','/api/v1/collections/{collection_id}','get','publicCollection',response=COLLECTION,public=True)
crud('community','/api/v1/collections/{collection_id}/items',COLLECTION_ITEM,'item_id',obj({'place_id':U,'note':S}))
op('community','/api/v1/collections/{collection_id}/items/order','put','orderCollection',obj({'item_ids':dict(arr(U),uniqueItems=True)}),ACK,version=True)
op('community','/api/v1/contributions','post','createContribution',obj({'type':enum('ADD','EDIT'),'target_id':{'type':['string','null'],'format':'uuid'},'expected_version':{'type':'integer','minimum':0},'fields':FIELDS}),CONTRIBUTION,201,idem=True)
op('community','/api/v1/me/contributions','get','myContributions',response=page(CONTRIBUTION))
op('community','/api/v1/contributions/{contribution_id}','patch','editContribution',obj({'fields':FIELDS}),CONTRIBUTION,version=True)
op('community','/api/v1/contributions/{contribution_id}/withdraw','post','withdrawContribution',response=CONTRIBUTION,version=True)
for resource, model in [('reviews',REVIEW),('contributions',CONTRIBUTION),('reports',REPORT_QUEUE)]:
    op('community','/api/v1/admin/'+resource,'get','moderationList_'+resource,response=page(model),scope='community:admin')
    op('community',f'/api/v1/admin/{resource}/{{id}}/moderate','post','moderate_'+resource,obj({'action':enum('APPROVE','REJECT','HIDE','RESTORE'),'reason':S}),ACK,202,scope='community:admin',version=True,idem=True)
op('community','/internal/v1/ratings/batch','post','ratingsBatch',IDS,batch(RATING),scope='community:ratings:read')
op('community','/internal/v1/ratings/snapshot','get','ratingSnapshot',response=page(RATING),scope='community:ratings:read')
# Trip parent version/owner governs nested modifications.
op('trip','/api/v1/me/trips','get','listTrips',response=page(TRIP))
op('trip','/api/v1/me/trips','post','createTrip',obj({k:v for k,v in TRIP['properties'].items() if k in ['name','start_date','end_date','timezone','currency','budget']}, ['name','start_date','end_date','timezone','currency']),TRIP,201,idem=True)
for method in ['get','patch','delete']:
    op('trip','/api/v1/trips/{trip_id}',method,method+'Trip',patch(TRIP,['trip_id','owner_id','state']) if method=='patch' else None,TRIP if method!='delete' else None,204 if method=='delete' else 200,version=method!='get',idem=method!='get')
op('trip','/api/v1/trips/{trip_id}/state','put','tripState',obj({'state':TRIP['properties']['state']}),TRIP,version=True)
crud('trip','/api/v1/trips/{trip_id}/destinations',SEGMENT,'segment_id')
crud('trip','/api/v1/trips/{trip_id}/days',DAY,'day_id')
crud('trip','/api/v1/trips/{trip_id}/days/{day_id}/items',ITEM,'item_id',obj({'place_id':U,'note':S,'duration_minutes':{'type':'integer','minimum':0},'locked':B,'recommendation_request_id':{'type':['string','null'],'format':'uuid'}}))
op('trip','/api/v1/trips/{trip_id}/days/{day_id}/items/order','put','orderTripItems',obj({'item_ids':dict(arr(U),uniqueItems=True)}),ACK,version=True)
crud('trip','/api/v1/trips/{trip_id}/transfers',TRANSFER,'transfer_id',obj({'from_item_id':U,'to_item_id':U,'mode':enum('WALK','DRIVE','BICYCLE')}))
op('trip','/api/v1/trips/{trip_id}/route-estimates','post','estimateRoute',obj({'from_item_id':U,'to_item_id':U,'mode':enum('WALK','DRIVE','BICYCLE')}),TRANSFER)
op('trip','/api/v1/trips/{trip_id}/snapshots/refresh','post','refreshSnapshots',obj({'item_ids':arr(U)}),ACK,202,version=True,idem=True)
# Ingestion admin-only durable workflow; never accepts plaintext connector secrets.
crud('ingestion','/api/v1/admin/data-sources',SOURCE,'source_id',obj({'name':S,'uri':{'type':'string','format':'uri'},'secret_reference':S,'license_version':S,'allow_storage':B,'allow_training':B}))
op('ingestion','/api/v1/admin/data-sources/{source_id}/policy','patch','updateSourcePolicy',patch(POLICY,['source_id','source_version']),POLICY,version=True)
op('ingestion','/api/v1/admin/data-sources/{source_id}/import-jobs','post','createImportJob',obj({'mode':enum('FULL','INCREMENTAL','REPLAY')}),JOB,202,idem=True)
op('ingestion','/api/v1/admin/import-jobs/{job_id}','get','getImportJob',response=JOB)
for resource,model in [('items',IMPORT_ITEM),('errors',obj({'item_id':U,'error_code':S,'message':S})),('candidates',PLACE)]:
    op('ingestion',f'/api/v1/admin/import-jobs/{{job_id}}/{resource}','get','import_'+resource,response=page(model))
for action in ['retry','cancel']: op('ingestion',f'/api/v1/admin/import-jobs/{{job_id}}/{action}','post',action+'Import',response=JOB,code=202,version=True,idem=True)
op('ingestion','/api/v1/admin/import-items/{item_id}/decision','post','importDecision',obj({'action':enum('MATCH','CREATE','REJECT'),'place_id':{'type':['string','null'],'format':'uuid'},'reason':S}),IMPORT_ITEM,version=True,idem=True)
op('ingestion','/internal/v1/sources/{source_id}/policy','get','sourcePolicy',response=POLICY,scope='ingestion:policy:read')
op('ingestion','/internal/v1/sources/policies/batch','post','sourcePolicyBatch',IDS,batch(POLICY),scope='ingestion:policy:read')
op('ingestion','/internal/v1/source-links','post','sourceLinks',obj({'source_id':U,'external_ids':arr(S)}),batch(obj({'source_id':U,'external_id':S,'place_id':U})),scope='ingestion:links:read')
# Intelligence Basic first, ML endpoints are contract-only until Basic acceptance.
op('intelligence','/api/v1/recommendations','post','recommend',RECOMMEND_REQUEST,RECOMMEND_RESPONSE,scope='recommendation:read',public=True)
op('intelligence','/api/v1/interactions/batch','post','recordInteractions',obj({'items':dict(arr(INTERACTION),minItems=1),'analytics_consent':{'const':True},'consent_version':V}),obj({'accepted_ids':arr(U),'errors':arr(obj({'event_id':U,'code':S}))}),202,public=True)
op('intelligence','/api/v1/me/interactions','get','myInteractions',response=page(INTERACTION))
op('intelligence','/api/v1/me/interactions','delete','deleteHistory',response=ACK,code=202,idem=True)
op('intelligence','/api/v1/admin/datasets','post','buildDataset',obj({'source_ids':arr(U),'feature_schema_version':V,'criteria':obj({'start':T,'end':T})}),DATASET,202,idem=True)
op('intelligence','/api/v1/admin/datasets/{dataset_id}','get','getDataset',response=DATASET)
op('intelligence','/api/v1/admin/training-jobs','post','startTraining',obj({'dataset_id':U,'seed':{'type':'integer','minimum':0},'code_revision':S}),TRAIN,202,idem=True)
op('intelligence','/api/v1/admin/training-jobs/{job_id}','get','getTraining',response=TRAIN)
op('intelligence','/api/v1/admin/training-jobs/{job_id}/cancel','post','cancelTraining',response=TRAIN,code=202,version=True)
op('intelligence','/api/v1/admin/models','get','listModels',response=page(MODEL))
op('intelligence','/api/v1/admin/models/{model_id}/metrics','get','modelMetrics',response=MODEL['properties']['metrics'])
for action in ['validate','deploy','rollback']:
    op('intelligence',f'/api/v1/admin/models/{{model_id}}/{action}','post',action+'Model',obj({'reason':S}),ACK,202,version=True,idem=True)

messages={}
def event(name,producer,consumers,payload,aggregate,command=False):
    fields={'event_id':U,'event_type':{'const':name},'schema_version':{'const':1},'aggregate_type':{'const':aggregate},'aggregate_id':U,'aggregate_version':V,'occurred_at':T,'producer':enum(*producer) if isinstance(producer,list) else {'const':producer},'correlation_id':U,'causation_id':{'type':['string','null'],'format':'uuid'},'traceparent':{'type':'string','pattern':'^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$'},'payload':payload}
    schema=obj(fields); schema['$schema']='https://json-schema.org/draft/2020-12/schema'
    messages[name]={'schema':schema,'producer':producer,'consumers':consumers,'kind':'command' if command else 'event','example':sample(schema)}
    example=messages[name]['example']
    example['event_id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'smarttravel-fixture:'+name))
    aggregate_key={'place':'place_id','user':'user_id','preferences':'user_id','rating':'place_id','trip':'trip_id','source':'source_id','contribution':'contribution_id','deletion':'deletion_request_id','claim':'claim_id','import':'command_id','model':'model_version_id'}.get(aggregate)
    example['aggregate_id']=example['payload'].get(aggregate_key,example['event_id'])
    example['traceparent']='00-'+'a'*32+'-'+'b'*16+'-01'

event('identity.user.registered.v1','identity',['identity'],obj({'user_id':U,'display_name':S}),'user')
event('identity.user.status-changed.v1','identity',[s for s in SERVICES if s!='identity'],STATUS,'user')
event('identity.preferences.changed.v1','identity',['intelligence'],obj({'user_id':U,**PREF['properties']}),'preferences')
event('identity.user.deletion-requested.v1','identity',[s for s in SERVICES if s!='identity'],obj({'deletion_request_id':U,'user_id':U,'policy_version':V}),'deletion')
event('domain.user-data-deleted.v1',[s for s in SERVICES if s!='identity'],['identity'],obj({'deletion_request_id':U,'service':enum(*[s for s in SERVICES if s!='identity']),'status':enum('COMPLETED','FAILED'),'artifact_handling':S}),'deletion')
event('catalog.place.upserted.v1','catalog',['community','trip','intelligence'],PLACE,'place')
event('catalog.place.visibility-changed.v1','catalog',['community','trip','intelligence'],obj({'place_id':U,'status':enum('PUBLISHED','HIDDEN','ARCHIVED'),'version':V}),'place')
event('catalog.destination.changed.v1','catalog',['trip','intelligence'],DEST,'destination')
event('catalog.category.changed.v1','catalog',['identity','intelligence'],obj({'category_id':U,'name':S,'active':B,'version':V}),'category')
event('community.rating-summary.changed.v1','community',['catalog','intelligence'],RATING,'rating')
event('community.review.changed.v1','community',['intelligence','identity'],obj({'review_id':U,'user_id':U,'place_id':U,'previous_status':{'type':['string','null'],'enum':[None,'PENDING','APPROVED','REJECTED','HIDDEN','DELETED']},'status':REVIEW['properties']['status'],'version':V,'change_kind':enum('CREATED','UPDATED','MODERATED','DELETED')}),'review')
event('community.favorite.changed.v1','community',['intelligence'],obj({'user_id':U,'place_id':U,'action':enum('ADDED','REMOVED'),'occurred_at':T}),'favorite')
event('community.contribution.apply-requested.v1','community',['catalog'],obj({'command_id':U,'contribution_id':U,'approved_by':U,'type':enum('ADD','EDIT'),'target_id':{'type':['string','null'],'format':'uuid'},'expected_version':{'type':'integer','minimum':0},'fields':FIELDS}),'contribution',True)
for result in ['applied','rejected']:
    payload={'command_id':U,'contribution_id':U}
    payload.update({'place_id':U,'version':V} if result=='applied' else {'error_code':S,'reason':S})
    event(f'catalog.contribution.{result}.v1','catalog',['community','identity'],obj(payload),'contribution')
event('catalog.business-claim.reviewed.v1','catalog',['identity'],CLAIM,'claim')
event('trip.item.added.v1','trip',['intelligence'],obj({'item_id':U,'trip_id':U,'user_id':U,'place_id':U,'recommendation_request_id':{'type':['string','null'],'format':'uuid'}}),'trip')
event('trip.changed.v1','trip',['identity'],obj({'trip_id':U,'user_id':U,'change_kind':enum('CREATED','UPDATED','DELETED','STATE_CHANGED'),'version':V}),'trip')
event('ingestion.place.upsert-requested.v1','ingestion',['catalog'],obj({'command_id':U,'source_id':U,'external_id':S,'source_version':V,'source_hash':{'type':'string','pattern':'^[a-f0-9]{64}$'},'proposed_place_id':U,'normalized':FIELDS,'expected_catalog_version':{'type':'integer','minimum':0}}),'import',True)
for result in ['applied','rejected']:
    payload={'command_id':U,'source_id':U}
    payload.update({'place_id':U,'catalog_version':V} if result=='applied' else {'error_code':S,'reason':S})
    event(f'catalog.place-import.{result}.v1','catalog',['ingestion'],obj(payload),'import')
event('ingestion.source-policy.changed.v1','ingestion',['catalog','intelligence'],POLICY,'source')
event('intelligence.model.deployed.v1','intelligence',['identity'],obj({'use_case':enum('PLACE_RECOMMENDATION'),'model_version_id':U,'deployment_id':U,'reason':S}),'model')

def write():
    def save(path,value):
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for s in SERVICES:
        save(ROOT/'openapi'/f'{s}.yaml',specs[s])
        save(ROOT/'fixtures'/f'{s}.http.json',examples[s])
    for name,data in messages.items():
        save(ROOT/'events'/f'{name}.schema.json',data['schema'])
        save(ROOT/'fixtures/events'/f'{name}.json',data['example'])
    save(ROOT/'registry.json',{'revision':'1.0.0-candidate','services':SERVICES,'messages':{n:{k:v for k,v in d.items() if k not in ['schema','example']} for n,d in messages.items()},'http_operations':{s:list(examples[s]) for s in SERVICES}})
    print(f'Generated candidate: {sum(len(x) for x in examples.values())} HTTP operations, {len(messages)} messages; human approval not implied.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--write',action='store_true'); args=parser.parse_args()
    if not args.write: parser.error('--write required to replace generated drafts intentionally')
    write()
