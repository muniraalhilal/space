#!/usr/bin/env bash
# Exercises schema.sql's row-level security on plain Postgres with emulated Supabase auth.
DB=${DB:-postgres://space:space@localhost:5432/sbtest}
A=11111111-1111-1111-1111-111111111111   # Amal (creates her own company)
B=22222222-2222-2222-2222-222222222222   # Bader (outsider / attacker)
pass=0; fail=0
as() { # as <uid> <email> <sql> → prints result or ERROR
  psql "$DB" -qtA -v ON_ERROR_STOP=1 -c "set role authenticated; set request.jwt.claim.sub = '$1'; set request.jwt.claim.email = '$2'; $3" 2>&1 | { out=$(cat); e=$(grep -m1 ERROR <<<"$out"); echo "${e:-$(tail -1 <<<"$out")}"; }
}
expect() { # expect <label> <pattern> <actual>
  if [[ "$3" =~ $2 ]]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 → $3"; fi
}
ins() { echo "insert into docs(collection,id,org_id,data) values ('$1','$2',${3:-null},'$4'::jsonb)"; }
psql "$DB" -qc "truncate docs"

# Amal signs up, creates her person + identity + company.
expect "user row for self" '^$' "$(as $A amal@x.com "$(ins users ua null '{"name":"Amal","email":"amal@x.com","authUid":"'$A'"}')")"
expect "identity as self" '^$' "$(as $A amal@x.com "$(ins identities $A null '{"userId":"ua"}')")"
expect "create company" '^$' "$(as $A amal@x.com "$(ins organizations o1 null '{"name":"Watad","isDemo":false}')")"
expect "first member = admin" '^$' "$(as $A amal@x.com "$(ins orgMembers m1 "'o1'" '{"orgId":"o1","userId":"ua","role":"company_admin"}')")"
expect "member writes task" '^$' "$(as $A amal@x.com "$(ins tasks t1 "'o1'" '{"orgId":"o1","title":"Secret plan"}')")"
expect "admin invites Bader by email" '^$' "$(as $A amal@x.com "$(ins users ub null '{"name":"Bader","email":"bader@x.com","authUid":""}'); $(ins orgMembers m2 "'o1'" '{"orgId":"o1","userId":"ub","role":"employee"}')")"

# Mallory (B with a different email) tries to break in.
expect "outsider cannot see company" '^0$' "$(as $B mal@x.com "select count(*) from docs where org_id='o1' or id='o1'")"
expect "outsider cannot act as Amal" 'violates row-level security' "$(as $B mal@x.com "$(ins identities $B null '{"userId":"ua"}')")"
expect "outsider cannot claim invite for another email" 'violates row-level security' "$(as $B mal@x.com "$(ins identities $B null '{"userId":"ub"}')")"
expect "outsider cannot add self to company" 'violates row-level security|Only company admins' "$(as $B mal@x.com "$(ins users um null '{"name":"M","email":"mal@x.com","authUid":"'$B'"}'); $(ins identities $B null '{"userId":"um"}'); $(ins orgMembers m9 "'o1'" '{"orgId":"o1","userId":"um","role":"company_admin"}')")"
expect "outsider cannot steal Amal's account link" 'already belongs|0 rows|^$' "$(as $B mal@x.com "update docs set data = jsonb_set(data,'{authUid}','\"$B\"') where collection='users' and id='ua'")"
expect "Amal still owns her person" "$A" "$(psql "$DB" -qtA -c "select data->>'authUid' from docs where id='ua'")"

# Real Bader (matching email) claims his invite and joins.
expect "invitee claims own invite" '^$' "$(as $B bader@x.com "delete from docs where collection='identities' and id='$B'; $(ins identities $B null '{"userId":"ub"}'); update docs set data = jsonb_set(data,'{authUid}','\"$B\"') where collection='users' and id='ub'")"
expect "invitee sees company task" '^1$' "$(as $B bader@x.com "select count(*) from docs where collection='tasks'")"
expect "employee cannot promote self" 'Only company admins' "$(as $B bader@x.com "update docs set data = jsonb_set(data,'{role}','\"company_admin\"') where id='m2'")"
expect "employee can set own presence" '^$' "$(as $B bader@x.com "update docs set data = jsonb_set(data,'{presence}','\"remote\"') where id='m2'")"
expect "employee cannot change admin presence" 'own status' "$(as $B bader@x.com "update docs set data = jsonb_set(data,'{presence}','\"offline\"') where id='m1'")"
expect "employee cannot add members" 'Only company admins' "$(as $B bader@x.com "$(ins orgMembers m5 "'o1'" '{"orgId":"o1","userId":"um","role":"employee"}')")"

# Private messages.
expect "DM between Amal and Bader" '^$' "$(as $A amal@x.com "$(ins orgMembers m3 "'o1'" '{"orgId":"o1","userId":"uc","role":"employee"}'); $(ins conversations c1 "'o1'" '{"orgId":"o1","members":{"m1":null,"m2":null}}'); $(ins messages x1 "'o1'" '{"orgId":"o1","conversationId":"c1","body":"hi"}')")"
expect "participant reads DM" '^1$' "$(as $B bader@x.com "select count(*) from docs where collection='messages'")"
expect "admin-only DM to third member" '^$' "$(as $A amal@x.com "$(ins conversations c2 "'o1'" '{"orgId":"o1","members":{"m1":null,"m3":null}}'); $(ins messages x2 "'o1'" '{"orgId":"o1","conversationId":"c2","body":"private"}')")"
expect "non-participant cannot read DM" '^1$' "$(as $B bader@x.com "select count(*) from docs where collection='messages'")"

# Files bucket.
expect "member uploads to own company folder" '^$' "$(as $A amal@x.com "insert into storage.objects(bucket_id,name) values ('files','o1/f1')")"
expect "outsider cannot read company files" '^0$' "$(as $B mal@x.com "delete from docs where collection='identities' and id='$B'; select count(*) from storage.objects")"

# Demo company: loaded by the site owner (SQL editor), shared by everyone, not destroyable.
psql "$DB" -qc "$(ins organizations dj "'dj'" '{"name":"Juniper","isDemo":true}'); $(ins users ud null '{"name":"Demo Admin","email":"d@juniper.demo","demo":true}'); $(ins orgMembers md "'dj'" '{"orgId":"dj","userId":"ud","role":"company_admin"}'); $(ins departments dd "'dj'" '{"orgId":"dj","name":"Design"}')"
expect "anyone sees demo company" '^1$' "$(as $B mal@x.com "select count(*) from docs where collection='organizations' and id='dj'")"
expect "visitor cannot create a demo company" 'site owner' "$(as $B mal@x.com "$(ins organizations dx "'dx'" '{"name":"Fake","isDemo":true}')")"
expect "visitor cannot create demo people" 'site owner' "$(as $B mal@x.com "$(ins users ux null '{"name":"X","email":"x@x","demo":true}')")"
expect "visitor can act as demo person" '^$' "$(as $B mal@x.com "delete from docs where collection='identities' and id='$B'; $(ins identities $B null '{"userId":"ud"}')")"
expect "demo admin cannot delete demo company" '^0$' "$(as $B mal@x.com "with d as (delete from docs where collection='organizations' and id='dj' returning 1) select count(*) from d")"
expect "own company cannot be flagged demo" 'site owner' "$(as $A amal@x.com "update docs set data = jsonb_set(data,'{isDemo}','true') where collection='organizations' and id='o1'")"

echo; echo "$pass passed, $fail failed"
exit $fail
