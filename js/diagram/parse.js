// Walkthroughs are written as mermaid comments, which every other renderer ignores:
//   %% play: Title        starts a scenario
//   %% A -> B : label     sends a token from node A to node B along the edge between them
//   %% A -> B, C          sends one token down each edge at once (A, B -> C joins two)
//   %% A -> B @ok         takes the edge mermaid knows as ok (A ok@--> B) among several
//   %% skip A B           fades nodes for the rest of the scenario
//   %% wait 1500          holds the picture before the next step, in milliseconds at 1x
// In a sequence diagram A and B are participants, and each step takes the next A to B message.
export function diagramLines(source, kinds) {
  const lines = source.split(/\r?\n/);
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at++;
  if (lines[at] && lines[at].trim() === '---') {
    at++;
    while (at < lines.length && lines[at].trim() !== '---') at++;
    at++;
  }
  const head = lines.slice(at).map((line) => line.trim()).find((line) => line && !line.startsWith('%%'));
  return head && kinds.test(head) ? lines.slice(at) : null;
}
export const flowchartLines = (source) => diagramLines(source, /^(?:flowchart|graph)\b/);

export const WAIT_MAX = 10000;

// base is the document line of the opening fence, so each step can say where it was written.
export function playScript(source, base) {
  const lines = diagramLines(source, /^(?:flowchart|graph|sequenceDiagram)\b/);
  if (!lines) return [];
  const offset = (base || 0) + source.split(/\r?\n/).length - lines.length + 1;
  const scenarios = [];
  let current = null;
  // A wait holds the picture before the step that follows it; one at the end holds the finish.
  let hold = null;
  const story = () => {
    if (!current) {
      current = { title: 'Walkthrough', steps: [], tail: null };
      scenarios.push(current);
    }
    return current;
  };
  lines.forEach((line, at) => {
    const comment = /^\s*%%(?!\{)\s*(.*?)\s*$/.exec(line);
    if (!comment) return;
    const text = comment[1];
    const title = /^play\s*:\s*(.*)$/i.exec(text);
    if (title) {
      if (current && hold) current.tail = hold;
      hold = null;
      current = { title: title[1] || 'Scenario ' + (scenarios.length + 1), steps: [], tail: null };
      scenarios.push(current);
      return;
    }
    let step = null;
    // A sentence after | is the step's caption: A -> B : label | caption, or skip A B | caption.
    const bar = text.indexOf('|');
    const body = bar < 0 ? text : text.slice(0, bar).trim();
    const caption = bar < 0 ? '' : text.slice(bar + 1).trim();
    const where = { caption: caption, text: text, line: offset + at };
    if (/^wait\b/i.test(body)) {
      const wait = /^wait\s+(\d+)\s*(?:ms)?$/i.exec(body);
      if (!wait) step = Object.assign({ bad: 'wait needs a number of milliseconds' }, where);
      else {
        story();
        hold = { ms: Math.min(WAIT_MAX, (hold ? hold.ms : 0) + Number(wait[1])), caption: caption || (hold ? hold.caption : '') };
        return;
      }
    }
    // A, B -> C or A -> B, C (or B & C, as mermaid writes it) moves one dot down each edge at once.
    // @id after a name picks the edge mermaid declared with that id.
    const move = /^([^:]+?)\s*-+>\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(body);
    const skip = /^skip\s+(.+)$/i.exec(body);
    const names = (list) => {
      const found = [];
      for (const word of list.replace(/\s*@\s*/g, '@').split(/[\s,&]+/).filter(Boolean)) {
        const [name, edge] = word.split('@');
        if (name) found.push({ name: name, edge: edge || '' });
        else if (found.length && edge) found[found.length - 1].edge = edge;
      }
      return found;
    };
    if (!step && move) step = Object.assign({ from: names(move[1]), to: names(move[2]), label: move[3] || '' }, where);
    else if (!step && skip) step = Object.assign({ skip: skip[1].split(/[\s,]+/).filter(Boolean) }, where);
    if (!step) return;
    step.hold = hold;
    hold = null;
    story().steps.push(step);
  });
  if (current && hold) current.tail = hold;
  return scenarios.filter((scenario) => scenario.steps.length);
}
