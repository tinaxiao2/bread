# Let's Get This

A personal bread-baking log: a gallery of loaves, each with the recipe card it followed,
and a list of recipes baked and to try. A recipe can be read in from a photo or screenshot.

It is published as a private Claude artifact, which provides its storage, photo hosting and
the recipe reader. There is no build step: the files are published as they are.
See `CLAUDE.md` for the layout and the rules the interface follows, and `tools/publish.md`
for how to publish.

```
npm test        # unit tests and end-to-end flows (needs Playwright with Chromium)
npm run dev     # local preview at http://localhost:4173, with stand-in storage
```
