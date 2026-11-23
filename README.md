# shows.leeba.co — LEEBA exhibitions

One site for every LEEBA show: the public catalogue of the show that is on now, and a
staff area for setting up shows, recording sales and looking back at past ones.

- **shows.leeba.co** — catalogue of the live show. Staff sign in (STAFF button) to record
  sales and mark pieces HOLD / SOLD / MEMO OUT.
- **shows.leeba.co/admin/** — staff area: exhibitions, new show import with report,
  publish, close, sales, owner settlement, packing / return check, clients.

Plain HTML, CSS and JavaScript on GitHub Pages; no build step.

```
index.html, assets/        catalogue page
admin/                     staff area (import.js = stock import engine)
config.js                  settings: stock script address, logo, photos, collections
data/catalog.json          the live show's stock list (written when a show is published)
data/shows/<TAG>.json      every show's stock list, kept for the staff area
images/                    photos, named by barcode (any of .jpg .jpeg .png)
```

Sales, stock status, staff codes and each show's record live in the LEEBA SHOWS Google
Sheet, through its Apps Script web app (address in `config.js`). Cost never goes in this
repository — it stays in the Sheet.

Past shows: Hong Kong (Sep 2026), Sharjah (Sep–Oct 2026), Abu Dhabi (Nov 2026),
Jewellery Arabia Bahrain (Nov 2026).
