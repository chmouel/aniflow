# Remote CLI and agent skills

aniflow includes a built-in client for talking to a hosted aniflow server
(see [`docs/hosting.md`](hosting.md)) and for managing the bundled coding-agent
skills.

Every remote command accepts `--json` for scripts and agents. Commands that
take a remote path also accept a full browser URL pasted straight from the
site.

## Login and configuration

Create an API token under **API tokens** in the site's account menu, then run:

```sh
aniflow login https://notes.example.com/pub
```

(`--url https://notes.example.com/pub` works the same.)

You can paste any page URL from the site (a note, `/files/`, `/tokens`, or a
bare hostname) and aniflow extracts the server base URL. It prompts for your
token, verifies it against `GET /api/me`, discovers your default folder and
shared folders, and saves `~/.config/aniflow/config.json` with mode `0600`.

For scripts or CI, pass flags or set environment variables instead:

- `ANIFLOW_URL` (or `--url`)
- `ANIFLOW_TOKEN` (or `--token`)
- `ANIFLOW_FOLDER` (default folder when a remote path omits the folder)

Check your active account and writable folders:

```sh
aniflow whoami
aniflow whoami --json
```

## Listing and searching

```sh
aniflow ls                        # your default folder
aniflow ls /                      # top-level folders (marks shared folders)
aniflow ls team                   # a specific folder
aniflow ls https://notes.example.com/pub/files/team/
aniflow search "kueue"            # search filenames and note text
aniflow search "token" team       # limit search to one folder
```

## Uploading, downloading and deleting

```sh
aniflow push plan.md                              # -> <your-folder>/plan.md
aniflow push plan.md team/plan.md                 # -> shared folder team/
cat draft.md | aniflow push - team/draft.md       # read from stdin
aniflow pull team/plan.md                         # write raw Markdown to stdout
aniflow pull team/plan.md ./plan.md               # save to a local file
aniflow pull https://notes.example.com/pub/files/team/plan.md --json
aniflow rm team/old.md
```

When updating or deleting an existing note from a script or agent, pull with
`--json` first to get its `version` (ETag), then pass `--if-match` so a
concurrent edit returns `412 Precondition Failed` instead of being overwritten:

```sh
ver=$(aniflow pull team/plan.md --json | jq -r .version)
aniflow push plan.md team/plan.md --if-match "$ver" --json
```

## Moving a note to a shared folder

Your own folder (`users/<login>/`) is readable by you alone. To let others
read a note, move it into a shared folder that fits its topic; `aniflow
whoami` lists the shared folders you may write to, and `aniflow ls /` marks
them:

```sh
aniflow mv plan.md pac/                   # users/<login>/plan.md -> pac/plan.md
aniflow mv plan.md team/design/spec.md    # move and rename
aniflow mv plan.md pac/ --json            # {"from", "to", "view", "private"}
```

`mv` writes the copy only when nothing is at the destination yet, then
deletes the original only if it has not changed in between. If that delete
fails, both copies stay and `mv` says so. Pictures beside the note and its
review comments do not move; `mv` warns on stderr when the note links to
relative pictures. Add `private: true` to the note first (or run
`aniflow private` on it afterwards) to share it with signed-in members only.

Scripts using the API directly can send `If-None-Match: *` with a `PUT` to
create a note without ever replacing one; a note already there answers
`412 Precondition Failed`.

## Private notes and folders

A private note or folder is for signed-in readers only (see
[hosting](hosting.md#private-folders-and-notes) for who that covers):

```sh
aniflow push plan.md team/plan.md --private       # upload it already private
aniflow private team/plan.md                      # hide an existing note
aniflow private team/board                        # hide a folder and everything under it
aniflow private team/plan.md --off                # make it public again
```

`--private` adds `private: true` to the note's front matter before upload, and
`aniflow private` does the same on the server, or adds the folder's hidden
`.aniflow-private` marker. Notes in your own folder always report private,
since nobody else can read them. `aniflow ls` tags private entries with
`(private)`. A note stays private when a folder above it is, so `--off` on it
reports `still private` until that folder is opened.

Pushing a copy without `private: true` over a private note makes it public,
and `push` warns on stderr when that happens.

## Reading review comments

Fetch review comments (including threaded replies) on a remote note:

```sh
aniflow comments team/plan.md          # formatted prompt with quoted lines
aniflow comments team/plan.md --json   # structured JSON
aniflow comments https://notes.example.com/pub/files/team/plan.md
```

## Agent skills

aniflow ships two skills inside the package:

- `aniflow-diagrams`: writing animated Mermaid walkthroughs and slide decks.
- `aniflow-notes`: using the CLI above to publish, pull, search, edit, and
  address comments on hosted notes.

Manage them with `aniflow skill`:

```sh
aniflow skill list                # list bundled skills and install status
aniflow skill install             # install or update all into ~/.agents/skills
aniflow skill install aniflow-notes --claude    # into ~/.claude/skills
aniflow skill install --project                 # into ./.agents/skills
aniflow skill install --target /path/to/skills
aniflow skill show aniflow-notes                # print SKILL.md to stdout
aniflow skill remove aniflow-notes
```

If a skill destination is already a symlink (for example, pointing at a local
git checkout), `aniflow skill install` leaves it untouched and reports it as
skipped.
