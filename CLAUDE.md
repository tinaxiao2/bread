# Let's Get This

A personal bread-baking log. Each bread has a photo, date, ratings and comments, and
points at the recipe card it followed. Recipes are either baked or "to try", and can be
read in from a photo or screenshot.

## UI copy rules

These are the owner's rules. Follow them on every screen.

- Do not add explanatory text, helper text, subtitles, descriptions, tooltips, or empty-state paragraphs unless I explicitly ask.
- Labels and buttons: 1–3 words. Headings: under 6 words.
- Never describe what a feature does in the UI. The UI should be self-evident.
- Never hardcode facts that can change (counts, dates, statuses, feature lists). Derive them from data or leave them out.
- If you think text is needed, propose it in chat first. Don't add it to the code.
- When editing a screen, remove stale copy rather than adding more.

## How it runs

The app is published as a **private Claude artifact**, the same way the owner's other
apps are. It is not hosted on GitHub Pages or any outside host, and it does not work as
a plain static site: storage, photos and the recipe reader all come from the artifact
runtime.

- Artifact: "Let's Get This". Find it by title with the artifact tools; `tools/publish.md` has the steps.
- Capabilities declared: `db` (breads and recipes), `assets` (photos), `sample` with
  images (reading a recipe from a picture).
- There is no build step. The files in `tools/publish.md` are published as they are.
- The page must stay within the artifact rules: classic `<script src>` tags, no service
  worker, no `alert`/`confirm`/`prompt`, no direct camera access (a file input is used),
  no downloads without the `downloads` capability, hash routes limited to plain `#name`.

## Layout

- `index.html` – shell and script tags
- `css/app.css` – all styles
- `data/machine.js` – the bread machine's programs (Cuisinart CBK-110NAS). Program names,
  loaf sizes, crust colour support and times live here as data, never in UI code.
- `js/util.js` – pure helpers: dates, times, amounts, recipe comparison
- `js/platform.js` – access to the artifact capabilities
- `js/store.js` – data layer: live lists, saving, photo upload
- `js/importer.js` – reading a recipe from an image
- `js/ui.js`, `js/fields.js`, `js/screens.js`, `js/app.js` – the interface
- `js/vendor/htm-preact.js` – Preact + htm, vendored
- `dev/` – local stand-in for the artifact runtime, and a dev server. Never published.
- `tests/` – unit tests and end-to-end flows

## Data

Two collections in the artifact database:

- `breads/{id}`: `name`, `date` (YYYY-MM-DD), `recipeId`, `photo` (`{full, thumb}` asset
  ids or null), `ratings` (`crust`, `crumb`, `taste`, 0 = not rated), `notes` (one per
  rating), `comments`, `createdAt`, `updatedAt`
- `recipes/{id}`: `name`, `ingredients[]` (`group`, `type`, `amount`, `unit`, `note`),
  `bake` (`program`, `size`, `crust`, `minutes`, `added`, `reason`, `ovenTemp`,
  `ovenMinutes`), `method`, `source`, `link`, `originals[]` (asset ids of imported
  images), `basedOn`, `createdAt`, `updatedAt`

A recipe is "baked" when a bread points at it and "to try" otherwise. That status is
derived, never stored.

Saving a bread whose recipe is unchanged keeps it on the same card. Changing the recipe
makes a new card when other breads use the old one, and edits the card in place when
none do. See `LGT.util.planRecipeSave`.

## Working on it

```
npm test            # unit tests + end-to-end flows in a phone-sized browser
npm run dev         # local preview at http://localhost:4173 with stand-in storage
```

The stand-in in `dev/` only imitates the artifact runtime. The real database, photo
storage and recipe reader can only be exercised in the published artifact under the
owner's login, so say so when reporting what was tested.

The repository is public. Never commit the owner's photos, screenshots or recipes.
