// Immutable P01 storage contract. Applied by the migration identity, never runtime.
const id = {bsonType: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'};
const positive = {bsonType: ['int', 'long'], minimum: 1};
const nonnegative = {bsonType: ['int', 'long'], minimum: 0};
const date = {bsonType: 'date'};
const state = (...values) => ({enum: values});
const index = (name, key, options = {}) => ({name, key, ...options});
const spec = (required, properties, indexes = [], extra = null) => ({
  validator: extra ? {$and: [{$jsonSchema: {bsonType: 'object', required, properties}}, extra]} :
    {$jsonSchema: {bsonType: 'object', required, properties}}, indexes
});
globalThis.communityDefinitions = {
  reviews: spec(['_id','user_id','place_id','rating','content','status','version','created_at','updated_at'], {
    _id: id, user_id: id, place_id: id, rating: {bsonType: 'int', minimum: 1, maximum: 5},
    content: {bsonType: 'string', minLength: 1, maxLength: 10000},
    status: state('PENDING','APPROVED','REJECTED','HIDDEN','DELETED'), version: positive, created_at: date, updated_at: date
  }, [index('review_user_place', {user_id:1,place_id:1}, {unique:true}),
      index('review_public', {place_id:1,status:1,created_at:-1,_id:1}), index('review_queue', {status:1,updated_at:1})]),
  rating_summaries: spec(['_id','count','sum','version','as_of'], {
    _id:id, count:nonnegative, sum:nonnegative, version:positive, as_of:date
  }, [], {$expr: {$and: [{$gte:['$sum','$count']}, {$lte:['$sum',{$multiply:['$count',5]}]}]}}),
  favorites: spec(['_id','user_id','place_id','created_at'], {_id:id,user_id:id,place_id:id,created_at:date},
    [index('favorite_user_place',{user_id:1,place_id:1},{unique:true}),index('favorite_history',{user_id:1,created_at:-1,_id:1})]),
  collections: spec(['_id','owner_id','name','visibility','version','created_at','updated_at'], {
    _id:id,owner_id:id,name:{bsonType:'string',minLength:1,maxLength:160},visibility:state('PRIVATE','PUBLIC'),version:positive,created_at:date,updated_at:date
  }, [index('collection_owner',{owner_id:1,updated_at:-1,_id:1})]),
  collection_items: spec(['_id','collection_id','place_id','rank'], {_id:id,collection_id:id,place_id:id,rank:nonnegative,note:{bsonType:'string'}},
    [index('collection_place',{collection_id:1,place_id:1},{unique:true}),index('collection_order',{collection_id:1,rank:1,_id:1})]),
  contributions: spec(['_id','user_id','type','payload','payload_schema_version','status','version','created_at','updated_at'], {
    _id:id,user_id:id,type:state('ADD_PLACE','SUGGEST_EDIT'),target_id:id,expected_version:positive,
    payload:{bsonType:'object'},payload_schema_version:positive,command_id:id,version:positive,
    status:state('PENDING','APPROVED','APPLYING','APPLIED','APPLY_FAILED','REJECTED','WITHDRAWN'),created_at:date,updated_at:date
  }, [index('contribution_command',{command_id:1},{unique:true,partialFilterExpression:{command_id:{$type:'string'}}}),
      index('contribution_queue',{status:1,created_at:1}),index('contribution_user',{user_id:1,created_at:-1})],
      {$or:[{type:'ADD_PLACE',target_id:{$exists:false}}, {type:'SUGGEST_EDIT',target_id:{$type:'string'},expected_version:{$gte:1}}]}),
  review_media: spec(['_id','review_id','owner_id','object_key','status'], {
    _id:id,review_id:id,owner_id:id,object_key:{bsonType:'string'},status:state('PENDING','APPROVED','REJECTED')
  }, [index('review_media_parent',{review_id:1})]),
  contribution_media: spec(['_id','contribution_id','owner_id','object_key','status'], {
    _id:id,contribution_id:id,owner_id:id,object_key:{bsonType:'string'},status:state('PENDING','APPROVED','REJECTED')
  }, [index('contribution_media_parent',{contribution_id:1})]),
  moderation_actions: spec(['_id','aggregate_id','actor_id','reason','action','occurred_at'], {
    _id:id,aggregate_id:id,actor_id:id,reason:{bsonType:'string',minLength:1},action:state('APPROVE','REJECT','HIDE','RESTORE'),occurred_at:date
  }, [index('moderation_aggregate',{aggregate_id:1,occurred_at:1})]),
  review_reports: spec(['_id','review_id','reporter_id','reason','status','created_at'], {
    _id:id,review_id:id,reporter_id:id,reason:{bsonType:'string',minLength:1},status:state('OPEN','RESOLVED','DISMISSED'),created_at:date
  }, [index('report_review_user',{review_id:1,reporter_id:1},{unique:true})]),
  collection_visibility_events: spec(['_id','collection_id','version','visibility','occurred_at'], {
    _id:id,collection_id:id,version:positive,visibility:state('PRIVATE','PUBLIC'),occurred_at:date
  }, [index('visibility_version',{collection_id:1,version:1},{unique:true})]),
  place_visibility_projections: spec(['_id','status','source_version','as_of'], {
    _id:id,status:state('DRAFT','PUBLISHED','HIDDEN','ARCHIVED'),source_version:positive,as_of:date
  }),
  outbox_events: spec(['_id','envelope','attempts','available_at'], {
    _id:id,envelope:{bsonType:'object'},attempts:nonnegative,available_at:date,published_at:{bsonType:['date','null']}
  }, [index('outbox_pending',{available_at:1,_id:1},{partialFilterExpression:{published_at:null}})]),
  inbox_events: spec(['_id','consumer_name','event_id','processed_at','producer'], {
    _id:{bsonType:'string'},consumer_name:{bsonType:'string'},event_id:id,processed_at:date,producer:{bsonType:'string'}
  }, [index('inbox_consumer_event',{consumer_name:1,event_id:1},{unique:true})]),
  idempotency_keys: spec(['_id','principal','operation','key','request_hash','response','expires_at'], {
    _id:id,principal:{bsonType:'string'},operation:{bsonType:'string'},key:{bsonType:'string'},
    request_hash:{bsonType:'string',pattern:'^[0-9a-f]{64}$'},response:{bsonType:'object'},expires_at:date
  }, [index('idempotency_principal',{principal:1,operation:1,key:1},{unique:true}),index('idempotency_expiry',{expires_at:1},{expireAfterSeconds:0})]),
  audit_logs: spec(['_id','actor','aggregate_id','action','correlation_id','occurred_at'], {
    _id:id,actor:{bsonType:'string'},aggregate_id:id,action:{bsonType:'string'},correlation_id:{bsonType:'string'},occurred_at:date
  }, [index('audit_aggregate',{aggregate_id:1,occurred_at:1})])
};
