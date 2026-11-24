# Supported providers

This table describes **[2.0.0 stable](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0)**, including the providers introduced during 2.0 testing. Install or update normally; test-version opt-in is not required.

Availability depends on region, device and the publisher's current free offer. A supported provider does not guarantee every channel, title or playback feature.

## Android 2.0 stable

| Provider | Live TV | On Demand |
|---|---|---|
| IPTV-org | Free-to-air lists by country and genre | — |
| Pluto TV | Yes | Movies & shows |
| Samsung TV Plus | Yes | — |
| LG Channels | Yes | — |
| Plex | Yes | Movies & shows |
| Roku Channel | Yes | Movies & shows |
| Tubi | Yes | Movies & shows |
| Xumo | Yes | Movies & shows |
| Sling Freestream | Yes | Free movies & shows |
| YuppTV Free | Free lineup | — |
| Fawesome | Yes | Movies & shows |
| AsianCrush | — | Free movies & shows; native playback |
| Midnight Pulp | — | Free movies & shows; native playback |
| Haystack News | — | Current clip selections using the official player; not the full archive |
| Runtime | Guest regional channels and guide | Movies, series and family titles; incomplete counts marked + |
| PBS KIDS | — | Currently listed episodes, movies, clips and shows |
| Popcornflix | — | Guest movies & shows |
| Local Now | Yes | Movies & shows |
| STIRR | Yes | Movies & shows |
| Zeam | Guest stations and guide | Featured-publisher hosted episodes and VOD recordings |
| Shout! TV | Free guest lineup | Free guest movies & shows |
| TCLtv+ | Free guest lineup and guide | Movies by category |
| wedotv | Free guest lineup | Movies & shows |
| Cineverse | All Channels A–Z | Movies & shows |
| Filmzie | — | Guest movies & shows |
| The CW | Guest lineup and guide | Guest movies & shows |
| Free Live Sports | Guest sports lineup and guide | Guest movies & shows |
| FilmRise | — | Movies & shows; some guest categories remain incomplete |
| NewsON | Guest live and AlwaysON stations | Recent newscasts and clips by state and station |
| NFB | — | Free regional films and collections |
| Canela.TV | Guest regional lineup and guide | Free movies & shows |
| RetroCrush | — | Free guest movies and eligible show episodes |
| FlixHouse | Supported guest lineup and guide | Free guest movies and eligible episodes |
| DOCUMENTARY+ | Supported guest lineup and guide | Free movies and eligible episodes |
| Red Bull TV | Continuous sports channels and available live events | Regional films, replays, clips and series |
| NASA+ | Continuous channel; no mapped programme schedule | Standalone videos and series |
| Internet Archive | SheepBox-created collection channels | Public-domain / Creative Commons films, classic TV and shorts |
| CDNLive | Public directory and sports-channel references; native playback with in-stream ads and TV remote controls; browser popup ads omitted; manual external guide mapping; recording unavailable | — |
| Philo Free | Free channels | Free movies & shows; native playback |
| FreeTV | Guest regional channels and guide | Free movies & shows; native playback |
| PBS | — | Free regional episodes, including Popular shows; Passport excluded |
| Revry | Two guest channels and guide | Free movies, shows, episodes and clips; premium offers excluded |
| BYUtv | — | Audited US/English guest videos; live, account-gated, future-only and BYUradio offers excluded |

2.0 stable includes the World View `Channel Up/Down: zoom in/out` hint before and during globe selection. It retains native CDNLive playback and enables new EPG presets once when capacity is available, including Ukraine after the old 25-source cap. Later opt-outs and custom-feed priority are retained. It includes watched/unwatched controls for movies, complete series and episodes, and 30 guide slots with clear capacity feedback. Samsung expands to its available worldwide lineup while preserving US identities. LG regional sources may be unreachable; the US cache/fallback is retained and incomplete regions are reported. EPGTalk uses user-entered compressed custom guide links, local caching and a 12-hour refresh limit under its [published conditions](https://github.com/acidjesuz/EPGTalk#disclaimer--terms-of-use).

Record by name supports guide title/description keywords and updates as listings arrive. Record by name covers loaded guide airings and supported saved On Demand titles; watch-party chat uses a smaller panel beside the video. On Demand recording uses Pluto, Internet Archive and eligible unprotected Tubi titles through their normal players. Other providers' recording restrictions are unchanged. It retains cache cleanup, provider status, BYUtv/NASA+/NFB text parties, screensaver and webcam/guide fixes, and earlier startup, World View, PBS, Philo and device improvements. BYUtv's dated US/English audit covers 8,581 guest videos in 150 show groups and 145 movie/standalone entries. Catalogues and access can change after an audit.

## Browsing and playback limitations

- Catalogues load when opened and use saved metadata caches. Large first loads can take several minutes. Reload refreshes the provider; incomplete counts are marked **+**.
- FilmRise's guest service limits some categories. Runtime can report different publisher totals. Haystack covers current clip selections, and Zeam covers hosted content discovered through its featured-publisher directory. These are not claims of complete archives.
- FlixHouse, RetroCrush, Revry and other mixed free/paid services include only supported free offers. Publisher region, access windows, normal protection and advertising remain in force.
- Haystack uses its official player inside SheepBox and has no native history, resume or autoplay. Zeam has playback resume and history; dedicated season navigation, autoplay, saved caption preferences and recording remain unavailable there.
- Captions, seeking, resume, autoplay, guide data and recording depend on the source. Protected streams and unsupported ad-managed sources cannot be recorded. Physical-TV behavior and complete ad-break coverage vary; not every title, region or device has been tested.
- DOCUMENTARY+ can return temporary publisher errors. Some NASA+ videos have unavailable upstream sources. Refresh or retry before reporting a problem.

## Web Cams and World View

The Famelack webcam directory supports country browsing, search and favorites. Cameras use YouTube's official player and may be offline or disallow embedding. World View combines country-based camera and live-TV browsing. Required map and directory credits remain with the distributed data.

## Web preview

[SheepBox Web RC5](https://sheepman90s.github.io/sheepbox-releases/watch/) has its own browser-compatible catalogue. RC5 launch snapshot: 24,709 top-level On Demand entries, 1,248 live listings, 3,892 webcams and a 46-entry provider directory. On Demand totals include show cards; imported episodes are available inside their shows and through search. A directory entry does not necessarily have an integrated player.

| Provider | Web coverage and playback |
|---|---|
| Philo Free | Complete audited free VOD snapshot: 2,202 movies, 897 shows and 11,680 episodes, plus 159 free live channels. Opens official Philo players. Current replays, free access and region can change. |
| BYUtv | Complete audited free US/English snapshot: 145 standalone entries and 150 shows; 8,581 playable videos including episodes/extras. Opens BYUtv's official player. Live, gated and future-only offers are excluded. |
| Roku | 3,308 free movies and 2,953 parent-free show cards from the supported browse graph; not a verified whole-service total. Episodes and playback use the official Roku player. |
| Fawesome | 160 films from its complete saved This Week shelf, not the whole library. Opens official movie pages. |
| Filmzie | Complete supported public movie/series directories: 4,415 movies, 199 shows, 264 seasons and 2,221 eligible episodes. Fresh free CPM access and original advertising are checked at playback; disabled/unavailable episodes are excluded. |
| Revry | Complete audited supported free guest offer: 162 movies, 76 shows, 594 episodes, five clips and two live channels. Clear HLS and protected DASH/Widevine play here with original advertising and available captions; current free access is checked at playback. |
| PBS | Complete free full-length snapshot: 11,999 videos across 307 shows. 11,793 use the approved official embed; 206 retain exact official-page handoffs. Passport is excluded, and PBS checks current windows and region. |
| FreeTV | Complete supported US guest snapshot: 677 films, 345 playable shows, 7,687 episodes (seven standalone) and 12 live channels. Current regional rights, original advertising and normal Widevine are retained. Full publisher guide pagination is supported. |
| Runtime | Complete supported US free guest snapshot: 955 movies, 87 playable shows, 2,832 episodes (320 independently free leaves) and 29 live channels. Internal HLS playback preserves original VMAP/SSAI advertising and rechecks guest access/region. Complete paged publisher guide. |
| Red Bull / PBS KIDS | 12 selected Red Bull films; 60 permitted PBS KIDS homepage videos across 18 shows. These are explicitly scoped selections. |
| NASA+, NFB, licensed Archive, 30A, Xumo, NewsON, CW, YuppTV and curated World TV | Existing supported direct or official embedded playback. Source availability and browser restrictions apply. |
| CDNLive and other website entries | Official website links; browser playback integration remains pending. |

Philo, BYUtv, Fawesome and Roku open in another tab; return to SheepBox to continue browsing. Publisher pages own advertising, current access and account/region requirements. Other sources use supported direct or permitted embedded players. Saved catalogue counts are dated metadata, not a guarantee that every title is currently playable.

Web RC5 includes watched/unwatched filters, complete loaded-series marks, backup merge, scoped cache clearing, provider status, hide/restore, Continue watching, four color palettes and supported next episodes. Original advertising may require Play. New episodes start unwatched and watch parties keep the current title. The time-grid guide covers CW, Revry, FreeTV, Runtime and Xumo. It includes local times, day/time controls, programme details, list view and search across loaded schedules; Xumo loads every channel page for the displayed window up to seven days ahead. SheepBox Classics remains a separate labelled collection schedule. Recording/DVR and automatic browser/Android library sync remain unavailable. Saved libraries browse offline; video needs a connection.

Daily automated metadata refreshes cover PBS, FreeTV, Runtime, Revry, NASA+, Filmzie, NewsON, Xumo, CW and YuppTV. Complete traversal and ownership/region checks run before publication; failed exports retain the saved library. Other snapshots keep their original dates. Current counts and individual dates appear in the app. See [maintenance scope](maintenance/README.md).

Text watch parties synchronize NASA+ on-demand videos, including matching Android rooms. Start from a NASA+ video or choose Watch party to join. Each viewer plays their own stream; the host can transfer control, hide chat or close the room. Chat is text only, with no microphone. Room credentials stay in memory. BYUtv/NFB browser players do not currently have verified sync controls, so those parties remain Android-only.

Provider additions are paused while we maintain and improve 2.0. See the [roadmap](ROADMAP.md) or [report a problem](https://github.com/sheepman90s/sheepbox-releases/issues).
