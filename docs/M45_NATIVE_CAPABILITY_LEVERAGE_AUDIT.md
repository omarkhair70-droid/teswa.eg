# M45 Native Capability Leverage Audit

Assessment basis: `package.json`, `app.json`, and code references in `app/`, `lib/`, `components/`.

| Capability | Current status | Meaningful use now? | Launch leverage potential | Recommendation |
|---|---|---|---|---|
| `expo-secure-store` | Installed + plugin configured, no clear direct usage reference found | No (appears reserved) | Could secure sensitive local flags/tokens beyond AsyncStorage | **Activate before launch** for high-sensitivity local state only |
| `expo-clipboard` | Installed, no usage found | No | Low immediate value; convenience only | **Keep reserved for later** |
| `expo-document-picker` | Installed, no usage found | No | Could broaden media/import flows, but scope creep risk pre-Play | **Keep reserved for later** |
| `expo-intent-launcher` | Installed, no usage found | No | Could improve permission-recovery UX by deep-linking settings | **Activate before launch** if permission friction observed in QA |
| `expo-store-review` | Installed, no usage found | No | Useful for post-success milestone rating prompt | **Activate before launch** (small scoped trigger) |
| `expo-media-library` | Installed + plugin configured, no explicit import found | Limited/unclear | Could enable save/share experiences and media management clarity | **Keep reserved for later** unless a specific launch flow needs it |
| `react-native-maps` | Installed, no usage found | No | Potential City Pulse map expression, but high scope risk now | **Keep reserved for later** |
| `react-native-view-shot` | Used in Motion share sheet | Yes | Already supports social sharing artifacts | **Already justified** |
| `@shopify/react-native-skia` | Used in Motion pulse canvas | Yes | Contributes premium visual identity | **Already justified** |
| `react-native-compressor` | Used via media compression utility + plugin | Yes | Important for media upload reliability/perf | **Already justified** |
| `expo-share-intent` | Integrated at root for inbound shared images to add flow | Yes | Strong top-of-funnel convenience | **Already justified** |
| `expo-background-task` | Used in background memory refresh | Yes | Supports resilience/offline freshness posture | **Already justified** |
| `expo-haptics` | Used across add/story/offer/deal/edit flows | Yes | Improves tactile confidence | **Already justified** |
| `expo-sqlite` | Used in offline cache foundation | Yes | Core to offline memory architecture | **Already justified** |

## Net conclusion
- **Underused but high-value pre-launch candidates:** `expo-store-review`, selective `expo-secure-store`, and conditionally `expo-intent-launcher`.
- **Likely distractors pre-launch:** maps/document-picker broad activations unless tied to a strict launch-critical UX issue.
- **No immediate removals required** before launch; defer dependency pruning until post-launch stabilization.
