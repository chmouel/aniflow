---
name: aniflow-notes
description: Publish, read, search, edit, delete, make private, and review
  Markdown notes on an aniflow server using the `aniflow` CLI and API token.
  Use when asked to upload, share (publicly or privately), update, fetch,
  search, hide or unhide, or address review comments on notes hosted on
  aniflow (such as Chmouel's Notes at share.chmouel.com/pub).
---

# aniflow notes

Use the `aniflow` CLI to work with notes on an aniflow server. Auth comes from
`~/.config/aniflow/config.json` (created by `aniflow login`) or `ANIFLOW_URL`
and `ANIFLOW_TOKEN` in the environment.

Every command accepts `--json` for structured output, and every note command
accepts either a relative path (`plan.md`, `pac/plan.md`) or a full browser URL
pasted from the site.

## Setup and identity

```sh
aniflow whoami --json                 # login, default folder, writable shared folders
aniflow login https://share.chmouel.com/pub   # interactive; any page URL works
```

If `whoami` fails with "no server configured" or 401, tell the user to run
`aniflow login` (tokens are created at `<server>/tokens`).

## Reading and searching

```sh
aniflow ls --json                     # your default folder
aniflow ls / --json                   # top-level folders (shared: true, private: true)
aniflow ls pac --json                 # a specific folder
aniflow search "kueue" --json         # search filenames and content across all notes
aniflow search "token" pac --json     # limit search to one folder
aniflow pull pac/design.md            # raw Markdown to stdout
aniflow pull pac/design.md --json     # {path, version, view, text}
aniflow pull https://share.chmouel.com/pub/files/pac/design.md  # full URL works
```

## Publishing and editing safely

```sh
aniflow push report.md --json                   # -> <your-folder>/report.md
aniflow push report.md pac/report.md --json     # -> shared folder pac/
cat draft.md | aniflow push - pac/draft.md --json
```

When editing an existing note, pull with `--json` first to get its `version`
(ETag), then pass `--if-match` on `push` so you never overwrite a concurrent
edit:

```sh
ver=$(aniflow pull pac/design.md --json | jq -r .version)
aniflow push design.md pac/design.md --if-match "$ver" --json
```

`push --json` returns `{"path", "status", "version", "view", "private"}`.
Give the user the `view` URL.

Deleting:

```sh
aniflow rm pac/old.md --json
aniflow rm pac/old.md --if-match "$ver" --json
```

## Private notes and folders

A private note or folder is only for signed-in readers: anonymous visitors
don't see it in listings or search, and its URL shows a sign-in page. Any
signed-in account can read it (on a server with `--github-org`, that means the
organisation's members), so it is not a way to keep something from your
team. Everything under a private folder is private too.

```sh
aniflow push plan.md pac/plan.md --private --json  # share it privately
aniflow private pac/plan.md --json                 # hide an existing note
aniflow private pac/team --json                    # hide a folder and all under it
aniflow private pac/plan.md --off --json           # make it public again
```

`private` answers `{"path", "private"}`. If `--off` still says `private: true`,
a folder above keeps it hidden; open that folder instead. A note is private
through `private: true` in its front matter, so `pull` brings the line back
with the text and pushing that copy keeps it private. Pushing a file without
the line over a note that was private makes it public, and `push` warns on
stderr when it does: push again with `--private` if that wasn't meant.

When the user asks to share something private, sensitive or internal, push it
with `--private` and say that in your answer. Don't make things private on
your own initiative.

## Addressing review comments

```sh
aniflow comments pac/design.md          # formatted prompt with line quotes and replies
aniflow comments pac/design.md --json   # structured JSON
```

Read the comments, revise the Markdown, and `push` the updated file back to the
same path with `--if-match`.

## Diagrams

When a note explains a flow, pipeline, or architecture, pair this skill with
`aniflow-diagrams` so Mermaid diagrams play as animated walkthroughs.
