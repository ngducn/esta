begin;
\ir _harness.psql

select plan(1);

select is_empty(
  $$ select category, schema_name, private.extraction_schema(category)
     from (values
       ('certificate', 'certificate_v1'),
       ('lease_contract', 'lease_v1'),
       ('utility_bill', 'utility_bill_v1'),
       ('insurance', null),
       ('tax_receipt', null),
       ('sale_contract', null),
       ('invoice_receipt', null),
       ('building_permit', null),
       ('drawing', null),
       ('handover', null),
       ('photo', null),
       ('id_card', null),
       ('other', null)
     ) expected (category, schema_name)
     where private.extraction_schema(category) is distinct from schema_name $$,
  'private.extraction_schema names the same schema as DOCUMENT_CATEGORIES for every category');

select * from finish();
rollback;
