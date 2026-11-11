# SheepBox 1.5.0-RC6

- Fixes TCLtv+ XITE 80s Flashback, XITE 90s Throwback and BBC Earth playback by resolving supported app-version and operating-system placeholders in the provider's stream URL.
- Preserves provider stream/ad parameters and reports useful TCLtv+ playback errors instead of a generic network failure.
- Lists Live TV providers alphabetically by display name.
- Includes RC4's live catalog recovery and movie category cleanup.

Update in Settings > App updates with Include test versions enabled, then retry the affected channels.

Provider catalog entries may still be unavailable through guest access; normal regional and access checks remain in effect. Physical-TV confirmation and full ad-pod validation remain pending.

Verification: signed debug/release builds, 33 targeted unit tests, five Android device tests and local lint passed. The additional full Linux CI run is queued and had not started at publication.
