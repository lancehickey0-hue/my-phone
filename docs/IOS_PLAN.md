# My-Phone for iPhone — plan (parked until Android ships)

Android is the priority. This captures what an iOS version would take so it's
ready when we pick it up.

## What carries over as-is
The shared Expo/React Native code already runs on iOS:
- Sign-in, Devices tab, live Map (Leaflet in a WebView), activity log
- Convex backend, device auto-linking and per-install secret
  (`src/lib/deviceIdentity.ts` uses `identifierForVendor` on iOS)
- Background GPS via `expo-location` once the user grants **Always**
- Face ID via `expo-local-authentication` (`NSFaceIDUsageDescription` is
  already in `app.json`)
- Remote alarm by push notification while the app is open

## What Apple doesn't allow, and the iOS substitute

| Android feature | Why it can't port | iOS version |
|---|---|---|
| Always-on "Hey, My-Phone, where are you?" (Vosk foreground service) | Third-party apps can't keep the mic listening in the background | **Siri Shortcut / App Intent**: "Hey Siri, where's my phone?" runs an intent that triggers the alarm. Custom phrase set by the user in Shortcuts. |
| Remote OS screen lock (Device Admin `lockNow()`) | No API lets an app lock an iPhone | Lockout covers **the My-Phone app only**; point users to Apple's Lost Mode for OS-level lock |
| Siren with app closed / on silent | Background audio is killed; silent switch mutes normal sounds | **Critical Alerts** entitlement — push plays a loud sound even on silent/DND. Must apply to Apple (justify as a find-my-device app). |
| Native lock-state poller | No long-running background code | Server sends a push the moment `isAlarmActive` flips; app reacts on receipt |
| Server-verified biometric key (Android Keystore) | — | Secure Enclave key with `.biometryCurrentSet` access control signs the same unlock challenge — same server code, different native module |

## Work list
1. Apple Developer account ($99/yr), bundle ID `com.myphone.app` provisioning
2. Regenerate `ios/` via `expo prebuild --platform ios` (the checked-in folder is stale)
3. Swift module: App Intent ("Find My-Phone") → calls `/triggerAlarmDevice` with the install secret
4. Swift module: Secure Enclave signing for unlock (mirror Android `DeviceKeyModule`)
5. Apply for Critical Alerts; send alarm pushes with `critical: true` and a bundled siren sound
6. EAS iOS build profile + TestFlight
7. Gate Android-only UI (Device Admin, wake-word setup, voice training) on `Platform.OS`

## Open questions
- Is app-only lockout acceptable on iPhone, or do we lean on Apple Lost Mode messaging?
- Price parity across platforms
