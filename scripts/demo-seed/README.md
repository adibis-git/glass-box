# Demo seed — "Aditya Biswas — Data & AI" showcase

Tooling that populates a workspace with a believable consulting team, reporting
hierarchy, and ~30 days of realistic usage so the dashboard and conversation
drill-downs demo well. **Everything it creates is tagged with a `seed_` id prefix**
and is fully reversible.

## What it creates
- 7 team members + memberships wiring a manager hierarchy (Founder → Heads → analysts).
- 178 conversations with realistic usage spread over the last 30 days.
- Full agent traces on every assistant message (plan → code → execution → chart →
  verification → report, or retrieve → cite), authored offline (no model API cost),
  grounded in the workspace's real datasets (sales_prospects, cloud_sales_performance,
  vendor_rfp) via ConversationSource links.

## Run
```bash
# 1. Team + hierarchy + usage rows (bcrypt hash for Password@123 injected via sed):
HASH=$(node -e "require('bcryptjs').hash('Password@123',12).then(h=>process.stdout.write(h))")
sed "s|__PWHASH__|$HASH|" seed_demo.sql | docker compose exec -T db psql -U glassbox -d glassbox -v ON_ERROR_STOP=1

# 2. Author real-looking traces onto the seeded conversations:
docker compose exec -T db psql -U glassbox -d glassbox -tAc "SELECT json_agg(x) FROM (...) x" > seed_convs.json
node author-traces.mjs            # emits traces.sql
docker compose exec -T db psql -U glassbox -d glassbox -v ON_ERROR_STOP=1 < traces.sql
```

## Remove (clean, complete)
```sql
DELETE FROM "Message"        WHERE id LIKE 'seed_%';
DELETE FROM "ConversationSource" WHERE "conversationId" LIKE 'seed_%';
DELETE FROM "ReportSnapshot" WHERE id LIKE 'seed_%';
DELETE FROM "Conversation"   WHERE id LIKE 'seed_%';
DELETE FROM "Membership"     WHERE id LIKE 'seed_%';
DELETE FROM "User"           WHERE id LIKE 'seed_%';
```
