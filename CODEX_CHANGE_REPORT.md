# Analytics Backend API Change Report

## Files Changed

| File | Change |
|---|---|
| `backend/src/modules/analytics/analytics.controller.ts` | Added the authenticated dashboard analytics HTTP controller and eight required GET routes. |
| `backend/src/modules/analytics/analytics-query.dto.ts` | Added the shared validated analytics filter DTO. |
| `backend/src/modules/analytics/analytics-query.types.ts` | Added typed API response contracts. |
| `backend/src/modules/analytics/analytics-query.service.ts` | Added independent panel aggregations and CSV export generation. |
| `backend/src/modules/analytics/analytics.module.ts` | Registered the analytics controller and query service. |
| `CODEX_CHANGE_REPORT.md` | Added this implementation and verification report. |

`backend/src/modules/analytics/analytics.service.ts` was intentionally not
modified; it remains responsible only for recording events. `AppModule` already
imported `AnalyticsModule` and was not changed.

## Routes Added

All routes are under `GET /api/v1/dashboard/analytics` at runtime and protected
by the existing `JwtAuthGuard`:

- `/overview`
- `/conversation-activity`
- `/hr-services`
- `/journey`
- `/escalations`
- `/top-paths`
- `/unrecognized-inputs`
- `/export`

## Filter Contract

Every route accepts the shared `AnalyticsQueryDto` query fields:

- `from` and `to`: ISO 8601 dates or datetimes, validated by
  `@IsDateString()`.
- `department`: exact `Employee.department` match.
- `service`: validated but currently rejected with `400 Bad Request` because
  the existing `AnalyticsEvent.metadata` has no defined service-field contract.
  Silently ignoring it would make filtered metrics misleading.

Date-only boundaries are interpreted in UTC. `from=YYYY-MM-DD` is inclusive at
UTC midnight; `to=YYYY-MM-DD` includes the entire UTC day. Datetime `to`
values are inclusive to the supplied millisecond. Omitted filters are
unrestricted.

## Aggregations and Data Sources

| Endpoint | Implementation |
|---|---|
| `overview` | `ChatSession.startedAt` counts total conversations; `Employee.status=ACTIVE` counts active employees; `Escalation.createdAt` provides HR escalation count and rate; `AnalyticsEvent` `SESSION_STARTED`/`BOT_COMPLETED` provides bot resolution rate when instrumentation exists; ordered `ChatMessage` inbound/outbound timestamps provide average first-response seconds. |
| `conversation-activity` | Returns only observed UTC daily, Monday-based weekly, and monthly buckets from `ChatSession.startedAt`, `AnalyticsEvent.BOT_COMPLETED`, and `Escalation.createdAt`. No historical zero-filled buckets are manufactured. |
| `hr-services` | Returns `{ dataAvailable: false, items: [] }`. There is no established structured service metadata or event writer to aggregate safely. |
| `journey` | Aggregates each existing `AnalyticsEventType` milestone and returns the six UI-aligned journey steps. Counts are real database aggregates. |
| `escalations` | Counts `Escalation` records and groups by the existing nullable `category` field without inventing categories. Average per day is returned only for a bounded `from`/`to` range. |
| `top-paths` | Returns `{ dataAvailable: false, items: [] }`. Current analytics event metadata has no defined structured path format. |
| `unrecognized-inputs` | Returns actual `AnalyticsEvent.UNRECOGNIZED_INPUT` records with event/session identifiers, department, occurrence time, and `reviewedAt`; no input text is inferred or exposed because its metadata contract is undefined. |
| `export` | Produces a CSV (`text/csv; charset=utf-8`) derived from the same overview, journey, and escalation aggregations, with deterministic `analytics-export.csv` content disposition. |

## Data Limitations and Product Decisions

No current code calls `AnalyticsService.recordEvent()`. Therefore event-driven
results are empty until the owning event-instrumentation workstream emits real
events; no historical data was invented or backfilled. The existing
`ConversationService.handleUnknownSelection()` re-prompts the menu and does not
create an escalation. This API treats unrecognized-input events independently
from escalation records. No review mutation, AI/NLP, sentiment analysis, or
sentiment inference was added.

No pre-existing cache abstraction was found, so no cache was introduced.
PDF export was not added because the backend has no existing PDF-generation
capability; introducing a reporting dependency solely for that format was out
of scope. CSV is the implemented export format.

## Verification

- `pnpm --filter backend exec eslint src/modules/analytics/analytics.controller.ts src/modules/analytics/analytics-query.dto.ts src/modules/analytics/analytics-query.service.ts src/modules/analytics/analytics-query.types.ts src/modules/analytics/analytics.module.ts` — passed.
- `pnpm --filter backend build` — passed.
- Compiled `AnalyticsQueryService` run against empty Prisma results — passed:
  valid empty response structures, CSV output, and invalid-date rejection were
  verified.
- All eight live compiled routes were requested without a JWT — each returned
  `401 Unauthorized`, confirming route registration and JWT protection.

Authenticated database-backed requests were not performed because no test HR
officer credentials were available, and none were invented.
