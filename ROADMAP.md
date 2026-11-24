# SheepBox roadmap

Stable Android release: [2.0.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0), promoting the tested RC12 feature set. [Earlier versions](https://github.com/sheepman90s/sheepbox-releases/releases) remain available.

## Current focus

**Provider additions are paused.** The next phase is testing and improving the existing 2.0 experience, including first-load caching, playback reliability, captions and TV remote navigation. Physical-TV and longer playback feedback remain useful for future maintenance updates.

## Planned features

| Feature | Scope |
|---|---|
| Closed captions | Consistent Live TV and On Demand controls, language/track selection and saved preferences where providers supply supported captions. |
| Split Screen | Multiple supported streams, remote-friendly pane selection, layout and audio controls. Device decoding, ads and DRM support need validation. |

These features have no committed release dates.

## Available now

- **2.0.0 stable:** Live TV, On Demand, Web Cams, World View, supported DVR, backups and in-app reports; the 2.0 provider additions; watched/unwatched controls; guide title/description recording searches as listings arrive; 30 guide slots and remembered guide opt-outs; worldwide Samsung; cache cleanup and provider status; and supported BYUtv/NASA+/NFB text parties with video beside a smaller chat panel. World View includes Channel Up/Down zoom guidance. See [stable release notes](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0) and [provider coverage](PROVIDERS.md). Test-version opt-in is not needed.
- **Web RC6 preview:** Adds Plex’s complete supported free movie/show root and genre directories, with full per-show season/episode loading and caching, plus Pluto’s audited supported US movies, shows and free live channels. Both open official publisher players; Pluto owns episode selection. Extends daily validated metadata maintenance to twelve providers. Retains internal Runtime playback, supported protected Revry/FreeTV playback, the time-grid guide, app-style Home/globe, portable library tools and NASA+ text parties. RC6 release snapshot: 78,789 top-level On Demand entries, 1,724 live listings and 3,892 webcams. Recording/DVR, broader party sync and automatic Android library sync remain future work. [Try it here](https://sheepman90s.github.io/sheepbox-releases/watch/) and see [coverage limits](PROVIDERS.md#web-preview).
