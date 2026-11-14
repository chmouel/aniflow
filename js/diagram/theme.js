import { host } from '../host.js';

// Mermaid's base theme recoloured from the page, so diagrams follow the picked theme.
export function diagramColours(dark) {
  const style = getComputedStyle(host.article);
  const context = document.createElement('canvas').getContext('2d');
  const rgb = (name) => {
    context.fillStyle = '#808080';
    context.fillStyle = style.getPropertyValue(name).trim() || '#808080';
    const value = context.fillStyle;
    if (value[0] === '#') return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
    return value.match(/[\d.]+/g).slice(0, 3).map(Number);
  };
  const hex = (colour) => '#' + colour.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('');
  const mix = (front, back, amount) => front.map((part, index) => part * amount + back[index] * (1 - amount));
  const back = rgb('--bgColor-muted');
  const ink = rgb('--fgColor-default');
  const muted = rgb('--fgColor-muted');
  const accent = rgb('--fgColor-accent');
  const line = rgb('--borderColor-default');
  const node = hex(mix(accent, back, dark ? 0.2 : 0.14));
  return {
    darkMode: dark,
    background: hex(back),
    mainBkg: node,
    primaryColor: node,
    primaryBorderColor: hex(mix(accent, back, 0.65)),
    primaryTextColor: hex(ink),
    secondaryColor: hex(mix(muted, back, 0.16)),
    secondaryBorderColor: hex(line),
    secondaryTextColor: hex(ink),
    tertiaryColor: hex(mix(ink, back, 0.05)),
    tertiaryBorderColor: hex(line),
    tertiaryTextColor: hex(ink),
    textColor: hex(ink),
    lineColor: hex(muted),
    clusterBkg: hex(mix(ink, back, 0.04)),
    clusterBorder: hex(line),
    edgeLabelBackground: hex(back),
    noteBkgColor: hex(mix(accent, back, 0.08)),
    noteBorderColor: hex(line),
    noteTextColor: hex(ink),
    fontFamily: style.fontFamily,
    fontSize: '15px',
    dropShadow: 'none',
    useGradient: false,
  };
}
