"""The reader page: markdown source in, a document the aniflow script renders in the browser."""

from __future__ import annotations

import html
import json

from aniflow.comments import COMMENT_MAX_CHARS
from aniflow.themes import THEME_READER_CSS, theme_script, theme_select

# Loaded in this order before the reader; highlight.js is left out for very large files.
MARKDOWN_SCRIPTS = (
    "highlight.min.js",
    "markdown-it.min.js",
    "markdown-it-footnote.min.js",
    "markdown-it-emoji.min.js",
    "purify.min.js",
)
HIGHLIGHT_MAX_BYTES = 512 * 1024
REVIEW_BUTTON = '<button type="button" class="renderer review-toggle" id="review" aria-pressed="false" aria-label="Review" title="Review" hidden><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"></path></svg><span class="count" hidden></span></button>'
PRESENT_BUTTON = '<button type="button" class="renderer present-toggle" id="present" aria-pressed="false" aria-label="Present" title="Present (P)" hidden><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 14.25 13H8.75v1.5h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V13H1.75A1.75 1.75 0 0 1 0 11.25v-7.5C0 2.784.784 2 1.75 2Zm0 1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25ZM6.5 5.2v4.1L10 7.25Z"></path></svg></button>'
REVIEW_DOCK = '<div class="review-dock" id="review-dock" role="region" aria-label="Review" hidden><span class="review-dock-text" role="status"></span><button type="button" class="primary" data-review="comment" hidden>Comment</button><button type="button" data-review="clear" hidden>Clear</button><button type="button" data-review="copy" hidden>Copy as prompt</button><button type="button" data-review="done">Done</button></div>'
# Reads the page's options and source, adds whatever an earlier script left in
# window.aniflowPage (plugins, link and image resolvers), and renders.
BOOT_JS = """
(() => {
  const data = (id) => JSON.parse(document.getElementById(id).textContent);
  const options = data('aniflow-options');
  if (options.root) options.resolveImage = options.resolveLink = Aniflow.directoryResolver(options.root, options.base);
  Aniflow.reader(Object.assign(options, {
    source: data('markdown-source'),
    nonce: document.currentScript.nonce,
    toc: '#toc',
    bar: '.bar.progress',
    reviewButton: '#review',
    reviewDock: '#review-dock',
    presentButton: '#present',
  }, window.aniflowPage || {}));
})();
"""


def json_script(value: object) -> str:
    """JSON for a data <script>, escaped so no "</script>" in it can close the block early."""
    return (
        json.dumps(value)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def reader_options(
    *,
    comments: str = "",
    review_name: str = "Review",
    root: str = "",
    base: str = "",
    signin: str = "",
    signout: str = "",
    me: dict | None = None,
    breaks: bool = False,
    callouts: bool = False,
    mermaid: str = "",
) -> dict[str, object]:
    """The JSON half of Aniflow.reader()'s options. root keeps links and pictures inside
    that path; comments is the URL of the document's comments; base is the path prefix the
    page is served under, which the built-in icons get too; signin and signout are where a
    reader signs in to comment and back out, me is who it already is."""
    options: dict[str, object] = {
        "mermaid": mermaid or base + "/vendor/mermaid.min.js",
        "breaks": breaks,
        "callouts": callouts,
    }
    if base:
        options["base"] = base
    if comments:
        options["comments"] = {
            "url": comments,
            "max": COMMENT_MAX_CHARS,
            "name": review_name,
        }
        if signin:
            options["comments"]["signin"] = signin
            options["comments"]["signout"] = signout
        if me:
            options["comments"]["me"] = {
                "id": me.get("id"),
                "login": me.get("login", ""),
                "name": me.get("name", ""),
                "admin": bool(me.get("admin")),
            }
    if root:
        options["root"] = root
    return options


def reader_page(
    *,
    title: str,
    text: str,
    nonce: str,
    back: tuple[str, str],
    options: dict[str, object],
    base: str = "",
    actions: str = "",
    tools: str = "",
    trail: str = "",
    account: str = "",
    top: str = "",
    style: str = "",
    body_class: str = "",
    favicon: str = "data:,",
    theme_default: str = "auto",
    theme_key: str = "aniflow-theme",
    theme: bool = False,
    before: str = "",
    after: str = "",
) -> bytes:
    """The whole document. actions and tools go in the bar after the back link, trail is
    the breadcrumb nav that takes the place of the title there, account the GitHub
    sign-in at the end of the bar, top above the contents,
    before and after are scripts around the one that renders. theme adds a theme picker to
    the bar; slides always offer one in their dock. base prefixes the reader's own
    stylesheets and scripts."""
    review = (REVIEW_BUTTON, REVIEW_DOCK) if options.get("comments") else ("", "")
    highlight = len(text.encode("utf-8")) <= HIGHLIGHT_MAX_BYTES
    scripts = "".join(
        f'<script nonce="{nonce}" src="{base}/vendor/{name}"></script>'
        for name in MARKDOWN_SCRIPTS
        if highlight or name != "highlight.min.js"
    )
    body_attribute = f' class="{html.escape(body_class)}"' if body_class else ""
    return f"""<!doctype html>
<html lang="en" data-theme-default="{html.escape(theme_default)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>{html.escape(title)}</title>
{theme_script(nonce, theme_key)}
<link rel="icon" href="{html.escape(favicon)}">
<link rel="stylesheet" href="{base}/vendor/github-markdown.css">
<link rel="stylesheet" href="{base}/static/page.css">
<link rel="stylesheet" href="{base}/static/aniflow.css">
<style>{THEME_READER_CSS}{style}</style></head><body{body_attribute}>
<header class="bar progress"><a href="{html.escape(back[1])}">← {html.escape(back[0])}</a>{trail or '<span class="name">' + html.escape(title) + "</span>"}<nav>{actions}{PRESENT_BUTTON}{review[0]}{tools}{theme_select(nonce) if theme else ""}{account}</nav></header>
<main class="page reader">{top}
<details class="toc" id="toc" hidden><summary>Contents</summary><ol></ol></details>
<article class="markdown-body"><noscript><pre>{html.escape(text)}</pre></noscript></article></main>
{review[1]}
<script type="application/json" id="markdown-source">{json_script(text)}</script>
<script type="application/json" id="aniflow-options">{json_script(options)}</script>
{scripts}
<script nonce="{nonce}" src="{base}/static/aniflow.min.js"></script>
{before}<script nonce="{nonce}">{BOOT_JS}</script>
{after}
</body></html>""".encode()


def reader_headers(nonce: str) -> dict[str, str]:
    """Scripts run only under the page's nonce, so an uploaded or served .js never does."""
    return {
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": (
            "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; "
            f"script-src 'nonce-{nonce}'; object-src 'none'; base-uri 'none'; "
            "form-action 'none'; frame-ancestors 'self'"
        ),
    }
