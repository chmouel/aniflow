# Writing Markdown in aniflow

aniflow reads GitHub flavoured Markdown, plus a few extras from Obsidian and
other editors. Each section below shows the source first, then what it turns
into. Diagrams have their own page: see [the walkthrough help](/help), or run
`aniflow --spec` for the full syntax.

## Text

```markdown
**Bold**, *italic*, ~~struck~~, `code`, ==highlighted==,
H~2~O and E = mc^2^. "Quotes" and dashes -- like these -- are
made typographic... but never inside `"code" --flags`.
```

**Bold**, *italic*, ~~struck~~, `code`, ==highlighted==,
H~2~O and E = mc^2^. "Quotes" and dashes -- like these -- are
made typographic... but never inside `"code" --flags`.

## Links

Links to other sites open in a new tab and carry a small arrow. Links to
other notes stay in the same tab.

```markdown
[aniflow on GitHub](https://github.com/chmouel/aniflow),
[a note beside this one](notes.md), https://example.com
```

[aniflow on GitHub](https://github.com/chmouel/aniflow),
[a note beside this one](notes.md), https://example.com

### Wikilinks

`[[Note name]]` links to a note by its name, the way Obsidian does. aniflow
looks for it next to the current note first, then from the top of the folder,
then anywhere else, choosing the closest match. A name with no matching note
is shown struck through, without a link.

```markdown
[[Getting started]] goes to Getting started.md, wherever it is.
[[Getting started|start here]] shows other text.
[[Getting started#Install]] opens it at a heading.
[[#Tables|The tables section]] stays on this page.
[[A note nobody wrote]]
```

[[#Tables|The tables section]] stays on this page.
[[A note nobody wrote]]

Wikilinks are looked up when the page loads, so a link you just typed in the
editor shows as missing until you reload. Notes you cannot open are never
found, so a link to a private note looks missing to a reader who is not signed
in.

At the end of a note, **Linked from** lists the other notes that link to it,
either with a wikilink or with an ordinary link.

## Pictures

```markdown
![A diagram](images/flow.png)
![Alt text](images/flow.png "A title becomes a caption")
![[flow.png]] and ![[flow.png|300]] (300 pixels wide)
```

A picture alone in its paragraph with a title becomes a figure with that
title as its caption. Click a picture to see it full size. `![[name.png]]`
finds a picture by name, like wikilinks, and also looks in an `images/`
folder beside the note.

## Lists

```markdown
- A list
  - nested
1. Numbered
2. list

- [x] A task that is done
- [ ] One that is not
```

- A list
  - nested
1. Numbered
2. list

- [x] A task that is done
- [ ] One that is not

### Definition lists

```markdown
Term
: What the term means.

Another term
: A first meaning.
: A second one.
```

Term
: What the term means.

Another term
: A first meaning.
: A second one.

## Tables

```markdown
| Name   | Size | Notes          |
| ------ | ---: | :------------: |
| alpha  |   12 | first          |
| beta   |  340 | second         |
```

| Name   | Size | Notes          |
| ------ | ---: | :------------: |
| alpha  |   12 | first          |
| beta   |  340 | second         |

Wide tables scroll sideways. Tables longer than 15 rows scroll on their own
and keep their header row in view.

## Code

Name the language after the opening fence for colours. `title=` puts a file
name in the header, and `{...}` marks lines.

````markdown
```go title="main.go" {2}
package main
func main() { println("marked") }
```
````

```go title="main.go" {2}
package main
func main() { println("marked") }
```

A `diff` block colours added and removed lines.

````markdown
```diff
- old line
+ new line
```
````

```diff
- old line
+ new line
```

Every block has a copy button, and a wrap button for long lines; aniflow
remembers your wrap setting for the next page. Blocks with marked lines do
not wrap, so the marks stay on the right lines. In slides, `{1|2-3|all}`
marks those lines one step at a time.

## Alerts and callouts

```markdown
> [!NOTE]
> Something worth knowing.

> [!WARNING]
> Something to be careful about.
```

> [!NOTE]
> Something worth knowing.

> [!WARNING]
> Something to be careful about.

GitHub's five kinds work: `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and
`CAUTION`.

## Footnotes and emoji

```markdown
A claim that needs a source.[^1] :rocket:

[^1]: The source.
```

A claim that needs a source.[^1] :rocket:

[^1]: The source.

## Front matter

YAML at the very top of a note is shown as a small panel. `private: true`
keeps the note for signed-in readers, and `title:` names it in the
**Linked from** list of other notes.

```markdown
---
title: Release notes
tags: [release, v2]
private: true
---
```

## Reading aids

A note of 200 words or more says how long it takes to read, and every served
note shows when it last changed, under its title. Printing a note leaves out
the bar, the contents and the buttons, wraps code, and writes each external
link's address after it.

## HTML

Plain HTML such as `<details>`, `<kbd>` and `<sup>` works. Scripts, styles,
forms and event attributes are removed.

## Slides

A note with `##` headings can be shown as slides with the Present button.
`<!-- slide: ... -->`, `<!-- column -->`, `<!-- reveal -->` and
`<!-- notes: ... -->` comments set layouts, columns, step-by-step reveals and
speaker notes. `aniflow --spec` lists them all.
