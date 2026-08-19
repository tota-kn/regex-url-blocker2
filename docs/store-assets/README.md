# Chrome Web Store assets

`listing/en.md` and `listing/ja.md` contain the localized store copy. Upload the matching five images from `screenshots/en/` and `screenshots/ja/` in filename order for each locale in the Chrome Web Store Developer Dashboard.

Regenerate screenshots from the current production build with:

```sh
pnpm store:screenshots
```

The capture uses deterministic sample settings and creates 1280×800 PNG files. The group editor image intentionally uses the dark theme; the other four images use the light theme.
