-- Demo seed: adityabiswas.com as a Data & AI consulting practice using Glass Box.
-- Team + reporting hierarchy + ~30 days of realistic usage. Every row is tagged
-- with a 'seed_' id prefix so it can be removed cleanly:
--   DELETE FROM "Message"  WHERE id LIKE 'seed_%';
--   DELETE FROM "Conversation" WHERE id LIKE 'seed_%';
--   DELETE FROM "ReportSnapshot" WHERE id LIKE 'seed_%';
--   DELETE FROM "Membership" WHERE id LIKE 'seed_%';
--   DELETE FROM "User"    WHERE id LIKE 'seed_%';
-- The password hash (__PWHASH__) is bcrypt('Password@123').

DO $$
DECLARE
  org text;
  aditya_uid text;
  aditya_mem text;
  pw text := '__PWHASH__';
  rec record;
  conv text;
  i int;
  t timestamptz;
  intent text;
  modality text;
  eff text;
  rep jsonb;
  q text;
  titles text[] := ARRAY[
    'Q3 pipeline health by region','Churn drivers in the SMB segment',
    'Vendor RFP compliance review','Marketing spend efficiency by channel',
    'Regional sales variance vs forecast','Support ticket volume trends',
    'Headcount cost model FY26','Contract SLA comparison (v1 vs v2)',
    'Top accounts at risk this quarter','Win rate by lead source',
    'Cash-flow sensitivity analysis','Client onboarding cycle times',
    'Discount impact on gross margin','Renewals forecast by cohort',
    'Data quality audit — CRM export'
  ];
BEGIN
  SELECT o.id INTO org FROM "Organization" o
    JOIN "Membership" mm ON mm."orgId"=o.id
    JOIN "User" u ON u.id=mm."userId"
    WHERE u.email='adityabiswas15@gmail.com' AND mm.role='OWNER' LIMIT 1;
  SELECT id INTO aditya_uid FROM "User" WHERE email='adityabiswas15@gmail.com';
  SELECT id INTO aditya_mem FROM "Membership" WHERE "userId"=aditya_uid AND "orgId"=org;

  IF EXISTS (SELECT 1 FROM "Conversation" WHERE "orgId"=org AND left(id,5)='seed_') THEN
    RAISE NOTICE 'Already seeded — skipping. (DELETE ... LIKE ''seed_%%'' to reseed.)';
    RETURN;
  END IF;

  -- Give the workspace a business identity + persona for the founder.
  UPDATE "Organization"
    SET name='Aditya Biswas — Data & AI', domain='Data & AI advisory', vertical='Professional services'
    WHERE id=org;
  UPDATE "Membership" SET persona='CONSULTANT' WHERE id=aditya_mem;

  -- Team members.
  INSERT INTO "User"(id,email,"passwordHash",name,"createdAt","updatedAt") VALUES
    ('seed_u_priya','priya.sharma@adityabiswas.com',pw,'Priya Sharma',now(),now()),
    ('seed_u_arjun','arjun.rao@adityabiswas.com',pw,'Arjun Rao',now(),now()),
    ('seed_u_rahul','rahul.mehta@adityabiswas.com',pw,'Rahul Mehta',now(),now()),
    ('seed_u_sneha','sneha.iyer@adityabiswas.com',pw,'Sneha Iyer',now(),now()),
    ('seed_u_kavya','kavya.nair@adityabiswas.com',pw,'Kavya Nair',now(),now()),
    ('seed_u_vikram','vikram.singh@adityabiswas.com',pw,'Vikram Singh',now(),now()),
    ('seed_u_meera','meera.gupta@adityabiswas.com',pw,'Meera Gupta',now(),now())
  ON CONFLICT (id) DO NOTHING;

  -- Memberships wiring the reporting hierarchy (managerId → a Membership.id).
  INSERT INTO "Membership"(id,"userId","orgId",role,persona,"managerId","createdAt") VALUES
    ('seed_m_priya','seed_u_priya',org,'ADMIN','OPERATIONS',aditya_mem,now()),
    ('seed_m_arjun','seed_u_arjun',org,'ADMIN','CONSULTANT',aditya_mem,now()),
    ('seed_m_meera','seed_u_meera',org,'VIEWER','FINANCE',aditya_mem,now()),
    ('seed_m_rahul','seed_u_rahul',org,'MEMBER','OPERATIONS','seed_m_priya',now()),
    ('seed_m_sneha','seed_u_sneha',org,'MEMBER','FINANCE','seed_m_priya',now()),
    ('seed_m_kavya','seed_u_kavya',org,'MEMBER','CONSULTANT','seed_m_arjun',now()),
    ('seed_m_vikram','seed_u_vikram',org,'MEMBER','SALES','seed_m_arjun',now())
  ON CONFLICT (id) DO NOTHING;

  -- Usage: per member, N conversations spread over the last 30 days, each a
  -- USER question + an ASSISTANT analysis (some multi-turn), with varied
  -- intent / modality / effort / decision-report / tokens.
  FOR rec IN
    SELECT * FROM (VALUES
      (aditya_uid,  8),
      ('seed_u_priya', 18),
      ('seed_u_arjun', 16),
      ('seed_u_rahul', 40),
      ('seed_u_sneha', 34),
      ('seed_u_kavya', 30),
      ('seed_u_vikram',26),
      ('seed_u_meera',  6)
    ) AS x(uid, nconv)
  LOOP
    FOR i IN 1..rec.nconv LOOP
      t := now() - (floor(random()*30)||' days')::interval - (floor(random()*10)||' hours')::interval;
      conv := 'seed_' || replace(gen_random_uuid()::text,'-','');
      q := titles[1 + floor(random()*array_length(titles,1))::int];

      INSERT INTO "Conversation"(id,"orgId","createdById",title,"defaultEffort","createdAt","updatedAt")
        VALUES (conv, org, rec.uid, q, 'LOW', t, t);

      INSERT INTO "Message"(id,"conversationId",role,content,status,"inputTokens","outputTokens","createdAt")
        VALUES ('seed_'||replace(gen_random_uuid()::text,'-',''), conv, 'USER', q||'?', 'DONE', 0, 0, t);

      intent := (ARRAY['quick_fact','quick_fact','quick_fact','analytical','analytical','decision'])[1+floor(random()*6)::int];
      modality := CASE WHEN random() < 0.30 THEN 'document' ELSE 'tabular' END;
      eff := (ARRAY['LOW','LOW','LOW','MEDIUM','MEDIUM','HIGH'])[1+floor(random()*6)::int];
      rep := CASE WHEN intent='decision'
                  THEN jsonb_build_object('headline', q, 'recommendation', 'See the full analysis.')
                  ELSE NULL END;

      INSERT INTO "Message"(id,"conversationId",role,content,report,intent,modality,effort,status,"inputTokens","outputTokens","createdAt")
        VALUES ('seed_'||replace(gen_random_uuid()::text,'-',''), conv, 'ASSISTANT',
                'Analysis for: '||q, rep, intent, modality, eff::"AnalysisEffort", 'DONE',
                2000 + floor(random()*13000)::int, 500 + floor(random()*5000)::int, t + interval '30 seconds');

      IF random() < 0.35 THEN
        INSERT INTO "Message"(id,"conversationId",role,content,status,"inputTokens","outputTokens","createdAt")
          VALUES ('seed_'||replace(gen_random_uuid()::text,'-',''), conv, 'USER', 'Can you break that down further?', 'DONE', 0, 0, t + interval '2 minutes');
        INSERT INTO "Message"(id,"conversationId",role,content,intent,modality,effort,status,"inputTokens","outputTokens","createdAt")
          VALUES ('seed_'||replace(gen_random_uuid()::text,'-',''), conv, 'ASSISTANT', 'Here is the breakdown.',
                  'analytical', modality, 'LOW', 'DONE', 1500 + floor(random()*8000)::int, 400 + floor(random()*3000)::int, t + interval '150 seconds');
        UPDATE "Conversation" SET "updatedAt" = t + interval '150 seconds' WHERE id=conv;
      END IF;
    END LOOP;
  END LOOP;

  -- A handful of shared decision reports (drives the "Shared reports" stat).
  INSERT INTO "ReportSnapshot"(id,"orgId","conversationId",title,report,charts,"shareToken","createdAt")
  SELECT 'seed_'||replace(gen_random_uuid()::text,'-',''), org, c.id, c.title,
         '{}'::jsonb, '[]'::jsonb, substr(md5(random()::text),1,24), c."updatedAt"
  FROM "Conversation" c
  WHERE c."orgId"=org AND left(c.id,5)='seed_'
    AND EXISTS (SELECT 1 FROM "Message" ms WHERE ms."conversationId"=c.id AND ms.report IS NOT NULL)
  ORDER BY random() LIMIT 6;

  RAISE NOTICE 'Seed complete for org %', org;
END $$;

-- Summary of what landed.
SELECT
  (SELECT count(*) FROM "User" WHERE id LIKE 'seed_%') AS demo_users,
  (SELECT count(*) FROM "Membership" WHERE id LIKE 'seed_%') AS demo_memberships,
  (SELECT count(*) FROM "Conversation" WHERE id LIKE 'seed_%') AS demo_conversations,
  (SELECT count(*) FROM "Message" WHERE id LIKE 'seed_%') AS demo_messages,
  (SELECT count(*) FROM "ReportSnapshot" WHERE id LIKE 'seed_%') AS demo_shared_reports;
