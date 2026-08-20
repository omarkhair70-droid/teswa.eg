# Teswa real-user performance metrics

Teswa records lightweight real-user performance telemetry through the safe analytics pipeline (`performance_metric` events). Metrics are sampled at the session level, so dashboards should use percentiles over many real sessions instead of expecting every app open to create a row.

## Privacy and allowed metadata

Performance events must only include operational metadata that is safe to aggregate:

- `metricName`
- `durationMs`
- `route`
- `appVersion`
- `platform`
- `cacheHit` when known
- `startType`: `cold_start`, `warm_start`, or `unknown`
- `networkState`: `online`, `offline`, or `unknown`
- `source`: `cached` or `live` when known

Do **not** attach message text, item descriptions, email, phone, tokens, profile content, URLs, exact coordinates, or any other private user content to performance metrics.

This is enforced on both sides of the pipeline. The mobile client sanitizes analytics metadata before calling Supabase, and `track_analytics_event` independently filters and validates the payload on the server. The server accepts no nested metadata objects, caps payload/key/string sizes, only accepts the known performance metric names and metadata keys, and rate-limits analytics writes.

`public.analytics_events` is not a client-readable or client-writable table. `anon` and `authenticated` have no direct table privileges. Authenticated application code records events only through `public.track_analytics_event(...)`; the RPC is not executable by `anon`.

## Metrics

| Metric | Meaning | Start | Stop |
| --- | --- | --- | --- |
| `app_start_to_first_screen` | Time for the app shell, auth gate, account gate, and initial routing to reach the first usable screen. | JavaScript performance session start during app bootstrap. | Root navigator marks the first screen ready. |
| `auth_ready_time` | Time until Supabase auth has resolved the initial session/user state. | JavaScript performance session start during app bootstrap. | Initial `getSession` or first auth-state event resolves. |
| `home_first_content_time` | Time for the Home tab to show its first marketplace feed result or cache-backed feed payload. | Home screen component mount. | Home feed query has data. |
| `direct_chat_first_message_time` | Time for a direct-chat conversation to load enough Supabase-native Direct Chat state to expose the first existing message. | Direct conversation screen load/refresh starts. | The first message appears in the local message list. Empty conversations do not emit this metric. |
| `dolab_first_content_time` | Time for Dolab to hydrate its local shelves/self-chat content area. | Dolab screen component mount. | Local Dolab media and self-message hydration completes. |
| `item_detail_first_content_time` | Time for an item detail screen to show its item payload, from either network or cache. | Item detail screen component mount. | Item detail query has an item. |

## Cache hit and cache miss

Use `cacheHit` to separate instant cache-backed experiences from network-backed ones:

- `cacheHit: true` means the first usable payload was served from a local/offline cache or locally persisted shelf data.
- `cacheHit: false` means the first usable payload came from live network/server data, or local hydration completed without cached user content.
- If a screen does not know the source, omit `cacheHit` rather than guessing.

A cache hit is not inherently better or worse than a network result. Read it alongside the route, app version, platform, start type, and network state.

## Reading p50, p75, and p95

Percentiles summarize the distribution of real-user durations:

- **p50** is the median. Half of sampled sessions are faster, and half are slower.
- **p75** is the upper quartile. Three quarters of sampled sessions are faster, and one quarter are slower.
- **p95** highlights tail latency. 95% of sampled sessions are faster, and the slowest 5% are slower.

For product decisions, compare the same metric by app version, platform, route, `cacheHit`, and network state. A healthy release should improve p50 without making p75/p95 worse.

### Internal percentile query

Run this from the Supabase SQL editor or another trusted service/database connection. Do not expose `analytics_events` to the mobile client just to build a dashboard.

```sql
select
  metadata->>'metricName' as metric_name,
  platform,
  app_version,
  count(*) as samples,
  percentile_cont(0.50) within group (order by (metadata->>'durationMs')::double precision) as p50_ms,
  percentile_cont(0.75) within group (order by (metadata->>'durationMs')::double precision) as p75_ms,
  percentile_cont(0.95) within group (order by (metadata->>'durationMs')::double precision) as p95_ms
from public.analytics_events
where event_name = 'performance_metric'
  and created_at >= now() - interval '7 days'
  and jsonb_typeof(metadata->'durationMs') = 'number'
group by metadata->>'metricName', platform, app_version
order by metric_name, platform, app_version;
```

Use a larger time window when sample counts are low. The client samples performance telemetry at the session level, so low traffic should not be interpreted as missing instrumentation by itself.

## Runtime limits

The production analytics RPC applies these operational limits:

- session id: maximum 128 characters;
- route: maximum 160 characters;
- entity type and app version: bounded strings;
- metadata: maximum 8 KiB and 24 top-level keys;
- string metadata values: maximum 256 characters;
- nested metadata objects: discarded;
- general analytics writes: maximum 120 events per user per minute;
- performance telemetry: maximum 30 events per user per minute;
- performance duration: `0..300000` ms.

These limits are abuse controls, not product targets. A duration near the five-minute ceiling means the user experience is already severely degraded and should be investigated.

## Why local repeated testing is not enough

Repeated local tests usually run on one device, one network, one account, one cache state, and often with developer tooling attached. They also become faster after repeated opens because caches, JavaScript bundles, images, auth state, and query data are warm.

Real-user telemetry captures the variability that local testing misses: older devices, low memory, cold starts, slow networks, expired caches, returning-user account gates, and production Supabase/native Direct Chat latency. Local profiling is still useful for debugging, but release performance should be judged from sampled real sessions.
