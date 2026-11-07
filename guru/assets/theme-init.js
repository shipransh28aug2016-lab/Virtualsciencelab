(function () {
  try {
    var t = localStorage.getItem('guru.ui.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable */ }
})();
