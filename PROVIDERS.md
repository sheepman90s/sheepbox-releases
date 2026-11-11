# Supported providers

Stable providers are available in **SheepBox 1.3.0** ([release and APK](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.3.0)). The Zeam row describes the **1.4.0 RC1 test release**. Availability, catalogs and playback vary by region and device.

| Provider | Live TV | On Demand |
|---|---|---|
| IPTV-org | Free-to-air channel lists by country and genre | — |
| Pluto TV | Yes | Movies & shows |
| Samsung TV Plus | Yes | — |
| LG Channels | Yes | — |
| Plex | Yes | Not implemented |
| Roku Channel | Yes | Movies & shows |
| Tubi | Yes | Movies & shows |
| Xumo | Yes | Movies & shows |
| Sling Freestream | Yes | Free movies & shows |
| YuppTV Free | Free lineup | — |
| Fawesome | Yes | Movies & shows |
| Local Now | Yes | Movies & shows |
| STIRR | Yes | Movies & shows |
| Zeam (1.4.0 RC1 test release) | Guest stations and guide; official in-app player | Featured publisher videos with Play/Favorite and search; official in-app player |
| FilmRise | Not implemented | Movies & shows; added in RC6 |
| Internet Archive | SheepBox-created 24/7 collection channels | Public-domain / Creative Commons films, classic TV & shorts |

“Live TV” describes the lineup available in SheepBox; it does not imply that every provider uses the same integration or supports every channel. Internet Archive 24/7 channels are assembled from its collections, rather than a standalone broadcaster lineup.

All On Demand providers use shared title cards, Play/Episodes and Favorite actions, category counts, search and cached browsing. Movies and shows are counted separately, with duplicate titles removed within each count. FilmRise counts with + are lower bounds because its guest service has returned only part of those categories. Catalogs load when opened, rather than at app startup.

Plex VOD remains unimplemented because the investigated guest authorization path is unavailable. FilmRise is VOD-only; no standalone live lineup has been verified. Account-requiring Google Freeplay and Prime/Freevee are outside the current provider plan.

FilmRise's 1.2.0 service check verified 4,579 movies, 818 shows and 93 categories, including all 251 True Crime movie titles. Three categories remain provider-limited and use + counts; the overall movie count is a lower bound. Initial-load batches use alternate sort orders to retrieve additional free titles and resume completed work; All New Arrivals returned 3,231 distinct free movies. The app cannot claim a complete FilmRise catalog. Fresh primary movie/episode manifests and ad schedules passed. These are a service snapshot, not guaranteed catalog sizes or proof of physical-TV playback and ad delivery.

See the [roadmap](ROADMAP.md) for future work.

## Zeam in 1.4.0 RC1

The [1.4.0 RC1 test release](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.4.0-RC1) adds Zeam guest stations and per-channel guides to Live TV, search and favorites. On Demand discovers featured publishers and loads their guest video lists. The current guest catalog check returned 409 stations, with availability applied by Zeam's official player. Counts change with the service.

Playback runs the official Zeam page inside SheepBox for provider authorization, ads and regional checks. Native resume/history, autoplay and caption settings remain pending. Recording is unavailable. Physical-TV picture, audio, ads, fullscreen and D-pad behavior need device testing.

## Web Cams and World View

SheepBox 1.3.0 includes country-first Famelack Web Cams and a native World View globe as the fifth Home choice. Native browsing supports local categories and counts, search and favorites; playback uses YouTube's official player inside SheepBox. The investigated directory contains 3,915 cameras across 93 countries, with 20 thematic categories. These are YouTube embeds, not additional IPTV-org TV channels. Cameras may be offline or disallow embedding. Physical-TV testing is still needed. The test build also appends supported HLS backups to existing direct-stream channels using exact original-URL and country matches, preserving primaries and guide mappings. Ambiguous matches and native session providers are excluded. See the [research chart](ROADMAP.md#famelack--tvgarden).

Roku on-demand in RC3 also uses Roku's new canonical API hostname, fixing playback requests that previously redirected to an HTML response instead of JSON.

RC4 refines World View with automatic country zoom and highlighted outlines, direct camera lists, vertical webcam country navigation, and square button styling throughout the app, including On Demand. A limited touch-mode focus fix prevents repeated unsolicited playback controls. Roku VOD playback was confirmed working by the user.

RC5 adds on-demand NASA country-detail terrain with saved fallback and makes the globe display-only. The country picker controls its position, toolbar buttons control zoom, and pill-shaped toolbar buttons have matching yellow focus outlines. Home icons are smaller and closer together. Reported AMC/Bosnia streams were reviewed; no verified replacements were found for the failing upstream sources.

RC6 adds “Loading GIS Data for World View…” as the final startup step, with download progress, persistent terrain files and a Continue option. Saved countries are reused and missing downloads resume next startup. World View pills now use one yellow focus border; the rest of the app keeps its existing buttons while this preview is tested. Mainland outlines and labels are corrected for Australia, Brazil, France and Kazakhstan.

RC7 moves terrain preparation to opening World View, with progress, persistent cache reuse and Continue/Home options. Normal app startup no longer downloads terrain. The approved pill style now covers navigation, catalog actions, dialogs, Home icons and native playback controls, using a single yellow focus border. Web Cams country rows are narrower and retain their alphabetical order and counts.
