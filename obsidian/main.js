// Draws with aniflow's vendored mermaid: Obsidian's loadMermaid() is another renderer whose SVG
// the player cannot follow.
import { MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import { diagrams } from '../js/diagram/index.js';
import { playScript } from '../js/diagram/parse.js';
import loadMermaid from 'aniflow:mermaid';
import icons from 'aniflow:icons';

const PICTURE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const DEFAULTS = { everyDiagram: false, autoplay: false };

class DiagramPart extends MarkdownRenderChild {
  constructor(plugin, element) {
    super(element);
    this.plugin = plugin;
  }

  onload() {
    this.plugin.parts.add(this);
    this.fresh();
    const draw = () => this.plugin.engine.draw(this.containerEl, this.render.signal);
    // Reading view builds a section before it puts it in the page.
    if (this.containerEl.isConnected) draw();
    else this.register(this.containerEl.onNodeInserted(draw, true));
  }

  onunload() {
    this.plugin.parts.delete(this);
    this.render.abort();
  }

  fresh() {
    this.render?.abort();
    this.render = new AbortController();
  }

  redraw() {
    this.fresh();
    this.plugin.engine.redraw(this.containerEl, this.render.signal);
  }
}

export default class AniflowPlugin extends Plugin {
  async onload() {
    this.settings = { ...DEFAULTS, ...(await this.loadData()) };
    this.parts = new Set();
    this.engine = diagrams({
      root: document.body,
      mermaid: loadMermaid,
      dark: () => document.body.classList.contains('theme-dark'),
      autoplay: this.settings.autoplay,
      resolveImage: (value, block) => this.picture(value, block?.dataset.aniflowPath || ''),
      pageName: () => this.app.workspace.getActiveFile()?.basename || '',
      save: (name, blob) => this.save(name, blob),
    });
    // The parts belong to the notes' views, which outlive the plugin, so their listeners go here.
    this.register(() => {
      for (const part of this.parts) part.render.abort();
      this.parts.clear();
      this.engine.close();
    });
    // Before Obsidian's own mermaid step, which would take the block otherwise.
    this.registerMarkdownPostProcessor((element, context) => this.claim(element, context), -100);
    this.registerEvent(this.app.workspace.on('css-change', () => {
      for (const part of this.parts) part.redraw();
    }));
    this.addSettingTab(new AniflowSettings(this));
  }

  claim(element, context) {
    let claimed = false;
    for (const code of element.querySelectorAll('pre > code.language-mermaid')) {
      const source = code.textContent;
      if (!this.settings.everyDiagram && !playScript(source).length) continue;
      const pre = code.parentElement;
      pre.replaceChildren(source);
      pre.className = 'highlight-source-mermaid';
      pre.dataset.aniflowPath = context.sourcePath;
      const section = context.getSectionInfo(element);
      if (section) pre.dataset.line = String(section.lineStart + 1);
      claimed = true;
    }
    if (claimed) context.addChild(new DiagramPart(this, element));
  }

  // Vault pictures go in as data URLs, since mermaid drops app:// links.
  async picture(value, sourcePath) {
    const icon = /^\/icons\/([a-z0-9-]+)\.svg$/.exec(value);
    if (icon) return icons[icon[1]] || null;
    if (/^(?:https:|data:image\/)/i.test(value)) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(decodeURI(value.replace(/^\//, '')), sourcePath);
    const type = file && PICTURE_TYPES[file.extension.toLowerCase()];
    if (!type) return null;
    const bytes = new Uint8Array(await this.app.vault.readBinary(file));
    let binary = '';
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return 'data:' + type + ';base64,' + btoa(binary);
  }

  async save(name, blob) {
    const note = this.app.workspace.getActiveFile()?.path || '';
    const path = normalizePath(await this.app.fileManager.getAvailablePathForAttachment(name, note));
    await this.app.vault.createBinary(path, await blob.arrayBuffer());
    new Notice('Saved ' + path);
  }
}

class AniflowSettings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { settings } = this.plugin;
    const toggle = (key, name, description) => new Setting(this.containerEl).setName(name).setDesc(description)
      .addToggle((control) => control.setValue(settings[key]).onChange(async (value) => {
        settings[key] = value;
        await this.plugin.saveData(settings);
      }));
    this.containerEl.empty();
    toggle('everyDiagram', 'Draw every Mermaid diagram', 'Also draw diagrams without a %% play: story, for pan, zoom and full screen. Applies to notes opened afterwards.');
    toggle('autoplay', 'Play when visible', 'Start a walkthrough once its diagram scrolls into view. Applies after restarting Obsidian.');
  }
}
