// Local P00 probe only. No business collection is changed.
const target = db.getSiblingDB('community_db');
if (!target.getCollectionNames().includes('platform_probe')) {
  target.createCollection('platform_probe');
}
const session = db.getMongo().startSession();
const probe = session.getDatabase('community_db').platform_probe;
const id = UUID().toString();
try {
  session.startTransaction({readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}});
  probe.insertOne({_id: id, test: 'rollback'});
  if (probe.countDocuments({_id: id}) !== 1) throw new Error('Missing write inside transaction');
  session.abortTransaction();
  if (target.platform_probe.countDocuments({_id: id}) !== 0) throw new Error('Rollback failed');
  session.startTransaction({readConcern: {level: 'snapshot'}, writeConcern: {w: 'majority'}});
  probe.insertOne({_id: id, test: 'commit'});
  session.commitTransaction();
  if (target.platform_probe.countDocuments({_id: id}) !== 1) throw new Error('Commit failed');
  target.platform_probe.deleteOne({_id: id});
  print('PASS MongoDB replica-set transaction commit/rollback');
} finally {
  session.endSession();
}
