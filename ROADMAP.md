# SheepBox roadmap

Planned work after stable [1.2.0](https://github.com/sheepman90s/sheepbox-releases/releases/tag/v1.2.0). The next test cycle starts at 1.3.0-RC1. These are future features, with no committed release dates.

| Feature | Status | Scope |
|---|---|---|
| Closed Captioning | Planned | Consistent caption controls across Live TV and On Demand, language/track selection, and saved preferences where providers supply supported captions. Existing provider subtitle support will be extended into a consistent experience. |
| Split Screen | Planned | Explore watching multiple supported streams at once, with remote-friendly pane selection, layout controls and a choice of which stream supplies audio. Device decoding capacity, provider ads and DRM support need validation. |
| Additional Providers | Ongoing | Research and integrate more free, account-free Live TV and VOD providers, using the shared browsing, favorites, search and playback experience. |

## Additional provider candidates

The reconstructed research queue is **Zeam**, **Shout! TV's free guest subset**, **TCLtv+**, **wedotv** and **Cineverse**. **DistroTV** remains on hold pending verification of a working replacement for its legacy endpoint. This is a research shortlist, not a list of supported integrations or guaranteed additions.

Each candidate needs a working guest catalog and playback path, normal regional availability, provider advertising support and device validation. We will not bypass accounts, subscriptions or DRM. Plex VOD remains blocked by its unavailable investigated guest authorization path. Google-account Freeplay and Prime/Freevee are excluded from the current plan.

## Already delivered in 1.2.0

- FilmRise Movies & Shows, following STIRR and Local Now.
- Bounded, resumable initial FilmRise category batches; unverified coverage retains + counts.
- Unique title totals beside On Demand categories.
- Restored IPTV-org United States flag after provider merges.

See [supported providers](PROVIDERS.md) for the current Live TV / On Demand matrix. Planned features above are not advertised as available today.
