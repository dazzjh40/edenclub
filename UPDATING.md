# Updating the Eden site

Notices on the site (the highlighted boxes on the homepage and the programme
page) come from the files in the `notices` folder. Edit a file, save it, and
the site republishes itself in about two minutes, in all nine languages, as
real page text that Google and screen readers see.

Never paste text into the stylesheet in `_astro/` again. It is no longer needed.

## From your phone

1. Open the **GitHub** app (or github.com in the browser) and go to
   `dazzjh40/edenclub` → `notices`.
2. Tap a file, then the pencil to edit. To add a new notice, open an existing
   one, copy everything, and create a new file in `notices` ending in `.md`.
3. Tap **Commit changes**. That's it.
4. To check it went live: the **Actions** tab shows a green tick when done, a
   red cross if something in the file was wrong. On a red cross, nothing has
   changed on the site; open the run to see the message, fix the file, save.

## What a notice file looks like

```
---
show: yes
pages: programme, home
from:
until: 2026-12-24
---

## en
**Christmas Eve:** we close at 01:00.

## es
**Nochebuena:** cerramos a la 01:00.
```

- **show**: `yes` or `no`. `no` keeps the file but hides the notice.
- **pages**: `home`, `programme`, or both separated by a comma.
- **from** / **until**: optional dates (year-month-day). The notice appears
  from that day and stays until closing (03:00) after the `until` day, then
  removes itself overnight. Leave both empty for a permanent notice.
- **## en**, **## es**, **## de**, **## nl**, **## fr**, **## it**, **## pt**,
  **## sv**, **## nb**: the text for each language. English is required. A
  missing language shows the English text.
- `**words**` makes words bold. `[words](https://...)` makes a link.
- Several notices on the same page appear in file-name order.

## What else happens automatically

- Every night at about 03:15 Canary time the site republishes, so dated
  notices come and go on time and expired event cards (anything with an end
  time) drop out of the pages.
- `notices/august-hours.md` holds this year's August hours with `show: no`.
  Check the days and times next July, then set it to `yes`.

## What this can't do

The site's source code was lost with the VPS, so the pages here are the
finished site. Notices are easy. New pages, new event cards, or changes to
prices, rules or the weekly programme mean editing the HTML files directly;
do those from a computer with Claude Code, not the phone.
