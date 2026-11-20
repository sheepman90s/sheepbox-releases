# Supported providers

The first table describes **[1.9.0 stable](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.9.0)**. **[2.0.0-RC6](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v2.0.0-RC6)** includes those providers and the additions in the second table. Enable **Settings > App updates > Include test versions** for RC6.

Availability depends on region, device and the publisher's current free offer. A supported provider does not guarantee every channel, title or playback feature.

## Android stable

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

## Android test release additions

| Provider | Live TV | On Demand |
|---|---|---|
| Philo Free | Free channels | Free movies & shows; native playback |
| FreeTV | Guest regional channels and guide | Free movies & shows; native playback |
| PBS | — | Free regional episodes, including Popular shows; Passport excluded |
| Revry | Two guest channels and guide | Free movies, shows, episodes and clips; premium offers excluded |
| BYUtv | — | Audited US/English guest videos; live, account-gated, future-only and BYUradio offers excluded |

RC6 also improves startup update prompts, globe selection and controls, PBS Popular shows, the Philo free library and device settings. BYUtv's dated US/English audit covers 8,581 guest videos in 150 show groups and 145 movie/standalone entries. Catalogues and access can change after an audit.

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

[SheepBox Web](https://sheepman90s.github.io/sheepbox-releases/watch/) has its own browser-compatible catalogue. Coverage differs from Android and some selections are partial. Philo, Fawesome and Roku open official players in another tab; return to SheepBox to continue browsing. Other sources use supported direct or embedded playback. Browser, account and region requirements are determined by the publisher.

Provider additions are paused while we test and improve 2.0. See the [roadmap](ROADMAP.md) or [report a problem](https://github.com/sheepman90s/sheepbox-releases/issues).
