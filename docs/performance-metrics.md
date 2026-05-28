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
- `networkState` when the app already knows it

Do **not** attach message text, item descriptions, email, phone, tokens, profile content, or any other private user content to performance metrics.

## Metrics

| Metric | Meaning | Start | Stop |
| --- | --- | --- | --- |
| `app_start_to_first_screen` | Time for the app shell, auth gate, account gate, and initial routing to reach the first usable screen. | JavaScript performance session start during app bootstrap. | Root navigator marks the first screen ready. |
| `auth_ready_time` | Time until Supabase auth has resolved the initial session/user state. | JavaScript performance session start during app bootstrap. | Initial `getSession` or first auth-state event resolves. |
| `home_first_content_time` | Time for the Home tab to show its first marketplace feed result or cache-backed feed payload. | Home screen component mount. | Home feed query has data. |
| `direct_chat_first_message_time` | Time for a direct-chat conversation to load enough Stream state to expose the first existing message. | Direct conversation screen load/refresh starts. | The first message appears in the local message list. Empty conversations do not emit this metric. |
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

## Why local repeated testing is not enough

Repeated local tests usually run on one device, one network, one account, one cache state, and often with developer tooling attached. They also become faster after repeated opens because caches, JavaScript bundles, images, auth state, and query data are warm.

Real-user telemetry captures the variability that local testing misses: older devices, low memory, cold starts, slow networks, expired caches, returning-user account gates, and production Supabase/Stream latency. Local profiling is still useful for debugging, but release performance should be judged from sampled real sessions.
