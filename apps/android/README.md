# SaaradhiGo Android

Android-specific scaffolding under the [SaaradhiGo-web](../../) monorepo at `apps/android`.

> Status: placeholder. No application code has been added yet.
>
> Note: the active **rider** Android build is produced from the Flutter codebase in the separate [SaaradhiGo-mobile](../../../SaaradhiGo-mobile) repository. This directory is reserved for an Android-only application or platform-specific assets/tooling tracked alongside the web client.

## Scope

This directory will contain:

- Android project (Gradle / Kotlin) source, manifests, and resources
- Signing configuration references (keystores must not be committed)
- App-specific tests
- GitHub Actions workflows producing the `build/android` and `test/android` status checks required by the monorepo branch-protection rules

## Backend integration

Targets the same SaaradhiGo backend as the other clients:

- REST (QA): `https://backend-qa-811d.up.railway.app/api/v1`
- WebSocket (QA): `wss://backend-qa-811d.up.railway.app/ws`
- REST (production target): `https://api.saaradhigo.com/api/v1` *(DNS not yet configured)*
- WebSocket (production target): `wss://api.saaradhigo.com/ws` *(DNS not yet configured)*

## Getting started

To be filled in once the app is scaffolded. Expected entries:

- Prerequisites (Android SDK, Gradle, JDK version)
- Build / run / test commands
- Signing and release configuration
- Deployment notes (Play Console)
