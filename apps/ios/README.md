# SaaradhiGo iOS

iOS-specific scaffolding under the [SaaradhiGo-web](../../) monorepo at `apps/ios`.

> Status: placeholder. No application code has been added yet.
>
> Note: the active **rider** iOS build is produced from the Flutter codebase in the separate [SaaradhiGo-mobile](../../../SaaradhiGo-mobile) repository. This directory is reserved for an iOS-only application or platform-specific assets/tooling tracked alongside the web client.

## Scope

This directory will contain:

- Xcode project / workspace, Swift sources, storyboards/SwiftUI views, and asset catalogs
- `Podfile` / Swift Package Manager configuration
- App-specific tests
- GitHub Actions workflows producing the `build/ios` and `test/ios` status checks required by the monorepo branch-protection rules

## Backend integration

Targets the same SaaradhiGo backend as the other clients:

- REST: `https://dev.api.saaradhigo.in/api/v1`
- WebSocket: `wss://dev.api.saaradhigo.in/ws`

## Getting started

To be filled in once the app is scaffolded. Expected entries:

- Prerequisites (Xcode version, CocoaPods / SPM)
- Build / run / test commands
- Code-signing and provisioning setup
- Deployment notes (App Store Connect / TestFlight)
