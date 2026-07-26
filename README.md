# SaaradhiGo Web & Platform Monorepo

Umbrella repository for the SaaradhiGo / VahanGo client applications. It hosts the web client and per-platform native scaffolding, and documents the shared branching and release workflow used across all SaaradhiGo repos.

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

## Branching and release workflow

This repository follows a 5-level hierarchical branching strategy:

`feature/* → develop → testing → staging → release → main`

Each level has progressively stricter branch-protection rules (approvals, status checks, force-push policy). The full configuration — including the GitHub Actions status checks each branch must pass — is documented in [BRANCH_PROTECTION_GUIDE.md](BRANCH_PROTECTION_GUIDE.md).

Quick reference:

| Branch    | Approvals | Force push | Purpose                           |
| --------- | --------- | ---------- | --------------------------------- |
| `main`    | 2         | No         | Production                        |
| `release` | 1         | No         | Release candidate                 |
| `staging` | 1         | No         | Pre-prod verification             |
| `testing` | 0         | Yes        | QA testing branch                 |
| `develop` | 0         | Yes        | Integration of feature branches   |

## Required CI status checks

Expected status checks (per BRANCH_PROTECTION_GUIDE.md):

- `build/web`, `test/web`
- `build/android`, `test/android`
- `build/ios`, `test/ios`
- `code-quality`
- `security-scan`

These should be wired up via GitHub Actions as each app gains real code.

## Related repositories

- [SaaradhiGo-mobile](../SaaradhiGo-mobile) — Flutter rider app (VahanGo)
- [SaaradhiGo-backend](../SaaradhiGo-backend) — API, WebSocket gateway, and database
