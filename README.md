<div align="center">

<img src="assets/sheepbox-banner.png" alt="SheepBox purple-curtain artwork and popcorn sheep mascot" width="640" />

# SheepBox TV and VOD

**Free live TV and free movies & shows. One app, one remote.**

[Website](https://sheepman90s.github.io/sheepbox-releases/) · [Downloads](https://github.com/sheepman90s/sheepbox-releases/releases) · [Supported providers](PROVIDERS.md) · [Roadmap](ROADMAP.md)

</div>

**Current test release: [1.2.0 - RC6](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.2.0-RC6), version code 136.** Adds FilmRise VOD, title totals beside all On Demand categories, and the restored IPTV-org United States flag. To receive RC6 in the app, enable **Settings > App updates > Include test versions**, then **Check now > Update now**. The regular release channel is unchanged.

<p align="center">
  <img src="assets/screenshot-home.jpg?v=1.1.0-rc4" alt="SheepBox home screen from 1.1.0 RC4" width="49%" />
  <img src="assets/screenshot-on-demand.jpg?v=1.1.0-rc4" alt="SheepBox On Demand screen from 1.1.0 RC4" width="49%" />
</p>

Screenshots show **1.1.0 - RC4**; the provider list below reflects **1.2.0 - RC6**.

## Features

| Feature | What you get |
|---|---|
| Live TV | Live TV Simple's channel-logo grid with My Stations, News, Local, Entertainment and Sports; Live TV Complete with provider, country and genre menus |
| TV guide | A six-hour program grid, provider schedules where available, Now / Next and optional international guide sources |
| On Demand | Movies and shows from Pluto TV, Roku, Xumo, Tubi, Sling Freestream, Fawesome, Local Now, STIRR, FilmRise and the Internet Archive |
| Consistent browsing | Shared cards, Play/Episodes and Favorite actions, unique title totals beside categories, search, A–Z ordering and first-open catalog progress |
| Seasons & episodes | Shared show screen with descriptions, seasons, episodes and optional autoplay |
| Recording & DVR | Record supported live streams now or schedule from the guide; manage recordings on the box or a USB drive. Protected streams and unsupported ad-managed sources cannot be recorded |
| Archive 24/7 | Always-on collection channels assembled from public-domain / Creative Commons films and classic TV |
| Search & favorites | Global and provider search, favorites, Continue Watching and resume |
| TV remote controls | Clear yellow focus, labelled icons, 15-second skip and hold-to-seek |
| Automatic updates | Startup checks, optional test versions, verified downloads and Android installation confirmation |

VOD catalogs load when opened and use local metadata caches. Reload refreshes them; providers and regions can change what is available. FilmRise service checks passed for catalog discovery, movie/episode primary HLS manifests and ad schedules; physical-TV picture, audio, captions, remote navigation and complete ad breaks still need device testing.

## Providers

**Live TV:** IPTV-org, Pluto TV, Samsung TV Plus, LG Channels, Plex, Roku Channel, Tubi, Xumo, Sling Freestream, YuppTV Free, Fawesome, Local Now and STIRR.

**On Demand:** Pluto TV, Roku Channel, Xumo, Tubi, Sling Freestream, Fawesome, Local Now, STIRR, FilmRise and the Internet Archive.

FilmRise is **VOD-only**. Plex VOD is not implemented. Internet Archive also supplies SheepBox-created 24/7 collection channels. See the [full provider matrix and limitations](PROVIDERS.md).

## Roadmap

- **Closed Captioning:** consistent controls, track/language selection and saved preferences where supported.
- **Split Screen:** multiple supported streams, remote-friendly pane selection and audio controls.
- **Additional Providers:** continued research and integrations for free, account-free Live TV and VOD.

These are planned features, without committed dates. See [ROADMAP.md](ROADMAP.md) for scope and the provider research queue.

## Install and update

1. Allow installs from your chosen downloader or file manager in the TV's Android settings.
2. Download the APK from [RC6](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.2.0-RC6), or browse [all releases](https://github.com/sheepman90s/sheepbox-releases/releases).
3. Open the APK and follow Android's installation prompts.
4. Start SheepBox. It checks the connection and loads live channels; each On Demand catalog builds when first opened.

For in-app test updates: **Settings > App updates > Include test versions > Check now > Update now**. Downloads are checked for the same package, a newer version and the established signing key before Android's installer opens. Keep the existing app installed to retain settings and favorites.

Signing certificate SHA-256: `a8ee97fd44e560a1b2921ce87e73a9e76b22a336de1bfc0f5723d846b693acff`

## Free streams and availability

SheepBox plays providers' free, ad-supported streams, IPTV-org free-to-air channel lists, and public-domain / Creative Commons collections from the Internet Archive. It hosts no streaming service, does not bypass subscriptions or DRM, and retains provider advertising. Recordings of supported streams can be stored locally.

SheepBox is independent and is not affiliated with these providers. Availability varies by region and device; unofficial integrations can change. Report problems through [GitHub issues](https://github.com/sheepman90s/sheepbox-releases/issues).

© 2026 [sheepman90s](https://github.com/sheepman90s)
