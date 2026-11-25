# Hosting aniflow for a team

aniflow can run behind a reverse proxy as a shared notes site. Anyone can read
the notes; GitHub sign-in gates comments, web editing, and API tokens. Everything
lives as plain Markdown files on disk, with comments and hashed tokens kept
separately under `$XDG_CACHE_HOME/aniflow`.

```mermaid
flowchart LR
  U@{ img: "/icons/user.svg", label: "Browser or CLI", w: 48, h: 48, constraint: "on" }
  P@{ img: "/icons/globe.svg", label: "Caddy", w: 48, h: 48, constraint: "on" }
  A@{ img: "/icons/service.svg", label: "aniflow", w: 48, h: 48, constraint: "on" }
  G@{ img: "/icons/key.svg", label: "GitHub OAuth", w: 48, h: 48, constraint: "on" }
  N@{ img: "/icons/folder.svg", label: "Notes folder", w: 48, h: 48, constraint: "on" }
  D@{ img: "/icons/database.svg", label: "Cache / tokens.db", w: 48, h: 48, constraint: "on" }

  U --> P --> A
  A --> G
  A --> N
  A --> D

%% play: Reading a note
%% U -> P : HTTPS | Request arrives at Caddy
%% P -> A : Host | Forwarded with the public Host header
%% A -> N : read | Reads the Markdown file from disk
%% A -> P : HTML | Renders the page, diagrams and comments
%% P -> U : 200 | Browser displays the note

%% play: Signing in and writing
%% U -> P : Sign in | Browser starts /auth/github/start
%% P -> A : redirect | aniflow sets a signed state cookie
%% A -> G : OAuth | GitHub verifies the user and org membership
%% G -> A : callback | aniflow issues an HttpOnly session cookie
%% A -> N : write | Saves edits atomically in the member's folder
%% A -> D : tokens | Stores hashed API tokens and comments
```

## Reverse proxy and path prefix

aniflow binds to `127.0.0.1` by default and refuses requests whose `Host`
header is not local. When you put Caddy or nginx in front of it:

- Pass `--allow-host notes.example.com` (repeatable) so it answers for the
  public hostname.
- Pass `--base /pub` if you mount it under a subpath. Every generated link,
  stylesheet, script, and `/icons/` reference gets the `/pub` prefix, and
  incoming requests work whether the proxy strips the prefix or forwards it.
- Forward the public `Host` and `X-Forwarded-Proto` headers so OAuth callback
  URLs and `Secure` cookies match what the browser sees.

Caddy example mounted at `/pub/`:

```caddyfile
notes.example.com {
	handle /pub {
		redir * /pub/ 308
	}
	handle /pub/* {
		reverse_proxy localhost:8099
	}
}
```

## Branding, logo and favicon

Name the site after the notes it serves:

- `--brand "Team Notes"` replaces the aniflow wordmark in the masthead, top
  bar, and page title.
- `--logo VALUE` sets the masthead picture. It accepts a path inside the served
  folder, an `https://` URL, or a `data:image/` URI. Dropping `logo.svg` or
  `logo.png` at the top of the served folder works with no flag.
- `--favicon VALUE` sets the tab icon. Dropping `favicon.svg`, `favicon.png`,
  or `favicon.ico` at the top of the folder works with no flag; without one,
  the tab falls back to the logo, then the brand's first letter.

Both `logo.*` and `favicon.*` are checked on every page load, so replacing a
file takes effect on the next refresh with no restart.

## Static public site (no comments)

If you only want a read-only site with no login:

```sh
aniflow serve /notes --host 0.0.0.0 --port 8080 \
  --base /pub --allow-host notes.example.com \
  --brand "Team Notes" --no-comments
```

With `--allow-host`, aniflow refuses to start with comments enabled unless
`--github-oauth` is configured, so a missing environment variable cannot expose
unauthenticated comment writes.

## GitHub OAuth and org access

Create a GitHub OAuth App at **github.com/settings/developers** with:

- **Homepage URL:** `https://notes.example.com/pub/`
- **Authorization callback URL:** `https://notes.example.com/pub/auth/github/callback`

Pass the credentials via environment variables (or flags):

| Variable | Flag | Purpose |
| --- | --- | --- |
| `ANIFLOW_GITHUB_CLIENT_ID` | `--github-oauth` | OAuth App client ID |
| `ANIFLOW_GITHUB_SECRET` | — | OAuth App client secret |
| `ANIFLOW_SIGNIN_SECRET` | — | Random key sealing session cookies (`openssl rand -base64 48`) |
| `ANIFLOW_GITHUB_ORGS` | `--github-org` | Comma-separated orgs; only active members may sign in |
| `ANIFLOW_COMMENTS_ADMIN` | `--comments-admin` | GitHub login allowed to moderate any comment or edit any folder |

When `--github-org` is set, sign-in requests `read:org` so private memberships
count. If your organisation restricts third-party OAuth apps, an org owner must
approve the app under org **Settings → Third-party access**.

Sessions live in an HMAC-signed `HttpOnly`, `SameSite=Lax`, `Secure` cookie
scoped to the base path (30 days). Reading stays public; writing comments,
replying in threads, editing notes, and creating API tokens require a session.

## User folders and web editing

Add `--user-folders` (requires `--github-oauth`):

- On first sign-in, each member gets `users/<login>/` in the served root with
  a `welcome.md` starter note. The `users/` folder itself is never listed and
  answers 404 if you browse to it, so the root listing stays a place for
  documents and team folders; a member reaches their own folder through the
  account menu, or the **My Space** card at the top of the root listing, which
  only a signed-in member sees and which points at their own folder.
- Only its owner can read `users/<login>/`, notes, pictures, raw Markdown,
  comments, listings, search and API included. Another member gets a 404, as
  for a missing file, and so does the `--comments-admin` account, which cannot
  write there either. An anonymous visitor gets the sign-in page for any path
  under `users/`, whether that member or note exists or not, so it cannot be
  used to find out who has an account. A symlink elsewhere that leads into a
  personal folder follows the same rule.
- Members can create, edit (split-pane live Markdown preview, Ctrl+S, Insert
  diagram), and delete `.md`/`.markdown` files inside their own folder.
- To let others read a note, a member moves it into a shared folder, one per
  team or topic such as `pac/` or `team/design/`, with
  `aniflow mv plan.md pac/` (see [cli.md](cli.md)) or by creating it there with
  **New note**. Pictures under `images/` and review comments stay behind. Add
  `private: true` to the moved note to keep it for signed-in members.
- When a member signs in and their `welcome.md` is still an unchanged copy of
  the older template, aniflow replaces it with the current one. Edited copies
  are left alone.
- To make a team folder writable by all signed-in members, drop a hidden
  `.aniflow-shared` file inside it from the server shell:

  ```sh
  touch /path/to/notes/team/.aniflow-shared
  ```

  Hidden files are never listed, served, or writable from the web.
- The editor takes images by paste, drag-drop or its **Image** button and saves
  them to `<folder>/images/`. PNG, JPEG, WebP and GIF up to 10 MB are
  accepted, and nothing over 2 MB is stored. When ImageMagick (`magick` or
  `convert`) is installed, aniflow strips their metadata (camera details and
  GPS position), fixes the rotation, fits them inside 2560 px and recompresses
  them, stepping down quality and size only as far as needed to get under
  2 MB. A PNG keeps its format while lossless compression is enough, and
  becomes WebP otherwise. GIFs are stored as they are, to keep animations,
  and refused over 2 MB; without ImageMagick, so is any image over 2 MB.
  Install ImageMagick in the container image (the Docker example below does).
- Writes refuse symlinks anywhere along the path, refuse files at the top level
  of the served root, and check a content-hash version under a lock so
  concurrent saves return `409 Conflict` instead of overwriting each other.

## Private folders and notes

A note or a folder can be kept for signed-in readers only, with two markers:

- A note is private when its YAML front matter has `private: true` (also
  `yes`, `on` or `1`, quoted or not) at the top level of the block.
- A folder is private when it holds a hidden `.aniflow-private` file, and so is
  everything under it, subfolders and pictures included. The served root
  counts too: a `.aniflow-private` at the top makes the whole site sign-in
  only.

```sh
# a folder only signed-in readers may open
touch /path/to/notes/salaries/.aniflow-private
```

```markdown
---
private: true
---
# Board notes
```

Anyone signed in may read a private note, whatever their account. **Without
`--github-org`, that means any GitHub account at all**, so set it when
"private" should mean "my team". With it, only the active members of the
organisation can sign in. Membership is checked at sign-in, so someone who
leaves keeps reading until their 30-day session cookie expires or the
`ANIFLOW_SIGNIN_SECRET` changes.

Anonymous visitors see nothing of it: private
folders and notes are left out of the file browser, `/api/notes` and
`/api/search`, and a direct URL answers a 401 page inviting them to sign in
with GitHub (the raw Markdown, pictures and downloads answer 404). After
signing in they land back on the page they asked for. The gate page never
shows the name or content, but it does tell a visitor that something exists
at the URL they typed, since a missing one answers 404.

Private pages go out with `Cache-Control: private, no-store`, and every page
with `Vary: Cookie, Authorization`, so a caching proxy in front never hands a
signed-in copy to someone else.

The marker is read the safe way round: a front matter block that is never
closed, or is longer than 8 KB, counts as private, and any truthy `private:`
line wins over a `private: false` one.

The **Make private** / **Make public** buttons — on a folder row, in a note's
More menu, or in the editor's toolbar — need `--user-folders` and write only
where that member may already write: their own folder, a shared one, or
anything outside other members' folders for the admin. A personal folder is
always owner-only, so its toggle has nothing to open. They set the marker file or the `private: true` front
matter, nothing else. With an API token, `aniflow private PATH [--off]` and
`aniflow push FILE PATH --private` do the same from a shell (see
[cli.md](cli.md#private-notes-and-folders)).

Without `--github-oauth` nobody can sign in, so private folders and notes stay
unreadable: aniflow says so on stderr at startup. Run a read-only site with
`--no-comments` and no private markers, or add `--github-oauth` (and
`--user-folders` if the toggles should be in the web UI).

## API tokens and revoking

Signed-in members can create 90-day personal API tokens (up to 10 live per
user) from **API tokens** in the account menu. Tokens are shown once and stored
only as SHA-256 hashes in `$XDG_CACHE_HOME/aniflow/tokens.db`. A token carries
the exact same rights as its owner on the web; admin status is derived from
`--comments-admin` on every request rather than stored in the token.

See [`docs/cli.md`](cli.md) for using tokens with `aniflow login`, `push`,
`pull`, `ls`, `search`, `comments`, `rm`, and `skill`.

To revoke all of a member's tokens from the server (or inside the container):

```sh
aniflow --revoke-tokens <login-or-github-id>
```

Existing browser cookies expire on their own after 30 days.

## Docker deployment

aniflow ships its built JS, CSS, vendor libraries, icons, and skills inside the
Python wheel, so the image needs no Node toolchain:

```dockerfile
FROM python:3.13-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ADD https://github.com/chmouel/aniflow/commits/main.atom /tmp/aniflow-main.atom
RUN python -m venv /aniflow \
 && /aniflow/bin/pip install --no-cache-dir \
      "aniflow @ git+https://github.com/chmouel/aniflow@main"

FROM python:3.13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends imagemagick \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /aniflow /aniflow
ENV PATH=/aniflow/bin:$PATH
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["aniflow"]
CMD ["serve", "/notes", "--host", "0.0.0.0", "--port", "8080", \
     "--base", "/pub", "--allow-host", "notes.example.com", \
     "--brand", "Team Notes", "--user-folders"]
```

Mount the notes folder on `/notes` (read-only if you use `--no-comments` without
`--user-folders`) and a writable volume on `/data` with `XDG_CACHE_HOME=/data`
so comments and `tokens.db` survive container restarts.
