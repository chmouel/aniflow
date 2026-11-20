"""The aniflow pages' own look: the file browser and the bits around the reader."""

GITHUB_MARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'
FOLDER_MENU_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M2 4.2A1.2 1.2 0 0 1 3.2 3h2.7l1.3 1.5h5.6A1.2 1.2 0 0 1 14 5.7v6.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.8Z"/></svg>'
KEY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M8.5 8H14M12 8v2.2M14 8v1.6"/></svg>'
SIGNOUT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M6.5 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v8.4a1.3 1.3 0 0 0 1.3 1.3h2.7M10.5 11.2 13.7 8l-3.2-3.2M13.5 8H6"/></svg>'
TRASH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M2.5 4.2h11M6 4.2V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.2M4 4.2l.7 8.6a1.2 1.2 0 0 0 1.2 1.2h4.2a1.2 1.2 0 0 0 1.2-1.2l.7-8.6"/></svg>'
FOLDER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>'
NOTE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M7 2.5h7.2c.5 0 1 .2 1.4.6l3.3 3.3c.4.4.6.9.6 1.4v11.7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2ZM8.5 11h7v1.5h-7Zm0 3.5h7V16h-7Zm0-7h3.5V9H8.5Z"/><path fill="currentColor" opacity=".45" d="M14.5 2.6v3.4a1.5 1.5 0 0 0 1.5 1.5h3.4Z"/></svg>'
SEARCH_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12.6 12.6l4.4 4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'


DIRECTORY_CSS = """
  .aniflow-browser { --folder-color:var(--fgColor-attention); --document-color:var(--fgColor-accent); }
  .aniflow-browser .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .aniflow-browser .browser-shell { width:min(100%, 1120px); margin:0 auto; padding:34px 40px 80px; }
  .aniflow-browser .browser-masthead { display:flex; align-items:center; justify-content:space-between; gap:32px; padding-bottom:30px; margin-bottom:28px; border-bottom:1px solid var(--borderColor-default); }
  .aniflow-browser .aniflow-brand { width:330px; max-width:48%; margin:0; flex-shrink:0; }
  /* 330px is the aniflow wordmark's size; a name and a logo take what they need. */
  .aniflow-browser .aniflow-brand.brand-name { width:auto; max-width:100%; flex-shrink:1; }
  .aniflow-browser .browser-demo { display:flex; align-items:center; gap:14px; color:var(--fgColor-default); text-decoration:none; }
  .aniflow-browser .browser-demo strong { display:block; margin-bottom:4px; font-size:15px; font-weight:650; }
  .aniflow-browser .browser-demo strong + span { display:block; font-size:13px; color:var(--fgColor-muted); }
  .aniflow-browser .browser-demo > svg { width:20px; height:20px; margin-left:10px; color:var(--fgColor-muted); }
  .aniflow-browser .demo-play { display:grid; place-items:center; flex:0 0 42px; height:42px; border:1px solid color-mix(in srgb, var(--document-color) 35%, var(--borderColor-default)); border-radius:50%; background:color-mix(in srgb, var(--document-color) 9%, var(--bgColor-default)); color:var(--document-color); }
  .aniflow-browser .demo-play::before { content:''; margin-left:3px; border-top:6px solid transparent; border-bottom:6px solid transparent; border-left:9px solid currentColor; }
  .aniflow-browser .browser-demo:hover strong { color:var(--document-color); }
  .aniflow-browser .browser-trail ol { display:flex; flex-wrap:wrap; gap:6px 10px; list-style:none; margin:0; padding:0; color:var(--fgColor-muted); font-size:13px; }
  .aniflow-browser .browser-trail li { display:flex; align-items:center; gap:10px; overflow-wrap:anywhere; }
  .aniflow-browser .browser-trail li + li::before { content:'/'; color:var(--borderColor-default); }
  .aniflow-browser .browser-trail a { color:var(--fgColor-muted); text-decoration:none; }
  .aniflow-browser .browser-trail a:hover { color:var(--document-color); text-decoration:underline; }
  .aniflow-browser .browser-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin:12px 0 30px; }
  .aniflow-browser h1 { margin:0; color:var(--fgColor-default); font-size:clamp(32px, 4vw, 54px); font-weight:750; line-height:1.12; letter-spacing:-.035em; overflow-wrap:anywhere; }
  .aniflow-browser .folder-summary { display:flex; flex-wrap:wrap; gap:12px; margin:12px 0 0; color:var(--fgColor-muted); font-size:14px; }
  .aniflow-browser .folder-summary > span { color:var(--borderColor-default); }
  .aniflow-browser .folder-up { display:inline-flex; align-items:center; gap:8px; padding:10px 0 10px 12px; color:var(--fgColor-muted); font-size:13px; text-decoration:none; white-space:nowrap; }
  .aniflow-browser .folder-up svg { width:18px; height:18px; transform:rotate(180deg); }
  .aniflow-browser .folder-up:hover { color:var(--document-color); }
  .aniflow-browser .browser-toolbar { display:flex; gap:16px; align-items:center; padding:8px; margin-bottom:30px; border:1px solid var(--borderColor-default); border-radius:12px; background:var(--bgColor-muted); }
  .aniflow-browser .folder-filter { display:flex; flex:1; align-items:center; min-width:0; gap:12px; padding-left:10px; color:var(--fgColor-muted); }
  .aniflow-browser .folder-filter svg { flex:0 0 20px; width:20px; height:20px; fill:currentColor; }
  .aniflow-browser .folder-filter input { width:100%; min-width:0; height:42px; border:0; outline:none; background:transparent; color:var(--fgColor-default); font:inherit; font-size:15px; }
  .aniflow-browser .folder-filter input::placeholder { color:var(--fgColor-muted); opacity:1; }
  .aniflow-browser .folder-filter:focus-within { color:var(--document-color); }
  .aniflow-browser .browser-toolbar:has(input:focus-visible) { outline:2px solid var(--document-color); outline-offset:2px; }
  .aniflow-browser .folder-sort { display:flex; flex-shrink:0; align-items:center; gap:8px; padding-left:16px; border-left:1px solid var(--borderColor-default); font-size:13px; color:var(--fgColor-muted); }
  .aniflow-browser .folder-sort select { max-width:155px; height:38px; padding:0 8px; border:0; border-radius:6px; background:var(--bgColor-muted); color:var(--fgColor-default); font:inherit; cursor:pointer; }
  .aniflow-browser .directory-group + .directory-group { margin-top:34px; }
  .aniflow-browser .directory-group h2 { display:flex; gap:10px; align-items:baseline; margin:0 0 18px; font-size:18px; letter-spacing:-.02em; font-weight:650; }
  .aniflow-browser .group-count { font-size:13px; color:var(--fgColor-muted); font-weight:400; }
  .aniflow-browser .directory-list { list-style:none; margin:0; padding:0; }
  .aniflow-browser .directory-list li { min-width:0; }
  .aniflow-browser .directory-list a { color:var(--fgColor-default); text-decoration:none; }
  .aniflow-browser .file-label { min-width:0; overflow-wrap:anywhere; font-weight:550; }
  .aniflow-browser .entry-arrow { display:grid; place-items:center; color:var(--fgColor-muted); }
  .aniflow-browser .entry-arrow svg { width:20px; height:20px; transition:transform .15s; }
  .aniflow-browser .directory-list a:hover .entry-arrow { color:var(--document-color); }
  .aniflow-browser .directory-list a:hover .entry-arrow svg { transform:translateX(3px); }
  .aniflow-browser .folders-list { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:22px 18px; padding-top:7px; }
  .aniflow-browser .folders-list a { position:relative; display:grid; grid-template-columns:1fr 22px; gap:18px 12px; align-items:center; min-height:124px; padding:18px 20px; border:1px solid color-mix(in srgb, var(--folder-color) 25%, var(--borderColor-default)); border-radius:0 12px 12px 12px; background:color-mix(in srgb, var(--folder-color) 4%, var(--bgColor-default)); }
  .aniflow-browser .folders-list a::before { content:''; position:absolute; left:-1px; top:-8px; width:38%; height:8px; border:1px solid color-mix(in srgb, var(--folder-color) 25%, var(--borderColor-default)); border-bottom:0; border-radius:6px 8px 0 0; background:color-mix(in srgb, var(--folder-color) 12%, var(--bgColor-default)); }
  .aniflow-browser .folders-list a:hover { border-color:var(--folder-color); background:color-mix(in srgb, var(--folder-color) 9%, var(--bgColor-default)); }
  .aniflow-browser .folders-list a:hover::before { border-color:var(--folder-color); }
  .aniflow-browser .folder-symbol { grid-column:1 / -1; display:flex; color:var(--folder-color); }
  .aniflow-browser .folder-symbol svg { width:28px; height:28px; }
  .aniflow-browser .folders-list .file-label { font-size:16px; }
  .aniflow-browser .directory-columns { display:grid; grid-template-columns:minmax(0,1fr) 140px 72px; column-gap:18px; padding:0 58px 10px 74px; color:var(--fgColor-muted); font-size:12px; }
  .aniflow-browser .directory-columns span:last-child { text-align:right; }
  .aniflow-browser .documents-list { border:1px solid var(--borderColor-default); border-radius:12px; overflow:hidden; }
  .aniflow-browser .documents-list li + li { border-top:1px solid var(--borderColor-muted); }
  .aniflow-browser .documents-list a { display:grid; grid-template-columns:36px minmax(0,1fr) 140px 72px 20px; align-items:center; gap:18px; min-height:78px; padding:16px 20px; }
  .aniflow-browser .documents-list a:hover { background:var(--bgColor-muted); }
  .aniflow-browser .document-symbol { display:grid; place-items:center; color:var(--document-color); }
  .aniflow-browser .document-symbol svg { width:26px; height:30px; }
  .aniflow-browser .documents-list .file-label { font-size:15px; }
  .aniflow-browser .file-extension { color:var(--fgColor-muted); font-weight:400; }
  .aniflow-browser .file-modified, .aniflow-browser .file-size { color:var(--fgColor-muted); font-size:12px; font-variant-numeric:tabular-nums; }
  .aniflow-browser .file-size { text-align:right; }
  .aniflow-browser .browser-empty { display:flex; flex-direction:column; align-items:center; padding:52px 24px; border:1px dashed var(--borderColor-default); border-radius:12px; text-align:center; }
  .aniflow-browser .empty-symbol { display:grid; place-items:center; width:60px; height:60px; margin-bottom:16px; border-radius:50%; background:var(--bgColor-muted); color:var(--fgColor-muted); }
  .aniflow-browser .empty-symbol svg { width:28px; height:28px; }
  .aniflow-browser .browser-empty h2 { margin:0 0 8px; font-size:20px; font-weight:600; }
  .aniflow-browser .browser-empty p { max-width:32em; margin:0 0 20px; font-size:14px; line-height:1.6; color:var(--fgColor-muted); }
  .aniflow-browser .browser-empty :is(a, button) { padding:10px 16px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--document-color); font:600 14px/1.4 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
  .aniflow-browser :is(.directory-group, .directory-list li, .browser-empty)[hidden] { display:none; }
  .aniflow-browser :is(a, select, button):focus-visible { outline:2px solid var(--document-color); outline-offset:3px; border-radius:6px; }
  @media (prefers-reduced-motion:reduce) { .aniflow-browser .entry-arrow svg { transition:none; } }
  @media (max-width:799px) {
    .aniflow-browser .browser-shell { padding:28px 24px 60px; }
    .aniflow-browser .browser-demo > svg, .aniflow-browser .browser-demo strong + span { display:none; }
    .aniflow-browser .browser-demo { gap:10px; }
    .aniflow-browser .browser-demo strong { max-width:9em; font-size:13px; line-height:1.5; margin:0; }
    .aniflow-browser .demo-play { flex-basis:34px; height:34px; }
    .aniflow-browser .folders-list { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .aniflow-browser .directory-columns { display:none; }
    .aniflow-browser .documents-list a { grid-template-columns:28px minmax(0, 1fr) auto 18px; gap:5px 12px; padding:16px; }
    .aniflow-browser .document-symbol { grid-row:1 / 3; }
    .aniflow-browser .file-modified { grid-column:2; grid-row:2; font-size:11px; }
    .aniflow-browser .file-size { grid-column:3; grid-row:1 / 3; font-size:11px; }
    .aniflow-browser .documents-list .entry-arrow { grid-column:4; grid-row:1 / 3; }
  }
  @media (max-width:499px) {
    .aniflow-browser .browser-shell { padding:24px 16px 48px; }
    .aniflow-browser .browser-masthead { gap:18px; margin-bottom:22px; padding-bottom:22px; }
    .aniflow-browser .aniflow-brand:not(.brand-name) { max-width:62%; }
    .aniflow-browser .browser-demo { gap:8px; }
    .aniflow-browser .browser-demo strong { max-width:5.5em; font-size:11px; }
    .aniflow-browser .demo-play { flex-basis:28px; height:28px; }
    .aniflow-browser .browser-heading { align-items:flex-start; flex-direction:column; gap:10px; margin-bottom:22px; }
    .aniflow-browser .folder-up { padding:0; min-height:32px; }
    .aniflow-browser .browser-toolbar { flex-wrap:wrap; gap:0; margin-bottom:26px; }
    .aniflow-browser .folder-filter { flex-basis:100%; }
    .aniflow-browser .folder-sort { justify-content:space-between; width:100%; margin-top:4px; padding:4px 2px 0 10px; border:0; border-top:1px solid var(--borderColor-default); }
    .aniflow-browser .folder-sort select { text-align:right; }
    .aniflow-browser .folders-list { gap:20px 12px; }
    .aniflow-browser .folders-list a { min-height:94px; padding:14px 16px; gap:10px 8px; }
    .aniflow-browser .folders-list .file-label { font-size:14px; }
    .aniflow-browser .documents-list a { padding:14px 12px; gap:5px 10px; }
    .aniflow-browser .documents-list .file-label { font-size:14px; }
    .aniflow-browser .directory-group + .directory-group { margin-top:28px; }
  }
"""

UI_CSS = """
  .aniflow-local .bar { z-index:6; }
  .aniflow-local.presenting .aniflow-brand { display:none; }
  .aniflow-local .bar nav { align-items:center; gap:10px; }
  .aniflow-local .bar nav .review-toggle { gap:6px; min-height:34px; padding:5px 8px; }
  .aniflow-local .bar nav select { min-height:34px; }
  .aniflow-local .reader-edit { display:inline-flex; align-items:center; min-height:32px; padding:0 12px; border:1px solid color-mix(in srgb, var(--fgColor-accent) 45%, var(--borderColor-default)); border-radius:999px; background:color-mix(in srgb, var(--fgColor-accent) 10%, transparent); color:var(--fgColor-accent); font-size:13px; font-weight:600; white-space:nowrap; }
  .aniflow-local .reader-edit:hover { background:color-mix(in srgb, var(--fgColor-accent) 18%, transparent); text-decoration:none; }
  .aniflow-menu { position:relative; }
  .aniflow-menu summary { display:inline-flex; align-items:center; gap:6px; min-height:34px; padding:4px 8px; border-radius:8px; color:var(--fgColor-muted); font-weight:600; cursor:pointer; list-style:none; white-space:nowrap; }
  .aniflow-menu summary:hover { color:var(--fgColor-default); background:color-mix(in srgb, var(--fgColor-default) 6%, transparent); }
  .aniflow-menu summary:focus-visible { outline:2px solid var(--fgColor-accent); outline-offset:2px; }
  .aniflow-menu summary::-webkit-details-marker { display:none; }
  .aniflow-menu summary::after { content:''; width:6px; height:6px; margin-left:1px; border-right:1.6px solid currentColor; border-bottom:1.6px solid currentColor; transform:translateY(-2px) rotate(45deg); opacity:.7; transition:transform .15s ease; }
  .aniflow-menu[open] > summary::after { transform:translateY(1px) rotate(225deg); }
  .aniflow-menu .menu-items { position:absolute; top:calc(100% + 8px); right:0; z-index:20; min-width:190px; max-width:calc(100vw - 24px); padding:6px; border:1px solid var(--borderColor-default); border-radius:12px; background:var(--bgColor-default); box-shadow:0 12px 32px color-mix(in srgb, var(--fgColor-default) 14%, transparent), 0 2px 6px color-mix(in srgb, var(--fgColor-default) 6%, transparent); }
  .aniflow-menu .menu-items :is(a, button) { display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px; border:0; border-radius:8px; background:none; color:var(--fgColor-default); font:500 14px/1.4 inherit; text-align:left; text-decoration:none; white-space:nowrap; cursor:pointer; }
  .aniflow-menu .menu-items :is(a, button):hover { background:var(--bgColor-muted); text-decoration:none; }
  .aniflow-menu .menu-items :is(a, button):focus-visible { outline:2px solid var(--fgColor-accent); outline-offset:-2px; }
  .aniflow-menu .menu-items :is(a, button) svg { width:16px; height:16px; flex-shrink:0; color:var(--fgColor-muted); fill:currentColor; }
  .aniflow-menu .menu-items :is(a.menu-signout, button.menu-danger) { color:var(--fgColor-muted); }
  .aniflow-menu .menu-items :is(a.menu-signout, button.menu-danger):hover { color:var(--fgColor-danger); background:color-mix(in srgb, var(--fgColor-danger) 10%, transparent); }
  .aniflow-menu .menu-items :is(a.menu-signout, button.menu-danger):hover svg { color:var(--fgColor-danger); }
  .aniflow-menu .menu-sep { height:1px; margin:6px 4px; border:0; background:var(--borderColor-muted); }
  /* The GitHub account, at the right end of the bar. */
  .account-signin { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:0 12px; border:1px solid var(--borderColor-default); border-radius:999px; background:var(--bgColor-default); color:var(--fgColor-default) !important; font-size:13px; font-weight:600; white-space:nowrap; }
  .account-signin:hover { border-color:var(--fgColor-muted); background:var(--bgColor-muted); text-decoration:none !important; }
  .account-signin svg { width:16px; height:16px; fill:currentColor; flex-shrink:0; }
  .aniflow-menu.account summary { padding:3px 10px 3px 4px; border:1px solid var(--borderColor-default); border-radius:999px; background:var(--bgColor-default); color:var(--fgColor-default); font-size:13px; }
  .aniflow-menu.account summary:hover, .aniflow-menu.account[open] > summary { border-color:var(--fgColor-muted); background:var(--bgColor-muted); }
  .account-avatar { width:26px; height:26px; border-radius:50%; border:1px solid var(--borderColor-muted); background:var(--bgColor-muted); flex-shrink:0; }
  .account-login { max-width:11em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .account .menu-items { min-width:228px; }
  .account .account-who { display:flex; align-items:center; gap:10px; margin:0 0 6px; padding:8px 10px 10px; border-bottom:1px solid var(--borderColor-muted); color:var(--fgColor-muted); font-size:12px; line-height:1.35; }
  .account .account-who img { width:32px; height:32px; border-radius:50%; border:1px solid var(--borderColor-muted); background:var(--bgColor-muted); flex-shrink:0; }
  .account .account-who b { display:block; color:var(--fgColor-default); font-size:14px; font-weight:650; }
  @media (prefers-reduced-motion:no-preference) {
    .aniflow-menu[open] > .menu-items { animation:aniflow-pop .12s ease-out; transform-origin:top right; }
    @keyframes aniflow-pop { from { opacity:0; transform:translateY(-4px) scale(.98); } to { opacity:1; transform:none; } }
  }
  @media (max-width:640px) {
    .account-login, .account-signin span { display:none; }
    .account-signin { padding:0 9px; }
    .aniflow-menu.account summary { padding:3px; gap:0; }
    .aniflow-menu.account summary::after { display:none; }
    .aniflow-local .bar nav .review-toggle > span:not(.count) { display:none; }
    .aniflow-menu .menu-items :is(a, button) { min-height:42px; }
  }
  .aniflow-local .reader-help { white-space:nowrap; color:var(--fgColor-muted); font-weight:600; }
  .aniflow-local .reader-help:hover { color:var(--fgColor-default); }
  .aniflow-help .aniflow-brand { width:min(260px, 62%); margin:0 0 14px; }
  .aniflow-help .reader .markdown-body h1 { font-size:clamp(1.8rem, 4vw, 2.5rem); }
  .aniflow-help .reader .aniflow-demo { margin:20px 0 28px; }
  .aniflow-help .reader .aniflow-demo .diagram-stage > svg { width:100%; min-height:220px; }
  .aniflow-help .reader .aniflow-demo .diagram-tools { opacity:1; }
  .aniflow-help .reader .demo-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 14px; }
  .aniflow-help .reader .demo-actions button, .aniflow-help .reader .demo-actions a { min-height:42px; padding:8px 14px; border:1px solid var(--borderColor-default); border-radius:9px; background:var(--bgColor-default); color:var(--fgColor-accent); font:600 14px/1.4 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
  .aniflow-help .reader .demo-actions .primary { background:var(--fgColor-accent); color:var(--bgColor-default); border-color:var(--fgColor-accent); }
  .aniflow-help .reader .demo-actions button:disabled { opacity:.5; cursor:wait; }
  .aniflow-help .reader .demo-actions :is(button,a):focus-visible { outline:2px solid var(--fgColor-accent); outline-offset:2px; }
  .aniflow-help .reader details.example-source { margin:16px 0 28px; }
  .aniflow-help .reader details.example-source > summary { color:var(--fgColor-accent); font-size:14px; }
  .aniflow-help .reader .help-step-picker { display:grid; gap:8px; margin:16px 0 24px; color:var(--fgColor-muted); font-size:14px; }
  .aniflow-help .reader .help-step-picker select { max-width:100%; min-height:44px; padding:8px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-default); font:inherit; }
  @media (min-width:1240px) { .aniflow-help .reader .help-step-picker { display:none; } }
  @media (max-width:1239px) { .aniflow-help #toc { display:none; } }
  @media (max-width:599px) {
    .aniflow-local .bar { display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 10px; padding-top:6px; padding-bottom:6px; }
    .aniflow-local .bar > nav { grid-column:1 / -1; justify-content:flex-end; gap:6px; }
    .aniflow-local .bar > nav .reader-edit { margin-right:auto; }
    .aniflow-local .bar nav select { max-width:110px; }
    .aniflow-local .bar .name { font-size:12px; }
    .aniflow-local .reader-help { display:none; }
    .aniflow-local .aniflow-brand { margin-bottom:20px; }
    .aniflow-help .aniflow-brand { margin-bottom:10px; }
    .aniflow-local .mermaid-diagram .diagram-tools { position:static; flex-wrap:wrap; justify-content:flex-end; width:100%; gap:4px; margin-bottom:12px; }
    .aniflow-local .mermaid-diagram .diagram-tools .diagram-play { flex:1 0 100%; border:0; margin:0; padding-right:0; }
    .aniflow-local .mermaid-diagram .diagram-play select { flex:1; max-width:none; height:36px; }
    .aniflow-local .mermaid-diagram .diagram-tools button { width:36px; height:36px; }
  }
"""

UI_JS = """
(() => {
  const search = document.getElementById('folder-search');
  if (search) {
    const groups = [...document.querySelectorAll('.directory-group')];
    const lists = groups.map(group => group.querySelector('.directory-list'));
    const rows = lists.flatMap(list => [...list.children]);
    const status = document.getElementById('folder-status');
    const empty = document.getElementById('folder-no-results');
    const sort = document.getElementById('folder-sort');
    const fold = value => value.normalize('NFKD').replace(/\\p{M}/gu, '').toLowerCase();
    const filter = () => {
      const query = fold(search.value.trim());
      let count = 0;
      for (const row of rows) {
        row.hidden = !fold(row.querySelector('a').dataset.name).includes(query);
        if (!row.hidden) count++;
      }
      for (const group of groups) {
        const matches = group.querySelectorAll('li:not([hidden])').length;
        group.hidden = !matches;
        group.querySelector('.group-count').textContent = String(matches);
      }
      empty.hidden = count !== 0;
      status.textContent = query ? count + (count === 1 ? ' match' : ' matches') : '';
    };
    const clear = () => { search.value = ''; filter(); search.focus(); };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => { if (event.key === 'Escape') clear(); });
    document.getElementById('folder-clear').addEventListener('click', clear);
    sort.addEventListener('change', () => {
      for (const list of lists) {
        const ordered = [...list.children].sort((a, b) => {
          const name = row => row.querySelector('a').dataset.name;
          return (sort.value === 'modified' && Number(b.dataset.modified) - Number(a.dataset.modified))
            || name(a).localeCompare(name(b), undefined, { numeric:true, sensitivity:'base' });
        });
        list.append(...ordered);
      }
    });
    const dateFormat = new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' });
    for (const time of document.querySelectorAll('.file-modified')) {
      const date = new Date(time.dateTime);
      time.textContent = dateFormat.format(date);
      time.title = date.toLocaleString();
    }
  }
  const menus = [...document.querySelectorAll('.aniflow-menu')];
  if (menus.length) {
    for (const menu of menus) {
      menu.addEventListener('toggle', () => {
        if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
      });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.open) {
          menu.open = false;
          menu.querySelector('summary').focus();
        }
      });
    }
    document.addEventListener('click', event => {
      for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  }
  const remove = document.querySelector('button[data-delete-url]');
  if (remove) {
    remove.addEventListener('click', async () => {
      if (!confirm('Delete ' + remove.dataset.name + '? This cannot be undone.')) return;
      remove.disabled = true;
      try {
        const response = await fetch(remove.dataset.deleteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: remove.dataset.version }),
        });
        const answer = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(answer.error || response.statusText);
        location.href = remove.dataset.folder;
      } catch (error) {
        remove.disabled = false;
        alert('Could not delete: ' + (error.message || error));
      }
    });
  }
  const copy = document.querySelector('[data-review="copy"]');
  if (copy) copy.textContent = 'Copy feedback';
  // The help page, with the base prefix the server may be mounted under.
  if (!location.pathname.endsWith('/help')) return;
  document.body.classList.add('aniflow-help');
  const article = document.querySelector('article.markdown-body');
  const attached = new WeakSet();
  function enhance() {
    const demo = article.querySelector('.aniflow-demo');
    const stage = demo?.querySelector('.diagram-stage');
    if (stage?.diagramPlay) {
      let actions = demo.querySelector('.demo-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'demo-actions';
        for (const [text, selector, primary] of [
          ['Play demo', '.play-toggle', true], ['Next step', '.play-next', false],
          ['Full screen', 'button[aria-label="Full screen"]', false],
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = text;
          button.dataset.control = selector;
          if (primary) button.className = 'primary';
          button.addEventListener('click', () => demo.querySelector('.diagram-stage ' + selector)?.click());
          actions.append(button);
        }
        const learn = document.createElement('a');
        learn.href = '#build-your-own';
        learn.textContent = 'Build your own';
        actions.append(learn);
        demo.prepend(actions);
      }
      const controls = stage.querySelector('.diagram-play');
      if (controls) {
        const sync = () => {
          for (const button of actions.querySelectorAll('button')) {
            const native = stage.querySelector(button.dataset.control);
            button.disabled = !native || native.disabled;
          }
          const primary = actions.querySelector('.primary');
          const text = controls.classList.contains('playing') ? 'Pause demo' : 'Play demo';
          if (primary.textContent !== text) primary.textContent = text;
        };
        if (!attached.has(controls)) {
          attached.add(controls);
          new MutationObserver(sync).observe(controls, { attributes:true, subtree:true, attributeFilter:['class', 'disabled'] });
        }
        sync();
      }
    }
    const walkthrough = article.querySelector('#build-your-own');
    if (walkthrough && !article.querySelector('.help-step-picker')) {
      const label = document.createElement('label');
      label.className = 'help-step-picker';
      label.textContent = 'Jump to a step';
      const picker = document.createElement('select');
      const placeholder = new Option('Choose a step', '');
      placeholder.disabled = placeholder.selected = true;
      picker.add(placeholder);
      for (const heading of article.querySelectorAll('h2')) {
        if (!heading.textContent.includes('Step ')) continue;
        picker.add(new Option(heading.textContent.replace(/^#/, '').trim(), heading.id));
      }
      picker.addEventListener('change', () => { location.hash = picker.value; });
      label.append(picker);
      walkthrough.after(label);
    }
  }
  new MutationObserver(enhance).observe(article, { childList:true, subtree:true });
  enhance();
})();
"""


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


# The web editor: Markdown on the left, the rendered page on the right, saved with Ctrl+S.
EDITOR_CSS = """
  body.aniflow-editing .page.reader { width:100%; max-width:none; display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); column-gap:32px; align-items:start; padding-inline:max(20px, env(safe-area-inset-left)); }
  body.aniflow-editing .page.reader > * { grid-column:auto; }
  body.aniflow-editing .page.reader > .toc { display:none; }
  body.aniflow-editing .reader .markdown-body { max-width:none; }
  .editor { position:sticky; top:68px; }
  .editor textarea { display:block; width:100%; height:calc(100vh - 96px); padding:16px 18px; border:1px solid var(--borderColor-default); border-radius:12px; background:var(--bgColor-muted); color:var(--fgColor-default); font:14px/1.65 ui-monospace,"JetBrains Mono","SF Mono",Menlo,Consolas,monospace; resize:none; tab-size:2; }
  .editor textarea:focus { outline:2px solid var(--fgColor-accent); outline-offset:-1px; }
  .editor-status { color:var(--fgColor-muted); font-size:13px; white-space:nowrap; }
  .editor-status.error { color:var(--fgColor-danger); }
  .bar nav button.editor-save { padding:5px 14px; border-radius:999px; background:var(--fgColor-accent); color:var(--bgColor-default); }
  .bar nav button.editor-save:disabled { opacity:.6; }
  .bar nav button.editor-delete { color:var(--fgColor-danger); }
  @media (max-width:900px) {
    body.aniflow-editing .page.reader { grid-template-columns:minmax(0, 1fr); row-gap:24px; }
    .editor { position:static; }
    .editor textarea { height:55vh; }
  }
  .new-note { display:flex; gap:8px; align-items:center; }
  .new-note input { width:12em; padding:8px 10px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-default); font:inherit; font-size:14px; }
  .new-note button { padding:8px 14px; border:0; border-radius:8px; background:var(--fgColor-accent); color:var(--bgColor-default); font:600 14px/1.4 system-ui,sans-serif; cursor:pointer; white-space:nowrap; }
"""

EDITOR_JS = """
(() => {
  const data = JSON.parse(document.getElementById('aniflow-editor').textContent);
  const area = document.getElementById('editor-text');
  const status = document.getElementById('editor-status');
  const saveButton = document.getElementById('editor-save');
  const back = document.querySelector('.bar > a');
  let version = data.version;
  let saved = data.exists ? area.value : null;
  let timer = 0;
  const dirty = () => area.value !== saved;
  function say(text, bad) {
    status.textContent = text;
    status.classList.toggle('error', Boolean(bad));
  }
  const mark = () => say(dirty() ? 'Unsaved changes' : 'Saved');
  area.addEventListener('input', () => {
    mark();
    clearTimeout(timer);
    timer = setTimeout(() => window.aniflowReader?.update(area.value), 300);
  });
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(answer.error || response.statusText);
    return answer;
  }
  async function save() {
    saveButton.disabled = true;
    try {
      const answer = await post(data.save, { text: area.value, version: version });
      version = answer.version;
      saved = area.value;
      back.href = answer.url;
      back.textContent = '← View';
      mark();
    } catch (error) {
      say(error.message, true);
    }
    saveButton.disabled = false;
  }
  saveButton.addEventListener('click', save);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
  document.getElementById('editor-diagram').addEventListener('click', () => {
    const start = area.selectionStart;
    const before = area.value.slice(0, start);
    const gap = !before || before.endsWith('\\n\\n') ? '' : before.endsWith('\\n') ? '\\n' : '\\n\\n';
    area.setRangeText(gap + data.example + '\\n', start, area.selectionEnd, 'end');
    area.focus();
    area.dispatchEvent(new Event('input'));
  });
  document.getElementById('editor-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete ' + data.name + '? This cannot be undone.')) return;
    try {
      await post(data.remove, { version: version });
      saved = area.value;
      location.href = data.folder;
    } catch (error) {
      say(error.message, true);
    }
  });
  addEventListener('beforeunload', (event) => {
    if (dirty()) event.preventDefault();
  });
  mark();
})();
"""

NEW_NOTE_JS = """
(() => {
  const input = document.getElementById('new-note-name');
  function open() {
    let name = input.value.trim().replace(/\\s+/g, '-');
    if (!name) return input.focus();
    if (!/\\.(md|markdown)$/i.test(name)) name += '.md';
    location.href = location.pathname.replace(/\\/?$/, '/') + encodeURIComponent(name) + '?edit';
  }
  document.getElementById('new-note').addEventListener('click', open);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
})();
"""


TOKENS_CSS = """
  .tokens { max-width:46rem; margin:0 auto 34px; }
  .tokens .token-new { display:flex; gap:8px; margin-bottom:14px; }
  .tokens .token-new input { flex:1; min-width:0; padding:9px 11px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-default); font:inherit; font-size:14px; }
  .tokens button { padding:8px 14px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-default); font:600 13px/1.4 system-ui,sans-serif; cursor:pointer; white-space:nowrap; }
  .tokens #token-create { border:0; background:var(--fgColor-accent); color:var(--bgColor-default); }
  .tokens .token-made { margin:0 0 14px; padding:12px 14px; border:1px solid var(--fgColor-success, var(--fgColor-accent)); border-radius:10px; background:var(--bgColor-muted); }
  .tokens .token-made p { margin:0 0 8px; font-size:13px; color:var(--fgColor-muted); }
  .tokens .token-made div { display:flex; gap:8px; align-items:center; }
  .tokens .token-made code { flex:1; min-width:0; overflow-wrap:anywhere; padding:6px 8px; border-radius:6px; background:var(--bgColor-default); font-size:13px; }
  .tokens .token-status { min-height:1.4em; margin:0 0 8px; font-size:13px; color:var(--fgColor-muted); }
  .tokens table { width:100%; border-collapse:collapse; font-size:14px; }
  .tokens th, .tokens td { padding:8px 6px; border-bottom:1px solid var(--borderColor-muted); text-align:left; }
  .tokens th { color:var(--fgColor-muted); font-weight:600; font-size:12px; }
  .tokens td:last-child { text-align:right; }
  .tokens .token-none td { color:var(--fgColor-muted); text-align:left; }
  @media (max-width:640px) { .tokens th:nth-child(2), .tokens td:nth-child(2), .tokens th:nth-child(3), .tokens td:nth-child(3) { display:none; } }
"""

TOKENS_JS = """
(() => {
  const data = JSON.parse(document.getElementById('aniflow-tokens').textContent);
  const status = document.getElementById('token-status');
  const name = document.getElementById('token-name');
  const rows = document.getElementById('token-rows');
  const say = (text) => { status.textContent = text; };
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(answer.error || response.statusText);
    return answer;
  }
  function revokeButton(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = id;
    button.textContent = 'Revoke';
    return button;
  }
  async function create() {
    if (!name.value.trim()) return name.focus();
    try {
      const made = await post(data.create, { name: name.value });
      document.getElementById('token-value').textContent = made.token;
      document.getElementById('token-made').hidden = false;
      const row = document.createElement('tr');
      for (const text of [made.name, 'today', 'never', new Date(made.expires * 1000).toISOString().slice(0, 10)]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      const last = document.createElement('td');
      last.append(revokeButton(made.id));
      row.append(last);
      rows.querySelector('.token-none')?.remove();
      rows.prepend(row);
      name.value = '';
      say('');
    } catch (error) {
      say(error.message);
    }
  }
  document.getElementById('token-create').addEventListener('click', create);
  name.addEventListener('keydown', (event) => { if (event.key === 'Enter') create(); });
  document.getElementById('token-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('token-value').textContent);
      say('Copied');
    } catch {
      say('Select the token and copy it by hand');
    }
  });
  rows.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button || !confirm('Revoke this token? Scripts that use it stop working.')) return;
    try {
      await post(data.revoke, { id: button.dataset.id });
      button.closest('tr').remove();
      say('Revoked');
    } catch (error) {
      say(error.message);
    }
  });
})();
"""
