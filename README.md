<div align="center">

<img src="assets/sheepbox-banner.png" alt="SheepBox popcorn sheep mascot" width="640" />

# SheepBox TV and VOD

**Free live TV, movies and shows. One app, one remote.**

[Website](https://sheepman90s.github.io/sheepbox-releases/) · [Web preview](https://sheepman90s.github.io/sheepbox-releases/watch/) · [Providers](PROVIDERS.md) · [Roadmap](ROADMAP.md) · [Report a problem](https://github.com/sheepman90s/sheepbox-releases/issues/new?template=bug_report.yml) · [Request a channel](https://github.com/sheepman90s/sheepbox-releases/issues/new?template=channel_request.yml) · [Request a feature](https://github.com/sheepman90s/sheepbox-releases/issues/new?template=feature_request.yml)

</div>

SheepBox brings free streaming services together in an Android TV and Google TV app with shared browsing, search, favorites and remote controls.

## Download

| Version | Download | Details |
|---|---|---|
| **2.0.0 stable** | [Sheepbox-latest.apk](https://github.com/sheepman90s/sheepbox-releases/releases/latest/download/Sheepbox-latest.apk) | Recommended for regular use. [Release notes](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0) |

[Versioned 2.0.0 APK](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.0.0/sheepbox-tv-vod-2.0.0-release.apk) / [SHA256](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.0.0/sheepbox-tv-vod-2.0.0-release.apk.sha256) / [Previous releases](https://github.com/sheepman90s/sheepbox-releases/releases).

**2.0.0 / Android build215** promotes the tested RC12 feature set to stable. Install over 1.9.0 or an existing 2.0 release candidate to retain personal data. Test-version opt-in is not required.

Requires Android 6.0 or later. Install updates over the existing app to retain settings, favorites and history.

## Test release: Android 2.1.0-RC4

[Download RC4/build 219](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC4/sheepbox-tv-vod-2.1.0-RC4-release.apk) / [SHA256](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC4/sheepbox-tv-vod-2.1.0-RC4-release.apk.sha256) / [What is new and testing limits](RELEASE_2_1_0_RC4.md).

RC4 replaces the previous Retro theme catalogue with BackWhen's actual 179 public media/weather sources, independent SheepBox channel names and original source credits. Recorded stations follow their published schedules; Pluto music stations play inside Android through normal guest playback. Knight Rider remains channel180, with real episode titles reserved at least three hours ahead and automatic playback in that advertised order. Install over the existing app to retain personal data; enable **Include test versions** for in-app RC updates. Stable2.0.0 remains the recommended stable download. The published Web RC7 is unchanged; in-page web music playback is separate ongoing work.

[Previous RC3](RELEASE_2_1_0_RC3.md) remains available.

## Install and update

1. Download the [stable APK](https://github.com/sheepman90s/sheepbox-releases/releases/latest/download/Sheepbox-latest.apk) to your TV or streaming device.
2. In Android settings, allow your chosen downloader or file manager to install apps.
3. Open the APK and follow Android's installation prompts.
4. Start SheepBox. On Demand catalogues load when first opened and use saved metadata caches on later visits.

For updates, open **Settings > App updates > Check now > Update now**. Stable 2.0.0 is offered without enabling test versions; enable that setting to receive RC4 and future prereleases. Downloads are checked for the expected package, a newer version and the established signing key before Android's installer opens.

Signing certificate SHA-256: `a8ee97fd44e560a1b2921ce87e73a9e76b22a336de1bfc0f5723d846b693acff`

## Features

- Live TV Simple and Live TV Complete, with provider, country and genre browsing.
- Programme guide, search, favorites, Continue Watching and supported playback resume.
- On Demand categories, title artwork, seasons and episodes, with provider-specific caching.
- Web Cams and World View for country-based browsing.
- Recording and scheduled DVR for supported streams, with local or USB storage.
- Personal backups, hidden items, private in-app problem reports and optional device optimization.
- TV remote navigation and captions where the provider and player support them.
- 2.0 stable: World View explains `Channel Up/Down: zoom in/out` before and during globe selection; mark movies, series and episodes watched/unwatched; play CDNLive in the native player and browse Samsung's worldwide lineup. New guide presets enable automatically when a slot is free, with later opt-outs remembered. Includes 30 guide sources and recording keyword searches as listings arrive. LG regional sources may be unavailable; existing US channels are retained.
- Watch-party chat uses a smaller panel beside the video, restoring the previous video size and focus when closed. Native support remains BYUtv, NASA+ and NFB on demand.
- Includes cache cleanup, provider status and the earlier 2.0 fixes.

<p align="center">
  <img src="docs/screenshot-home-rc12.png" alt="SheepBox Home with navigation beside the sheep mascot" width="49%" />
  <img src="docs/screenshot-catalogue-rc14.png" alt="SheepBox On Demand categories and title artwork" width="49%" />
</p>

Screenshots are from the 1.9.0 release-candidate series. See [supported providers and limitations](PROVIDERS.md) for current Android and browser coverage.

## Web preview

Retro TV provides a separate **179-station continuous guide** with channel numbers, categories, full-screen playback and **Request a channel**. [Release notes and limitations](RELEASE_2_1_0_RC2.md).

[Open SheepBox Web RC7](https://sheepman90s.github.io/sheepbox-releases/watch/) in a desktop or mobile browser. The RC7 release snapshot contains 78,527 top-level On Demand entries, 1,687 live listings and 3,892 webcams. PBS adds 12,012 free full-length videos across 307 shows, including NOVA and FRONTLINE. FreeTV adds 679 films, 7,691 episodes, 345 playable shows and 12 live channels. Revry and FreeTV protected videos play inside SheepBox using normal browser Widevine and the publisher's original advertising. Protected playback needs a compatible browser; the publisher link remains available.

Plex adds 30,965 movies and 2,840 shows from its complete supported free root and genre directories. Opening a show loads all available seasons and free episodes before displaying the list, then caches it. Search covers movie/show titles and episodes from opened shows.

Pluto adds 16,050 movies, 4,231 shows and 445 free live channels from its fully paged supported US categories, current website indexes and live directory. Every discovered movie/show destination was checked; unavailable and locked offers are excluded. These sources do not prove a whole-service total. Pluto provides episode selection in its official player.

Runtime adds 699 free movies, 72 playable shows, 2,567 episodes and 29 live channels with internal HLS playback and original advertising.

Daily automated refreshes cover PBS, FreeTV, Runtime, Revry, NASA+, Filmzie, NewsON, Xumo, CW, YuppTV, Plex and Pluto. Incomplete or inconsistent updates retain the working library. Other snapshots keep their own dates; see Provider Status for checked dates.

Use watched/unwatched controls, favorites, Continue watching, browser backups, hide/restore, four color palettes, cache clearing and provider status. Supported episodes can continue to the next episode; original advertising may require Play. The time-grid guide covers CW, Revry, FreeTV, Runtime and Xumo, with day/time controls, programme details, list view and search across loaded schedules. SheepBox Classics has separate labelled collection schedules. World View keeps keyboard globe selection and zoom.

Start a text watch party from a NASA+ on-demand video's player, or choose Watch party to join an invitation. The host controls playback, chat sits beside a smaller video, and each viewer streams independently. Matching NASA+ rooms work with the Android app. BYUtv/NFB parties remain Android-only; no microphone or voice chat is used.

Browser support differs from Android. PBS-approved videos use its official embedded player; other free PBS videos open their exact official page. Philo, BYUtv, Fawesome, Roku, Plex and Pluto open official players in a new tab; return to SheepBox to continue browsing. Some other entries are website links or explicitly partial selections. Saved metadata supports offline browsing; watching and parties need a connection. Recording/DVR and automatic Android library sync remain unavailable. See [web provider coverage](PROVIDERS.md#web-preview) for counts and limits. Publisher access, advertising and region restrictions remain in force.

## Availability and support

SheepBox is independent and is not affiliated with its listed providers. It hosts no video. Streams come from providers' free offers, free-to-air directories and public-domain or Creative Commons collections. Provider advertising, access restrictions and normal content protection remain in place.

Catalogues change, some services return incomplete results, and a **+** beside a count means the loaded catalogue is incomplete. Captions, recording, resume and autoplay depend on the source. Some streams may be unavailable or temporarily fail; retry or refresh the provider before [reporting a problem](https://github.com/sheepman90s/sheepbox-releases/issues). Include the app version, device model, provider and title, without account details or private playback links.

Provider additions are paused while we maintain and improve 2.0. See the [roadmap](ROADMAP.md) for planned work.

Use [Bug report or Feature request](https://github.com/sheepman90s/sheepbox-releases/issues/new/choose) to submit public feedback. Feature requests receive the **enhancement** label so suggestions can be tracked and discussed separately from bugs. Keep private details in the app's private reporting flow.

© 2026 [sheepman90s](https://github.com/sheepman90s)
