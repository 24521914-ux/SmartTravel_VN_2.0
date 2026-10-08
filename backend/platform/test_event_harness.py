"""Platform mechanics only, not domain consumers or a production broker.
A SQLite transaction proves atomic test inbox/projection updates; P01 must
implement the same invariant on the selected service DB, P02 on transport.
"""
import copy
import json
import sqlite3
import unittest
import uuid
from pathlib import Path
from jsonschema import Draft202012Validator,FormatChecker,ValidationError

ROOT=Path(__file__).resolve().parents[1]/'contracts'

class Harness:
    def __init__(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE inbox(event_id TEXT PRIMARY KEY)')
        self.db.execute('CREATE TABLE projection(stream TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL)')
    def apply(self,raw,fail=False):
        event=json.loads(raw)
        name=event['event_type']
        schema=json.loads((ROOT/'events'/f'{name}.schema.json').read_text(encoding='utf-8'))
        Draft202012Validator(schema,format_checker=FormatChecker()).validate(event)
        stream=event['producer']+':'+name+':'+event['aggregate_id']
        with self.db:
            if self.db.execute('SELECT 1 FROM inbox WHERE event_id=?',(event['event_id'],)).fetchone(): return False
            self.db.execute('INSERT INTO inbox VALUES (?)',(event['event_id'],))
            row=self.db.execute('SELECT version FROM projection WHERE stream=?',(stream,)).fetchone()
            if row is None or event['aggregate_version']>row[0]:
                self.db.execute('INSERT INTO projection VALUES (?,?,?) ON CONFLICT(stream) DO UPDATE SET version=excluded.version,body=excluded.body',(stream,event['aggregate_version'],raw))
            if fail: raise RuntimeError('Synthetic crash before commit')
        return True

class EventHarnessTests(unittest.TestCase):
    def test_all_messages_serialized_and_duplicate_delivery(self):
        harness=Harness()
        try:
            for path in sorted((ROOT/'fixtures/events').glob('*.json')):
                raw=path.read_text(encoding='utf-8')
                with self.subTest(event=path.stem):
                    self.assertTrue(harness.apply(raw)); self.assertFalse(harness.apply(raw))
            self.assertEqual(harness.db.execute('SELECT count(*) FROM inbox').fetchone()[0],23)
        finally: harness.db.close()
    def test_rollback_retry_old_version_and_poison_message(self):
        event=json.loads((ROOT/'fixtures/events/community.rating-summary.changed.v1.json').read_text(encoding='utf-8'))
        event['aggregate_version']=2; event['payload']['version']=2
        harness=Harness()
        try:
            with self.assertRaises(RuntimeError): harness.apply(json.dumps(event),fail=True)
            self.assertEqual(harness.db.execute('SELECT count(*) FROM inbox').fetchone()[0],0)
            self.assertEqual(harness.db.execute('SELECT count(*) FROM projection').fetchone()[0],0)
            self.assertTrue(harness.apply(json.dumps(event)))
            old=copy.deepcopy(event); old['event_id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'smarttravel-old')); old['aggregate_version']=1; old['payload']['version']=1
            self.assertTrue(harness.apply(json.dumps(old)))
            self.assertEqual(harness.db.execute('SELECT version FROM projection').fetchone()[0],2)
            old['schema_version']=999
            with self.assertRaises(ValidationError): harness.apply(json.dumps(old))
            self.assertEqual(harness.db.execute('SELECT count(*) FROM inbox').fetchone()[0],2)
        finally: harness.db.close()

if __name__=='__main__': unittest.main()
