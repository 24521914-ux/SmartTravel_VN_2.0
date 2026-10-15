// Run with mongosh inside community-db; passwords only from its environment.
const admin = db.getSiblingDB('admin');
assert(admin.auth('community_admin', process.env.MONGO_INITDB_ROOT_PASSWORD), 'admin authentication failed');
try { rs.status(); } catch (e) {
  if (e.code !== 94) throw e;
  rs.initiate({_id:'rs0', members:[{_id:0, host:'community-db:27017'}]});
}
let primary = false;
for (let i = 0; i < 60; i++) {
  if (admin.hello().isWritablePrimary) { primary = true; break; }
  sleep(1000);
}
assert(primary, 'replica set did not elect primary');
const community = db.getSiblingDB('community_db');
if (!community.getUser('community_migrator')) community.createUser({user:'community_migrator',
  pwd:process.env.COMMUNITY_MIGRATION_PASSWORD, roles:[{role:'dbAdmin',db:'community_db'},{role:'readWrite',db:'community_db'}]});
const collections = ['reviews','rating_summaries','favorites','collections','collection_items','contributions',
  'contribution_media','review_media','moderation_actions','review_reports','collection_visibility_events',
  'place_visibility_projections','outbox_events','inbox_events','idempotency_keys','audit_logs','user_mutation_fences'];
const privileges = collections.map(name => ({resource:{db:'community_db',collection:name},
  actions:['find','insert', ...(name === 'audit_logs' || name === 'moderation_actions' ? [] : ['update','remove'])]}));
privileges.push({resource:{db:'community_db',collection:''},actions:['listCollections','listIndexes']});
privileges.push({resource:{db:'community_db',collection:'schema_migrations'},actions:['find']});
if (!community.getRole('communityRuntime')) community.createRole({role:'communityRuntime',privileges,roles:[]});
else community.updateRole('communityRuntime',{privileges,roles:[]});
if (!community.getUser('community_runtime')) community.createUser({user:'community_runtime',
  pwd:process.env.COMMUNITY_RUNTIME_PASSWORD,roles:[{role:'communityRuntime',db:'community_db'}]});
print('PASS community authenticated replica set and least-privilege users provisioned');
