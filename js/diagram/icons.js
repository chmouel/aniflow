export const DIAGRAM_ICONS = {
  out: '<path d="M3 8h10"/>',
  in: '<path d="M3 8h10M8 3v10"/>',
  fit: '<path d="M13 8a5 5 0 1 1-1.46-3.54M13.5 2v3h-3"/>',
  full: '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  play: '<path d="M5 3.2v9.6L12.6 8z"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.2"/>',
  share: '<path d="M8 2.5v7.5M5 5.2l3-2.7 3 2.7M4.5 8H3.5v5.5h9V8h-1"/>',
  back: '<path d="M10.5 3.5L6 8l4.5 4.5M4 3.5v9"/>',
  next: '<path d="M5.5 3.5L10 8l-4.5 4.5M12 3.5v9"/>',
  left: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  right: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  pen: '<path d="M10.5 2.8l2.7 2.7-7.4 7.4-3.3.6.6-3.3z"/><path d="M9 4.3l2.7 2.7"/>',
  follow: '<path d="M2.5 5.5h2.2l1.1-1.7h4.4l1.1 1.7h2.2v7h-11z"/><circle cx="8" cy="9" r="2.1"/>',
  warn: '<path d="M8 2.2l6 10.6H2z"/><path d="M8 6.6v2.8M8 11.1v.1"/>',
  theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/>',
  comment: '<path d="M2.5 3.5h11v7.2H8.2l-3.2 2.6v-2.6H2.5z"/><path d="M5 6.3h6M5 8.3h4"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  notes: '<rect x="1.8" y="3" width="8.4" height="6.2" rx="1"/><path d="M12.2 4.5h2v8.5H5.5v-2M6 9.2v2"/>',
  laser: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2"/>',
};
export const diagramIcon = (name) => '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' + DIAGRAM_ICONS[name] + '</svg>';

// Parsed rather than set as an HTML string, which Obsidian's plugin review rejects.
export function showIcon(element, name) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' + DIAGRAM_ICONS[name] + '</svg>';
  element.replaceChildren(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));
}
