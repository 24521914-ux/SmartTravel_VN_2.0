"""Independent boundary/security review checks, not domain implementation tests."""
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'contracts'

def api(service,path,method):
    return json.loads((ROOT/'openapi'/f'{service}.yaml').read_text(encoding='utf-8'))['paths'][path][method]
def body(op): return op['requestBody']['content']['application/json']['schema']

class ContractPolicyTests(unittest.TestCase):
    def test_place_http_metadata_does_not_expand_frozen_event_v1(self):
        read=api('catalog','/api/v1/places/{place_id}','get')['responses']['200']['content']['application/json']['schema']
        event=json.loads((ROOT/'events/catalog.place.upserted.v1.schema.json').read_text(encoding='utf-8'))['properties']['payload']
        metadata={'name_en','address','description','price_min','price_max','rating_avg','review_count'}
        self.assertTrue(metadata <= set(read['properties']))
        self.assertFalse(metadata & set(event['properties']))
        self.assertEqual(set(event['required']),set(event['properties']))

    def test_place_writes_allow_address_but_not_server_owned_metadata(self):
        rules=json.loads((ROOT.parent/'services/catalog-service/src/main/resources/request-contracts.json').read_text(encoding='utf-8'))
        for method,path in [('post','/api/v1/admin/places'),('patch','/api/v1/admin/places/{place_id}')]:
            schema=body(api('catalog',path,method))
            with self.subTest(method=method):
                self.assertIn('address',schema['properties'])
                self.assertFalse({'rating_avg','review_count','status','version','source_version'} & set(schema['properties']))
                matches=[rule['schema'] for rule in rules if rule['method']==method.upper() and rule['path'].startswith('/api/v1/admin/places') and rule['path'].count('/')==path.count('/')]
                self.assertEqual(matches,[schema])
    def test_privileged_routes_protected_and_scoped(self):
        for path in (ROOT/'openapi').glob('*.yaml'):
            spec=json.loads(path.read_text(encoding='utf-8'))
            for route,methods in spec['paths'].items():
                for op in methods.values():
                    if '/admin/' in route:
                        self.assertTrue(op['security']); self.assertTrue(op['x-required-scope'].endswith(':admin'))
                    if route.startswith('/internal/'):
                        self.assertTrue(op['security']); self.assertIn(':',op['x-required-scope'])
    def test_client_cannot_choose_identity_owner_roles_or_place_snapshot(self):
        register=body(api('identity','/api/v1/auth/register','post'))
        self.assertFalse(register['additionalProperties'])
        self.assertNotIn('roles',register['properties']); self.assertNotIn('user_id',register['properties'])
        trip=body(api('trip','/api/v1/me/trips','post'))
        self.assertNotIn('owner_id',trip['properties']); self.assertNotIn('state',trip['properties'])
        item=body(api('trip','/api/v1/trips/{trip_id}/days/{day_id}/items','post'))
        self.assertNotIn('snapshot',item['properties']); self.assertNotIn('source_version',item['properties'])
        recommend=body(api('intelligence','/api/v1/recommendations','post'))
        self.assertNotIn('user_id',recommend['properties']); self.assertEqual(recommend['properties']['topN']['maximum'],50)
    def test_parent_mutations_and_create_preconditions(self):
        item=api('trip','/api/v1/trips/{trip_id}/days/{day_id}/items','post')
        self.assertTrue(any(p['name']=='If-Match' and p['required'] for p in item['parameters']))
        self.assertTrue(any(p['name']=='Idempotency-Key' and p['required'] for p in item['parameters']))
        update=api('community','/api/v1/reviews/{review_id}','patch')
        self.assertTrue(any(p['name']=='If-Match' and p['required'] for p in update['parameters']))
    def test_public_place_contract_excludes_hidden_and_draft(self):
        op=api('catalog','/api/v1/places/{place_id}','get')
        schema=op['responses']['200']['content']['application/json']['schema']
        self.assertEqual(schema['properties']['status']['enum'],['PUBLISHED'])
        self.assertNotIn('business_evidence',schema['properties'])
        fixture=json.loads((ROOT/'fixtures/catalog.http.json').read_text(encoding='utf-8'))
        self.assertIsNone(fixture['searchPlaces']['response']['next_cursor'], 'Single-page stub must terminate pagination')
        self.assertEqual(fixture['placeBatch']['request']['ids'], [item['place_id'] for item in fixture['placeBatch']['response']['items']])
    def test_review_changes_and_source_revoke_have_explicit_versions(self):
        review=json.loads((ROOT/'events/community.review.changed.v1.schema.json').read_text(encoding='utf-8'))['properties']['payload']['properties']
        self.assertEqual(set(review['change_kind']['enum']),{'CREATED','UPDATED','MODERATED','DELETED'})
        self.assertIn('previous_status',review); self.assertIn('version',review)
        policy=json.loads((ROOT/'events/ingestion.source-policy.changed.v1.schema.json').read_text(encoding='utf-8'))['properties']['payload']['properties']
        for field in ['source_version','license_version','allow_storage','allow_training','status']: self.assertIn(field,policy)
    def test_all_planned_message_families_are_present(self):
        registry=json.loads((ROOT/'registry.json').read_text(encoding='utf-8'))
        names=set(registry['messages'])
        expected={
            'identity.user.registered.v1','identity.user.status-changed.v1','identity.preferences.changed.v1','identity.user.deletion-requested.v1',
            'domain.user-data-deleted.v1','catalog.place.upserted.v1','catalog.place.visibility-changed.v1','catalog.destination.changed.v1','catalog.category.changed.v1',
            'community.rating-summary.changed.v1','community.review.changed.v1','community.favorite.changed.v1','community.contribution.apply-requested.v1',
            'catalog.contribution.applied.v1','catalog.contribution.rejected.v1','catalog.business-claim.reviewed.v1',
            'trip.item.added.v1','trip.changed.v1','ingestion.place.upsert-requested.v1','catalog.place-import.applied.v1','catalog.place-import.rejected.v1',
            'ingestion.source-policy.changed.v1','intelligence.model.deployed.v1'}
        self.assertEqual(names,expected)
    def test_no_sql_or_domain_entity_types_cross_contract(self):
        for file in (ROOT/'openapi').glob('*.yaml'):
            text=file.read_text(encoding='utf-8').lower()
            for token in ['password_hash','jdbc:','@entity','org.hibernate','postgresql://','mongodb://']:
                self.assertNotIn(token,text)

if __name__=='__main__': unittest.main()
