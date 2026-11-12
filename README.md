# SaaradhiGo Web & Platform Monorepo

Umbrella repository for the SaaradhiGo client applications. It hosts the web client and per-platform native scaffolding, and documents the shared branching and release workflow used across all SaaradhiGo repos.

> Status: scaffolding only. Each `apps/*` directory currently contains a placeholder README; production code has not been added yet. The active rider mobile codebase lives in the separate [SaaradhiGo-mobile](../SaaradhiGo-mobile) repository.

## Repository layout

```
SaaradhiGo-web/
├── apps/
│   ├── web/                       # Web application (placeholder)
│   ├── android/                   # Android-specific app/scaffolding (placeholder)
│   └── ios/                       # iOS-specific app/scaffolding (placeholder)
├── README.md
└── BRANCH_PROTECTION_GUIDE.md     # Branching strategy and GitHub protection rules
```

See each app's own README for setup details:

- [apps/web/README.md](apps/web/README.md)
- [apps/android/README.md](apps/android/README.md)
- [apps/ios/README.md](apps/ios/README.md)

## Branches and deploys

- **Feature branches** open a PR into `develop`. CI must pass: `verify` (lint, types, tests, build, layout and area gates) and `secret scan`.
- **`develop` deploys to QA automatically.** Railway (QA project, service `web`, root `apps/web`) builds every new commit on `develop` once its GitHub checks pass ("wait for CI"). Nobody deploys QA by hand except to redeploy a commit already on `develop`.
- **`main` is production.** It takes pull requests from `develop` only (`source branch` check, `.github/workflows/main-source.yml`), with every CI check green, merged with a merge commit. No direct pushes or force-pushes, for admins too.
- **Production deploys only from `main`, through CI, never by hand.** When a production environment exists, its deploy runs from a push to `main` after CI, never from `workflow_dispatch`, a local machine or a dashboard button.
- **Today** there is no production environment, so a merge to `main` deploys nothing.
- The older five-branch model (`testing`, `staging`, `release`) and [BRANCH_PROTECTION_GUIDE.md](BRANCH_PROTECTION_GUIDE.md) are retired; those branches are not used.

## Related repositories

- [SaaradhiGo-mobile](../SaaradhiGo-mobile) — Flutter rider app
- [SaaradhiGo-backend](../SaaradhiGo-backend) — API, WebSocket gateway, and database
