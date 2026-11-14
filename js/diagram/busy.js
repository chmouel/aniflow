// Anything that must not vanish under a page reload (a playing story, a highlighted box, an
// open full-screen diagram, a comment being written) registers a check here; isBusy() asks them all.
const checks = [];

export function addBusyCheck(check) {
  checks.push(check);
}

export function isBusy() {
  return checks.some((check) => check());
}

export let diagramsBusy = 0;
let diagramBusyWrapped = false;
// A playing story or a highlighted box holds off the live reload, so neither vanishes mid-talk.
export function diagramBusy(on) {
  diagramsBusy += on ? 1 : -1;
  if (diagramBusyWrapped) return;
  diagramBusyWrapped = true;
  addBusyCheck(() => diagramsBusy > 0);
}
