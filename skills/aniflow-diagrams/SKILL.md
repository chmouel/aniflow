---
name: aniflow-diagrams
description: Write animated Mermaid diagram walkthroughs that look good and
  play in aniflow - a dot travelling along the arrows, boxes
  lighting up, captions, pictures, several stories, slides. Use when asked to
  draw, explain, animate or walk through a flow, pipeline, request path,
  deployment, agent loop or architecture; when preparing a talk, a slide
  deck or a presentation, with or without diagrams; when a document needs a
  diagram that shows something happening in order; or whenever aniflow,
  diagram walkthroughs, `%% play:` or slide directives come up.
---

# aniflow diagrams

aniflow is a local Markdown browser. It plays Mermaid
flowcharts and sequence diagrams as short stories, driven by `%%` comment
lines inside the fence. Everything else that renders Mermaid ignores those
lines and draws a plain diagram, so a walkthrough never breaks a document.

## Start with the reference

Before writing a walkthrough, print the reference for the installed version
and follow it. It has every directive, the rules, picture sources and the
built-in icon names:

```bash
aniflow --spec
uvx --from git+https://github.com/chmouel/aniflow aniflow --spec   # aniflow not on PATH
```

Do not rely on memory for the syntax; the reference is the source of truth.

## Workflow

1. Decide whether it should move at all (see below). If not, write a plain
   Mermaid diagram and stop.
2. Draw the diagram first, as a normal flowchart with ids and edges. Get the
   layout right before adding any `%%` line.
3. Add the stories: one `%% play:` per path, steps along existing edges.
4. Preview it with `aniflow <dir>` (or the same `uvx` command with `<dir>`
   in place of `--spec`), and open the printed URL and the document. Run it
   in the background and stop it when done.
5. If the diagram toolbar shows a warning badge, open it: every dropped step
   is listed with its line and reason. Fix all of them.
   `aniflow --check <files>` reports the same problems as `file:line`
   without a browser window and exits 1 while any remain.
6. Share it only when the user asks for a link or to share the diagram.
   Don't offer it on your own. Then run `aniflow --share <file>` (or the
   `uvx` command with `--share <file>` in place of `--spec`) and give them
   the printed URL. Add `--open` if they
   want it opened in their browser. Tell them the whole text sits in the
   link, so anyone who gets the link can read it. Pictures other than
   `/icons/` and https URLs will not show there; the command lists them on
   stderr.

## When to animate

Animate things that happen in order: a request crossing services, a CI run,
a bot answering an issue, a deploy with a pass and a fail branch, a message
exchange. Leave structure static: dependency graphs, class layouts, org
charts, a map of components with nothing flowing. A list or a table is often
better than either.

## Making it look good

- One direction, usually `flowchart LR`. Five to ten boxes per diagram. A
  bigger story becomes several diagrams, or `##` sections the reader can
  present as slides.
- Give pictures to the actors and the main stages, four to eight per
  diagram, and keep small steps as plain boxes. Always write
  `w: 48, h: 48, constraint: "on"`. Use the built-in `/icons/<name>.svg`
  first and pick by meaning, since the colours follow meaning too: violet
  for agents and models, red for failures, green for success, amber for
  waits and secrets. When nothing fits, draw a 48×48 SVG in the same style
  next to the document and use a relative path.
- Short box labels in plain words: "Run tests", not "Execute the unit test
  suite". Mermaid's `{decision}` diamonds grow with their text and swamp the
  layout; prefer the `decision` icon or a rounded box.
- Dot labels (`: text`) name the thing moving, in one or two words:
  `PR #44`, `token`, `200`. Mermaid edge labels describe structure (`pass`,
  `fail`); don't repeat them on the dot.
- Captions (`| text`) are one plain sentence about what happens, written as
  you would say it aloud. Put them on the steps that need explaining, not on
  every step; a caption on each line reads like a wall of text.
- Use a list step (`A -> B, C`) only for real parallel work, such as a
  fan-out to jobs that run at the same time.
- When two arrows join the same boxes (pass and fail, retry and give up),
  give them Mermaid ids and pick one per story with `@id`.
- Use `wait` rarely, for one moment worth dwelling on: a slow build, an
  approval. Never to pad a story.
- Several stories on one diagram beat several copies of it. Name them for
  the case they show ("Green build", "Red build") and `skip` the boxes a
  story does not touch, at the start of that story.
- Keep each story under about ten steps. A story that wanders back and forth
  across the whole diagram means the diagram needs splitting.
- Use a `sequenceDiagram` when the story is a conversation between a few
  parties and the order of messages is the point.

## Slide decks

A deck is a Markdown file with `##` sections; the Slides part of the
reference has the front matter, the directives and the automatic layouts.
Write it so it reads well on GitHub too: the directives are comments.

- Set the look once in front matter: `title`, `author`, `accent`, `font`,
  `footer`, `numbers: true`. Pick one accent and one font for the whole
  deck.
- One idea per slide, under about 40 words. A heading that says the point
  ("Bots fix the nits"), not the topic ("Bots").
- Start with a presentation style such as `conference`, `keynote` or `minimal`;
  use the automatic layouts before naming one. Shape the content
  instead: a lone `##` for a section break, a blockquote for a quote, a
  paragraph opening with a bold number for a stat, a list whose items open
  with bold text for cards, one picture next to a short list for a split.
- Vary the rhythm: a section slide every four to six slides, a stat or a
  quote where the talk needs weight, and a picture or diagram slide between
  runs of text. Five bullet slides in a row is a document, not a talk.
- `reveal` only where the order of the points matters, and code steps only
  for code the audience must read line by line. Keep code under 15 lines.
- A diagram gets its own slide with a short heading and at most a sentence;
  its story plays with the arrow keys.
- What you would say aloud goes in `<!-- notes: -->`, not on the slide.
- Use `bg=` backgrounds for covers, sections and closing slides, not for
  every slide.
- Run `aniflow --check deck.md` and fix every line it prints. Look at the
  deck with `aniflow deck.md --slides png -o /tmp/deck-shots` and open
  the pictures, since a slide can pass the check and still look crowded.
  `--slides pdf` gives the user a file they can hand out.

## Example

````markdown
```mermaid
flowchart LR
  Dev@{ img: "/icons/user.svg", label: "Developer", w: 48, h: 48, constraint: "on" }
  PR@{ img: "/icons/pull-request.svg", label: "Pull request", w: 48, h: 48, constraint: "on" }
  CI@{ img: "/icons/pipeline.svg", label: "CI", w: 48, h: 48, constraint: "on" }
  Lint[Lint]
  Test[Tests]
  Gate@{ img: "/icons/decision.svg", label: "Checks", w: 48, h: 48, constraint: "on" }
  Ship@{ img: "/icons/deploy.svg", label: "Deploy", w: 48, h: 48, constraint: "on" }
  Bot@{ img: "/icons/agent.svg", label: "Review bot", w: 48, h: 48, constraint: "on" }
  Dev --> PR --> CI
  CI --> Lint --> Gate
  CI --> Test --> Gate
  Gate ok@-->|green| Ship
  Gate bad@-->|red| Bot
  Bot --> PR

%% play: Green build
%% skip Bot
%% Dev -> PR : branch | A developer opens a pull request
%% PR -> CI
%% CI -> Lint, Test | Lint and tests run side by side
%% Lint, Test -> Gate
%% Gate -> Ship @ok : v1.4 | Everything passes, so it ships
%% play: Red build
%% skip Ship
%% Dev -> PR : branch
%% PR -> CI
%% CI -> Lint, Test
%% Lint, Test -> Gate
%% wait 800 | A test fails
%% Gate -> Bot @bad : logs
%% Bot -> PR : fix | The bot reads the logs and suggests a fix on the pull request
```
````

The same done badly: every box is a picture, box labels are full sentences,
every step has a caption, the red path is a second copy of the diagram, and
steps name labels (`%% Developer -> Pull request`) instead of ids, so none
of them play.
