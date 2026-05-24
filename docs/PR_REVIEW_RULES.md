# PR Review Rules

> Purpose: enforce focused, safer pull requests with clear validation discipline.

## 1) One concern per PR
Each PR should address a single concern (feature, fix, or refactor slice).
- Avoid mixing unrelated changes.
- Split broad efforts into stacked or sequential PRs.

## 2) Required PR description sections
Every PR description must include:
1. **Summary** — what changed
2. **Why** — user/business reason
3. **Scope boundaries** — explicitly what was not changed
4. **Risk assessment** — expected risk level and why
5. **Validation** — local command output + manual QA performed
6. **Rollback plan** — how to revert safely if needed

## 3) Risky areas (require extra reviewer attention)
- Auth
- Startup
- Storage
- Navigation
- Notifications
- Payments/Deals

If a PR touches one or more risky areas:
- Request at least one senior reviewer.
- Ensure manual QA covers affected flows.
- Prefer smaller rollout/OTA messaging discipline.

## 4) Merge decision rules
Use one of these outcomes explicitly:

### Merge
Use when:
- Scope is focused
- Checks pass
- QA confidence is sufficient
- No blocking concerns remain

### Merge after changes
Use when:
- Core direction is acceptable
- Specific fixes are required before merge
- Reviewer feedback is actionable and bounded

### Do not merge
Use when:
- Scope is unclear or mixed
- Risk is unacceptably high
- Regressions are observed
- Validation/QA evidence is missing

## 5) Required local commands
Run and report results in PR before requesting final merge:
- `npm run typecheck`
- `npx expo-doctor`

## 6) Required manual QA for navigation/UI PRs
For PRs that change UI, routes, screen transitions, or user interaction flows:
- Execute manual QA checklist scenarios relevant to changed surfaces.
- Include tested routes and devices in PR description.
- Confirm back navigation and repeated tap safety where applicable.

## 7) Reviewer checklist (quick)
- [ ] One concern only
- [ ] Description sections complete
- [ ] Risky area assessment present
- [ ] Required local commands reported
- [ ] Manual QA evidence included (if navigation/UI)
- [ ] Merge outcome selected (merge / merge after changes / do not merge)
