import unittest
from copy import deepcopy
from jsonschema import Draft202012Validator, ValidationError
from p03_nonai_contracts import compatibility, response_schema, PATCH_PATH, STATUS_SCHEMA


def document():
    return {'paths':{PATCH_PATH:{'patch':{
        'requestBody':{'content':{'application/json':{'schema':{
            'type':'object','properties':{'price':{'type':'number'}},'required':[],
            'additionalProperties':False}}}},
        'responses':{'200':{'content':{'application/json':{'schema':{
            'type':'object','properties':{'status':{'enum':['PUBLISHED']}},'required':['status'],
            'additionalProperties':False}}}}}}}}}


class ContractCompatibilityTests(unittest.TestCase):
    def test_only_optional_status_addition_accepted_and_legacy_payload_valid(self):
        old = document(); new = deepcopy(old)
        op = new['paths'][PATCH_PATH]['patch']
        schema = op['requestBody']['content']['application/json']['schema']
        schema['properties']['status'] = deepcopy(STATUS_SCHEMA)
        op['description'] = 'Additive publication command'
        self.assertTrue(compatibility(old,new,'catalog')['pass'])
        Draft202012Validator(schema).validate({'price':60000})
        Draft202012Validator(schema).validate({'status':'PUBLISHED'})
        with self.assertRaises(ValidationError): Draft202012Validator(schema).validate({'status':'UNKNOWN'})
        self.assertNotIn('status',old['paths'][PATCH_PATH]['patch']['requestBody']['content']['application/json']['schema']['properties'])

    def test_required_new_field_rejected(self):
        old = document(); new = deepcopy(old)
        schema = new['paths'][PATCH_PATH]['patch']['requestBody']['content']['application/json']['schema']
        schema['properties']['status'] = deepcopy(STATUS_SCHEMA)
        schema['required'].append('status')
        self.assertFalse(compatibility(old,new,'catalog')['pass'])

    def test_response_enum_change_is_breaking(self):
        old = document(); new = deepcopy(old)
        new['paths'][PATCH_PATH]['patch']['responses']['200']['content']['application/json']['schema']['properties']['status']['enum'].append('HIDDEN')
        self.assertFalse(compatibility(old,new,'catalog')['pass'])

    def test_other_service_change_rejected(self):
        old = document(); new = deepcopy(old)
        new['paths']['/new'] = {}
        self.assertFalse(compatibility(old,new,'trip')['pass'])

    def test_live_schema_must_match_existing_operation_status(self):
        d = document()
        self.assertEqual(response_schema(d,'/api/v1/admin/offerings/abc?x=1','PATCH',200)['required'],['status'])
        with self.assertRaises(KeyError): response_schema(d,'/api/v1/admin/offerings/abc','PATCH',201)
        with self.assertRaises(ValueError): response_schema(d,'/unknown','GET',200)


if __name__ == '__main__': unittest.main()
