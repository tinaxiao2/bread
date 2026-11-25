# Publishing

The app is the owner's private Claude artifact titled **Let's Get This**. Find it by that
title with the artifact tools (`list_artifacts`); its link is not kept in this public repository.

## Steps

1. `npm test`
2. `get_artifact` for the live version, to use as `base_version`.
3. `publish_files` with the slug, `base_version` and the files below. Each file is served at
   its repository path. A republish keeps files it does not name, so list anything deleted
   from the repository under `remove`.
4. Capabilities change only when the page starts or stops using one. `read_declaration`,
   then `declare_capabilities` with the whole declaration:

   ```json
   {"db": {"rules": [{"path": "", "read": "admin", "write": "admin"}]}, "assets": {}, "sample": {"images": true}}
   ```

   Gaining a capability: declare first, then publish the code that uses it.
   Losing one: publish first, then declare.

## Files that are published

`index.html`, `manifest.webmanifest`, `css/app.css`, `data/machine.js`, every file in `js/`
(including `js/vendor/`), every file in `icons/`.

Never published: `dev/`, `tests/`, `tools/`, `package.json`, the Markdown files.

## The owner's data

Breads, recipes and photos live in the artifact's database and asset storage, not in this
repository. Republishing keeps them. Deleting the artifact erases them.
