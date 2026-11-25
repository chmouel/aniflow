"""The aniflow pages' own look: the file browser and the bits around the reader."""

GITHUB_MARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'
FOLDER_MENU_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M2 4.2A1.2 1.2 0 0 1 3.2 3h2.7l1.3 1.5h5.6A1.2 1.2 0 0 1 14 5.7v6.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.8Z"/></svg>'
KEY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M8.5 8H14M12 8v2.2M14 8v1.6"/></svg>'
SIGNOUT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M6.5 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v8.4a1.3 1.3 0 0 0 1.3 1.3h2.7M10.5 11.2 13.7 8l-3.2-3.2M13.5 8H6"/></svg>'
TRASH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M2.5 4.2h11M6 4.2V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.2M4 4.2l.7 8.6a1.2 1.2 0 0 0 1.2 1.2h4.2a1.2 1.2 0 0 0 1.2-1.2l.7-8.6"/></svg>'
FOLDER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>'
NOTE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M7 2.5h7.2c.5 0 1 .2 1.4.6l3.3 3.3c.4.4.6.9.6 1.4v11.7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2ZM8.5 11h7v1.5h-7Zm0 3.5h7V16h-7Zm0-7h3.5V9H8.5Z"/><path fill="currentColor" opacity=".45" d="M14.5 2.6v3.4a1.5 1.5 0 0 0 1.5 1.5h3.4Z"/></svg>'
LOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4.4 7V5.2a3.6 3.6 0 0 1 7.2 0V7M3.5 7h9a.9.9 0 0 1 .9.9v5.2a.9.9 0 0 1-.9.9h-9a.9.9 0 0 1-.9-.9V7.9a.9.9 0 0 1 .9-.9Z"/><circle cx="8" cy="10.2" r=".9" fill="currentColor"/></svg>'
SEARCH_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12.6 12.6l4.4 4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'


DIRECTORY_CSS = """
  .aniflow-browser { --folder-color:var(--fgColor-attention); --document-color:var(--fgColor-accent); }
  html[data-mode="light"] body.aniflow-browser { background:var(--bgColor-muted); }
  html[data-mode="light"] .aniflow-browser .bar { background:color-mix(in srgb, var(--bgColor-default) 88%, transparent); }
  html[data-mode="light"] .aniflow-browser .browser-toolbar { background:var(--bgColor-default); box-shadow:0 1px 2px color-mix(in srgb, var(--fgColor-default) 6%, transparent); }
  html[data-mode="light"] .aniflow-browser .folder-sort select { background:var(--bgColor-default); }
  html[data-mode="light"] .aniflow-browser .folders-list a { background:var(--bgColor-default); box-shadow:0 1px 3px color-mix(in srgb, var(--fgColor-default) 7%, transparent); }
  html[data-mode="light"] .aniflow-browser .folders-list a:hover { box-shadow:0 6px 16px color-mix(in srgb, var(--fgColor-default) 10%, transparent); }
  html[data-mode="light"] .aniflow-browser .documents-list { background:var(--bgColor-default); box-shadow:0 1px 3px color-mix(in srgb, var(--fgColor-default) 6%, transparent); }
  html[data-mode="light"] .aniflow-browser .browser-empty { background:var(--bgColor-default); }
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
  .aniflow-browser .my-space { display:flex; align-items:center; gap:16px; margin-bottom:26px; padding:16px 20px; border:1px solid color-mix(in srgb, var(--document-color) 35%, var(--borderColor-default)); border-radius:12px; background:color-mix(in srgb, var(--document-color) 7%, var(--bgColor-default)); color:var(--fgColor-default); text-decoration:none; }
  .aniflow-browser .my-space:hover { border-color:var(--document-color); background:color-mix(in srgb, var(--document-color) 12%, var(--bgColor-default)); }
  .aniflow-browser .my-space-symbol { display:grid; place-items:center; flex:0 0 44px; height:44px; border-radius:50%; background:color-mix(in srgb, var(--document-color) 14%, var(--bgColor-default)); color:var(--document-color); }
  .aniflow-browser .my-space-symbol svg { width:24px; height:24px; }
  .aniflow-browser .my-space-text { flex:1; min-width:0; }
  .aniflow-browser .my-space strong { display:block; margin-bottom:2px; font-size:16px; font-weight:650; }
  .aniflow-browser .my-space-text span { display:block; color:var(--fgColor-muted); font-size:13px; }
  .aniflow-browser .my-space:hover .entry-arrow { color:var(--document-color); }
  .aniflow-browser .my-space:hover .entry-arrow svg { transform:translateX(3px); }
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
  .aniflow-browser .new-note { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .aniflow-browser .new-note input { width:13em; padding:8px 10px; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-default); font:inherit; font-size:14px; }
  .aniflow-browser .new-note button { padding:8px 14px; border:0; border-radius:8px; background:var(--fgColor-accent); color:var(--bgColor-default); font:600 14px/1.4 system-ui,sans-serif; cursor:pointer; white-space:nowrap; }
  .aniflow-browser .new-note button.new-folder { border:1px solid var(--borderColor-default); background:var(--bgColor-default); color:var(--fgColor-default); }
  .aniflow-browser .new-note button.new-folder:hover { border-color:var(--fgColor-muted); background:var(--bgColor-muted); }
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
  .aniflow-browser .folders-list li { position:relative; }
  .aniflow-browser .private-mark { display:inline-flex; align-items:center; margin-left:6px; vertical-align:-2px; color:var(--fgColor-attention); }
  .aniflow-browser .private-mark svg { width:14px; height:14px; }
  .aniflow-browser .folder-privacy { display:inline-flex; align-items:center; gap:7px; padding:7px 13px; border:1px solid var(--borderColor-default); border-radius:999px; background:var(--bgColor-default); color:var(--fgColor-default); font:inherit; font-size:13px; cursor:pointer; white-space:nowrap; }
  .aniflow-browser .folder-privacy:hover { border-color:var(--fgColor-muted); }
  .aniflow-browser .folder-privacy[aria-pressed="true"] { border-color:color-mix(in srgb, var(--fgColor-attention) 45%, var(--borderColor-default)); color:var(--fgColor-attention); }
  .aniflow-browser .folder-privacy svg { width:14px; height:14px; }
  .aniflow-browser .folder-privacy:focus-visible { outline:2px solid var(--document-color); outline-offset:2px; }
  .aniflow-browser .folder-private { display:inline-flex; align-items:center; gap:5px; margin-top:10px; padding:2px 10px; border:1px solid color-mix(in srgb, var(--fgColor-attention) 45%, transparent); border-radius:999px; background:color-mix(in srgb, var(--fgColor-attention) 12%, transparent); color:var(--fgColor-attention); font-size:12px; font-weight:600; vertical-align:1px; }
  .aniflow-browser .folder-private svg { width:13px; height:13px; }
  .aniflow-browser .private-toggle { position:absolute; top:8px; right:8px; display:grid; place-items:center; width:30px; height:30px; padding:0; border:1px solid var(--borderColor-default); border-radius:8px; background:var(--bgColor-default); color:var(--fgColor-muted); cursor:pointer; }
  .aniflow-browser .private-toggle:hover { border-color:var(--fgColor-muted); color:var(--fgColor-default); }
  .aniflow-browser .private-toggle[aria-pressed="true"] { border-color:color-mix(in srgb, var(--fgColor-attention) 45%, var(--borderColor-default)); color:var(--fgColor-attention); }
  .aniflow-browser .private-toggle svg { width:15px; height:15px; }
  .aniflow-browser .private-toggle:focus-visible { outline:2px solid var(--document-color); outline-offset:2px; }
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
  .bar-trail .private-badge { display:inline-flex; flex:none; align-items:center; gap:4px; margin-left:8px; padding:1px 8px; border:1px solid color-mix(in srgb, var(--fgColor-attention) 45%, transparent); border-radius:999px; background:color-mix(in srgb, var(--fgColor-attention) 12%, transparent); color:var(--fgColor-attention); font-size:12px; font-weight:600; white-space:nowrap; }
  .bar-trail .private-badge svg { width:12px; height:12px; }
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
  .aniflow-local .search-open svg { width:16px; height:16px; }
  dialog.aniflow-search { width:min(620px, calc(100vw - 24px)); max-height:min(75vh, 560px); margin:10vh auto auto; padding:0; border:1px solid var(--borderColor-default); border-radius:14px; background:var(--bgColor-default); color:var(--fgColor-default); box-shadow:0 24px 64px rgba(0,0,0,.38); overflow:hidden; }
  dialog.aniflow-search::backdrop { background:rgba(0,0,0,.48); backdrop-filter:blur(3px); }
  dialog.aniflow-search[open] { display:flex; flex-direction:column; }
  .aniflow-search .search-head { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--borderColor-muted); color:var(--fgColor-muted); }
  .aniflow-search .search-head svg { flex-shrink:0; }
  .aniflow-search input { flex:1; min-width:0; border:0; background:none; color:var(--fgColor-default); font:16px/1.4 inherit; outline:none; }
  .aniflow-search .search-close { padding:3px 8px; border:1px solid var(--borderColor-default); border-radius:6px; background:none; color:var(--fgColor-muted); font:600 11px/1.3 ui-monospace,monospace; cursor:pointer; }
  .aniflow-search .search-close:hover { color:var(--fgColor-default); border-color:var(--fgColor-muted); }
  .aniflow-search .search-results { overflow:auto; padding:8px; }
  .aniflow-search .search-empty { margin:0; padding:24px 12px; text-align:center; color:var(--fgColor-muted); font-size:14px; }
  .aniflow-search .search-hit { display:block; padding:10px 12px; border-radius:9px; color:inherit; text-decoration:none; }
  .aniflow-search .search-hit:hover, .aniflow-search .search-hit[aria-selected="true"] { background:var(--bgColor-muted); }
  .aniflow-search .search-hit-path { display:block; color:var(--fgColor-accent); font-size:14px; font-weight:600; overflow-wrap:anywhere; }
  .aniflow-search .search-hit-line { display:block; margin-top:3px; color:var(--fgColor-muted); font-size:12.5px; line-height:1.45; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .aniflow-search .search-hit-num { margin-right:6px; font-family:ui-monospace,monospace; opacity:.7; }
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
  const searchButton = document.getElementById('search-open');
  const searchDialog = document.getElementById('aniflow-search');
  if (searchButton && searchDialog) {
    const input = document.getElementById('aniflow-search-input');
    const results = document.getElementById('aniflow-search-results');
    const endpoint = searchButton.dataset.searchUrl;
    let timer = 0, active = -1, pending = null, seq = 0;
    const setEmpty = (text) => {
      results.replaceChildren();
      active = -1;
      const p = document.createElement('p');
      p.className = 'search-empty';
      p.textContent = text;
      results.append(p);
    };
    const pick = (index) => {
      const items = [...results.querySelectorAll('.search-hit')];
      if (!items.length) { active = -1; return; }
      active = ((index % items.length) + items.length) % items.length;
      items.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
      items[active].scrollIntoView({ block: 'nearest' });
    };
    const run = async (gen) => {
      const q = input.value.trim();
      if (!q) { setEmpty('Type to search across all notes.'); return; }
      pending = new AbortController();
      try {
        const resp = await fetch(endpoint + '?q=' + encodeURIComponent(q), { cache: 'no-store', signal: pending.signal });
        if (gen !== seq) return;
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();
        if (gen !== seq) return;
        results.replaceChildren();
        active = -1;
        if (!data.results || !data.results.length) { setEmpty('No notes match "' + q + '".'); return; }
        for (const item of data.results) {
          const link = document.createElement('a');
          link.className = 'search-hit';
          link.setAttribute('role', 'option');
          link.href = item.url;
          const title = document.createElement('span');
          title.className = 'search-hit-path';
          title.textContent = item.path;
          link.append(title);
          for (const match of item.matches || []) {
            const row = document.createElement('span');
            row.className = 'search-hit-line';
            const num = document.createElement('span');
            num.className = 'search-hit-num';
            num.textContent = ':' + match.line;
            row.append(num, document.createTextNode(match.text));
            link.append(row);
          }
          results.append(link);
        }
        pick(0);
      } catch (error) {
        if (gen === seq && error.name !== 'AbortError') setEmpty('Search failed.');
      }
    };
    const openSearch = () => {
      if (!searchDialog.open) searchDialog.showModal();
      input.focus();
      input.select();
      if (!input.value.trim()) setEmpty('Type to search across all notes.');
    };
    searchButton.addEventListener('click', openSearch);
    document.getElementById('aniflow-search-close')?.addEventListener('click', () => searchDialog.close());
    searchDialog.addEventListener('click', event => { if (event.target === searchDialog) searchDialog.close(); });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      if (pending) { pending.abort(); pending = null; }
      const gen = ++seq;
      if (!input.value.trim()) { setEmpty('Type to search across all notes.'); return; }
      timer = setTimeout(() => run(gen), 180);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); pick(active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); pick(active - 1); }
      else if (event.key === 'Enter' && active >= 0) {
        const chosen = results.querySelectorAll('.search-hit')[active];
        if (chosen) { event.preventDefault(); location.href = chosen.href; }
      }
    });
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (document.body.classList.contains('presenting')) return;
        event.preventDefault();
        openSearch();
      }
    });
  }
  const rename = document.querySelector('button[data-rename-url]');
  if (rename) {
    rename.addEventListener('click', async () => {
      const next = prompt('Rename ' + rename.dataset.name + ' to:', rename.dataset.name);
      if (!next || next.trim() === rename.dataset.name) return;
      rename.disabled = true;
      try {
        const response = await fetch(rename.dataset.renameUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: next.trim(), version: rename.dataset.version }),
        });
        const answer = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(answer.error || response.statusText);
        location.href = answer.url;
      } catch (error) {
        rename.disabled = false;
        alert('Could not rename: ' + (error.message || error));
      }
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
  // Make private / Make public: the server answers {private} and the page reloads.
  for (const button of document.querySelectorAll('button[data-private-url]')) {
    button.addEventListener('click', async () => {
      const wanted = button.dataset.private !== 'true';
      button.disabled = true;
      try {
        const response = await fetch(button.dataset.privateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ private: wanted }),
        });
        const answer = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(answer.error || response.statusText);
        location.reload();
      } catch (error) {
        button.disabled = false;
        alert('Could not change privacy: ' + (error.message || error));
      }
    });
  }
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
  .bar nav button.editor-private { color:var(--fgColor-muted); }
  .bar nav button.editor-private[aria-pressed="true"] { border:1px solid color-mix(in srgb, var(--fgColor-attention) 45%, var(--borderColor-default)); border-radius:999px; color:var(--fgColor-attention); }
  .bar nav button.editor-private:disabled { opacity:.55; cursor:not-allowed; }
  @media (max-width:900px) {
    body.aniflow-editing .page.reader { grid-template-columns:minmax(0, 1fr); row-gap:24px; }
    .editor { position:static; }
    .editor textarea { height:55vh; }
  }
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
      return answer;
    } catch (error) {
      say(error.message, true);
      return null;
    } finally {
      saveButton.disabled = false;
    }
  }
  // The button saves and goes to the note; Ctrl+S saves and stays in the editor.
  saveButton.addEventListener('click', async () => {
    const answer = await save();
    if (answer) location.href = answer.url;
  });
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
  async function uploadImage(file) {
    if (!file || !data.upload) return;
    const token = '![Uploading image ' + Math.random().toString(36).slice(2, 8) + '…]()';
    const start = area.selectionStart;
    const before = area.value.slice(0, start);
    const gap = !before || before.endsWith('\\n\\n') ? '' : before.endsWith('\\n') ? '\\n' : '\\n\\n';
    area.setRangeText(gap + token + '\\n', start, area.selectionEnd, 'end');
    area.focus();
    say('Uploading image…');
    try {
      const response = await fetch(data.upload, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const answer = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(answer.error || response.statusText);
      const pos = area.value.indexOf(token);
      if (pos !== -1) area.setRangeText(answer.markdown, pos, pos + token.length, 'end');
      else area.setRangeText('\\n' + answer.markdown + '\\n', area.value.length, area.value.length, 'end');
      area.dispatchEvent(new Event('input'));
      say('Uploaded image');
    } catch (error) {
      const pos = area.value.indexOf(token);
      if (pos !== -1) area.setRangeText('', pos, pos + token.length, 'preserve');
      say(error.message || 'Upload failed', true);
    }
  }
  const imageInput = document.getElementById('editor-image-file');
  document.getElementById('editor-image')?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    imageInput.value = '';
    if (file) uploadImage(file);
  });
  area.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadImage(file);
  });
  area.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
  });
  area.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    uploadImage(file);
  });
  // The Private button only edits the front matter in the textarea; a save writes it.
  const privateButton = document.getElementById('editor-private');
  if (privateButton && !privateButton.disabled) {
    const frontMatter = () => {
      const lines = area.value.split('\\n');
      if (!/^---[ \\t]*$/.test(lines[0] || '')) return null;
      for (let i = 1; i < Math.min(lines.length, 201); i++) {
        if (/^(---|\\.\\.\\.)[ \\t]*$/.test(lines[i])) return { lines, end: i };
      }
      return null;
    };
    const linePattern = /^private[ \\t]*:/i;
    const isPrivate = () => {
      const block = frontMatter();
      if (!block) return false;
      for (let i = 1; i < block.end; i++) {
        const found = /^private[ \\t]*:[ \\t]*(.*)$/i.exec(block.lines[i]);
        if (found && /^(true|yes|on|1)$/i.test(found[1].split('#')[0].trim().replace(/^["']|["']$/g, ''))) return true;
      }
      return false;
    };
    const paint = () => {
      const on = isPrivate();
      privateButton.setAttribute('aria-pressed', String(on));
      privateButton.title = on ? 'Make this note public' : 'Make this note private';
    };
    const setPrivate = (wanted) => {
      const block = frontMatter();
      if (wanted) {
        if (!block) area.value = '---\\nprivate: true\\n---\\n' + area.value;
        else {
          let index = -1;
          for (let i = 1; i < block.end; i++) if (linePattern.test(block.lines[i])) index = i;
          if (index === -1) block.lines.splice(1, 0, 'private: true');
          else block.lines[index] = 'private: true';
          area.value = block.lines.join('\\n');
        }
      } else {
        if (!block) return;
        let index = -1;
        for (let i = 1; i < block.end; i++) if (linePattern.test(block.lines[i])) index = i;
        if (index === -1) return;
        block.lines.splice(index, 1);
        const closing = block.end - 1;
        const body = block.lines.slice(1, closing);
        if (!body.some((line) => line.trim() && !line.trim().startsWith('#'))) {
          block.lines.splice(closing, 1);
          block.lines.splice(0, 1);
        }
        area.value = block.lines.join('\\n');
      }
      area.dispatchEvent(new Event('input'));
      paint();
    };
    privateButton.addEventListener('click', () => setPrivate(privateButton.getAttribute('aria-pressed') !== 'true'));
    paint();
  }
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
  const mkdirButton = document.getElementById('new-folder');
  if (mkdirButton) {
    mkdirButton.addEventListener('click', async () => {
      const name = input.value.trim().replace(/\\s+/g, '-');
      if (!name) return input.focus();
      mkdirButton.disabled = true;
      try {
        const response = await fetch(mkdirButton.dataset.mkdirUrl + '/' + encodeURIComponent(name), { method: 'POST' });
        const answer = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(answer.error || response.statusText);
        location.href = answer.url;
      } catch (error) {
        mkdirButton.disabled = false;
        alert('Could not create folder: ' + (error.message || error));
      }
    });
  }
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

# The sign-in gate a private note or folder answers anonymous readers with: the colours
# of its own illustration, so it follows the page theme like everything else.
GATE_CSS = """
  .aniflow-gate { --gate-stone:#3d4658; --gate-fire:#ff8a3d; --gate-ember:#ffc861;
    --gate-glow:#ff5a1f; --gate-ring:#8ad4ff;
    min-height:100vh; margin:0; background:var(--bgColor-default); color:var(--fgColor-default); }
  html[data-mode="light"] .aniflow-gate { --gate-stone:#8d8579; --gate-fire:#d4611b;
    --gate-ember:#b1760f; --gate-glow:#ff7a24; --gate-ring:#2563c9; }
  .aniflow-gate .gate { display:flex; flex-direction:column; align-items:center; width:min(100%, 560px);
    margin:0 auto; padding:clamp(28px, 6vw, 52px) 24px 56px; text-align:center; }
  .aniflow-gate .aniflow-brand { width:min(100%, 220px); margin:0 auto 4px; }
  .aniflow-gate .aniflow-brand.brand-name { width:auto; max-width:100%; justify-content:center; }
  .aniflow-gate .aniflow-brand .brand-logo { height:clamp(3.5rem, 11vw, 4.75rem); }
  .aniflow-gate .aniflow-brand .brand-word { font-size:clamp(1.6rem, 5.5vw, 2.5rem); }
  .aniflow-gate .gate-art { display:block; width:min(100%, 480px); height:auto; margin:10px auto 8px; }
  .aniflow-gate .gate-opening { fill:color-mix(in srgb, var(--gate-stone) 25%, var(--bgColor-default)); }
  .aniflow-gate h1 { margin:0 0 12px; font-size:clamp(30px, 8vw, 54px); font-weight:800; line-height:1.05; letter-spacing:-.04em; }
  .aniflow-gate .gate-note { max-width:32em; margin:0 auto 26px; color:var(--fgColor-muted); font-size:clamp(14px, 2.6vw, 16px); line-height:1.65; }
  .aniflow-gate .gate-actions { display:flex; flex-direction:column; align-items:center; gap:14px; }
  .aniflow-gate .gate-signin { display:inline-flex; align-items:center; gap:9px; padding:11px 22px; border-radius:999px; background:var(--fgColor-accent); color:var(--bgColor-default); font-size:15px; font-weight:600; text-decoration:none; }
  .aniflow-gate .gate-signin:hover { filter:brightness(1.07); }
  .aniflow-gate .gate-signin svg { width:18px; height:18px; fill:currentColor; flex-shrink:0; }
  .aniflow-gate .gate-back { color:var(--fgColor-muted); font-size:14px; text-decoration:none; }
  .aniflow-gate .gate-back:hover { color:var(--fgColor-default); text-decoration:underline; }
  .aniflow-gate :is(.gate-signin, .gate-back):focus-visible { outline:2px solid var(--fgColor-accent); outline-offset:3px; }
  .aniflow-gate .gate-fire { transform-box:fill-box; transform-origin:center bottom; animation:gate-flicker 3.6s ease-in-out infinite; }
  .aniflow-gate .gate-flame { transform-box:fill-box; transform-origin:center bottom; animation:gate-sway 2.9s ease-in-out infinite; }
  .aniflow-gate .gate-flame:nth-of-type(2n) { animation-delay:-1.1s; }
  .aniflow-gate .gate-flame:nth-of-type(3n) { animation-delay:-1.9s; }
  .aniflow-gate .gate-ring { animation:gate-pulse 5s ease-in-out infinite; }
  .aniflow-gate .gate-ember { opacity:0; animation:gate-rise 6s linear infinite; }
  .aniflow-gate .gate-ember.e2 { animation-delay:-1.2s; }
  .aniflow-gate .gate-ember.e3 { animation-delay:-2.4s; }
  .aniflow-gate .gate-ember.e4 { animation-delay:-3.6s; }
  .aniflow-gate .gate-ember.e5 { animation-delay:-4.8s; }
  @keyframes gate-flicker { 0%, 100% { opacity:.86; transform:scaleY(1); } 30% { opacity:1; transform:scaleY(1.07); } 62% { opacity:.8; transform:scaleY(.95); } 82% { opacity:.95; transform:scaleY(1.03); } }
  @keyframes gate-sway { 0%, 100% { transform:rotate(-1.6deg); } 50% { transform:rotate(1.6deg); } }
  @keyframes gate-pulse { 0%, 100% { opacity:.82; } 50% { opacity:1; } }
  @keyframes gate-rise { 0% { opacity:0; transform:translateY(10px); } 22% { opacity:.9; } 100% { opacity:0; transform:translateY(-54px); } }
  @media (prefers-reduced-motion:reduce) {
    .aniflow-gate :is(.gate-fire, .gate-flame, .gate-ring, .gate-ember) { animation:none; }
    .aniflow-gate .gate-ember { opacity:.55; transform:none; }
  }
  @media (max-width:420px) {
    .aniflow-gate .gate { padding:24px 16px 40px; }
    .aniflow-gate .gate-back { font-size:13px; }
  }
"""

# An original drawing for the gate: a stone doorway with steps, fire on the threshold, a
# glowing ring and a chained padlock. No picture, no lettering, only the palette above.
GATE_ART = """
<svg class="gate-art" viewBox="0 0 480 320" width="480" height="320" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gate-halo" cx="50%" cy="88%" r="60%">
      <stop offset="0" stop-color="var(--gate-glow)" stop-opacity=".6"/>
      <stop offset="1" stop-color="var(--gate-glow)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gate-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--gate-stone)" stop-opacity=".95"/>
      <stop offset="1" stop-color="var(--gate-stone)" stop-opacity=".5"/>
    </linearGradient>
    <linearGradient id="gate-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="var(--gate-ember)"/>
      <stop offset=".55" stop-color="var(--gate-fire)"/>
      <stop offset="1" stop-color="var(--gate-glow)"/>
    </linearGradient>
  </defs>
  <ellipse cx="240" cy="286" rx="200" ry="32" fill="url(#gate-halo)"/>
  <g fill="url(#gate-wall)">
    <path d="M120 264h240l14 14H106Z" fill-opacity=".8"/>
    <path d="M106 278h268l16 16H90Z" fill-opacity=".6"/>
    <path d="M90 294h300l14 14H76Z" fill-opacity=".4"/>
  </g>
  <path d="M128 278V140a112 112 0 0 1 224 0v138Z" fill="url(#gate-wall)"/>
  <path class="gate-opening" d="M154 278V140a86 86 0 0 1 172 0v138Z"/>
  <path d="M154 278V140a86 86 0 0 1 172 0v138Z" fill="none" stroke="var(--gate-stone)" stroke-opacity=".8" stroke-width="3"/>
  <g stroke="var(--gate-stone)" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M240 28v26"/>
    <path d="M202 35 211 59"/>
    <path d="M278 35 269 59"/>
    <path d="M148 76 170 91"/>
    <path d="M332 76 310 91"/>
    <path d="M128 140h26M326 140h26"/>
    <path d="M128 210h26M326 210h26"/>
    <path d="M128 246h26M326 246h26"/>
  </g>
  <g class="gate-fire" fill="url(#gate-flame)">
    <path class="gate-flame" d="M176 278c-3-14 3-23 2-34 9 9 16 20 16 34Z"/>
    <path class="gate-flame" d="M200 278c-4-22 5-34 4-52 15 13 24 31 24 52Z"/>
    <path class="gate-flame" d="M236 278c-5-28 7-44 5-66 19 17 30 40 30 66Z"/>
    <path class="gate-flame" d="M280 278c-4-20 5-32 4-48 14 12 22 29 22 48Z"/>
    <path class="gate-flame" d="M306 278c-3-12 3-19 2-28 9 8 14 17 14 28Z"/>
  </g>
  <g class="gate-embers" fill="var(--gate-ember)">
    <circle class="gate-ember e1" cx="212" cy="196" r="3"/>
    <circle class="gate-ember e2" cx="262" cy="178" r="2.4"/>
    <circle class="gate-ember e3" cx="238" cy="150" r="2.8"/>
    <circle class="gate-ember e4" cx="292" cy="188" r="2.2"/>
    <circle class="gate-ember e5" cx="186" cy="170" r="2.6"/>
  </g>
  <ellipse class="gate-ring" cx="240" cy="176" rx="78" ry="88" fill="none" stroke="var(--gate-ring)" stroke-opacity=".28" stroke-width="10"/>
  <ellipse class="gate-ring" cx="240" cy="176" rx="78" ry="88" fill="none" stroke="var(--gate-ring)" stroke-opacity=".9" stroke-width="3"/>
  <g fill="none" stroke="var(--gate-stone)" stroke-opacity=".9" stroke-width="3">
    <ellipse cx="240" cy="92" rx="5" ry="8"/>
    <ellipse cx="240" cy="106" rx="8" ry="5"/>
    <ellipse cx="240" cy="120" rx="5" ry="8"/>
    <ellipse cx="240" cy="134" rx="8" ry="5"/>
    <ellipse cx="240" cy="148" rx="5" ry="8"/>
    <ellipse cx="240" cy="162" rx="8" ry="5"/>
    <ellipse cx="240" cy="176" rx="5" ry="8"/>
  </g>
  <path d="M222 206v-16a18 18 0 0 1 36 0v16" fill="none" stroke="var(--gate-stone)" stroke-width="7" stroke-linecap="round"/>
  <rect x="206" y="202" width="68" height="60" rx="11" fill="var(--gate-stone)"/>
  <rect x="206" y="202" width="68" height="60" rx="11" fill="none" stroke="var(--fgColor-default)" stroke-opacity=".25" stroke-width="2"/>
  <circle cx="240" cy="226" r="6.5" fill="var(--gate-ember)"/>
  <path d="M240 230v13" stroke="var(--gate-ember)" stroke-width="4" stroke-linecap="round"/>
</svg>
"""
