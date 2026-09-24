# SaaradhiGo Ops Console

Internal operations console for SaaradhiGo. A Next.js 14 (App Router) app written in TypeScript + Tailwind, run by ops + support staff against the shared backend.

> Phase-0 MVP. Surface kept intentionally small: dashboard, trips, drivers, support tickets, pricing zones. Approve-driver and view rate cards work end-to-end; driver detail / SOS / withdrawal-management screens are TODO.

## Quick start

```bash
cd apps/web
cp .env.example .env.local       # tweak NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev                      # http://localhost:3000
```

Sign in with an admin-role phone number; OTP flow is identical to the mobile clients.

## Stack

- **Next.js 14 App Router** — file-based routing under `src/app/`. The `(console)` route group holds the authenticated UI.
- **TypeScript strict mode.**
- **Tailwind CSS** for styling. Brand colours + dark surface defined in `tailwind.config.ts`.
- **No state management library.** State per page; tokens persisted in `localStorage`. If we add cross-page caching, drop in TanStack Query.
- **No bundler customisation** beyond `next.config.js` and the `NEXT_PUBLIC_API_BASE_URL` env var.

## Pages

| Path | What it does |
|---|---|
| `/login` | OTP login (uses `/auth/otp/` + `/auth/login/`). |
| `/dashboard` | Daily KPI tiles via `/ride/admin/dashboard/`. |
| `/trips` | Trips list with status filter via `/ride/admin/trips/`. |
| `/drivers` | Drivers list with KYC approve action. |
| `/support` | Support tickets list via `/support/admin/tickets/`. |
| `/zones` | Service zones + rate cards via `/pricing/admin/zones/` + `/pricing/admin/rate-cards/`. |

## Auth model

Access + refresh tokens live in `localStorage` (keys: `saaradhi_admin_access_token`, `saaradhi_admin_refresh_token`). The `Authorization: Bearer …` header is attached on every call by `src/lib/api.ts`.

Token rotation isn't wired yet — the access token currently lives for 15 minutes server-side, so an ops user will need to sign in again after that window. The refresh flow is a Phase-1 follow-up.

## Backend integration

All API calls go through `src/lib/api.ts`:

```ts
import { api } from '@/lib/api';
const data = await api.get<DashboardData>('/ride/admin/dashboard/');
```

The backend envelope `{status: 'success', data: {...}}` is unwrapped automatically; DRF pagination responses (`{results, next, ...}`) are returned as-is.

## TODO (Phase-1)

- Driver detail page (KYC docs, vehicle expiry, withdrawals, ride history).
- Trip detail page (chat history, payment status, refund actions, SOS link).
- Refresh-token rotation + idle timeout.
- CSV export for trips / withdrawals / receipts.
- Live trip-on-map view (consume the same WebSocket the mobile app uses).
- Two-factor enforcement for admin login.
- Audit log read-only view.
