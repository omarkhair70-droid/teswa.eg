-- Stream webhook delivery is no longer part of Direct Chat. Native Direct Chat
-- creates notification rows directly from direct_messages inserts.

drop table if exists public.direct_push_events;
