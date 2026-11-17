const assetQuery = new URL(document.currentScript.src).search;
(async () => {
  const status = document.getElementById('viewer-status');
  try {
    const catalogue = await (await fetch('../lib/templates/catalogue.json' + assetQuery)).json();
    const id = new URLSearchParams(location.search).get('deck');
    const deck = catalogue.find((item) => item.id === id);
    if (!deck) { status.textContent = 'Presentation not found. Return to the gallery to choose one.'; return; }
    const response = await fetch('../lib/templates/' + deck.file + assetQuery);
    if (!response.ok) throw new Error();
    const source = await response.text();
    document.title = deck.title + ' | aniflow';
    document.getElementById('edit').href = '../try/?template=' + encodeURIComponent(deck.id);
    status.remove();
    if (!location.hash) history.replaceState(null, '', '#slide=1');
    Aniflow.reader({ article: '#deck', source, presentButton: '#present', mermaid: '../lib/vendor/mermaid.min.js', resolveImage: (url) => url.startsWith('/icons/') ? '../lib' + url : null });
  } catch (error) { status.textContent = 'The presentation could not be loaded. Return to the gallery and try again.'; }
})();
