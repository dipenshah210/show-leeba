/* ------------------------------------------------------------------
   shows.leeba.co - site configuration
   Edit this file only; the app code never needs touching for these.
------------------------------------------------------------------- */
window.LEEBA_CONFIG = {

  /* The LEEBA logo in the header - shipped with this site as assets/leeba-logo.png.
     If the logo cannot load, the header falls back to the LEEBA wordmark. */
  LOGO: "assets/leeba-logo.png",

  /* Where the product photos live.
     Local folder shipped with this site:      "images/"
     Or point it at S3 / CloudFront, e.g.:     "https://leeba-media.s3.ap-south-1.amazonaws.com/hk2026/"
     Must end with a slash. */
  IMAGE_BASE: "images/",

  /* Data files (relative to index.html). */
  CATALOG:     "data/catalog.json",
  PRICES_COST: "data/prices.cost.enc.json",

  /* Show title, used in exported files. */
  SHOW_NAME: "LEEBA - Hong Kong Show 2026, HKCEC Wanchai",

  /* Cards rendered per batch while scrolling. */
  PAGE_SIZE: 120
};
