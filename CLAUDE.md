# Working on SIGNAL//BREAK

## Every report ends with the links to the game

End every report on finished work with the current web version, after checking which build it serves:

- **Web version (plays anywhere, installs on iPhone/iPad):** https://signalbreak-game.website.yandexcloud.net/ — updated by `.github/workflows/mirror.yml` on every push; its "Check the site" step logs the commit the site serves. Give the version number and that commit.
- **Claude artifact (needs claude.ai access):** https://claude.ai/artifact/EgNdNyi1qmYWnvLpEsVVkw — republish `dist/artifact.html` after each build.
- **GitHub Pages:** https://magma-rager.github.io/def/ — only once Pages is switched on in the repository settings (a "pages build and deployment" workflow appears); until then say it is off.

If a link is not serving the latest build, say so instead of listing it as current.
