# Third-party notices

## HLS.js1.7.4

Copyright2017 Dailymotion and the HLS.js contributors; portions derived from
Brightcove's video.js HLS work, copyright2013–2015 Brightcove.

Licensed under Apache License2.0. The publisher's complete notice is retained in
`vendor/HLS-LICENSE.txt`; the license text is in `vendor/APACHE-2.0.txt`.
[Project and source](https://github.com/video-dev/hls.js/tree/v1.7.4).

Pinned distribution: `hls.js@1.7.4/dist/hls.min.js`, SHA256
`cfc70cc9e9fc63d071919e087670abc760c8fd1bc889b88588026e4d22193bbe`.
The unmodified distribution is served locally with the web application.

## Publisher content

Provider names identify their respective owners. Content remains hosted by the
publisher. NFB video uses the official embedded player under its embedding terms;
the player page links back to NFB. NASA material follows its media usage guidance.
Each Internet Archive item has a source link and an explicit reuse license that
is checked at playback. Catalogue metadata and images identify the original works;
they do not imply publisher endorsement of SheepBox.

PBS and PBS KIDS use only the original PBS Viral Player for titles with explicit
`allow_embed` and `is_playable` permission. The publisher retains sponsorship,
captions, controls and regional access. [PBS player glossary](https://docs.pbs.org/space/MM/5343815/Glossary).

## World View and Web Cams

World View reuses the Android app's unmodified NASA Blue Marble Earth image and
Natural Earth country geometry. Both source datasets are public domain; exact
credits are in `data/world-view-sources.txt`. The globe renderer is project code,
with no additional graphics runtime library. It uses the bundled overview image,
not live satellite imagery or the Android on-demand terrain tiles.

The webcam metadata snapshot is from Famelack under the MIT license, retained in
`data/FAMELACK-LICENSE.txt`, including its copyright notice. Directory licensing
does not grant ownership of camera video. Each camera uses YouTube's original
privacy-enhanced embedded player, which enforces availability, embedding settings
and advertising. [YouTube embed documentation](https://support.google.com/youtube/answer/171780).

## NewsON, Xumo and Google IMA

NewsON and Xumo retain ownership of their names, metadata, logos and programming.
Media remains on the services, with their access rules and advertising. NewsON's
original VMAP is processed by the official Google IMA HTML5 SDK, loaded from
Google at playback initialization; it is not vendored or modified. Xumo live
streams retain the original SSAI advertising parameters and content. No Google
sample-ad fixture is included in production playback.
[IMA documentation](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/get-started).

## Shaka Player5.3.4

The unchanged compiled player is vendored from the official `shaka-player` npm
package5.3.4. Source: <https://github.com/shaka-project/shaka-player/tree/v5.3.4>.
Distributed under Apache2.0; complete package licence and notices are retained
in `vendor/shaka-player-LICENSE.txt`. Original compiled-file SHA256:
`76e6481647db316c197e13bdd7e344f16dd568871e07b46c8f5f4346c582758c`.
The site uses the browser’s normal content-decryption module; no CDM, licence
keys or protected media are bundled.
