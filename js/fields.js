/* Form pieces: the ingredient editor, baking details, ratings and the photo picker. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  var H = root.htmPreact, html = H.html, useState = H.useState, useEffect = H.useEffect, useRef = H.useRef;
  var U = LGT.util, ui = LGT.ui, Icon = ui.Icon;

  var keySeq = 0;
  /** Give every ingredient row a stable key for the form. Keys never reach the database. */
  function keyed(list) {
    return (list || []).map(function (i) { return i._k ? i : Object.assign({}, i, { _k: 'k' + (++keySeq) }); });
  }
  function val(fn) { return function (e) { fn(e.target.value); }; }
  /** A stable id for a form control, from its label. */
  function fid(label) { return 'f-' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function Field(props) {
    return html`<div class="field"><span class="label">${props.label}</span>${props.children}</div>`;
  }

  /** A text area that grows to fit what is in it. */
  function Area(props) {
    var ref = useRef(null);
    useEffect(function () {
      var el = ref.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.max(props.rows === 1 ? 48 : 84, el.scrollHeight + 3) + 'px';
    }, [props.value]);
    return html`<textarea ref=${ref} id=${fid(props.label)} class=${'input' + (props.rows === 1 ? ' one' : '')} rows=${props.rows || 3} aria-label=${props.label}
      value=${props.value} onInput=${val(props.onChange)}></textarea>`;
  }

  // ---------- ingredients ----------
  function TypePicker(props) {
    var options = LGT.store.types(props.group);
    var known = options.indexOf(props.value) >= 0;
    var s = useState(!known && !!props.value), custom = s[0], setCustom = s[1];
    if (custom) {
      return html`<input id=${props.id} class="mini" value=${props.value} placeholder="Type" aria-label="Type" onInput=${val(props.onChange)}/>`;
    }
    function pick(e) {
      if (e.target.value === '__other') { setCustom(true); props.onChange(''); } else props.onChange(e.target.value);
    }
    return html`<select id=${props.id} class="mini" aria-label="Type" value=${known ? props.value : ''} onChange=${pick}>
      <option value="">Type</option>
      ${options.map(function (o) { return html`<option value=${o}>${o}</option>`; })}
      <option value="__other">Other…</option>
    </select>`;
  }

  function IngredientLine(props) {
    var ing = props.ing, change = props.onChange;
    function set(patch) { change(Object.assign({}, ing, patch)); }
    function setType(type) { set({ type: type, _auto: false }); }
    var metric = ing.unit === 'g' || ing.unit === 'ml' || ing.unit === 'oz' || ing.unit === 'lb';
    var id = 'ing-' + ing._k;
    return html`<div class="line">
      ${ing.group === 'salt' ? html`<span></span>`
        : ing.group === 'other'
          ? html`<input id=${id + '-name'} class="mini" value=${ing.type} placeholder="Ingredient" aria-label="Ingredient"
              list="lgt-ingredient-names" autocomplete="off" onInput=${val(setType)}/>`
          : html`<${TypePicker} id=${id + '-type'} group=${ing.group} value=${ing.type} onChange=${setType}/>`}
      <input id=${id + '-amount'} class=${'mini amount' + (ing.unsure ? ' unsure' : '')} value=${ing.amount} aria-label="Amount"
        inputmode=${metric ? 'decimal' : 'text'} autocomplete="off"
        onFocus=${function () { if (ing.unsure) set({ unsure: false }); }}
        onInput=${val(function (v) { set({ amount: v, unsure: false }); })}/>
      <select id=${id + '-unit'} class="mini" aria-label="Unit" value=${ing.unit} onChange=${val(function (v) { set({ unit: v }); })}>
        ${U.UNITS.map(function (u) { return html`<option value=${u}>${u || '–'}</option>`; })}
      </select>
      <button type="button" class="rm" aria-label="Remove" onClick=${props.onRemove}><${Icon} name="close"/></button>
      ${ing.note ? html`<input id=${id + '-note'} class="mini note" value=${ing.note} aria-label="Note" onInput=${val(function (v) { set({ note: v }); })}/>` : null}
    </div>`;
  }

  function IngredientsEditor(props) {
    var list = props.list;
    function add(group, name) {
      var row = U.newIngredient(group, name);
      if (group === 'other' && !name) row._auto = false;         // a blank row is hers to name
      props.onChange(list.concat(keyed([row])));
    }
    var groups = U.GROUPS.filter(function (g) { return list.some(function (i) { return i.group === g; }); });
    var kinds = ['flour', 'water', 'dairy', 'yeast', 'salt'].filter(function (g) {
      return g === 'flour' || g === 'dairy' || groups.indexOf(g) < 0;
    });
    // Named ingredients one tap away: the staples, then whatever has been added before.
    var have = {}, known = [], offered = [];
    list.forEach(function (i) { if (i.group === 'other' && i.type) have[String(i.type).trim().toLowerCase()] = true; });
    U.STAPLES.concat(LGT.store.otherNames()).forEach(function (n) {
      var k = n.toLowerCase();
      if (known.some(function (x) { return x.toLowerCase() === k; })) return;
      known.push(n);
      if (!have[k]) offered.push(n);
    });
    return html`<div class="group">
      ${groups.map(function (g) {
        return html`<div class="grow" key=${g}><b>${U.GROUP_LABEL[g]}</b><div class="lines">
          ${list.filter(function (i) { return i.group === g; }).map(function (ing) {
            return html`<${IngredientLine} key=${ing._k} ing=${ing}
              onChange=${function (next) { props.onChange(list.map(function (x) { return x._k === ing._k ? next : x; })); }}
              onRemove=${function () { props.onChange(list.filter(function (x) { return x._k !== ing._k; })); }}/>`;
          })}
        </div></div>`;
      })}
      <div class="addrow">
        ${kinds.map(function (g) {
          return html`<button type="button" key=${g} onClick=${function () { add(g); }}><${Icon} name="plus"/>${U.GROUP_LABEL[g]}</button>`;
        })}
        ${offered.slice(0, 8).map(function (n) {
          return html`<button type="button" key=${'n-' + n} onClick=${function () { add('other', n); }}><${Icon} name="plus"/>${n}</button>`;
        })}
        <button type="button" onClick=${function () { add('other', ''); }}><${Icon} name="plus"/>${U.GROUP_LABEL.other}</button>
      </div>
      <datalist id="lgt-ingredient-names">
        ${known.map(function (n) { return html`<option key=${n} value=${n}></option>`; })}
      </datalist>
    </div>`;
  }

  // ---------- baking details ----------
  function Chips(props) {
    return html`<div class=${'chips ' + (props.class || 'c3')}>
      ${props.options.map(function (o) {
        var on = o.id === props.value;
        return html`<button type="button" key=${o.id} class=${on ? 'on' : ''} aria-pressed=${on}
          onClick=${function () { props.onChange(on ? props.none : o.id); }}>${o.body || o.label}</button>`;
      })}
    </div>`;
  }
  function Num(props) {
    return html`<input id=${fid(props.label)} class=${'input ' + (props.class || '')} inputmode="numeric" autocomplete="off" aria-label=${props.label}
      value=${props.value === null || props.value === undefined ? '' : props.value}
      onInput=${function (e) { props.onChange(e.target.value.replace(/[^\d]/g, '')); }}/>`;
  }

  function BakeEditor(props) {
    var bake = props.bake;
    function set(patch) { props.onChange(U.withBake(bake, patch)); }
    var chosen = bake.programs || U.cleanBake(bake).programs;
    var sizes = U.sizesFor(chosen);
    var t = U.splitMinutes(bake.minutes);
    // Added time belongs to the program whose time is set by hand, so it shows only with that program.
    var extra = U.hasManual(chosen);
    var oven = U.hasDough(chosen) || bake.ovenTemp !== null || bake.ovenMinutes !== null;
    var time = html`<${Field} label="Time">
      <div class="time">
        <${Num} label="Hours" value=${t.h} onChange=${function (v) { set({ minutes: U.joinMinutes(v, t.m) }); }}/>h
        <${Num} label="Minutes" value=${t.m} onChange=${function (v) { set({ minutes: U.joinMinutes(t.h, v) }); }}/>min
      </div>
    <//>`;
    return html`
      <${Field} label="Setting">
        <div class="chips c3 programs">
          ${LGT.machine.programs.map(function (p) {
            var on = chosen.indexOf(p.n) >= 0;
            return html`<button type="button" key=${p.n} class=${on ? 'on' : ''} aria-pressed=${on}
              onClick=${function () { set({ programs: U.toggleProgram(chosen, p.n) }); }}><b>${p.n}</b>${p.name}</button>`;
          })}
        </div>
      <//>
      ${sizes.length && !props.hideSize ? html`<${Field} label="Loaf size">
        <${Chips} options=${sizes} value=${bake.size} none=""
          onChange=${function (v) { set({ size: v }); }}/>
      <//>` : null}
      ${U.hasCrust(chosen) ? html`<${Field} label="Crust color">
        <${Chips} options=${LGT.machine.crusts} value=${bake.crust} none=""
          onChange=${function (v) { set({ crust: v }); }}/>
      <//>` : null}
      ${extra ? html`<div class="cols times">
        ${time}
        <${Field} label="Added time">
          <div class="time">
            <${Num} label="Added minutes" value=${bake.added} onChange=${function (v) { set({ added: U.num(v) }); }}/>min
          </div>
        <//>
      </div>
      <${Field} label="Reason">
        <input id="f-reason" class="input" value=${bake.reason} aria-label="Reason" onInput=${val(function (v) { set({ reason: v }); })}/>
      <//>` : time}
      <${Field} label="Proofing">
          <div class="chips c3">
            ${U.PROOF_PLACES.map(function (p) {
              var list = bake.proof || [], on = list.indexOf(p.id) >= 0;
              return html`<button type="button" key=${p.id} class=${on ? 'on' : ''} aria-pressed=${on}
                onClick=${function () { set({ proof: on ? list.filter(function (x) { return x !== p.id; }) : list.concat([p.id]) }); }}>${p.label}</button>`;
            })}
          </div>
      <//>
        <${Field} label="Proof time">
          <div class="time">
            <${Num} label="Proof hours" value=${U.splitMinutes(bake.proofMinutes).h}
              onChange=${function (v) { set({ proofMinutes: U.joinMinutes(v, U.splitMinutes(bake.proofMinutes).m) }); }}/>h
            <${Num} label="Proof minutes" value=${U.splitMinutes(bake.proofMinutes).m}
              onChange=${function (v) { set({ proofMinutes: U.joinMinutes(U.splitMinutes(bake.proofMinutes).h, v) }); }}/>min
          </div>
        <//>
      ${oven ? html`<${Field} label="Oven">
        <div class="time">
          <${Num} class="temp" label="Oven temperature" value=${bake.ovenTemp} onChange=${function (v) { set({ ovenTemp: U.num(v) }); }}/>°F
          <${Num} label="Oven minutes" value=${bake.ovenMinutes} onChange=${function (v) { set({ ovenMinutes: U.num(v) }); }}/>min
        </div>
      <//>` : null}`;
  }

  // ---------- the recipe part of a form ----------
  /** props: recipe, savedName (its name as saved, when editing), onChange, pending (Blob[] of images not yet saved), onPending, onView, hideSize */
  function RecipeFields(props) {
    var r = props.recipe;
    function set(patch) { props.onChange(Object.assign({}, r, patch)); }
    var known = LGT.store.sources().filter(function (s) { return s !== r.source; });
    var pending = props.pending || [];
    var hasOriginals = (r.originals && r.originals.length) || pending.length;
    // Recipes this one can be attached to as a tweak.
    var parents = LGT.store.parentChoices([r.name, props.savedName]);
    if (r.parent && !parents.some(function (n) { return U.nameKey(n) === U.nameKey(r.parent); })) parents = [r.parent].concat(parents);
    return html`
      ${parents.length ? html`<${Field} label="Parent">
        <select id="f-parent" class="input" aria-label="Parent" value=${r.parent || ''} onChange=${val(function (v) { set({ parent: v }); })}>
          <option value="">–</option>
          ${parents.map(function (n) { return html`<option key=${n} value=${n}>${n}</option>`; })}
        </select>
      <//>` : null}
      <${Field} label="Ingredients">
        <${IngredientsEditor} list=${r.ingredients} onChange=${function (list) { set({ ingredients: list }); }}/>
      <//>
      <${BakeEditor} bake=${r.bake} hideSize=${props.hideSize} onChange=${function (bake) { set({ bake: bake }); }}/>
      <${Field} label="Method">
        <${Area} label="Method" value=${r.method} onChange=${function (v) { set({ method: v }); }}/>
      <//>
      <${Field} label="Source">
        <${Area} rows=${1} label="Source" value=${r.source} onChange=${function (v) { set({ source: v.replace(/\n/g, ' ') }); }}/>
        ${!r.source && known.length ? html`<div class="suggest">
          ${known.map(function (s) { return html`<button type="button" key=${s} onClick=${function () { set({ source: s }); }}>${s}</button>`; })}
        </div>` : null}
      <//>
      <${Field} label="Link">
        <input id="f-link" class="input" type="url" inputmode="url" autocapitalize="off" autocomplete="off" value=${r.link} aria-label="Link"
          onInput=${val(function (v) { set({ link: v }); })}/>
      <//>
      ${hasOriginals ? html`<${Field} label="Original">
        <div class="origs" style="padding:0;border:0">
          ${(r.originals || []).map(function (id) {
            return html`<div class="orig" key=${id}>
              <button type="button" aria-label="View original" onClick=${function () { props.onView({ id: id }); }}><${ui.Photo} id=${id}/></button>
              <button type="button" class="x" aria-label="Remove" onClick=${function () { set({ originals: r.originals.filter(function (x) { return x !== id; }) }); }}><${Icon} name="close"/></button>
            </div>`;
          })}
          ${pending.map(function (blob, n) {
            return html`<div class="orig" key=${'p' + n}>
              <button type="button" aria-label="View original" onClick=${function () { props.onView({ blob: blob }); }}><${ui.BlobImage} blob=${blob}/></button>
              <button type="button" class="x" aria-label="Remove" onClick=${function () { props.onPending(pending.filter(function (b) { return b !== blob; })); }}><${Icon} name="close"/></button>
            </div>`;
          })}
        </div>
      <//>` : null}`;
  }

  // ---------- ratings ----------
  function RatingsEditor(props) {
    var ratings = props.ratings, notes = props.notes;
    var s = useState({}), open = s[0], setOpen = s[1];
    return html`<div class="rate">
      ${U.RATINGS.map(function (k) {
        var key = k[0], label = k[1], showNote = open[key] || !!notes[key];
        function setNote(v) { var n = Object.assign({}, notes); n[key] = v; props.onChange(ratings, n); }
        return html`<div key=${key}>
          <div class="row">
            <b>${label}</b>
            <${ui.Stars} label=${label} value=${ratings[key]} onChange=${function (v) {
              var r = Object.assign({}, ratings); r[key] = v; props.onChange(r, notes);
            }}/>
            ${showNote ? null : html`<button type="button" class="noteb" onClick=${function () {
              var o = Object.assign({}, open); o[key] = true; setOpen(o);
            }}>Note</button>`}
          </div>
          ${showNote ? html`<input id=${'f-' + key + '-note'} class="input" value=${notes[key] || ''} placeholder="Note" aria-label=${label + ' note'} onInput=${val(setNote)}/>` : null}
        </div>`;
      })}
    </div>`;
  }

  // ---------- photos ----------
  var picSeq = 0;
  /** A photo in the form: one already saved ({photo}) or one just picked ({blob}). */
  function pic(x) { return Object.assign({ key: 'p' + (++picSeq) }, x); }

  /**
   * The bread's photos in order, cover first, with + at the end. Drag a photo to move it.
   * props: items ([{key, photo} | {key, blob}]), onChange(items), onAdd(files), onView({id} | {blob})
   */
  function PhotosField(props) {
    var items = props.items || [], byKey = {};
    items.forEach(function (it) { byKey[it.key] = it; });
    var d = ui.useDragOrder(items.map(function (it) { return it.key; }), function (keys) {
      props.onChange(keys.map(function (k) { return byKey[k]; }).filter(Boolean));
    });
    function pick(e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (files.length) props.onAdd(files);
    }
    return html`<div class=${'photos' + (d.dragging ? ' dragging' : '')} ref=${d.box}>
      ${d.order.map(function (k, n) {
        var it = byKey[k];
        if (!it) return null;
        return html`<div class=${'photo has' + (d.dragging === k ? ' lifted' : '')} key=${k} ...${d.item(k)}>
          <button type="button" class="view" aria-label=${'Photo ' + (n + 1)}
            onClick=${function () { props.onView(it.photo ? { id: it.photo.full } : { blob: it.blob }); }}>
            ${it.photo ? html`<${ui.Photo} id=${it.photo.thumb || it.photo.full}/>` : html`<${ui.BlobImage} blob=${it.blob}/>`}
          </button>
          <button type="button" class="x" aria-label="Remove photo"
            onClick=${function () { props.onChange(items.filter(function (x) { return x.key !== k; })); }}><${Icon} name="close"/></button>
        </div>`;
      })}
      <div class="photo add">
        <${Icon} name="camera"/>
        <input id="f-photo" type="file" accept="image/*" multiple aria-label="Photo" onChange=${pick}/>
      </div>
    </div>`;
  }

  LGT.fields = {
    keyed: keyed, Field: Field, Area: Area, IngredientsEditor: IngredientsEditor, BakeEditor: BakeEditor,
    RecipeFields: RecipeFields, RatingsEditor: RatingsEditor, PhotosField: PhotosField, pic: pic, Chips: Chips
  };
})(typeof window !== 'undefined' ? window : globalThis);
