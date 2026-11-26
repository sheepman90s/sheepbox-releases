# SheepBox Android 2.1.0-RC2 and Web 2.0.0-RC7

Retro TV adds 179 continuously scheduled SheepBox channels on Android and the web. Open Retro TV from Home, browse now/next/later, filter categories, enter a channel number, or watch full screen. Each station follows a shared program clock rather than opening an on-demand series page.

The stations curate the same 5,307 file-programs from 3,886 Internet Archive items into classic series, cartoons, movies, science, history, travel and other themes. Programs retain source credits and reuse information. News and weather are historical recordings. Source coverage is incomplete: 31 unverified metadata records remain excluded. Source availability can change; playback of every station has not been verified.

Choose **Request a channel** in Retro TV, or Android **Settings > Support SheepBox**, to send a name and optional details to SheepBox's private GitHub issue tracker. No GitHub account is required. A confirmed submission shows a reference number. Requests are reviewed for availability and supported playback. Downloaded or self-hosted web packages link to the hosted app for submission. The separate public GitHub channel-request form requires a GitHub account and is public.

Android RC2 includes My SheepBox from RC1: named profiles, viewing workspaces, ordered shelves, colours, automatic local saving and encrypted snapshot backups. Workspace profiles separate saved spaces; favorites and viewing history remain shared on the device. Continuous device synchronization remains separate. Fawesome live playback handles its renamed channel directory.

## Install or update

- Android **2.1.0-RC2, build 217** requires Android 6.0 or later. Install the versioned APK over the existing app to retain personal data. Enable **Include test versions** in App updates to receive release candidates. It uses the established SheepBox signing key. Stable **2.0.0/build 215** remains the recommended stable download.
- [Open Web RC7](https://sheepman90s.github.io/sheepbox-releases/watch/). This release snapshot has 78,527 top-level On Demand entries and 1,687 ordinary live listings, plus the separate 179-station Retro TV guide. Provider Status shows current counts and dates as daily metadata updates arrive. Existing publisher access, advertising, region and DRM requirements remain in force.
- The web ZIP includes a local Node.js preview launcher. See its PREVIEW_README.txt. Video requires a connection; channel requests are submitted through the hosted app.

## Verification and limits

947 Android unit tests, 210 web tests and 25 reporting-service tests pass. Signed stable-to-RC2 upgrade and workspace checks pass on an Android emulator, along with four native Retro TV/request cases covering real video decoding, clock transitions, remote navigation and a mocked request receipt. Seven in-memory DOM cases cover request validation, submission, explicit retry and cancellation; they do not establish visual layout or browser focus trapping. No real support issue was submitted during testing.

Physical Android TV/phone acceptance and visual browser acceptance of the new request form remain pending. Earlier Retro TV browser playback and guide checks were performed on the 179-channel preview. Existing source availability limits still apply.
