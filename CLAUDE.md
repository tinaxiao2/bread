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

Two collections and two documents in the artifact database:

- `breads/{id}`: `name`, `date` (YYYY-MM-DD, or '' for "–": not baked yet), `recipeId` (or null), `photos` (list of
  `{full, thumb}` asset ids, cover first; `photo` repeats the cover), `ratings` (`crust`,
  `crumb`, `taste`, 0–5 in half steps, 0 = not rated), `notes` (one per rating), `comments`,
  `splitFrom` (id of the entry it was split from, or null), `createdAt`, `updatedAt`
- `recipes/{id}`: `name`, `ingredients[]` (`group`, `type`, `amount`, `unit`, `note`),
  `bake` (`programs[]`, `size`, `crust`, `minutes`, `added`, `reason`, `proof[]` (places:
  `machine`, `airfryer`, `fridge`), `proofMinutes`, `extraProofs[]` (`{proof[], minutes}` for each proof after the first), `ovenTemp`, `ovenMinutes`), `method`, `source`, `link`, `parent` (the label it is filed
  under, or ''), `flag` (ISO country code, or ''), `line` (id of the recipe's first tweak), `tweak` (its number in
  the recipe, 1 for the first), `originals[]` (asset ids of imported images), `basedOn`, `createdAt`, `updatedAt`
- `meta/labels`: `flags` — each label's own country flag, keyed by the label lower-cased.
- `meta/order`: `toTry` — the owner's ranking of recipes to try, as group keys (`label:<label>` or
  `line:<id>`; keys from before, a lower-cased name, are still read). Recipes not in it come last.

Entries from the first version hold a single `bake.program` instead of `bake.programs`, and
salt as an `other` ingredient named Salt, no `proof` (read as the bread machine), and a single
`photo` instead of `photos`. `LGT.util.cleanBake`, `cleanIngredient` and `photosOf` read both
shapes, so nothing is migrated. Always go through them. `util.regroup` (inside both) also reads
names the way the owner calls them: sugar, brown sugar, honey and molasses named as `other` are
the Sugar row; bread machine yeast is Instant; canola oil is Oil. Recipes saved before `line` existed are
read as one recipe per name, numbered in the order they were made (`store.lines`); saving one
writes its `line` and `tweak`.

## How the owner's log works

These are decisions the owner made. Keep them.

- **Three levels: label → recipe → tweak.** Example: the label "White bread" holds the recipes
  "Country White Bread" and "Classic White Sandwich Bread"; each recipe holds its tweaks.
  - A **label** is only the text in a recipe's Parent field (`parent`). It has no document of its
    own. A label and a recipe may share a name (label "Mantou" holds the recipes "Mantou" and
    "Milk Mantou").
  - A **recipe** is a line of `recipes` documents sharing a `line`. Its name, label and flag are
    kept the same on every tweak (`store.setShared`). Renaming it renames every tweak, and the
    breads still called by its old name ("Old", "Old II") (`store.renameBreads`).
  - A **tweak** is one document: a distinct set of ingredients and baking details. Tweaks are
    numbered I, II, III in the order made (`util.roman`).
- **Names never join anything.** A recipe goes under a label only through the Parent field. A
  bread joins a recipe only when it was started from one (Bake again, Bake this, Use recipe, or
  a name suggestion tapped in the bread form). Typing a saved recipe's name makes a new recipe.
- **Where a bread's tweak goes** (`util.planRecipeSave`): on the recipe's tweak with the same
  ingredients and baking details, else a new tweak (the next number). Editing the only bread
  on a tweak edits the tweak in place.
- **A bread's name defaults to its recipe's name plus the tweak's numeral from II on**
  ("Country White Bread", "Country White Bread II") and follows the form as the baking changes
  (`store.previewName`), until she types her own. The recipe keeps its own name.
- **Recipes tab**: one card per label (or per recipe with no label). A label with several recipes
  shows "N recipes" like the rating: icon and text, no background.
- **Recipe page**: at the top, a carousel of every photo of every bake under the label (newest
  bake first; dots, or "3 / 14" past 10 photos); the label as the heading, with a pencil to rename
  it ("Edit parent": every recipe under it, its flag and its To try place follow, `store.renameLabel`); arrow buttons step between its recipes (in the
  order made; it opens on the one baked last); below, that recipe's tweaks I, II, III, with the
  ingredient lines that differ from I highlighted.
- **Flags**: a recipe can carry a country flag, picked beside the Name field. It is kept the
  same on every tweak (`store.setShared`) and shows before the name everywhere (`ui.Named`).
  A label can have its own flag, picked beside the Parent field (`store.setLabelFlag`, kept in
  `meta/labels`); without one it shows the flag of its first recipe that has one. Stored as the
  ISO code, drawn as the emoji. The first choice after "–" is **Global** (`GLOBAL`, drawn as 🍞)
  for breads made everywhere; it sorts and counts like a country named "Global".
- **Parent is a dropdown**: "–", the labels already in use (never the recipe names), A to Z,
  then "New…" to type a new label.
- **Recipes to try are ranked** by dragging their rows (same hold-then-drag as photos,
  `ui.useDragOrder`).
- **Gallery has a Recipes · All toggle** (top right, remembered on the device): All is every
  entry; Recipes is one tile per label (or recipe with no label) that has been baked. Tiles show the rating at the
  top left, where Dough shows on an entry not baked yet (dough is not rated). In the Recipes view the number of baked entries is a toffee-brown (#C27C3A)
  bubble at the top right, sized like an iPhone badge on an app icon (about a third of the
  tile's width, overlapping the corner; the tiles have extra side margin so it clears the
  screen edge), and one card per extra entry (up to 3) steps
  diagonally up and to the left behind the tile. Under the toggle, **Filter by** (icon +
  brown text naming the current choice) sorts either view: Most recent, Most baked,
  Rating (unrated last), A to Z, Country (by country name, no flag last). Remembered on the device.
  Ties: Most baked goes to the better rated, then the most recent with a photo, then those with
  none. Rating puts ties and the unrated in order of most baked, then the most recent with a
  photo, then those with none.
- **From photo on New bread saves a recipe, not a bread**: it opens Check recipe on top of the
  bread form; saving closes both and the recipe goes to To try. Cancel returns to the bread form.
- **Sources from Reddit are just "Reddit"** (`util.cleanSource`, applied on save, when
  reading a recipe in, and when showing older ones): the link carries the subreddit and user.
- **Baked, To try and Dough are derived, never stored.** A bread counts as **baked once it
  has a date** (`store.isBakedBread`); an entry dated "–" (the button beside Date) is still a
  plan. A recipe is baked when a baked bread points at one of its tweaks, and "Baked n×"
  counts baked breads only. Photos do not decide it. (The owner chose this: recipes read in through New bread were showing as baked
  before anything was baked.) An entry is Dough until a bake is recorded: a program
  that is not a dough program, or an oven step (`LGT.util.isBaked`).
- **Programs can be combined** (for example Dough then Bake). The program marked `manual`
  in `data/machine.js` (Bake) has its time typed in as "added time", so the added time and
  its reason only exist, and only show, when that program is chosen.
- **A blank recipe starts with** flour (AP), water (Room temp), yeast (active dry) and salt, every
  measurement in grams. New rows always start in grams, except eggs: an egg row starts at 1
  with no unit. Salt has its own row. Water has a kind: Room temp, Lukewarm, Warm or Hot.
  Yeast: Active dry or Instant (bread machine yeast is Instant). Dairy and Sugar (Sugar,
  Brown sugar, Honey, Molasses) are rows added on demand, several allowed. The chips offer
  Flour, Dairy, Sugar, then every named ingredient the owner has used before.
- Rows that were only offered (`_auto`) and left without an amount are not saved.
- **Proofing** records where (bread machine by default; several places allowed) and for how
  long. A different place is a different tweak. A proof in the machine starts at 65 min
  (`machine.proofMinutes`) when the machine is chosen as a place, or when Dough is chosen while
  it is. The owner's rule: Dough's 1 h 30 is 25 min of kneading plus a 65 min rise, and the
  rise is logged as the proof, so Dough's time is always 25 min (`kneading`); with a machine
  proof the two add up to 1 h 30, and Stats never counts the rise twice. Times she typed are kept. The + under it adds another proof
  ("2nd proof"), each with its own places and time, starting in the machine at 65 min.
- **Ratings** go in half stars: the left half of a star picks the half.
- **Date** field is narrow with the date centered, and the "–" button beside it.
- Dropdowns in ingredient rows use slightly smaller text (14.5px); the viewport has
  `maximum-scale=1` so iPhone does not zoom in when one is tapped.
- **Several photos per bread.** The first is the cover in the Gallery; the bread page swipes
  through them. In the form the photos wrap in a grid with + last, and are put in order by
  dragging (mouse: drag; phone: hold briefly, then drag, so a quick swipe still scrolls).
  Photos picked together are added in the order picked. iPhone always shows its own menu
  (Photo Library / Take Photo / Choose File) for a web page's file picker; a page cannot
  skip it, so do not try.
- **Stats** (third tab): flour used, loaves, favorite, highest rated and time spent, all derived in
  `store.stats`. Highest rated is the label (or recipe) with the best-rated bake (ties: more
  baked, then more recent). Tapping the favorite's or highest rated's name opens its recipe page
  (on the recipe of the latest or best bake), or the bread when it has no recipe. Those two names
  stay on one line and at one size: when either is too long, both are set smaller until both
  fit. **Countries** lists where the recipes are from: every recipe once (baked or to try), by its
  flag or else its label's, most first; recipes with no flag are left out. Each row shows
  "baked / all" (no label) and taps open to list its recipes A to Z, the ones not baked yet in
  gray; tapping one opens its recipe page. Loaves and the favorite count baked (dated) entries; flour and time
  count every entry. Flour in cups or spoons is converted at about 120 g a
  cup. Time is machine programs + Bake's added time + proofing + oven. A split copy's dough
  (flour, machine time, proofing) is counted once, with the entry it came from. The favorite
  is the label (or recipe with no label) with the most entries.
- **Split** on a bread's page opens a copy of the entry (name, date, photo, ratings, comments,
  recipe) that is saved as a new bread. It is for one dough baked two ways: change the
  baking on the copy and it becomes the recipe's next tweak, and the copy's name follows. The copy records
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
