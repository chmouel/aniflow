import { host } from '../host.js';
import { copyText } from './code.js';
import { addBusyCheck } from '../diagram/busy.js';

export function initReview() {
  if (host.commentsUrl && host.reviewToggle && host.dock) {
    const reviewName = host.reviewName;
    if (reviewName === 'Comments') {
      const label = document.createElement('span');
      label.textContent = 'Comments';
      host.reviewToggle.insertBefore(label, host.reviewToggle.querySelector('.count'));
    }
    const coarse = matchMedia('(pointer: coarse)');
    const commentMax = host.commentMax;
    // Sign-in is on when the server offers it: writing then needs an account, and only
    // the account that wrote a comment may change it.
    const gated = Boolean(host.commentsSignin);
    const me = host.commentsMe;
    const mine = (comment) => !gated || (me && comment.author_id === me.id);
    function signInLink(label) {
      const link = make('a', 'review-signin', label);
      const back = location.pathname + location.search + location.hash;
      link.href = host.commentsSignin + '?next=' + encodeURIComponent(back);
      return link;
    }
    const badge = host.reviewToggle.querySelector('.count');
    const dockText = host.dock.querySelector('.review-dock-text');
    const commentButton = host.dock.querySelector('[data-review="comment"]');
    const clearButton = host.dock.querySelector('[data-review="clear"]');
    const copyButton = host.dock.querySelector('[data-review="copy"]');
    const session = make('span', 'review-session');
    const gutter = document.createElement('div');
    gutter.className = 'review-gutter';
    let reviewing = false;
    let view = { lines: 0, comments: [] };
    let promptText = '';
    let selection = null;
    let marks = [];
    let composer = null;
    let message = '';
    let messageTimer = 0;

    const range = (start, end) => start === end ? 'Line ' + start : 'Lines ' + start + '–' + end;
    const plural = (count) => count + (count === 1 ? ' comment' : ' comments');
    addBusyCheck(() => Boolean(composer) || Boolean(host.article.querySelector('.review-comment form')));

    function make(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      if (tag === 'button') element.type = 'button';
      return element;
    }

    function ago(date) {
      const seconds = (date.getTime() - Date.now()) / 1000;
      const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
      }
      return 'just now';
    }

    function notify(text) {
      message = text;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { message = ''; updateDock(); }, 3000);
      updateDock();
    }

    async function call(url, options) {
      const response = await fetch(url, Object.assign({ cache: 'no-store' }, options));
      const answer = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(answer.error || response.statusText);
      return answer;
    }

    async function loadPrompt() {
      const response = await fetch(host.commentsUrl + '?format=prompt', { cache: 'no-store' });
      promptText = response.ok ? await response.text() : '';
    }

    async function refresh() {
      view = await call(host.commentsUrl);
      await loadPrompt();
      redraw();
    }

    async function post(action, query, body) {
      view = await call(host.commentsUrl.replace('/comments/', '/comments/' + action + '/') + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? '' : JSON.stringify(body),
      });
      await loadPrompt();
      redraw();
    }

    function redraw() {
      const count = view.comments.length;
      badge.textContent = String(count);
      badge.hidden = !count;
      const label = count ? reviewName + ', ' + plural(count) : reviewName;
      host.reviewToggle.setAttribute('aria-label', label);
      host.reviewToggle.title = label;
      if (!reviewing) return;
      buildMarks();
      drawThreads();
      paint();
    }

    // Every block that maps to source lines, and each line of every code block.
    function collect() {
      const found = [];
      for (const element of host.article.querySelectorAll('[data-line]')) {
        if (element.closest('.code-body, .review-thread, .review-composer')) continue;
        const start = Number(element.dataset.line);
        if (start) found.push({ element: element, start: start, end: Number(element.dataset.lineEnd) || start, code: false });
      }
      for (const box of host.article.querySelectorAll('.code-body [data-code]')) {
        const first = Number(box.dataset.code);
        const pre = box.matches('pre') ? box : box.querySelector('pre');
        if (!first || !pre) continue;
        const count = pre.textContent.replace(/\n$/, '').split('\n').length;
        const last = Math.min(first + count - 1, Number(box.dataset.lineEnd) || Infinity);
        for (let line = first; line <= last; line++) {
          found.push({ element: box, start: line, end: line, code: true, body: box.closest('.code-body') });
        }
      }
      return found.sort((a, b) => a.start - b.start || a.end - b.end);
    }

    function buildMarks() {
      gutter.replaceChildren();
      for (const old of host.article.querySelectorAll('.code-gutter')) old.remove();
      const commented = view.comments.filter((comment) => !comment.outdated);
      marks = collect();
      const columns = new Map();
      for (const mark of marks) {
        const button = make('button', 'review-line', String(mark.start));
        button.dataset.start = mark.start;
        button.dataset.end = mark.end;
        button.setAttribute('aria-label', range(mark.start, mark.end));
        if (mark.end > mark.start) button.title = range(mark.start, mark.end);
        if (commented.some((comment) => comment.start <= mark.end && comment.end >= mark.start)) button.classList.add('commented');
        mark.button = button;
        if (mark.code) {
          let column = columns.get(mark.body);
          if (!column) {
            column = make('div', 'code-gutter');
            mark.body.prepend(column);
            columns.set(mark.body, column);
          }
          column.append(button);
        } else {
          gutter.append(button);
        }
      }
      host.article.append(gutter);
      place();
    }

    function place() {
      if (!reviewing) return;
      const top = host.article.getBoundingClientRect().top;
      for (const mark of marks) {
        if (mark.code) continue;
        const box = mark.element.getBoundingClientRect();
        mark.button.hidden = !box.height;
        if (!box.height) continue;
        const row = mark.element.tagName === 'TR';
        const style = getComputedStyle(row ? mark.element.cells[0] || mark.element : mark.element);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const offset = mark.element.tagName === 'HR'
          ? box.height / 2 - 12
          : (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0) + (line - 24) / 2;
        mark.button.style.top = (box.top - top + offset) + 'px';
      }
      drawBands();
    }

    const inside = (mark) => Boolean(selection) && mark.start <= selection.end && mark.end >= selection.start;

    // Code lines are not elements, so their selection is a tinted band over the block.
    function drawBands() {
      for (const band of host.article.querySelectorAll('.code-band')) band.remove();
      const spans = new Map();
      for (const mark of marks) {
        if (!mark.code || !inside(mark)) continue;
        const span = spans.get(mark.body) || [mark.button, mark.button];
        span[1] = mark.button;
        spans.set(mark.body, span);
      }
      for (const [body, [first, last]] of spans) {
        const band = make('div', 'code-band');
        band.style.top = first.offsetTop + 'px';
        band.style.height = (last.offsetTop + last.offsetHeight - first.offsetTop) + 'px';
        body.append(band);
      }
    }

    function paint() {
      for (const element of host.article.querySelectorAll('.review-selected')) element.classList.remove('review-selected');
      for (const mark of marks) {
        const on = inside(mark);
        mark.button.classList.toggle('selected', on);
        mark.button.setAttribute('aria-pressed', String(on));
        if (on && !mark.code) mark.element.classList.add('review-selected');
      }
      drawBands();
      updateDock();
    }

    function remember() {
      const hash = selection ? '#L' + selection.start + (selection.end > selection.start ? '-L' + selection.end : '') : '';
      if (hash || /^#L\d/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + hash);
    }

    function choose(start, end, extend) {
      if (extend && selection) {
        const anchor = selection.anchor;
        selection = { start: Math.min(anchor.start, start), end: Math.max(anchor.end, end), anchor: anchor };
      } else {
        selection = { start: start, end: end, anchor: { start: start, end: end } };
      }
      remember();
      paint();
    }

    function clear() {
      selection = null;
      remember();
      paint();
    }

    function updateDock() {
      const count = view.comments.length;
      host.dock.classList.toggle('error', message.startsWith('!'));
      if (message) dockText.textContent = message.replace(/^!/, '');
      else if (selection) dockText.textContent = range(selection.start, selection.end) + ' selected';
      else if (count) dockText.textContent = plural(count);
      else dockText.textContent = coarse.matches ? 'Tap a line number' : 'Click a line number, shift-click for a range';
      commentButton.hidden = !selection || Boolean(composer);
      clearButton.hidden = !selection;
      copyButton.hidden = Boolean(selection) || !count;
      session.textContent = '';
      if (gated) {
        if (me) session.append(make('span', '', me.login), signInLink('Sign out'));
        else session.append(signInLink('Sign in to comment'));
      }
    }

    // The last mapped block or code line at or before the line: comments and the form go after it.
    function spot(line) {
      let best = null;
      for (const mark of marks) if (mark.start <= line) best = mark;
      return best || marks[0] || null;
    }

    const lineOf = (element) => Number(element?.dataset.line || element?.querySelector('[data-line]')?.dataset.line || 0);

    // Where comments for a range ending on this mark go: [node, 'after' | 'before' | 'append'].
    function slot(mark, start) {
      const element = mark.element;
      if (mark.code) return [element.closest('.code-block'), 'after'];
      if (element.tagName === 'TR') return [element.closest('table'), 'after'];
      const own = element.tagName === 'LI' ? element : element.parentElement?.tagName === 'LI' ? element.parentElement : null;
      if (!own) return [element, 'after'];
      // A range covering whole list items goes after their list, not inside the last item.
      let item = own;
      let list = null;
      while (item && start < lineOf(item) && lineOf(item.parentElement.firstElementChild) >= start) {
        list = item.parentElement;
        item = list.parentElement?.tagName === 'LI' ? list.parentElement : null;
      }
      if (list) return [list, 'after'];
      if (element !== own) return [element, 'after'];
      const nested = own.querySelector(':scope > ul, :scope > ol');
      return nested ? [nested, 'before'] : [own, 'append'];
    }

    function insertAt([node, how], content) {
      if (how === 'before') node.before(content);
      else if (how === 'append') node.append(content);
      else node.after(content);
    }

    function editor(text, label, action, save, cancel) {
      const form = make('form', 'review-form');
      const area = make('textarea');
      area.value = text;
      area.rows = 4;
      area.maxLength = commentMax;
      area.placeholder = 'Leave a comment';
      area.setAttribute('aria-label', label);
      const row = make('div', 'review-actions');
      const hint = make('span', 'review-hint', /Mac|iP/.test(navigator.platform) ? '⌘ Enter to save' : 'Ctrl+Enter to save');
      const cancelButton = make('button', '', 'Cancel');
      const submit = make('button', 'primary', action);
      submit.type = 'submit';
      row.append(hint, cancelButton, submit);
      form.append(area, row);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!area.value.trim()) {
          area.focus();
          return;
        }
        submit.disabled = true;
        try {
          await save(area.value);
        } catch (error) {
          submit.disabled = false;
          notify('!Saving failed: ' + (error.message || error));
        }
      });
      area.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          form.requestSubmit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      });
      cancelButton.addEventListener('click', cancel);
      return { form: form, area: area };
    }

    function closeComposer() {
      if (composer) composer.remove();
      composer = null;
      updateDock();
    }

    function compose() {
      if (!selection) return;
      closeComposer();
      const target = { start: selection.start, end: selection.end };
      const mark = spot(target.end);
      if (!mark) return;
      const holder = make('div', 'review-composer');
      if (gated && !me) {
        holder.append(
          make('p', 'review-composer-title', 'Sign in to comment on ' + range(target.start, target.end).toLowerCase()),
          signInLink('Sign in with GitHub'),
        );
        insertAt(slot(mark, target.start), holder);
        composer = holder;
        updateDock();
        return;
      }
      holder.append(make('p', 'review-composer-title', 'Comment on ' + range(target.start, target.end).toLowerCase()));
      const { form, area } = editor('', 'Comment on ' + range(target.start, target.end).toLowerCase(), 'Comment', async (text) => {
        await post('add', '', { start: target.start, end: target.end, body: text });
        closeComposer();
        clear();
        notify('Comment added');
      }, closeComposer);
      holder.append(form);
      insertAt(slot(mark, target.start), holder);
      composer = holder;
      updateDock();
      area.focus({ preventScroll: true });
      holder.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function card(comment) {
      const item = make('section', 'review-comment' + (comment.outdated ? ' outdated' : ''));
      const head = make('header');
      const about = comment.target ? (comment.target.label ? ', ' + comment.target.label : ', diagram') : '';
      const where = make('button', 'review-where', range(comment.start, comment.end) + about);
      where.setAttribute('aria-label', 'Select ' + range(comment.start, comment.end).toLowerCase());
      where.addEventListener('click', () => choose(comment.start, comment.end, false));
      const stamp = new Date((comment.updated || comment.created) * 1000);
      const when = make('time', '', ago(stamp) + (comment.updated > comment.created + 1 ? ', edited' : ''));
      when.dateTime = stamp.toISOString();
      when.title = stamp.toLocaleString();
      const tools = make('span', 'review-tools');
      const edit = make('button', '', 'Edit');
      const remove = make('button', '', 'Delete');
      tools.append(edit, remove);
      head.append(where, when);
      if (comment.author) head.append(make('span', 'review-author', comment.author));
      if (mine(comment)) head.append(tools);
      edit.hidden = remove.hidden = false;
      item.append(head);
      if (comment.outdated) {
        item.append(make('p', 'review-note', 'These lines changed after the comment. It was written on:'));
        item.append(make('pre', 'review-quote', comment.quote.join('\n')));
      }
      const body = make('p', 'review-body', comment.body);
      item.append(body);
      edit.addEventListener('click', () => {
        if (item.querySelector('form')) return;
        const done = () => {
          form.remove();
          body.hidden = false;
          edit.disabled = false;
        };
        const { form, area } = editor(comment.body, 'Edit the comment on ' + range(comment.start, comment.end).toLowerCase(), 'Save', async (text) => {
          await post('edit', '?id=' + encodeURIComponent(comment.id), { body: text });
          notify('Comment saved');
        }, done);
        body.hidden = true;
        edit.disabled = true;
        body.after(form);
        area.focus();
      });
      let armed = 0;
      remove.addEventListener('click', async () => {
        if (!armed) {
          remove.textContent = 'Confirm delete';
          remove.classList.add('danger');
          armed = setTimeout(() => {
            armed = 0;
            remove.textContent = 'Delete';
            remove.classList.remove('danger');
          }, 3000);
          return;
        }
        clearTimeout(armed);
        remove.disabled = true;
        try {
          await post('delete', '?id=' + encodeURIComponent(comment.id));
          notify('Comment deleted');
        } catch (error) {
          remove.disabled = false;
          notify('!Deleting failed: ' + (error.message || error));
        }
      });
      return item;
    }

    function drawThreads() {
      for (const old of host.article.querySelectorAll('.review-thread')) old.remove();
      const groups = [];
      for (const comment of view.comments) {
        const mark = spot(comment.end);
        if (!mark) continue;
        const where = slot(mark, comment.start);
        let group = groups.find((other) => other.where[0] === where[0] && other.where[1] === where[1]);
        if (!group) groups.push((group = { where, end: 0, comments: [] }));
        group.end = Math.max(group.end, comment.end);
        group.comments.push(comment);
      }
      // Inserted from the bottom up, so threads after the same block keep their line order.
      for (const group of groups.sort((a, b) => b.end - a.end)) {
        const thread = make('div', 'review-thread');
        for (const comment of group.comments) thread.append(card(comment));
        insertAt(group.where, thread);
      }
    }

    function enter() {
      reviewing = true;
      host.article.classList.add('reviewing');
      document.body.classList.add('reviewing');
      host.dock.hidden = false;
      host.reviewToggle.setAttribute('aria-pressed', 'true');
      buildMarks();
      drawThreads();
      paint();
    }

    function leave() {
      reviewing = false;
      closeComposer();
      selection = null;
      remember();
      gutter.remove();
      for (const element of host.article.querySelectorAll('.code-gutter, .code-band, .review-thread')) element.remove();
      for (const element of host.article.querySelectorAll('.review-selected')) element.classList.remove('review-selected');
      marks = [];
      host.article.classList.remove('reviewing');
      document.body.classList.remove('reviewing');
      host.dock.hidden = true;
      host.reviewToggle.setAttribute('aria-pressed', 'false');
    }

    host.onShow = () => { if (reviewing) leave(); };
    host.onDiagram = () => {
      if (!reviewing) return;
      buildMarks();
      paint();
    };

    host.reviewToggle.hidden = false;
    host.reviewToggle.addEventListener('click', () => (reviewing ? leave() : enter()));
    host.article.addEventListener('mousedown', (event) => {
      if (event.shiftKey && event.target.closest('.review-line')) event.preventDefault();
    });
    host.article.addEventListener('click', (event) => {
      const button = event.target.closest('.review-line');
      if (!button || !reviewing) return;
      const start = Number(button.dataset.start), end = Number(button.dataset.end);
      const touch = coarse.matches && Boolean(selection);
      if (touch && start >= selection.start && end <= selection.end) clear();
      else choose(start, end, event.shiftKey || touch);
    });
    commentButton.addEventListener('click', compose);
    clearButton.addEventListener('click', clear);
    copyButton.after(session);
    host.dock.querySelector('[data-review="done"]').addEventListener('click', leave);
    copyButton.addEventListener('click', async () => {
      const done = promptText ? await copyText(promptText) : false;
      notify(done ? 'Copied ' + plural(view.comments.length) + ' as a prompt' : '!Copy failed');
    });
    document.addEventListener('keydown', (event) => {
      if (reviewing && event.key === 'Escape' && selection && !composer && !event.target.closest('textarea')) clear();
    });
    new ResizeObserver(() => { if (reviewing) requestAnimationFrame(place); }).observe(host.article);

    // #L12 or #L12-L14 opens review mode with those lines selected, as on GitHub.
    function follow() {
      const wanted = /^#L(\d+)(?:-L(\d+))?$/.exec(location.hash);
      if (!wanted) return;
      if (!reviewing) enter();
      const start = Math.max(1, Math.min(Number(wanted[1]), view.lines || 1));
      choose(start, Math.max(start, Math.min(Number(wanted[2] || start), view.lines || start)), false);
      const first = marks.find(inside);
      if (first) (first.code ? first.button : first.element).scrollIntoView({ block: 'center' });
    }
    addEventListener('hashchange', follow);
    addEventListener('aniflow-comments', () => refresh().catch((error) => console.error('comments', error)));
    refresh().catch((error) => console.error('comments', error)).then(follow);
  }
}
