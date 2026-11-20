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
aniflow /notes --host 0.0.0.0 --port 8080 \
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

- On first sign-in, each member gets `<root>/<login>/` with a `welcome.md`
  starter note.
- Everyone can read every folder.
- Members can create, edit (split-pane live Markdown preview, Ctrl+S, Insert
  diagram), and delete `.md`/`.markdown` files inside their own folder.
- To make a team folder writable by all signed-in members, drop a hidden
  `.aniflow-shared` file inside it from the server shell:

  ```sh
  touch /path/to/notes/team/.aniflow-shared
  ```

  Hidden files are never listed, served, or writable from the web.
- Writes refuse symlinks anywhere along the path, refuse files at the top level
  of the served root, and check a content-hash version under a lock so
  concurrent saves return `409 Conflict` instead of overwriting each other.

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
COPY --from=build /aniflow /aniflow
ENV PATH=/aniflow/bin:$PATH
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["aniflow"]
CMD ["/notes", "--host", "0.0.0.0", "--port", "8080", \
     "--base", "/pub", "--allow-host", "notes.example.com", \
     "--brand", "Team Notes", "--user-folders"]
```

Mount the notes folder on `/notes` (read-only if you use `--no-comments` without
`--user-folders`) and a writable volume on `/data` with `XDG_CACHE_HOME=/data`
so comments and `tokens.db` survive container restarts.
