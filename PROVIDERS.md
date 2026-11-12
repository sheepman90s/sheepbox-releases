# Supported providers

The stable release is **SheepBox 1.7.0/code175** ([release and APK](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.7.0)). Includes Plex and Filmzie Movies & Shows plus The CW and Free Live Sports Live TV and Movies & Shows. Test versions do not need to be enabled. Availability, catalogs and playback vary by region and device.

| Provider | Live TV | On Demand |
|---|---|---|
| IPTV-org | Free-to-air channel lists by country and genre | — |
| Pluto TV | Yes | Movies & shows |
| Samsung TV Plus | Yes | — |
| LG Channels | Yes | — |
| Plex | Yes | Movies & shows in 1.7.0 stable |
| Roku Channel | Yes | Movies & shows |
| Tubi | Yes | Movies & shows |
| Xumo | Yes | Movies & shows |
| Sling Freestream | Yes | Free movies & shows |
| YuppTV Free | Free lineup | — |
| Fawesome | Yes | Movies & shows |
| Local Now | Yes | Movies & shows |
| STIRR | Yes | Movies & shows |
| Zeam | Guest stations and guide; native Media3/IMA | Hosted show episodes and VOD recordings; categories/counts, Play/Favorite, native playback and resume |
| Shout! TV | Free guest lineup | Free guest movies and shows; availability varies |
| TCLtv+ | Free guest lineup and guide | Movies by category |
| wedotv | Free guest lineup | Movies & shows |
| Cineverse | All Channels A-Z | Movies & shows |
| Filmzie | — | Guest movies & shows in 1.7.0 stable |
| The CW | Guest lineup and guide in 1.7.0 stable | Guest Movies & Shows with native Widevine/IMA in 1.7.0 stable |
| Free Live Sports | Guest sports lineup and guide in 1.7.0 stable | Guest Movies & Shows with native HLS/IMA in 1.7.0 stable |
| FilmRise | Not implemented | Movies & shows; added in RC6 |
| NewsON | Guest live/AlwaysON stations and current programme metadata in 1.8.0-RC1 test releases | Recent newscasts and clips by state/station in 1.8.0-RC1 test releases |
| NFB | No | Free regional Films & Collections, cached genre/language browsing, native HLS/captions, episodes and resume/autoplay in 1.8.0-RC2 test releases |
| Canela.TV | Guest regional lineup/guide with native playback and session renewal in 1.8.0-RC3 test releases | Free Movies & Shows, cached browsing, full episodes, search/favorites, resume/autoplay and provider advertising in 1.8.0-RC3 test releases |
| Internet Archive | SheepBox-created 24/7 collection channels | Public-domain / Creative Commons films, classic TV & shorts |

“Live TV” describes the lineup available in SheepBox; it does not imply that every provider uses the same integration or supports every channel. Internet Archive 24/7 channels are assembled from its collections, rather than a standalone broadcaster lineup.

All On Demand providers use shared title cards, Play/Episodes and Favorite actions, category counts, search and cached browsing. Movies and shows are counted separately, with duplicate titles removed within each count. FilmRise counts with + are lower bounds because its guest service has returned only part of those categories. Catalogs load when opened, rather than at app startup.

Plex Movies & Shows use a fresh anonymous guest session, categorized catalog caching, native IMA and standard Android Widevine. Filmzie Movies & Shows use the public guest catalog, native HLS and unchanged IMA schedules; no Filmzie Live TV catalog is integrated. FilmRise is VOD-only; no standalone live lineup has been verified. Account-requiring Google Freeplay and Prime/Freevee are outside the current provider plan.

FilmRise's 1.2.0 service check verified 4,579 movies, 818 shows and 93 categories, including all 251 True Crime movie titles. Three categories remain provider-limited and use + counts; the overall movie count is a lower bound. Initial-load batches use alternate sort orders to retrieve additional free titles and resume completed work; All New Arrivals returned 3,231 distinct free movies. The app cannot claim a complete FilmRise catalog. Fresh primary movie/episode manifests and ad schedules passed. These are a service snapshot, not guaranteed catalog sizes or proof of physical-TV playback and ad delivery.

See the [roadmap](ROADMAP.md) for future work.

## Zeam in 1.4.0

Zeam On Demand opens to an All Videos grid with Play/Favorite cards, search and unique category counts. It loads hosted episodes from show/season collections as well as legacy VOD recordings. Categories come from Zeam's featured-publisher collections, including Comedy, Entertainment, Sports, True Crime and Destinations. Publisher filtering is optional and excludes sources with no supported videos.

The first opening builds a local metadata cache with progress; later visits open from that cache. Reload refreshes the directory and retries failed sources. Repeated featured shows are deduplicated by stable content identity. Broadcasts display their station and air date, and episodes use their own artwork where available. Partial loads retain completed work and mark loaded counts with +.

Native playback supports seeking, resume and watch history. Hosted episodes use provider IMA prerolls and midrolls after eight minutes of watched content; pauses, ads and large seek jumps do not advance that clock. The catalog covers hosted content discovered through the featured publisher directory, not every video format or page on Zeam. Dedicated season navigation, autoplay and saved caption preferences remain future work. Recording remains unavailable.

The [1.4.0 stable release](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.4.0) uses version code 155 and includes the user-confirmed RC6 changes. Catalogs, ads and availability vary by region and device.

## Web Cams and World View

SheepBox 1.3.0 includes country-first Famelack Web Cams and a native World View globe as the fifth Home choice. Native browsing supports local categories and counts, search and favorites; playback uses YouTube's official player inside SheepBox. The investigated directory contains 3,915 cameras across 93 countries, with 20 thematic categories. These are YouTube embeds, not additional IPTV-org TV channels. Cameras may be offline or disallow embedding. Physical-TV testing is still needed. The test build also appends supported HLS backups to existing direct-stream channels using exact original-URL and country matches, preserving primaries and guide mappings. Ambiguous matches and native session providers are excluded. See the [research chart](ROADMAP.md#famelack--tvgarden).

Roku on-demand in RC3 also uses Roku's new canonical API hostname, fixing playback requests that previously redirected to an HTML response instead of JSON.

RC4 refines World View with automatic country zoom and highlighted outlines, direct camera lists, vertical webcam country navigation, and square button styling throughout the app, including On Demand. A limited touch-mode focus fix prevents repeated unsolicited playback controls. Roku VOD playback was confirmed working by the user.

RC5 adds on-demand NASA country-detail terrain with saved fallback and makes the globe display-only. The country picker controls its position, toolbar buttons control zoom, and pill-shaped toolbar buttons have matching yellow focus outlines. Home icons are smaller and closer together. Reported AMC/Bosnia streams were reviewed; no verified replacements were found for the failing upstream sources.

RC6 adds “Loading GIS Data for World View…” as the final startup step, with download progress, persistent terrain files and a Continue option. Saved countries are reused and missing downloads resume next startup. World View pills now use one yellow focus border; the rest of the app keeps its existing buttons while this preview is tested. Mainland outlines and labels are corrected for Australia, Brazil, France and Kazakhstan.

RC7 moves terrain preparation to opening World View, with progress, persistent cache reuse and Continue/Home options. Normal app startup no longer downloads terrain. The approved pill style now covers navigation, catalog actions, dialogs, Home icons and native playback controls, using a single yellow focus border. Web Cams country rows are narrower and retain their alphabetical order and counts.
