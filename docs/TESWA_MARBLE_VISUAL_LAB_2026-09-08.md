# Teswa Marble Visual Lab — 2026-09-08

Status: EXPERIMENT / DO NOT MERGE
Branch: `design/marble-visual-lab-20260908`
Base: `main@723fc99e391f7ab43f9ab38e183da8d5888d1912`

## Purpose
Validate the user-approved white marble, angelic sculpture and spacious editorial visual direction against the real Arabic-first Teswa product. Preserve the existing marketplace, offers, deal, messaging and social flows; do not replace them with a generic marketplace or a wellness product.

## Isolation
- No production deployment, release build or main merge.
- No Supabase/Oracle provider, database, API, auth, storage, realtime or infrastructure changes.
- No modification of existing feature routes while the visual experiment is evaluated.
- Use synthetic demo data only. No connected account or production data.
- The experiment must not be mistaken for a live offer, deal or inventory screen.

## Visual target
- Preserve white marble, architectural arches, sculptural angels, warm ivory and generous negative space.
- Use actual separable artwork assets, not a screenshot of a completed UI as the interface.
- Implement text, controls, cards and navigation as real components.
- Keep art strongest in Home/Discover and milestone moments; quiet surfaces for forms, chat, trust and settings.
- Arabic-first layout, semantic type and color, accessible targets, reduced motion and real-device review.

## Product preservation
Retain Home next-action logic, actual listings, Discover search/filters/pagination/nearby, item details, publishing/draft recovery, offer/deal lifecycle, unified messages, stories, trust/profile, notifications and Dolab. The visual concept is not a specification for new backend fields or capabilities.

## Acceptance
1. An isolated rendered Home/Discover prototype can be inspected at mobile widths.
2. Compare the rendered result side by side with the approved artwork.
3. Verify readable Arabic, safe areas, scrolling, real controls and reduced-motion behavior.
4. Map the approved visual primitives to existing Teswa components and domain contracts.
5. Integrate only through a separately reviewed feature lane after release/backend coordination.

This document records the experiment's boundaries. It does not claim that the visual implementation or device QA is complete.