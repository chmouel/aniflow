import { host } from '../host.js';
import { diagramHash } from './hash.js';
import { showIcon } from './icons.js';
import { diagramCanvas } from './picture.js';
import { copyText } from '../reader/code.js';

const VIDEO_TYPES = {
  mp4: ['video/mp4;codecs=avc1.640028', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm'],
};

// The mime a recording would use: mp4 and webm must be that container, while video takes
// whichever one the browser records.
export function diagramVideoType(kind) {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return '';
  const types = kind === 'mp4' ? VIDEO_TYPES.mp4 : kind === 'webm' ? VIDEO_TYPES.webm : [...VIDEO_TYPES.mp4, ...VIDEO_TYPES.webm];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function diagramExportName(title, extension) {
  const slug = (text) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let page = host.pageName?.() ?? location.pathname.split('/').pop() ?? '';
  try { page = decodeURIComponent(page); } catch (error) { /* keep it encoded */ }
  page = page.replace(/\.(md|markdown)$/i, '');
  return ([slug(page), slug(title || '')].filter(Boolean).join('-').slice(0, 120) || 'diagram') + '.' + extension;
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Every diagram can copy a link to its spotlight or save a picture of its current view; a story
// adds its GIF and video choices to the same menu and takes over the button while one is saved.
export function diagramShare(stage, svg, tools) {
  const group = document.createElement('div');
  group.className = 'diagram-share';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'play-record';
  showIcon(button, 'share');
  const menu = document.createElement('div');
  menu.className = 'diagram-export';
  menu.hidden = true;
  group.append(button, menu);
  tools.prepend(group);
  const share = {
    button: button,
    title: 'Share or save this diagram',
    name: () => '',
    choose: null,
    cancel: () => false,
    label(text) {
      button.title = text || share.title;
      button.setAttribute('aria-label', button.title);
    },
    choice(kind, text, note) {
      const element = document.createElement('button');
      element.type = 'button';
      element.dataset.kind = kind;
      element.dataset.note = note;
      element.textContent = text;
      const small = document.createElement('small');
      small.textContent = note;
      element.append(small);
      menu.append(element);
      return element;
    },
  };
  share.link = share.choice('link', 'Copy link', 'To this diagram and spotlight');
  share.choice('png', 'PNG', 'What you see right now');
  share.label();

  // A still keeps the current zoom, spotlight, dot and caption, so it draws the live viewBox.
  // It resolves to {name, blob} and throws once the button says what went wrong.
  async function savePicture() {
    const box = svg.viewBox.baseVal;
    const caption = stage.querySelector(':scope > .diagram-caption');
    const text = caption && !caption.hidden ? caption.textContent : '';
    const name = diagramExportName(share.name(), 'png');
    try {
      const canvas = await diagramCanvas(svg, { x: box.x, y: box.y, w: box.width, h: box.height }, 2400, Boolean(text), true);
      await canvas.draw(text);
      const blob = await new Promise((resolve) => canvas.element.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('the browser made no picture');
      await host.save(name, blob);
      share.label();
      return { name: name, blob: blob };
    } catch (error) {
      share.label('Could not save the PNG: ' + (error.message || error));
      throw error;
    }
  }
  stage.diagramPicture = savePicture;

  button.addEventListener('click', () => {
    if (share.cancel()) return;
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener('click', async (event) => {
    const choice = event.target.closest('button[data-kind]');
    if (!choice) return;
    if (choice.dataset.kind === 'link') {
      const note = choice.querySelector('small');
      const hash = diagramHash(stage);
      if (!hash) return;
      history.replaceState(history.state, '', location.pathname + location.search + hash);
      note.textContent = (await copyText(location.href)) ? 'Copied' : 'Could not copy, the address bar has it';
      setTimeout(() => {
        menu.hidden = true;
        note.textContent = choice.dataset.note;
      }, 900);
      return;
    }
    menu.hidden = true;
    if (choice.dataset.kind === 'png') savePicture().catch(() => {});
    else if (share.choose) share.choose(choice.dataset.kind);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !group.contains(event.target)) menu.hidden = true;
  }, { signal: host.render?.signal });
  group.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    event.stopPropagation();
    event.preventDefault();
    menu.hidden = true;
    button.focus();
  });
  return share;
}
