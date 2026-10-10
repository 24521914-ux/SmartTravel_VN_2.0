const community = db.getSiblingDB('community_db');
assert.eq = (actual, expected, message) => assert(EJSON.stringify(actual) === EJSON.stringify(expected), message);
assert(community.auth('community_migrator', process.env.COMMUNITY_MIGRATION_PASSWORD), 'migration authentication failed');
const crypto = require('crypto');
const fs = require('fs');
const file = '/migrations/V1__community_baseline.js';
const checksum = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const migration = 'V1__community_baseline';
// Exclusive administrative migration lock. A crashed deployment requires investigation
// and explicit lock removal; never automatically steal a live migration's lease.
community.migration_lock.insertOne({_id:'schema', started_at:new Date()});
try {
  const previous = community.schema_migrations.findOne({_id:migration});
  if (previous) assert.eq(previous.checksum, checksum, 'immutable migration checksum mismatch');
  load(file);
  for (const [name, definition] of Object.entries(communityDefinitions)) {
    let info = community.getCollectionInfos({name})[0];
    if (!info) {
      assert(!previous, 'collection missing after migration: '+name);
      community.createCollection(name, {validator:definition.validator, validationLevel:'strict', validationAction:'error'});
      info = community.getCollectionInfos({name})[0];
    }
    assert.eq(EJSON.stringify(info.options.validator), EJSON.stringify(definition.validator), 'validator drift: '+name);
    assert.eq(info.options.validationLevel, 'strict', 'validation level drift: '+name);
    assert.eq(info.options.validationAction, 'error', 'validation action drift: '+name);
    for (const expected of definition.indexes) {
      let actual = community[name].getIndexes().find(i => i.name === expected.name);
      if (!actual) {
        assert(!previous, 'index missing after migration: '+name+'/'+expected.name);
        const {key,...options} = expected;
        community[name].createIndex(key,options);
        actual = community[name].getIndexes().find(i => i.name === expected.name);
      }
      assert.eq(EJSON.stringify(actual.key),EJSON.stringify(expected.key),'index key drift');
      assert.eq(!!actual.unique,!!expected.unique,'index uniqueness drift');
      assert.eq(EJSON.stringify(actual.partialFilterExpression),EJSON.stringify(expected.partialFilterExpression),'partial index drift');
      assert.eq(actual.expireAfterSeconds,expected.expireAfterSeconds,'TTL drift');
    }
  }
  if (!previous) community.schema_migrations.insertOne({_id:migration,checksum,applied_at:new Date()});
  print('PASS community V1 checksum, 16 collections, validators and indexes');
} finally { community.migration_lock.deleteOne({_id:'schema'}); }
