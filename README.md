# FlagBook

A phone-first web app for running a flag football team: roster, practice schedule,
game days (location, snack duty, quarter-by-quarter rotation) and a drawable playbook
in the style of `Raiders.pdf`.

No build step, no dependencies, no account. Everything is stored on the device
(browser localStorage) and can be exported/imported as a JSON backup.

## Run it

Any static file server works. From this folder:

```sh
python3 -m http.server 8765
```

then open <http://localhost:8765> in Safari or Chrome. To use it on your phone, either

* host the folder somewhere static (GitHub Pages, Netlify, an S3 bucket…) and open the URL
  on the phone, then **Share → Add to Home Screen** (it installs as an app and works offline), or
* run `tools/build-single.sh` and AirDrop / email `dist/flagbook.html` to the phone. Opening
  that one file in Safari gives you the whole app; add it to the home screen the same way.

The single file has no service worker, so it does not cache for offline use, but Safari keeps
the page data between launches.

## The playbook

* The field is a 4:3 landscape page (720 × 540 units = 10 in × 7.5 in), the same ratio as
  `Raiders.pdf`, with the line of scrimmage at the same height. Printing uses that exact page size,
  one play per page (**More → Print all plays**, or the ⋯ menu inside a play).
* Six spots: **Q** (black diamond), **C**, **X**, **Y**, **Z**, **R**. Drag a token from the bench
  onto the field, or tap it to drop it at its default spot. In **Move** mode drag tokens around;
  they snap onto the line when close.
* In **Draw route** mode, tap a player and drag anywhere on the field. The stroke is cleaned up
  automatically: jitter is removed, real cuts stay sharp and are squared to 45° angles, and
  curved parts (swings, wheels, drags) become smooth splines. Redrawing replaces the shape but
  keeps the route's settings.
* Tap a route to select it; tap it again (or use **🔥 Hot route**) to make it a hot route. Hot
  routes are red and show the step number the receiver should be ready for the ball on
  (**Ready on step** stepper). Any route can carry a step/depth number in black too.
* Route endings: arrow, dot (settle), block bar, none. Routes can be dashed (motion / fake paths).
* **Show spacing** draws the red double arrows with yard splits between players on the line.
  The number is measured from the token positions (30-yard field width); tap a number to
  type your own, the way the Raiders book labels 1 / 4 / 4 / 1.
* **Lineup by quarter** – the bar at the top of the playbook picks whose names caption the
  tokens: the **Team lineup** (a default rotation kept with the playbook) or any game's rotation.
  Tap **Q1–Q4** to swap the named players in every position across all plays, the editor and
  the printout. **Edit lineup** opens the quarters × spots grid right there (with Auto-fill).
  From a game page, *Open playbook with Qn names* jumps straight to that game's lineup.
  Printing can emit one page per play per quarter (**All quarters**).

The eight plays from `Raiders.pdf` are loaded as samples the first time the app runs.

### View mode

Tapping a play in the playbook opens **View mode**: the play fills the screen with the current
quarter's names, and you can scribble over it with a finger (highlighter, red, blue, black pens,
undo, clear) to walk the team through it. Those marks never touch the play and disappear when you
move to another play with the ‹ › arrows. **✏️ Edit** switches to the editor; the editor's
**👁 View** button goes back. In landscape on a phone the field fills the screen with the tools
stacked at the side.

## Games & rotation

Each game has a date, kickoff, location (tap to open in Maps), opponent, notes and **snack duty**.
**Auto-snacks** on the Games page cycles snack duty through the roster for any game without one.

The rotation grid is quarters × the six spots. **Auto-rotate** fills it so playing time is as
even as possible (nobody sits two quarters in a row when avoidable), honours preferred spots from
the roster (e.g. your QB), and treats anything you have already set by hand as locked.
**↻** reshuffles, **Clear** empties it. The **Game sheet** is a printable one-pager.

## Project layout

```
index.html            app shell + nav
css/app.css           styles (mobile first, print rules for 10in × 7.5in pages)
js/util.js            helpers
js/geometry.js        stroke → route smoothing, SVG path building
js/store.js           state, localStorage persistence, import/export, seed plays
js/rotation.js        fair rotation + snack assignment
js/field.js           SVG renderer for a play
js/views/*.js         screens (home, roster, practices, games, playbook, print, settings)
js/app.js             hash router + UI helpers
sw.js, manifest.webmanifest, icons/   PWA install/offline
tools/run-tests.swift      runs tests/*.test.js in JavaScriptCore (no Node needed)
tools/syntax-check.swift   parses every script
tools/snapshot.swift       headless WebKit screenshot of any route (used for visual checks)
tools/make-icons.swift     regenerates the PNG icons
tools/build-single.sh      bundles everything into dist/flagbook.html
```

Run the tests with `swift tools/run-tests.swift`. When you change app files and have the
service-worker version deployed, bump `CACHE` in `sw.js` so installed phones pick up the update.

## Data model (JSON backup)

```jsonc
{
  "team": { "name": "Raiders", "season": "Fall 2026" },
  "roster":    [{ "id", "name", "number", "positions": ["Q"], "guardian", "phone", "email", "notes", "active" }],
  "practices": [{ "id", "date", "time", "location", "notes" }],
  "games":     [{ "id", "date", "time", "location", "opponent", "snackPlayerId", "notes",
                  "rotation": { "1": { "Q": "playerId", "C": "…" }, "2": {} } }],
  "plays":     [{ "id", "name", "notes", "players": { "Y": [x, y] },
                  "routes": { "Y": { "pts": [[dx, dy]], "corners": [true], "hot", "steps", "end", "dashed", "labelSide" } },
                  "spacing": { "show": true, "labels": { "Y|Z": "1" } } }]
}
```
