// The diagram in the hero, played by the same library the aniflow command uses.
const source = `\`\`\`mermaid
flowchart LR
  I@{ img: "/icons/issue.svg", label: "Issue", w: 64, h: 64, constraint: "on" }
  A@{ img: "/icons/agent.svg", label: "Agent", w: 64, h: 64, constraint: "on" }
  M@{ img: "/icons/model.svg", label: "Model", w: 64, h: 64, constraint: "on" }
  P@{ img: "/icons/pipeline.svg", label: "CI", w: 64, h: 64, constraint: "on" }
  R@{ img: "/icons/reviewer.svg", label: "Review", w: 64, h: 64, constraint: "on" }
  S@{ img: "/icons/release.svg", label: "Release", w: 64, h: 64, constraint: "on" }
  I --> A
  A <--> M
  A --> P --> R --> S

%% play: Ship a fix
%% I -> A : #42 | A reader reports that exports crop the last row.
%% A -> M : prompt | The agent asks the model for a patch.
%% M -> A : diff | The model answers with a two-line fix.
%% A -> P : PR | The agent opens a pull request and CI runs the tests.
%% P -> R : green | Every check passes, so a reviewer takes a look.
%% R -> S : merge | The fix is merged and goes out in the next release.
%% wait 1500
\`\`\`
`;

Aniflow.reader({
  article: '#demo',
  source,
  mermaid: 'lib/vendor/mermaid.min.js',
  resolveImage: (url) => (url.startsWith('/icons/') ? 'lib' + url : null),
});
