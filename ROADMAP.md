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
- **Web RC5 preview:** Adds complete supported free Runtime movies, episodes and live channels with internal playback, daily validated metadata refreshes for ten integrated providers, and a time-grid guide with Runtime/Xumo coverage. Includes complete supported free PBS and FreeTV catalogues, protected Revry/FreeTV playback with normal browser Widevine and original advertising, PBS popular shows and more publisher guide coverage. Retains the app-style Home/globe, portable library tools and NASA+ text parties. RC5 release snapshot: 24,710 top-level On Demand entries, 1,279 live listings and 3,892 webcams. Some players use official publisher pages; recording/DVR, broader party sync and automatic Android library sync remain future work. [Try it here](https://sheepman90s.github.io/sheepbox-releases/watch/) and see [coverage limits](PROVIDERS.md#web-preview).
