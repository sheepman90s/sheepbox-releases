# SheepBox roadmap

Planned work after stable [1.7.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.7.0). These features have no committed release dates.

| Feature | Status | Scope |
|---|---|---|
| Closed Captioning | Planned | Consistent caption controls across Live TV and On Demand, language/track selection, and saved preferences where providers supply supported captions. Existing provider subtitle support will be extended into a consistent experience. |
| Split Screen | Planned | Explore watching multiple supported streams at once, with remote-friendly pane selection, layout controls and a choice of which stream supplies audio. Device decoding capacity, provider ads and DRM support need validation. |
| Additional Providers | Ongoing | Research and integrate more free, account-free Live TV and VOD providers, using the shared browsing, favorites, search and playback experience. |

## Available in1.8.0-RC6

- Adds DOCUMENTARY+ Movies & Shows and four live channels with guide in All Channels A–Z. Current guest snapshot:270 movies,38 shows/291 eligible episodes. Includes categorized caching, search/favorites, resume/autoplay and native playback with provider ads. Includes FlixHouse, RetroCrush, Canela.TV, NFB and NewsON.
- 522 regression tests, zero-error lint, signed/instrumentation builds and standard CI passed. Android23 passed; each of two Android35 runs passed6/7 with intermittent provider HTTP500/504 errors. All tested playback paths succeeded across runs, but neither full native run was green.
- Enable Include test versions to try [RC6](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC6). Provider server errors may require Retry.

## Available in 1.8.0-RC5

- FlixHouse Movies & Shows and Live TV/guide: current US guest catalog has 2,078 movies, 14 shows/168 eligible episodes, and 11 native live channels in All Channels A–Z.
- Categorized metadata caching, search/favorites, history/resume/autoplay, captions and native playback with provider ads. The first catalog load may take several minutes.
- Includes RetroCrush, Canela.TV, NFB and NewsON. Enable Include test versions to try [RC5](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC5).
- All 501 regression tests, zero-error lint, signed/instrumentation builds and six Android native checks passed. Actual ads completed before decoded movie, episode and live content; physical-TV feedback remains pending.

## Available in 1.8.0-RC4

- RetroCrush On Demand: free guest episodes within mixed-access shows, categorized caching, search/favorites, history/resume/autoplay and native playback with provider advertising. VOD only; Premium/account-only offers remain excluded.
- Includes Canela.TV, NFB and NewsON. Enable Include test versions to try [RC4](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC4).
- All 482 regression tests, zero-error lint, signed/instrumentation assembly and three Android35 native checks passed. Physical-TV feedback and ad fill/completion remain unverified.

## Available in 1.8.0-RC3

- Canela.TV Live TV/guide and Movies & Shows: free regional titles, cached category browsing, search/favorites, full seasons/episodes, resume/autoplay and native playback with provider advertising and required guest-session renewal.
- Includes NFB and NewsON from the earlier test releases. Enable Include test versions in App updates to try [RC3](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC3).
- 469 regression tests, zero-error lint, signed assembly, four Android37 native checks and all three GitHub CI workflows passed. Native movie/episode checks observed real inserted ads followed by decoded content; physical-TV feedback remains pending.

## Available in 1.8.0-RC2

- NFB Films & Collections: free regional films and eligible collections/series, genre/language browsing, metadata caching, search/favorites, episodes, resume/autoplay and native HLS/manifest captions. VOD only; regional availability applies.
- Includes NewsON Live TV and Recent Newscasts & Clips from RC1. Enable Include test versions in App updates to try [RC2](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.8.0-RC2).
- 450 regression tests, zero-error lint, signed assembly, four Android37 native checks and all three GitHub CI workflows passed. NFB also received positive user device feedback.

## Delivered in 1.5.0 stable

- User-tested RC6 promoted to 1.5.0, version code 162.
- Shout! TV and TCLtv+ integrations, TCLtv+ stream URL fixes, alphabetical Live TV providers, catalog recovery and duplicate movie-category cleanup.
- Regional and guest-access restrictions apply; full advertising-pod validation remains pending.

## Delivered in 1.4.0 stable

- User-confirmed RC6 promoted to stable, including the World View GIS loading percentage.

### Included from RC5

- Zeam All Videos cards with Play/Favorite, real provider categories, unique counts and persistent metadata caching.
- Hosted show/season episode discovery alongside legacy VOD recordings, with stable-ID deduplication.
- Native guest episode playback with provider prerolls and watched-content midroll timing.
- Dedicated season navigation, autoplay and saved caption preferences remain future work.

## Delivered in 1.4.0 RC4

- D-pad navigation between native Zeam playback and the toolbar.
- Removed duplicate All Channels while preserving Local News, Nearby and all stations.

## Delivered in 1.4.0 RC3

- Native Media3 playback for Zeam live TV and featured-publisher VOD.
- Provider IMA advertising, VOD ad schedules, seeking, resume and watch history.
- Native content/ad playback and lifecycle checks passed on Android 10 and 14 emulators. RC6 was subsequently confirmed by the user before the stable release.
- Show/episode discovery was delivered in RC5; dedicated season navigation, autoplay and saved caption preferences remain future work.

## Delivered in 1.4.0 RC1

- Zeam guest live stations, guide, search and favorites.
- Zeam featured-publisher On Demand browsing with shared Play/Favorite cards and loaded title counts.
- Initial official Zeam website playback, superseded by native playback in 1.4.0 RC3.
- World View country list rendering correction, reproduced and verified on Android 10 with an Android 14 comparison.

## Additional provider candidates

Shout! TV and TCLtv+ are included in 1.5.0 stable; wedotv and Cineverse in 1.6.0 stable; Plex Movies & Shows, Filmzie, The CW and Free Live Sports in 1.7.0 stable. NewsON, NFB, Canela.TV, RetroCrush and FlixHouse are included in the 1.8.0 test releases. Further provider research includes additional Famelack / TV.Garden feeds. **DistroTV** remains on hold pending verification of a working replacement for its legacy endpoint. Remaining research candidates are not guaranteed additions.

Each candidate needs a working guest catalog and playback path, normal regional availability, provider advertising support and device validation. We will not bypass accounts, subscriptions or DRM. Google-account Freeplay and Prime/Freevee are excluded from the current plan.

## Famelack / TV.Garden

Added November 10, 2026. [Official site](https://famelack.com/) and [official public dataset](https://github.com/famelack/famelack-data).

| Area | Findings | Status |
|---|---|---|
| Live TV | Primarily IPTV-org. Of 6,910 TV records, 5,518 match SheepBox's IPTV-org stream URLs and another 249 match names; 1,143 are unmatched candidates, with possible overlap in other providers. | Research; no additional TV feeds implemented |
| Web Cams | 3,915 cameras in 93 countries, including 1,483 in the US; 20 thematic categories. All current entries use YouTube embeds rather than direct stream URLs. | [1.3.0-RC7 test release](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.3.0-RC7); country-first browsing, local category counts, offline directory fallback and in-app YouTube playback |
| Radio | Independent curated radio directory. | Research only |

World View is the fifth Home choice in RC3, with a native interactive Earth globe, remote controls, country search and existing Live TV / Web Cams playback routes. Home menu items are smaller to fit five choices. RC3 also appends confidently matched HTTPS HLS backups to existing direct-stream channels; primaries, favorites, guide mappings and regional feed IDs are preserved. Names alone never establish a match, and ambiguous/session-provider matches are skipped. This feature is not in stable 1.2.0. Webcam playback and TV remote operation need device validation. Counts are a dataset snapshot, not verified new playable channels. The Famelack MIT license must be retained when reusing its data.

### Jamaica follow-up

The current Famelack dataset has **6 TV entries, 22 radio stations and 8 webcams** for Jamaica. Five TV stream URLs match SheepBox's IPTV-org input; the additional TV entry is **Sydenham S.D.A Church**, via YouTube. All 22 radio stations returned audio or HLS data in bounded service checks. The eight webcam listings are already in the 1.3.0-RC1 camera browser. No additional TV or radio feeds were implemented in this review.

The preliminary candidate count below has been superseded by the full video-only audit.

### Comprehensive video audit (radio excluded)

Compared all **6,910 TV records / 8,320 video source links** against all 13 SheepBox live-provider inputs, including a fresh Sling guest catalog. Also checked all **3,915 webcam video IDs**; all are represented in Web Cams.

| TV record classification | Count |
|---|---:|
| Every listed link already represented | 5,365 |
| Exact known channel, with additional links | 208 |
| Existing name, different links | 385 |
| Potential new identity requiring review | 922 |
| Possible excluded identity | 30 |

Of 808 eligible unrepresented direct URLs checked, 745 returned HLS playlists and 643 showed explicit video-track information. These checks do not establish full playback or 922 genuinely new channels; 208 candidates have possible name aliases. Thirty excluded-identity cases remain out of automatic import.

The requested next step is to append verified alternate direct streams to existing non-session channels, preserving primary streams, IDs, favorites and guide mappings. Ambiguous regional/name matches, new channels and YouTube TV entries stay separate.

## Already delivered in 1.2.0

- FilmRise Movies & Shows, following STIRR and Local Now.
- Bounded, resumable initial FilmRise category batches; unverified coverage retains + counts.
- Unique title totals beside On Demand categories.
- Restored IPTV-org United States flag after provider merges.

See [supported providers](PROVIDERS.md) for the current Live TV / On Demand matrix. Planned features above are not advertised as available today.

RC4 refines World View with automatic country zoom and highlighted outlines, direct camera lists, vertical webcam country navigation, and square button styling throughout the app, including On Demand. A limited touch-mode focus fix prevents repeated unsolicited playback controls. Roku VOD playback was confirmed working by the user.

RC5 adds on-demand NASA country-detail terrain with saved fallback and makes the globe display-only. The country picker controls its position, toolbar buttons control zoom, and pill-shaped toolbar buttons have matching yellow focus outlines. Home icons are smaller and closer together. Reported AMC/Bosnia streams were reviewed; no verified replacements were found for the failing upstream sources.

RC6 adds “Loading GIS Data for World View…” as the final startup step, with download progress, persistent terrain files and a Continue option. Saved countries are reused and missing downloads resume next startup. World View pills now use one yellow focus border; the rest of the app keeps its existing buttons while this preview is tested. Mainland outlines and labels are corrected for Australia, Brazil, France and Kazakhstan.

RC7 moves terrain preparation to opening World View, with progress, persistent cache reuse and Continue/Home options. Normal app startup no longer downloads terrain. The approved pill style now covers navigation, catalog actions, dialogs, Home icons and native playback controls, using a single yellow focus border. Web Cams country rows are narrower and retain their alphabetical order and counts.
