// The id a heading gets, which wikilinks to a heading ([[note#Heading]]) must produce too.
export function slug(text) {
  return String(text).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-') || 'section';
}
