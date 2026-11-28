# SheepBox Android 2.1.0-RC5

Android build 220 adds a loading screen when Retro TV opens. If channels or the guide cannot load, Retry tries again and Home returns to the main menu.

Available Retro TV listings now cover the next 12 hours. Knight Rider 180 reserves 12 hours of actual episode titles in the order they will play, retaining your current position. Its estimated guide times exclude advertising and pauses. Turbo Pursuit 45 remains alongside the separate Knight Rider 180 rotation.

Recorded Retro channels use animated SheepBox house bumpers and a SheepBox donation card. They replace the source's house stingers/donation clips at their original durations. Programme files, paid spots, trivia and publisher advertising remain intact. Live Pluto/Roku channels retain their own breaks.

Android keeps all 16 existing Pluto music stations on their original Pluto feeds. This release does not switch Android music to Roku. Current source availability, regional checks, advertising and DRM still apply. The weather forecast API is currently unavailable; its source music remains available.

## Install and test

[Download RC5/build 220](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC5/sheepbox-tv-vod-2.1.0-RC5-release.apk) / [SHA256 checksum](https://github.com/sheepman90s/sheepbox-releases/releases/download/v2.1.0-RC5/sheepbox-tv-vod-2.1.0-RC5-release.apk.sha256).

Install over the existing signed app to keep settings, favorites and workspaces. For in-app updates, open **Settings > App updates**, enable **Include test versions**, then choose **Check now > Update now**. Stable 2.0.0 remains GitHub Latest and the recommended stable download. [Previous RC4](RELEASE_2_1_0_RC4.md) remains available.

Please check opening Retro TV, Retry after an interrupted connection, scrolling the 12-hour guide, recorded-channel bumper transitions, Pluto music and Knight Rider's next advertised episode. Physical-device feedback is still needed; every source, complete episodes/all ads and uninterrupted 12-hour playback have not been verified.

The published Web RC7 has its own version and is unchanged by this Android release. The [channel/source map](RETRO_CHANNEL_SOURCES.csv) identifies the original public origins; programming changes with the source.
