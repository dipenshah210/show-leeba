# shows.leeba.co — LEEBA Hong Kong Show 2026

An exhibition catalogue of all 550 pieces going to HKCEC Wanchai, 16–20 September.
Same shape as live.leeba.co, with prices on show and cost kept behind a passcode.

---

## 1. What is in this folder

```
index.html                    the page
config.js                     the only file you normally edit (logo, image path)
assets/shows.css              styling
assets/shows.js               app code
data/catalog.json             550 pieces with selling prices
data/prices.cost.enc.json     cost + margin, encrypted
images/                       568 photos named by SKU
tools/build_site_data.py      rebuilds the two data files from the master database
```

### The logo

The real LEEBA logo ships with this site as `assets/leeba-logo.png`, and `config.js`
points the header at it (`LOGO: "assets/leeba-logo.png"`). It sits on a small light
card so the teal gradient reads clearly against the dark header. If the logo cannot
load for any reason the header falls back to the LEEBA wordmark, so the page never
breaks.

## 2. Deploy

Upload the whole folder to whatever serves `shows.leeba.co`, so that `index.html`
sits at the root. Any static host works — S3 + CloudFront, Cloudflare Pages,
Netlify, Vercel, or the IIS box.

**It must be served over HTTPS.** The cost decryption uses the browser's Web Crypto API,
which browsers only expose on `https://` (and `localhost`), and the catalogue is fetched
rather than inlined. Opening `index.html` by double-clicking it will not work.

To test locally first:

```bash
cd this-folder
python3 -m http.server 8080
# then open http://localhost:8080
```

### Serving the photos from S3 instead

The `images/` folder is 12 MB. If you would rather serve it from S3 like
live.leeba.co does, upload the folder there and set one line in `config.js`:

```js
IMAGE_BASE: "https://your-bucket.s3.ap-south-1.amazonaws.com/hk2026/",
```

The bucket needs CORS to allow GET from `https://shows.leeba.co`, and the file
names must stay exactly as they are (`DJ-1423.png`, `LRG00438.png`, …).

## 3. Prices

**Selling prices are on show to everyone who opens the site.** They are in
`data/catalog.json` in plain sight, alongside the price per carat.

**Cost, margin and the pricing build-up are not.** They sit in
`data/prices.cost.enc.json` as AES-256-GCM ciphertext and open only with the internal
passcode, through the COST button in the header.

| | |
|---|---|
| Internal passcode | `LEEBA-COST-2026` |

**The COST button is hidden on phones, tablets and iPads** — a customer could be
looking at any of those screens at the stand. On your own device, open
`shows.leeba.co/#cost` to bring up the passcode box; nothing on the page hints at it.
On a laptop or desktop the button stays in the header as usual.

**Change it before the show:**

```bash
cd tools
python3 build_site_data.py --cost "YOUR-INTERNAL-CODE"
```

That rewrites the encrypted file. Re-upload `data/` and the new code is live. The cost
view closes when the tab closes; press COST again to close it by hand mid-conversation.

### How the cost protection actually works

Hiding a number with JavaScript is not protection — anyone reads it in the browser's
network tab in ten seconds. So the cost figures are never in the page until someone
opens them:

- `catalog.json` carries selling prices and nothing about cost — no cost, no markup,
  no diamond/gold/making split, not even the pricing formula. There is nothing to reveal.
- `prices.cost.enc.json` is AES-256-GCM ciphertext. The key is derived from your
  passcode with PBKDF2-SHA256 at 250,000 iterations, in the browser.
- Without the passcode the file is random bytes, and the page never holds the key either.

Practical limits: anyone you give the code to can read the cost of every piece and can
pass the code on. If it leaks, re-run the command above with a new one and re-upload
`data/`; every copy of the old code stops working immediately.

Since the whole site is now a public price list, treat the URL itself as the thing you
control — it is unlisted and carries `noindex`, but anyone with the link sees prices.

## 4. Using it at the show

- **Every card carries the facts** — SKU, description, category, carat, pieces, purity,
  gross weight, net gold weight, tone, price and price per carat. No tap needed to
  answer the usual questions.
- **Two views** — GRID for browsing with a customer, LIST for scanning fast down a long
  filtered set. The choice is remembered on that device.
- **Filters on the page** — category, tone, purity and sort sit in a strip under the
  location row, scrolling sideways on a phone. MORE FILTERS holds shape, carat, price,
  gross weight, availability and the export actions; the counter on it shows how many
  filters are active.
- **Search** — SKU, description, shape, quality, certificate number. Press `/` to jump
  to the box from anywhere.
- **Filter** — location, category, purity, tone, shape, carat range, price range, gross
  weight range, availability. The running total at the top right always reflects what is
  on screen: pieces, carats and value.
- **Tap a piece** — full detail: price band, headline numbers, the complete
  specification, and the stone-by-stone diamond breakdown with a carat total to read
  out. Left/right arrow keys step through the filtered list without going back.
- **Select and export** — tick any card, or SELECT ALL VISIBLE, then EXPORT SELECTED
  for a two-sheet Excel (collection + diamond details). EXPORT ALL VISIBLE sends the
  whole filtered set. Cost columns appear only if the cost view is open at the time.
- **Availability** — set AVAILABLE / HOLD / SOLD / MEMO OUT on the detail view. It shows
  as a band on the card and a coloured stripe down the row, so the stand sees at a
  glance what is gone.

Availability is stored in that one browser, on that one device — it is not shared
between your iPad and your phone. It is there to keep one person's stand tidy, not
to run stock across the team. If you need shared live status across devices, that
needs the Apps Script backend behind it, the same way live.leeba.co works.

## 5. Rebuilding the data

The site data is generated from `LEEBA_HK_EXHIBITION_MASTER.xlsx` →
`leeba_hk_catalog.json`. When the master changes, regenerate the JSON and re-run:

```bash
cd tools
python3 build_site_data.py --cost "YOUR-INTERNAL-CODE"
```

It prints a check confirming no cost field leaked into the public file.
