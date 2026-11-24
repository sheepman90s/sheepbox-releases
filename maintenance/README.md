# Web catalogue maintenance

The daily 07:17 UTC workflow refreshes complete supported PBS, FreeTV, Runtime,
Revry, NASA+, Filmzie, NewsON, Xumo, CW and YuppTV metadata. A manual run can
select any of those providers. Playback always obtains current publisher access
and the original advertising; the workflow never publishes guest tokens, media
offers, licence URLs, player responses, checkpoints or detailed audit receipts.

Each run uses an isolated temporary stage. Complete traversal, identities,
episode ownership, regional scope and the combined library are validated before
promotion. A drop greater than 20% needs maintainer review rather than automatic
publication. A failed provider export preserves that provider’s complete saved
library while other validated providers may refresh. The run lists retained
providers, and Provider Status explains when the previous snapshot is shown.
If no provider can refresh, nothing is published. A competing main
commit aborts promotion; there are no force pushes. Temporary files and logs are
not uploaded as artifacts.

The workflow uses only the built-in repository token (`contents:write` and
`pages:write`). It explicitly requests and checks a legacy Pages build after
committing because token pushes do not trigger Pages automatically. The existing
`main:/docs` site, audience and application version remain unchanged. Catalogue
updates regenerate the content revision, service-worker cache and hash manifest,
then verify the hosted changed bytes. Publication failures after a commit are
reported; retry that Pages build to deploy the already validated source.

BYUtv, Philo, Roku, NFB, webcams and curated publisher selections retain their
original snapshot dates and existing maintainer refresh process. They are not
silently described as freshly crawled. Provider Status shows individual dates.
GitHub may delay scheduled runs or disable an inactive public schedule after
60 days; the Actions page is the authoritative run history.

Local validation: set `SHEEPBOX_SITE_ROOT` to a verified packaged `watch/`
directory, `SHEEPBOX_REFRESH_OUTPUT` to a new temporary directory and optionally
`SHEEPBOX_REFRESH_PROVIDERS=runtime`. Run `node maintenance/refresh.mjs`.
Python 3.12+, Node 22+ and curl are required; no account or additional secret is
needed. Publishing runs only in this public repository's clean main checkout.

References: [repository token behavior](https://docs.github.com/en/actions/concepts/security/github_token),
[explicit Pages builds](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build),
[schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
