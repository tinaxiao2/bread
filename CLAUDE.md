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
- Claude's icon set for artifacts has no bread: bread, loaf, croissant, wheat, toast, bakery
  and cake all resolve to a coffee cup. The artifact carries a bread cover picture
  (`thumb.png`) and a 🍞 emoji marker (set with `publish_version`) instead.
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

- `breads/{id}`: `name`, `date` (YYYY-MM-DD), `recipeId` (or null), `photo` (`{full, thumb}`
  asset ids or null), `ratings` (`crust`, `crumb`, `taste`, 0 = not rated), `notes` (one per
  rating), `comments`, `createdAt`, `updatedAt`
- `recipes/{id}`: `name`, `ingredients[]` (`group`, `type`, `amount`, `unit`, `note`),
  `bake` (`programs[]`, `size`, `crust`, `minutes`, `added`, `reason`, `ovenTemp`,
  `ovenMinutes`), `method`, `source`, `link`, `originals[]` (asset ids of imported
  images), `basedOn`, `createdAt`, `updatedAt`

Entries from the first version hold a single `bake.program` instead of `bake.programs`.
`LGT.util.cleanBake` reads both, so nothing is migrated. Always go through it.

## How the owner's log works

These are decisions the owner made. Keep them.

- **A recipe is known by its name.** Every `recipes` document with the same name (ignoring
  capitals and spacing) is one **variation** of that recipe: a distinct set of ingredients
  and baking details. The Recipes tab shows one card per name, with its variations inside.
- **A bread's name is its recipe's name.** Saving a bread named like a saved recipe joins
  that recipe: the matching variation if the ingredients and baking details are the same,
  a new variation if they differ. See `LGT.util.planRecipeSave`. Naming a new bread like a
  saved recipe fills the form from that recipe's latest variation.
- Renaming a recipe renames all its variations and the breads baked from them.
- **Baked, To try and Dough are derived, never stored.** A recipe is baked when a bread
  points at one of its variations. An entry is Dough until a bake is recorded: a program
  that is not a dough program, or an oven step (`LGT.util.isBaked`).
- **Programs can be combined** (for example Dough then Bake). The program marked `manual`
  in `data/machine.js` (Bake) has its time typed in as "added time", so the added time and
  its reason only exist, and only show, when that program is chosen.
- **A blank recipe starts with** AP flour, water, active dry yeast and salt (tbsp). Dairy
  is added on demand. Salt and Sugar are always offered as quick-add chips, followed by
  every named ingredient the owner has used before. Units follow what was last used.
- Rows that were only offered (`_auto`) and left without an amount are not saved.
- **Split** on a bread's page opens a copy of the entry (name, date, photo, ratings, comments,
  recipe) that is saved as a new bread. It is for one dough baked two ways: change the
  baking on the copy and it becomes another variation of the same recipe. The copies share
  the photo they started with, so a photo is deleted only when no bread uses it any more.

## Working on it

```
npm test            # unit tests + end-to-end flows in a phone-sized browser
npm run dev         # local preview at http://localhost:4173 with stand-in storage
```

The stand-in in `dev/` only imitates the artifact runtime. The real database, photo
storage and recipe reader can only be exercised in the published artifact under the
owner's login, so say so when reporting what was tested.

The repository is public. Never commit the owner's photos, screenshots or recipes.
