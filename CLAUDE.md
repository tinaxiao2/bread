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
- The artifact's icon comes from a fixed set chosen by a word passed when publishing. It has no
  bread: `bread` and `food` give a coffee cup, `pizza` gives a concierge bell, `recipe` gives
  a book, and words it does not know (loaf, croissant, wheat, toast, bakery, cake, baking,
  utensils, apple, chef) are ignored, leaving the icon as it was. iPhone's Add to Home Screen
  uses that icon, not the page's own `icons/` or `thumb.png`. **The owner chose the book:
  publish with `icon: "recipe"` or leave `icon` out, never another word.**
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

Two collections and one document in the artifact database:

- `breads/{id}`: `name`, `date` (YYYY-MM-DD, or '' for "–": not baked yet), `recipeId` (or null), `photos` (list of
  `{full, thumb}` asset ids, cover first; `photo` repeats the cover), `ratings` (`crust`,
  `crumb`, `taste`, 0–5 in half steps, 0 = not rated), `notes` (one per rating), `comments`,
  `splitFrom` (id of the entry it was split from, or null), `createdAt`, `updatedAt`
- `recipes/{id}`: `name`, `ingredients[]` (`group`, `type`, `amount`, `unit`, `note`),
  `bake` (`programs[]`, `size`, `crust`, `minutes`, `added`, `reason`, `proof[]` (places:
  `machine`, `airfryer`, `fridge`), `proofMinutes`, `ovenTemp`, `ovenMinutes`), `method`, `source`, `link`, `parent` (name of the recipe it is attached
  to, or ''), `flag` (ISO country code, or ''), `originals[]` (asset ids of imported images), `basedOn`, `createdAt`, `updatedAt`
- `meta/order`: `toTry` — the owner's ranking of recipes to try, as group keys (the parent
  recipe's name, lower-cased). Recipes not in it come last.

Entries from the first version hold a single `bake.program` instead of `bake.programs`, and
salt as an `other` ingredient named Salt, no `proof` (read as the bread machine), and a single
`photo` instead of `photos`. `LGT.util.cleanBake`, `cleanIngredient` and `photosOf` read both
shapes, so nothing is migrated. Always go through them.

## How the owner's log works

These are decisions the owner made. Keep them.

- **A recipe is known by its name.** Every `recipes` document with the same name (ignoring
  capitals and spacing) is one variation of that recipe: a distinct set of ingredients
  and baking details.
- **A recipe can be attached to a parent recipe** (the Parent field). The parent and
  everything attached to it form one group: one card on the Recipes tab, and every variation
  inside it is called a **tweak** ("Tweak 1" is the oldest). The parent is stored on every
  variation of a name and kept in step by `store.setParent`; renaming a parent updates what
  is attached to it. A parent name with no recipe of its own still gathers what is attached
  to it. The Parent list offers only recipes with no parent of their own, never the recipe
  being edited or anything attached to it.
- **Flags**: a recipe can carry a country flag, picked beside the Name field. Like the
  parent, it is kept the same on every variation of a name (`store.setShared`). It shows
  before the name everywhere (`ui.Named`); a recipe without its own shows its nearest
  parent's (`store.flagFor`). Stored as the ISO code, drawn as the emoji.
- **Recipes to try are ranked** by dragging their rows (same hold-then-drag as photos,
  `ui.useDragOrder`).
- **Gallery has a Recipes · All toggle** (top right, remembered on the device): All is every
  entry; Recipes is one tile per parent recipe that has been baked. Tiles show the rating at the
  bottom left above the name. In the Recipes view the number of baked entries is a red
  bubble at the top right, sized like an iPhone badge on an app icon (about a third of the
  tile's width, overlapping the corner; the tiles have extra side margin so it clears the
  screen edge), and one card per extra entry (up to 3) steps
  diagonally up and to the left behind the tile. Under the toggle, **Filter by** (icon +
  brown text naming the current choice) sorts either view: Most recent, Most baked,
  Rating (unrated last), A to Z. Remembered on the device.
- **From photo on New bread saves a recipe, not a bread**: it opens Check recipe on top of the
  bread form; saving closes both and the recipe goes to To try. Cancel returns to the bread form.
- **Sources from Reddit are just "Reddit"** (`util.cleanSource`, applied on save, when
  reading a recipe in, and when showing older ones): the link carries the subreddit and user.
- **A bread's name is its recipe's name.** Saving a bread named like a saved recipe joins
  that recipe: the matching variation if the ingredients and baking details are the same,
  a new variation if they differ. See `LGT.util.planRecipeSave`. Naming a new bread like a
  saved recipe fills the form from that recipe's latest variation.
- Renaming a recipe renames all its variations and the breads baked from them.
- **Baked, To try and Dough are derived, never stored.** A bread counts as **baked once it
  has a date** (`store.isBakedBread`); an entry dated "–" (the button beside Date) is still a
  plan. A recipe is baked when a baked bread points at one of its variations, and "Baked n×"
  counts baked breads only. Photos do not decide it. (The owner chose this: recipes read in through New bread were showing as baked
  before anything was baked.) An entry is Dough until a bake is recorded: a program
  that is not a dough program, or an oven step (`LGT.util.isBaked`).
- **Programs can be combined** (for example Dough then Bake). The program marked `manual`
  in `data/machine.js` (Bake) has its time typed in as "added time", so the added time and
  its reason only exist, and only show, when that program is chosen.
- **A blank recipe starts with** flour (AP), water, yeast (active dry) and salt, every
  measurement in grams. New rows always start in grams. Salt has its own row. Water has a
  kind: Lukewarm, Warm or Hot. Dairy is added on demand. Sugar is always a quick-add chip,
  followed by every named ingredient the owner has used before.
- Rows that were only offered (`_auto`) and left without an amount are not saved.
- **Proofing** records where (bread machine by default; several places allowed) and for how
  long. A different place is a different tweak.
- **Ratings** go in half stars: the left half of a star picks the half.
- **Several photos per bread.** The first is the cover in the Gallery; the bread page swipes
  through them. In the form the photos wrap in a grid with + last, and are put in order by
  dragging (mouse: drag; phone: hold briefly, then drag, so a quick swipe still scrolls).
- **Stats** (third tab): flour used, loaves, favorite and time spent, all derived in
  `store.stats`. Loaves and the favorite count baked (dated) entries; flour and time
  count every entry. Flour in cups or spoons is converted at about 120 g a
  cup. Time is machine programs + Bake's added time + proofing + oven. A split copy's dough
  (flour, machine time, proofing) is counted once, with the entry it came from. The favorite
  is the parent recipe with the most entries.
- **Split** on a bread's page opens a copy of the entry (name, date, photo, ratings, comments,
  recipe) that is saved as a new bread. It is for one dough baked two ways: change the
  baking on the copy and it becomes another variation of the same recipe. The copy records
  `splitFrom`. The copies share
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
