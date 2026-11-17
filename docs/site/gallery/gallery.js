const assetQuery = new URL(document.currentScript.src).search;
(async () => {
  const list = document.getElementById('decks');
  try {
    const response = await fetch('../lib/templates/catalogue.json' + assetQuery);
    if (!response.ok) throw new Error();
    const decks = await response.json();
    for (const deck of decks) {
      const item = document.createElement('article');
      item.className = 'gallery-item';
      const image = document.createElement('img');
      image.src = 'previews/' + deck.id + '.webp' + assetQuery;
      image.alt = deck.title + ': cover and two inner slides';
      image.width = 1200;
      image.height = 450;
      image.loading = 'lazy';
      const content = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = deck.title;
      const description = document.createElement('p');
      description.textContent = deck.description;
      const actions = document.createElement('div');
      actions.className = 'actions';
      for (const [text, href, download] of [
        ['Present', 'view.html?deck=' + encodeURIComponent(deck.id) + '#slide=1', false],
        ['Use this template', '../try/?template=' + encodeURIComponent(deck.id), false],
        ['Download Markdown', '../lib/templates/' + encodeURIComponent(deck.file) + assetQuery, true],
      ]) {
        const link = document.createElement('a');
        link.textContent = text;
        link.href = href;
        if (download) link.download = deck.file;
        else link.className = 'button' + (text === 'Present' ? '' : ' ghost');
        actions.append(link);
      }
      content.append(title, description, actions);
      item.append(image, content);
      list.append(item);
    }
  } catch (error) { document.getElementById('gallery-status').textContent = 'The gallery could not be loaded. Try refreshing the page.'; }
})();
