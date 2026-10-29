"""Turns src/web/demo-seed.json into supabase/seed.sql (run once in the Supabase SQL editor)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / 'src/web/demo-seed.json').read_text())
rows = []
for coll, docs in d.items():
    for doc in docs:
        doc = dict(doc)
        did = doc.pop('id')
        if coll == 'users':
            doc['demo'] = True
        org = did if coll == 'organizations' else doc.get('orgId')
        rows.append({'collection': coll, 'id': did, 'org_id': org, 'data': doc})
payload = json.dumps(rows, ensure_ascii=False).replace('$seed$', '')
sql = f"""-- Space demo companies (Juniper, Qamar Studio). Run in the Supabase SQL editor after schema.sql.
-- Re-running resets the demo companies to this starting state; real companies are not touched.
delete from public.docs where org_id in (select id from public.docs where collection = 'organizations' and coalesce((data->>'isDemo')::boolean, false));
delete from public.docs where collection = 'users' and coalesce((data->>'demo')::boolean, false);
insert into public.docs (collection, id, org_id, data)
select r->>'collection', r->>'id', r->>'org_id', r->'data'
from jsonb_array_elements($seed${payload}$seed$::jsonb) r
on conflict (collection, id) do update set org_id = excluded.org_id, data = excluded.data, updated_at = now();
select count(*) as demo_rows from public.docs where org_id in ('4a802a56-38a7-4022-a511-38dbe944c93d', 'b96c8d5c-007e-4118-bfe6-1d7da642aec9');
"""
(root / 'supabase/seed.sql').write_text(sql)
print(len(rows), 'rows,', len(sql), 'bytes')
