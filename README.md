<div align="center">

<img src="assets/sheepbox-banner.png?v=1.7.0-rc4" alt="SheepBox pink-accent sheep artwork" width="640" />

# SheepBox TV and VOD

**Free live TV and free movies & shows. One app, one remote.**

[Website](https://sheepman90s.github.io/sheepbox-releases/) · [Downloads](https://github.com/sheepman90s/sheepbox-releases/releases) · [Supported providers](PROVIDERS.md) · [Roadmap](ROADMAP.md)

</div>

**Direct APK download:** [Sheepbox-latest.apk](https://github.com/sheepman90s/sheepbox-releases/releases/latest/download/Sheepbox-latest.apk) — a permanent link to the latest stable version.

**Current stable release: [1.7.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.7.0), version code 175.** Includes native Plex and Filmzie Movies & Shows, The CW and Free Live Sports Live TV/guide and Movies & Shows, categorized caching, shared browsing/history and pink sheep artwork. Update in **Settings > App updates > Check now > Update now**; test versions do not need to be enabled.

**Test release: [1.8.0-RC6](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC6), version code181.** Adds DOCUMENTARY+ Movies & Shows and four live channels with guide in All Channels A–Z. Current guest snapshot:270 movies,38 shows/291 eligible episodes. Includes categorized caching, search/favorites, resume/autoplay and native playback with provider ads. Includes FlixHouse, RetroCrush, Canela.TV, NFB and NewsON. Enable **Include test versions** in App updates. 522 regression tests, zero-error lint, signed/instrumentation builds and standard CI passed. Android23 passed; each of two Android35 runs passed6/7 with intermittent provider HTTP500/504 errors. All tested playback paths succeeded across runs, but neither full native run was green.

1.7.0 promotes the user-tested RC6 improvements to stable and retains the Cineverse/wedotv updates. Some provider streams remain unavailable through guest access; partial catalog counts show +. Regional restrictions apply, and full advertising-pod validation remains pending.

<p align="center">
  <img src="assets/screenshot-home.jpg?v=1.1.0-rc4" alt="SheepBox home screen from 1.1.0 RC4" width="49%" />
  <img src="assets/screenshot-on-demand.jpg?v=1.1.0-rc4" alt="SheepBox On Demand screen from 1.1.0 RC4" width="49%" />
</p>

Screenshots show **1.1.0 - RC4**; the provider list below includes **1.7.0 stable features**.

## Features

| Feature | What you get |
|---|---|
| Live TV | Live TV Simple's channel-logo grid with My Stations, News, Local, Entertainment and Sports; Live TV Complete with provider, country and genre menus |
| TV guide | A six-hour program grid, provider schedules where available, Now / Next and optional international guide sources |
| On Demand | DOCUMENTARY+ Movies & Shows in1.8.0-RC6; FlixHouse Movies & Shows in 1.8.0-RC5 and RetroCrush On Demand from RC4; Canela.TV Movies & Shows in 1.8.0-RC3; NFB Films & Collections from RC2; NewsON recent newscasts/clips from RC1; movies and shows from Pluto TV, Roku, Xumo, Tubi, Sling Freestream, Fawesome, Local Now, STIRR, FilmRise, Shout! TV, TCLtv+, wedotv, Cineverse and the Internet Archive; Plex, Filmzie, The CW and Free Live Sports |
| Consistent browsing | Shared cards, Play/Episodes and Favorite actions, unique title counts beside categories (+ means incomplete), search, A–Z ordering and first-open catalog progress |
| Seasons & episodes | Shared show screen with descriptions, seasons, episodes and optional autoplay |
| Recording & DVR | Record supported live streams now or schedule from the guide; manage recordings on the box or a USB drive. Protected streams and unsupported ad-managed sources cannot be recorded |
| Archive 24/7 | Always-on collection channels assembled from public-domain / Creative Commons films and classic TV |
| Search & favorites | Global and provider search, favorites, Continue Watching and resume |
| TV remote controls | Clear yellow focus, labelled icons, 15-second skip and hold-to-seek |
| Automatic updates | Startup checks, optional test versions, verified downloads and Android installation confirmation |

VOD catalogs load when opened and use local metadata caches. Reload refreshes them; providers and regions can change what is available. FilmRise uses bounded initial-load batches and alternate sort orders to retrieve more titles, deduplicates stable IDs, and resumes interrupted loads from completed batches. True Crime now has all 251 movie titles. Some largest guest categories remain incomplete and show lower-bound + counts; Reload can retry. FilmRise service checks passed for catalog discovery, movie/episode primary HLS manifests and ad schedules; physical-TV picture, audio, captions, remote navigation and complete ad breaks still need device testing.

## Zeam in 1.4.0

Zeam On Demand opens to an All Videos grid with Play/Favorite cards, search and unique category counts. It loads hosted episodes from show/season collections as well as legacy VOD recordings. Categories come from Zeam's featured-publisher collections, including Comedy, Entertainment, Sports, True Crime and Destinations. Publisher filtering is optional and excludes sources with no supported videos.

The first opening builds a local metadata cache with progress; later visits open from that cache. Reload refreshes the directory and retries failed sources. Repeated featured shows are deduplicated by stable content identity. Broadcasts display their station and air date, and episodes use their own artwork where available. Partial loads retain completed work and mark loaded counts with +.

Native playback, provider ads, seeking, resume and history are included. RC6 was confirmed by the user before promotion to stable. Dedicated season navigation, autoplay and saved caption preferences remain future work.

## Providers

**Live TV:** IPTV-org, Pluto TV, Samsung TV Plus, LG Channels, Plex, Roku Channel, Tubi, Xumo, Sling Freestream, YuppTV Free, Fawesome, Local Now, STIRR, Zeam, Shout! TV, TCLtv+, wedotv and Cineverse, The CW and Free Live Sports; NewsON from 1.8.0-RC1, Canela.TV from RC3 FlixHouse from RC5 and DOCUMENTARY+ from RC6 test releases.

**On Demand:** Pluto TV, Roku Channel, Xumo, Tubi, Sling Freestream, Fawesome, Local Now, STIRR, FilmRise, Shout! TV, TCLtv+, wedotv, Cineverse, Plex, Filmzie, The CW, Free Live Sports and the Internet Archive; NewsON, NFB, Canela.TV, RetroCrush, FlixHouse and DOCUMENTARY+ in the 1.8.0 test releases.

FilmRise and Filmzie are **VOD-only**. Plex and Filmzie Movies & Shows and The CW/Free Live Sports Live TV and Movies & Shows are included in stable 1.7.0. Internet Archive also supplies SheepBox-created 24/7 collection channels. See the [full provider matrix and limitations](PROVIDERS.md).

## Roadmap

- **Closed Captioning:** consistent controls, track/language selection and saved preferences where supported.
- **Split Screen:** multiple supported streams, remote-friendly pane selection and audio controls.
- **Additional Providers:** continued research and integrations for free, account-free Live TV and VOD.

These are planned features, without committed dates. See [ROADMAP.md](ROADMAP.md) for scope and the provider research queue.

## Install and update

1. Allow installs from your chosen downloader or file manager in the TV's Android settings.
2. Download the APK from [1.7.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.7.0), or browse [all releases](https://github.com/sheepman90s/sheepbox-releases/releases).
3. Open the APK and follow Android's installation prompts.
4. Start SheepBox. It checks the connection and loads live channels; each On Demand catalog builds when first opened.

For in-app updates: **Settings > App updates > Check now > Update now**. Test versions are optional. Downloads are checked for the same package, a newer version and the established signing key before Android's installer opens. Keep the existing app installed to retain settings and favorites.

Signing certificate SHA-256: `a8ee97fd44e560a1b2921ce87e73a9e76b22a336de1bfc0f5723d846b693acff`

## Free streams and availability

SheepBox plays providers' free, ad-supported streams, IPTV-org free-to-air channel lists, and public-domain / Creative Commons collections from the Internet Archive. It hosts no streaming service, does not bypass subscriptions or DRM, and retains provider advertising. Recordings of supported streams can be stored locally.

SheepBox is independent and is not affiliated with these providers. Availability varies by region and device; unofficial integrations can change. Report problems through [GitHub issues](https://github.com/sheepman90s/sheepbox-releases/issues).

© 2026 [sheepman90s](https://github.com/sheepman90s)

Roku on-demand in RC3 also uses Roku's new canonical API hostname, fixing playback requests that previously redirected to an HTML response instead of JSON.

RC4 refines World View with automatic country zoom and highlighted outlines, direct camera lists, vertical webcam country navigation, and square button styling throughout the app, including On Demand. A limited touch-mode focus fix prevents repeated unsolicited playback controls. Roku VOD playback was confirmed working by the user.

RC5 adds on-demand NASA country-detail terrain with saved fallback and makes the globe display-only. The country picker controls its position, toolbar buttons control zoom, and pill-shaped toolbar buttons have matching yellow focus outlines. Home icons are smaller and closer together. Reported AMC/Bosnia streams were reviewed; no verified replacements were found for the failing upstream sources.

RC6 adds “Loading GIS Data for World View…” as the final startup step, with download progress, persistent terrain files and a Continue option. Saved countries are reused and missing downloads resume next startup. World View pills now use one yellow focus border; the rest of the app keeps its existing buttons while this preview is tested. Mainland outlines and labels are corrected for Australia, Brazil, France and Kazakhstan.

RC7 moves terrain preparation to opening World View, with progress, persistent cache reuse and Continue/Home options. Normal app startup no longer downloads terrain. The approved pill style now covers navigation, catalog actions, dialogs, Home icons and native playback controls, using a single yellow focus border. Web Cams country rows are narrower and retain their alphabetical order and counts.
