/* The bread machine this log is kept for. Everything the interface knows about the
   machine comes from here: program names, which loaf sizes and crust colours each
   program offers, and its total time in minutes (from the manual's Programs & Timing
   tables). `aka` lists names recipes commonly use for the same program. */
(function (root) {
  var LGT = root.LGT = root.LGT || {};
  LGT.machine = {
    model: 'Cuisinart CBK-110NAS',
    sizes: [
      { id: '1', label: '1 lb' },
      { id: '1.5', label: '1½ lb' },
      { id: '2', label: '2 lb' }
    ],
    crusts: [
      { id: 'light', label: 'Light' },
      { id: 'medium', label: 'Medium' },
      { id: 'dark', label: 'Dark' }
    ],
    programs: [
      { n: 1, name: 'White', aka: ['Basic'], crust: true, minutes: { '1': 198, '1.5': 205, '2': 210 } },
      { n: 2, name: 'French', aka: ['Italian'], crust: false, minutes: { '1': 245, '1.5': 255, '2': 260 } },
      { n: 3, name: 'Whole Wheat', aka: ['Whole Grain', 'Wheat'], crust: true, minutes: { '1': 237, '1.5': 245, '2': 250 } },
      { n: 4, name: 'Ultra-Fast', aka: ['Rapid', 'Express'], crust: true, minutes: { '1': 113, '1.5': 123 } },
      { n: 5, name: 'Sweet', aka: [], crust: true, minutes: { '1': 195, '1.5': 200 } },
      { n: 6, name: 'Gluten-Free', aka: [], crust: true, minutes: { '1.5': 135 } },
      { n: 7, name: 'Artisan Dough', aka: [], crust: false, total: 305, dough: true },
      { n: 8, name: 'Dough', aka: ['Pizza Dough'], crust: false, total: 90, dough: true },
      { n: 9, name: 'Jam', aka: [], crust: false, total: 80 },
      { n: 10, name: 'Packaged Mix', aka: [], crust: true, total: 154 },
      { n: 11, name: 'Cake', aka: ['Quick Bread'], crust: false, total: 112 },
      { n: 12, name: 'Bake', aka: ['Bake Only'], crust: false, total: 100 }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
