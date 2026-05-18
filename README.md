# failure-reporter

Cloudflare Worker that consumes the `aauth-events-dlq` dead-letter
queue and emits a metadata-only `aauth.shipping_failed` event back
into the main `aauth-events` queue.

## Why

Events that fail to ship (the `shipper` Worker exhausts ~1 hour of
retries against Freezer) land in `aauth-events-dlq` and would
otherwise vanish silently from queryable Parquet. This Worker
synthesizes a minimal failure event for each one — `original_event_id`,
`original_event`, `original_timestamp`, `original_service` — so the
gap is itself a row you can `SELECT` against.

We deliberately do **not** re-emit the original payload: poison
events would hit the DLQ again on the same failure. The DLQ itself
retains full bodies for 4 days for dashboard inspection if you need
to see what was lost.

## Deploy

```bash
npm install
npx wrangler deploy
```

No secrets needed. Cloudflare wires the consumer (`aauth-events-dlq`)
and producer (`aauth-events`) bindings from `wrangler.toml` at deploy
time.

## Verify

When events land in the DLQ (e.g. Freezer is down for >1 hour),
they'll be reprocessed and a `aauth.shipping_failed` event will
appear in Parquet. Query example:

```sql
SELECT
  timestamp,
  json_extract_string(data, '$.original_event') AS original_event,
  json_extract_string(data, '$.original_event_id') AS original_event_id
FROM events
WHERE event = 'aauth.shipping_failed'
ORDER BY timestamp DESC
LIMIT 20;
```

See `AAuth-dev/EVENT-LOGGING-PLAN.md` for the broader design.
