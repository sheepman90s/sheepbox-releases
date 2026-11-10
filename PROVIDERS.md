# Supported providers

Available in **SheepBox 1.2.0 - RC6** ([release and APK](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.2.0-RC6)). Availability, catalogs and playback vary by region and device.

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
| FilmRise | Not implemented | Movies & shows; added in RC6 |
| Internet Archive | SheepBox-created 24/7 collection channels | Public-domain / Creative Commons films, classic TV & shorts |

“Live TV” describes the lineup available in SheepBox; it does not imply that every provider uses the same integration or supports every channel. Internet Archive 24/7 channels are assembled from its collections, rather than a standalone broadcaster lineup.

All On Demand providers use shared title cards, Play/Episodes and Favorite actions, category totals, search and cached browsing. Movies and shows are counted separately, with duplicate titles removed within each total. Catalogs load when opened, rather than at app startup.

Plex VOD remains unimplemented because the investigated guest authorization path is unavailable. FilmRise is VOD-only; no standalone live lineup has been verified. Account-requiring Google Freeplay and Prime/Freevee are outside the current provider plan.

FilmRise's current service check verified 1,829 movies, 818 shows and 93 categories, plus fresh primary movie/episode manifests and ad schedules. These are a dated service snapshot, not guaranteed catalog sizes or proof of physical-TV playback and ad delivery.

See the [roadmap](ROADMAP.md) for future work.
