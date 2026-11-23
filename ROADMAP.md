# SheepBox roadmap

Stable Android release: [1.9.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.9.0). Current Android test release: [2.0.0-RC12](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0-RC12-code214).

## Current focus

**Provider additions are paused.** The next phase is testing and improving the existing 2.0 experience, including first-load caching, playback reliability, captions and TV remote navigation. Physical-TV and longer playback feedback remain important before a stable release.

## Planned features

| Feature | Scope |
|---|---|
| Closed captions | Consistent Live TV and On Demand controls, language/track selection and saved preferences where providers supply supported captions. |
| Split Screen | Multiple supported streams, remote-friendly pane selection, layout and audio controls. Device decoding, ads and DRM support need validation. |

These features have no committed release dates.

## Available now

- **1.9.0 stable:** Live TV, On Demand, Web Cams, World View, supported DVR, personal backups, in-app reports and device optimization. See the [provider matrix](PROVIDERS.md) and [stable release notes](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.9.0).
- **2.0.0-RC12 test:** Adds the World View Channel Up/Down zoom hint before and during selection. Retains native CDNLive playback and automatic new-guide defaults with remembered opt-outs. Includes watched/unwatched controls, worldwide Samsung, 30 guide slots and corrected shelf sheep artwork. Improves **Record by name** so searches receive listings that finish loading after leaving Home, display guide loading/coverage and preserve remote focus through updates. Includes single-airing/series scheduling, supported saved On Demand recording, smaller watch-party chat, cache cleanup, provider status, BYUtv/NASA+/NFB text-only parties, earlier providers and World View fixes. See [RC12 release notes](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0-RC12-code214). Enable Include test versions in App updates.
- **Web RC2 preview:** Adds persistent watched/unwatched controls, backup migration/merge, catalogue cache clearing, provider status, complete audited Philo Free VOD and BYUtv browsing, a CW guide and keyboard globe controls. Its snapshot has 21,558 top-level On Demand entries, 1,205 live listings and 3,892 webcams. Some players open official publisher pages; provider coverage differs from Android. Watch parties, recording/DVR and automatic Android library sync remain future web work without committed dates. [Try it here](https://sheepman90s.github.io/sheepbox-releases/watch/) and see [coverage limits](PROVIDERS.md#web-preview).
