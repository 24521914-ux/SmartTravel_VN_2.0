const community = db.getSiblingDB('community_db');
assert(community.auth('community_runtime',process.env.COMMUNITY_RUNTIME_PASSWORD),'runtime authentication failed');
function denied(action) {
  try { action(); } catch (e) { assert(e.code === 13, 'expected Unauthorized, got '+e.code); return; }
  throw new Error('runtime operation was unexpectedly authorized');
}
denied(() => community.createCollection('forbidden'));
denied(() => community.reviews.createIndex({content:1},{name:'forbidden'}));
denied(() => community.runCommand({collMod:'reviews',validationLevel:'off'}));
denied(() => community.audit_logs.updateOne({_id:'missing'},{$set:{action:'tamper'}}));
denied(() => community.audit_logs.deleteOne({_id:'missing'}));
denied(() => community.schema_migrations.updateOne({_id:'V1__community_baseline'},{$set:{checksum:'tamper'}}));
denied(() => db.getSiblingDB('identity_db').users.findOne({}));
const session = community.getMongo().startSession();
const tx = session.getDatabase('community_db');
const user = 'ffffffff-0000-4000-8000-000000000001';
const place = 'ffffffff-0000-4000-8000-000000000002';
const review = 'ffffffff-0000-4000-8000-000000000003';
const document = {_id:review,user_id:user,place_id:place,rating:Int32(5),content:'Synthetic storage fixture',
  status:'APPROVED',version:Long(1),created_at:new Date(),updated_at:new Date()};
function transaction(action) {
  session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  try { action(); } finally { session.abortTransaction(); }
}
function rejects(code, action) {
  try { action(); } catch (e) { assert(e.code === code,'expected '+code+', got '+e.code); return; }
  throw new Error('invalid write accepted');
}
try {
  transaction(() => {
    tx.user_mutation_fences.insertOne({_id:user,user_id:user,version:Long(1),updated_at:new Date()});
    tx.user_mutation_fences.updateOne({_id:user},{$inc:{version:Long(1)}});
    assert(tx.user_mutation_fences.findOne({_id:user}).version.toString() === '2','runtime fence update failed');
  });
  assert(community.user_mutation_fences.countDocuments({_id:user}) === 0,'fence rollback failed');
  transaction(() => {
    tx.reviews.insertOne(document);
    tx.rating_summaries.insertOne({_id:place,count:Long(1),sum:Long(5),version:Long(1),as_of:new Date()});
    tx.outbox_events.insertOne({_id:review,envelope:{fixture:true},attempts:Int32(0),available_at:new Date()});
    tx.inbox_events.insertOne({_id:'probe:'+review,consumer_name:'p01-storage-probe',event_id:review,producer:'fixture',processed_at:new Date()});
  });
  assert(community.reviews.countDocuments({_id:review}) === 0,'review rollback failed');
  assert(community.rating_summaries.countDocuments({_id:place}) === 0,'rating rollback failed');
  assert(community.outbox_events.countDocuments({_id:review}) === 0,'outbox rollback failed');
  assert(community.inbox_events.countDocuments({_id:'probe:'+review}) === 0,'inbox rollback failed');
  transaction(() => {
    tx.reviews.insertOne(document);
    rejects(11000,()=>tx.reviews.insertOne({...document,_id:'ffffffff-0000-4000-8000-000000000004'}));
  });
  transaction(() => rejects(121,()=>tx.reviews.insertOne({...document,rating:Int32(6)})));
  transaction(() => rejects(121,()=>tx.rating_summaries.insertOne({_id:place,count:Long(1),sum:Long(6),version:Long(1),as_of:new Date()})));
  print('PASS community: runtime authorization, unique review, rating/schema validation; review+rating+outbox+inbox real transaction rollback');
} finally { session.endSession(); }
