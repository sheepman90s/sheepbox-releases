# SheepBox Android 2.1.0-RC4

Android build219 updates Retro TV to the reference's actual179 public media/weather sources, with independent SheepBox channel names and source credits. This replaces the earlier substitute Archive-theme catalogue. Meet After-School Static, The Slime Line, Mixtape Ninety, Friday Night Forever and Turbo Pursuit. Programme titles and original upstream media are retained.

The guide shows actual programme titles for at least the next three hours when the source provides coverage. Recorded stations follow their original published clock and commercial slots; Pluto guides and playback are requested normally on the viewer's Android device, with original server-side advertising. Availability can change at the source.

Knight Rider remains the separate Roku full-episode rotation on channel180. It reserves episode titles and runtimes ahead for at least three hours, retains your position and automatically plays the advertised next episode. Estimated times exclude advertising and pauses. Roku controls current free access, advertising and Widevine checks. Back returns to the guide; CH+/- returns to neighboring stations.

Source & credits identifies Internet Archive items, BackWhen-hosted material, Pluto channels and the Roku series. The [channel/source map](RETRO_CHANNEL_SOURCES.csv) lists all180 stations and public origins; programme examples are a November27 snapshot and change with the source schedules. Weather retains the reference music; its forecast API is currently failing and is labeled unavailable. Custom weather graphics are not reproduced.

## Install and test

Install over the existing signed app to retain settings and workspaces. Open **Settings > App updates**, enable **Include test versions**, then choose **Check now > Update now**. Stable2.0.0 remains GitHub Latest and the recommended stable download. [Download RC4](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC4/sheepbox-tv-vod-2.1.0-RC4-release.apk) and its [checksum](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC4/sheepbox-tv-vod-2.1.0-RC4-release.apk.sha256).

The published Web RC7 is unchanged by this Android release. In-page web music-station playback remains separate ongoing work; this release does not claim it is resolved.

## Verification and limits

964 Android unit tests,242 web/service checks and five native cases passed for the runtime. Native checks decoded reference recordings and Pluto Vevo90s, verified all18 native Pluto guides cover three hours, played Knight Rider's advertised first/next episodes, and exercised channel keys, numeric tuning, fullscreen, Back, Home and clock resynchronization. Release lint reported zero errors. The established signer and normal package are retained; the signed upgrade from RC3 retained its first-install record.

A late emulator-only Goldfish AVC picture issue was addressed by preferring Android's platform software codec for emulator Pluto playback. The recorded-to-Pluto regression sustained clear720p video for30seconds, and signed playback was visually inspected. Physical-device decoder selection is unchanged.

Physical TV/phone acceptance, every station and complete episodes/all advertising breaks are not verified. The episode-transition test uses a normal seek near the end to accelerate the check.
