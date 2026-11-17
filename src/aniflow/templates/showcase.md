---
title: A tour of aniflow
author: Your name
style: conference
footer: Your event
logo: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAyMDAgNDgiPjxyZWN0IHg9IjIiIHk9IjIiIHdpZHRoPSI0NCIgaGVpZ2h0PSI0NCIgcng9IjEyIiBmaWxsPSIjNWYzNWE4Ii8+PHBhdGggZD0iTTE0IDMyTDI0IDE0TDM0IDMyWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48dGV4dCB4PSI1OCIgeT0iMzIiIGZvbnQtZmFtaWx5PSJzeXN0ZW0tdWksc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyMiIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iIzVmMzVhOCI+WW91ciBsb2dvPC90ZXh0Pjwvc3ZnPg==
logo-dark: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAyMDAgNDgiPjxyZWN0IHg9IjIiIHk9IjIiIHdpZHRoPSI0NCIgaGVpZ2h0PSI0NCIgcng9IjEyIiBmaWxsPSIjZmZmZmZmIi8+PHBhdGggZD0iTTE0IDMyTDI0IDE0TDM0IDMyWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNWYzNWE4IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48dGV4dCB4PSI1OCIgeT0iMzIiIGZvbnQtZmFtaWx5PSJzeXN0ZW0tdWksc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyMiIgZm9udC13ZWlnaHQ9IjcwMCIgZmlsbD0iI2ZmZmZmZiI+WW91ciBsb2dvPC90ZXh0Pjwvc3ZnPg==
numbers: true
---

## Start with Markdown

Each heading starts a new slide.

<!-- slide: bg=accent transition=zoom -->
## Change the background

A single setting changes the mood of this slide.

<!-- slide: reveal -->
## Reveal ideas as you speak

- One idea at a time.
- The arrow key reveals the next.

<!-- notes: Ask the audience what they would like to explain. -->

## Walk through a diagram

```mermaid
flowchart LR
  Write --> Present --> Share

%% play: Tell a story
%% Write -> Present | Write your slides in Markdown.
%% Present -> Share | Share what you have learned.
```

## Highlight code

```js {1|2|all}
const talk = write('Markdown');
present(talk);
```

<!-- slide: center -->
## Your turn

Edit this deck and make it your own.
