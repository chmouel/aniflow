// #diagram=2&story=1&step=3&focus=A,B names the second diagram on the page, its first story
// after three steps, and the boxes in the spotlight. Heading ids never hold '=', so it cannot
// clash with them.
export function diagramHash(stage) {
  const number = stage.dataset.diagram;
  if (!number) return '';
  const parts = ['diagram=' + number];
  const at = stage.diagramPlay?.where();
  if (at) {
    parts.push('story=' + at.story);
    if (at.step !== null) parts.push('step=' + at.step);
  }
  const lit = stage.diagramFocus?.get() || [];
  if (lit.length) parts.push('focus=' + lit.map(encodeURIComponent).join(','));
  return '#' + parts.join('&');
}

export function diagramFromHash(stage) {
  if (!location.hash.startsWith('#diagram=')) return false;
  const wanted = new URLSearchParams(location.hash.slice(1));
  if (wanted.get('diagram') !== stage.dataset.diagram) return false;
  const number = (name) => (/^\d+$/.test(wanted.get(name) || '') ? Number(wanted.get(name)) : null);
  if (stage.diagramPlay && (number('story') !== null || number('step') !== null)) stage.diagramPlay.restore(number('story') || 1, number('step'));
  if (stage.diagramFocus) stage.diagramFocus.set((wanted.get('focus') || '').split(',').filter(Boolean));
  stage.closest('.mermaid-diagram')?.scrollIntoView({ block: 'center' });
  stage.diagramFull?.();
  return true;
}
