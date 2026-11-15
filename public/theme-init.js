// Applies the saved theme before the app draws, so there's no flash of the wrong colours.
(function () {
  try {
    var p = localStorage.getItem('ep.theme') || 'dark';
    var t = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'light') document.querySelector('meta[name="theme-color"]').setAttribute('content', '#F7F7F3');
    var a = JSON.parse(localStorage.getItem('ep.accentVars') || 'null');
    if (a && a[t]) {
      var st = document.documentElement.style;
      st.setProperty('--acid', a[t].acid); st.setProperty('--acid-dim', a[t].dim); st.setProperty('--acid-ink', a[t].ink);
    }
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
})();
