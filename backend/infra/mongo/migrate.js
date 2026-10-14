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
  const nextFile = '/migrations/V2__provider_name_limits.js';
  const nextMigration = 'V2__provider_name_limits';
  const nextChecksum = crypto.createHash('sha256').update(fs.readFileSync(nextFile)).digest('hex');
  const nextPrevious = community.schema_migrations.findOne({_id:nextMigration});
  if (nextPrevious) {
    assert(previous, 'V2 revision without V1');
    assert.eq(nextPrevious.checksum, nextChecksum, 'immutable V2 migration checksum mismatch');
    load(nextFile);
  }
  // V2 is an idempotent expansion. A crash after collMod but before recording the
  // revision may leave its exact new validator; accept only that declared transition.
  let interruptedV2Validator = null;
  if (!nextPrevious) {
    const oldValidator = communityDefinitions.collections.validator;
    const oldCopy = EJSON.parse(EJSON.stringify(oldValidator));
    load(nextFile);
    interruptedV2Validator = EJSON.stringify(communityDefinitions.collections.validator);
    communityDefinitions.collections.validator = oldCopy;
  }
  for (const [name, definition] of Object.entries(communityDefinitions)) {
    let info = community.getCollectionInfos({name})[0];
    if (!info) {
      assert(!previous, 'collection missing after migration: '+name);
      community.createCollection(name, {validator:definition.validator, validationLevel:'strict', validationAction:'error'});
      info = community.getCollectionInfos({name})[0];
    }
    const exactPendingV2 = name === 'collections' && !nextPrevious && previous &&
      EJSON.stringify(info.options.validator) === interruptedV2Validator;
    if (!exactPendingV2) assert.eq(EJSON.stringify(info.options.validator), EJSON.stringify(definition.validator), 'validator drift: '+name);
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
  if (!nextPrevious) {
    load(nextFile);
    const expanded = community.runCommand({collMod:'collections',validator:communityDefinitions.collections.validator,
      validationLevel:'strict',validationAction:'error'});
    assert(expanded.ok === 1, 'V2 validator expansion failed');
    community.schema_migrations.insertOne({_id:nextMigration,checksum:nextChecksum,applied_at:new Date()});
  }
  const fenceFile = '/migrations/V3__user_mutation_fences.js';
  const fenceMigration = 'V3__user_mutation_fences';
  const fenceChecksum = crypto.createHash('sha256').update(fs.readFileSync(fenceFile)).digest('hex');
  const fencePrevious = community.schema_migrations.findOne({_id:fenceMigration});
  if (fencePrevious) assert.eq(fencePrevious.checksum,fenceChecksum,'immutable V3 migration checksum mismatch');
  load(fenceFile);
  const fenceDefinition = communityDefinitions.user_mutation_fences;
  let fenceInfo = community.getCollectionInfos({name:'user_mutation_fences'})[0];
  if (!fenceInfo) {
    assert(!fencePrevious,'V3 fence collection missing after migration');
    community.createCollection('user_mutation_fences',{validator:fenceDefinition.validator,validationLevel:'strict',validationAction:'error'});
    fenceInfo = community.getCollectionInfos({name:'user_mutation_fences'})[0];
  }
  assert.eq(EJSON.stringify(fenceInfo.options.validator),EJSON.stringify(fenceDefinition.validator),'V3 fence validator drift');
  assert.eq(fenceInfo.options.validationLevel,'strict','V3 fence validation level drift');
  assert.eq(fenceInfo.options.validationAction,'error','V3 fence validation action drift');
  for (const expected of fenceDefinition.indexes) {
    let actual = community.user_mutation_fences.getIndexes().find(index => index.name === expected.name);
    if (!actual) {
      assert(!fencePrevious,'V3 fence index missing after migration');
      const {key,...options} = expected;
      community.user_mutation_fences.createIndex(key,options);
      actual = community.user_mutation_fences.getIndexes().find(index => index.name === expected.name);
    }
    assert.eq(EJSON.stringify(actual.key),EJSON.stringify(expected.key),'V3 fence index key drift');
    assert.eq(!!actual.unique,!!expected.unique,'V3 fence index uniqueness drift');
  }
  if (!fencePrevious) community.schema_migrations.insertOne({_id:fenceMigration,checksum:fenceChecksum,applied_at:new Date()});
  print('PASS community V1/V2/V3 checksums, 17 collections, validators and indexes');
} finally { community.migration_lock.deleteOne({_id:'schema'}); }
