# PWA Foundation Remediation

## Files Changed

- `dashboard/public/dashboard/service-worker.js`
- `dashboard/public/service-worker.js` removed
- `dashboard/components/pwa/service-worker-registration.tsx`
- `dashboard/app/manifest.ts`
- `dashboard/package.json`
- `pnpm-lock.yaml`

Pre-existing changes to `dashboard/app/globals.css` were left untouched.

## PWA Security Changes

- Removed precaching of all authenticated dashboard routes.
- The service worker caches only the non-sensitive `/offline` fallback.
- No dashboard HTML, employee conversations, escalation data, HR request data, HR documents, API responses, RSC responses, authentication tokens, or authenticated responses are cached.
- Offline fallback lookup is restricted to the worker's own cache.
- Dashboard navigation uses the network first and shows the offline fallback only when the network request fails.

## Service-Worker Scope

- Worker URL: `/dashboard/service-worker.js`
- Registration scope: `/dashboard/`
- Manifest scope: `/dashboard/`
- Unrelated application routes are outside the worker's scope.

## Offline Behavior

Online dashboard navigation remains network-backed. When offline, dashboard navigation displays the non-sensitive offline page, which explicitly states that live HR information requires a connection. No live HR data is presented offline.

## Dependency Change

The originally validated lint remediation aligned the dashboard with the existing compatible workspace toolchain:

- TypeScript: `7.0.2` to `5.9.3`
- ESLint: `10.8.1` to `9.39.5`

The current working copy has since been edited to use TypeScript 6 through an `@typescript/typescript6` override, explicit `typescript-eslint`, and ESLint 10. That current configuration is not the validated state.

## Validation

At completion of the remediation:

- `pnpm --dir dashboard lint`: passed
- `pnpm --dir dashboard exec tsc --noEmit`: passed
- `pnpm --dir dashboard build`: passed

A subsequent lint check against the current user-edited package configuration fails before linting because `eslint-plugin-react` is incompatible with ESLint 10 (`contextOrFilename.getFilename is not a function`).

The production build and TypeScript check passed for the remediation state. The manifest remained valid, the service-worker scope was `/dashboard/`, dashboard HTML was not precached, and the service worker contained no API, RSC, token, or persistence handling.

## Feature Scope Confirmation

No analytics implementation, conversations integration, escalation UI, HR Requests UI, authentication, API integration, offline persistence, IndexedDB, push notifications, background synchronization, or dashboard feature code was added.

The AppShell structure and exactly four navigation items remain unchanged.
