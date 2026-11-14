import { host } from '../host.js';
import { diagramIcon } from './icons.js';

// A walkthrough step that cannot play is dropped, and this badge says which and why, so a
// broken story never plays short without a word.
export function diagramWarnings(stage, tools, scenarios) {
  const rows = scenarios.flatMap((scenario) => scenario.problems.map((problem) => Object.assign({ story: scenario.title }, problem)));
  if (!rows.length) return;
  const group = document.createElement('div');
  group.className = 'diagram-warnings';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'play-warn';
  button.innerHTML = diagramIcon('warn');
  const count = document.createElement('span');
  count.textContent = String(rows.length);
  button.append(count);
  const text = rows.length === 1 ? '1 walkthrough step cannot play' : rows.length + ' walkthrough steps cannot play';
  button.title = text;
  button.setAttribute('aria-label', text);
  button.setAttribute('aria-expanded', 'false');
  const list = document.createElement('ul');
  list.className = 'diagram-problems';
  list.hidden = true;
  for (const row of rows) {
    const item = document.createElement('li');
    item.dataset.line = String(row.line);
    const where = document.createElement('small');
    where.textContent = row.story + ' · line ' + row.line;
    const reason = document.createElement('span');
    reason.textContent = row.reason;
    const source = document.createElement('code');
    source.textContent = '%% ' + row.text;
    item.append(where, reason, source);
    list.append(item);
  }
  group.append(button, list);
  tools.prepend(group);
  const show = (open) => {
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => show(list.hidden));
  document.addEventListener('pointerdown', (event) => {
    if (!list.hidden && !group.contains(event.target)) show(false);
  }, { signal: host.render?.signal });
  group.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || list.hidden) return;
    event.stopPropagation();
    event.preventDefault();
    show(false);
    button.focus();
  });
  console.warn('Diagram walkthrough: ' + text + '\n' + rows.map((row) => row.story + ', line ' + row.line + ': ' + row.reason + ' (%% ' + row.text + ')').join('\n'));
}
