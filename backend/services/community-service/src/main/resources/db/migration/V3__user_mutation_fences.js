// Additive transaction fence: serialize each user's UGC mutations with deletion/status changes.
communityDefinitions.user_mutation_fences = {
  validator: {$jsonSchema: {bsonType:'object',required:['_id','user_id','version','updated_at'],properties:{
    _id:{bsonType:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'},
    user_id:{bsonType:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'},
    version:{bsonType:['int','long'],minimum:1},updated_at:{bsonType:'date'}
  }}},
  indexes:[{name:'user_mutation_fence_user',key:{user_id:1},unique:true}]
};
