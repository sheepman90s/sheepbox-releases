# BYUtv guest video metadata

`byutv-on-demand-v1.json` is the complete audited US/English guest on-demand
metadata snapshot consumed by the forthcoming SheepBox Android provider.
It contains 150 show groups and 145 movie/standalone-video entries, covering
8,581 current guest video offers. It does not add BYUtv to the web player.

The adjacent audit receipt records discovery, exclusions and publisher count
discrepancies. Every discovered candidate was individually checked. A snapshot
is not a permanent entitlement: the app obtains fresh guest playback and DRM
authorization when a video opens. Live broadcasts, BYUradio, account-gated and
future-only offers are outside this snapshot.

Only stable title/episode IDs, public artwork and programme metadata belong in
these files. Do not add signed media/preplay URLs, licenses, accounts, cookies,
guest identifiers or bootstrap routing data. Refresh by rerunning the private
source repository's BYUtv library audit and strict metadata exporter; publish
only a complete validated replacement with its dated receipt.
