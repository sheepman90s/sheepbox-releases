# SheepBox Android 2.1.0-RC3

Android build 218 adds **Knight Rider as Retro TV channel 180**. Open Retro TV from Home and select Knight Rider or enter180 on the remote.

The channel plays full episodes in a shuffled rotation, refreshes the current free episode list when a rotation ends, and avoids an immediate repeat when another episode is available. Each episode starts from the beginning. This is a separate rotation for each viewer; the original 179 Archive stations retain their existing shared schedules.

Channel180 uses the existing Roku player with its normal authorization, advertising and Widevine configuration. Roku controls current availability and access; a VPN or proxy may prevent playback. Errors stop with a retry/guide choice rather than cycling through failures. Ordinary on-demand playback keeps its existing auto-next setting; the channel continues independently of that setting.

Back returns to the Retro guide. Channel Up/Down returns to the adjacent Retro station. The player retains its current episode and remaining rotation when Android recreates it.

Web RC7 remains at 179 channels. Roku does not currently offer a supported embedded web player for this continuous channel. No web runtime, catalogue or service deployment is included in RC3.

Install RC3 over the existing signed app to retain settings, favorites, workspaces, history and recordings. Enable **Include test versions** in Settings > App updates to receive the prerelease. Stable 2.0.0 remains the recommended stable release and GitHub Latest.

## Verification and limits

952 Android unit tests pass, and release lint reports zero errors. The established signing certificate and the unchanged179-station Archive catalog are verified in the packaged APK. A signed RC2/build217-to-RC3/build 218 upgrade retained the captured workspaces, favorites, viewing history, recording fixture, settings and original install identity.

Six native acceptance cases passed on an Android emulator. Channel180 played full-episode video, refreshed an exhausted rotation and decoded the next episode, continued with ordinary VOD auto-next disabled, retained its episode/queue through activity recreation, and handled numeric180, Channel Down and Back. Existing Archive playback, shared-clock transitions and Home/remote navigation also passed. Screenshots were inspected.

Physical Android TV/phone acceptance remains pending. Accelerated seek-to-end checks verify transitions, not a complete episode or every advertising break. Playback of every episode is not claimed. The existing Archive coverage remains incomplete, with 31 unverified metadata records excluded.
