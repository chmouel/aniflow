// Playback speed, one choice for every diagram. 1x plays slower than the timeline's raw
// durations so there is time to talk over each step.
export const DIAGRAM_SPEEDS = [0.5, 0.75, 1, 1.5, 2];
export const DIAGRAM_PACE = 0.6;
export let diagramSpeed = DIAGRAM_SPEEDS.includes(Number(localStorage.getItem('aniflow-diagram-speed')))
  ? Number(localStorage.getItem('aniflow-diagram-speed')) : 1;
export const diagramRate = () => diagramSpeed * DIAGRAM_PACE;
// by is +1 or -1 to go faster or slower, stopping at either end; 0 cycles through the list.
export function setDiagramSpeed(by) {
  const at = DIAGRAM_SPEEDS.indexOf(diagramSpeed);
  diagramSpeed = by ? DIAGRAM_SPEEDS[Math.max(0, Math.min(DIAGRAM_SPEEDS.length - 1, at + by))]
    : DIAGRAM_SPEEDS[(at + 1) % DIAGRAM_SPEEDS.length];
  localStorage.setItem('aniflow-diagram-speed', String(diagramSpeed));
  dispatchEvent(new Event('aniflow-diagram-speed'));
}
