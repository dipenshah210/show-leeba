/* ==================================================================
   LEEBA - shows.leeba.co
   Exhibition catalogue for HKCEC Wanchai, 16-20 September.

   Selling prices are public. Cost, margin and the pricing build-up stay
   encrypted (AES-GCM, key derived from a passcode with PBKDF2-SHA256 in
   the browser) so a customer at the screen never sees them.
================================================================== */
(function () {
"use strict";

var CFG = window.LEEBA_CONFIG || {};
var IMG_BASE  = CFG.IMAGE_BASE || "images/";
var PAGE_SIZE = CFG.PAGE_SIZE || 120;
var SHOW_NAME = CFG.SHOW_NAME || "LEEBA Show";

var THUMBS = null;              // optional {file: dataURI} map (preview builds)

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ------------------------------------------------------------- state */
var ALL = [], VIEW = [], shown = 0;
var sel = new Set();
var avail = {};
var cost = null;                // decrypted internal payload, memory only
var listView = false;

var filt = { loc: "", cat: "", purity: "", tone: "", shape: "", q: "",
             ctMin: null, ctMax: null, prMin: null, prMax: null,
             gwMin: null, gwMax: null, avail: "", sort: "sku" };

/* Location is shown to clients as the bare D/H/I letter only, by design -
   the full Dubai/Hong Kong/India meaning is for internal use, never surfaced
   on this site (badge, chips, or export alike). */

/* ----------------------------------------------------------- helpers */
function money(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function num(n, d) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "";
  return Number(n).toFixed(d === undefined ? 2 : d);
}
function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function srcFor(file) { return (THUMBS && THUMBS[file]) || (IMG_BASE + file); }
function imgs(p) {
  return p.IMAGES_ALL ? p.IMAGES_ALL.split(",").map(function (s) { return s.trim(); })
                      : (p.IMAGE ? [p.IMAGE] : []);
}
function sellOf(p) { return p.SELLING_PRICE_USD === undefined ? null : p.SELLING_PRICE_USD; }
function costOf(p) { return cost && cost[p.SKU] ? cost[p.SKU] : null; }
function availOf(p) { return avail[p.SKU] || p.AVAILABILITY || "AVAILABLE"; }
// Full diamond detail exists even when the source cost lines never carried a
// piece count (Dubai priced those by weight, not by pcs) - fall back to the
// number of stone-group lines so pieces is never blank when detail exists.
function pcsOf(p) {
  if (p.TOTAL_PCS) return p.TOTAL_PCS;
  var d = p.DIAMONDS || [];
  if (!d.length) return null;
  var brk = d.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
  var use = brk.length ? brk : d;
  var n = use.reduce(function (t, x) { return t + (x.PCS || 0); }, 0);
  return n || use.length || null;
}

function loadAvail() {
  try { avail = JSON.parse(localStorage.getItem("leeba.hk.avail") || "{}"); } catch (e) { avail = {}; }
}
function saveAvail() {
  try { localStorage.setItem("leeba.hk.avail", JSON.stringify(avail)); } catch (e) {}
}

var toastT;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.hidden = true; }, 1800);
}

/* ============================================================== BOOT */
function boot() {
  loadAvail();

  var logo = $("#logo");
  if (CFG.LOGO) {
    logo.onload = function () { logo.hidden = false; $("#brandText").hidden = true; };
    logo.onerror = function () { logo.hidden = true; $("#brandText").hidden = false; };
    logo.src = CFG.LOGO;
  }

  if (CFG.THUMBS) {
    fetch(CFG.THUMBS).then(function (r) { return r.json(); })
      .then(function (m) { THUMBS = m; if (ALL.length) apply(); }).catch(function () {});
  }

  fetch(CFG.CATALOG || "data/catalog.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      ALL = j.products || [];
      buildFilters();
      restoreSession();
      apply();
    })
    .catch(function (e) {
      $("#grid").innerHTML = '<div class="empty">Could not load the catalogue (' + esc(e.message) +
        '). This site must be served over http(s), not opened as a file.</div>';
    });

  wire();
}

/* --------------------------------------------------- filter controls */
function buildFilters() {
  var cats = {}, tones = {}, purities = {}, shapes = {};
  ALL.forEach(function (p) {
    if (p.CATEGORY) cats[p.CATEGORY] = (cats[p.CATEGORY] || 0) + 1;
    if (p.METAL_COLOR) tones[p.METAL_COLOR] = (tones[p.METAL_COLOR] || 0) + 1;
    if (p.METAL_KT) purities[p.METAL_KT] = (purities[p.METAL_KT] || 0) + 1;
    (p.SHAPES || "").split(",").forEach(function (s) {
      s = s.trim(); if (s) shapes[s] = (shapes[s] || 0) + 1;
    });
  });

  $("#catChips").innerHTML = '<button class="chip is-on" data-cat="">ALL</button>' +
    Object.keys(cats).sort().map(function (c) {
      return '<button class="chip" data-cat="' + esc(c) + '">' + esc(c) + ' <b>' + cats[c] + '</b></button>';
    }).join("");

  $("#toneChips").innerHTML = '<button class="chip is-on" data-tone="">ALL</button>' +
    Object.keys(tones).sort().map(function (t) {
      return '<button class="chip" data-tone="' + esc(t) + '">' + esc(t) + '</button>';
    }).join("");

  var pu = $("#purity");
  Object.keys(purities).sort(function (a, b) { return b - a; }).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = k + "K";
    pu.appendChild(o);
  });

  var sh = $("#shape");
  Object.keys(shapes).sort().forEach(function (s) {
    var o = document.createElement("option");
    o.value = s; o.textContent = s + " (" + shapes[s] + ")";
    sh.appendChild(o);
  });

  ["", "D", "H", "I"].forEach(function (l) {
    var n = l ? ALL.filter(function (p) { return p.LOC === l; }).length : ALL.length;
    var el = $("#c" + (l || "All"));
    if (el) el.textContent = n;
  });
}

function activeCount() {
  var n = 0;
  ["loc", "cat", "purity", "tone", "shape", "avail", "q"].forEach(function (k) { if (filt[k]) n++; });
  ["ctMin", "ctMax", "prMin", "prMax", "gwMin", "gwMax"].forEach(function (k) {
    if (filt[k] !== null) n++;
  });
  return n;
}

/* ---------------------------------------------------- filter + sort */
function apply() {
  var q = filt.q.toLowerCase().trim();

  VIEW = ALL.filter(function (p) {
    if (filt.loc && p.LOC !== filt.loc) return false;
    if (filt.cat && p.CATEGORY !== filt.cat) return false;
    if (filt.tone && p.METAL_COLOR !== filt.tone) return false;
    if (filt.purity && String(p.METAL_KT) !== filt.purity) return false;
    if (filt.shape && (p.SHAPES || "").indexOf(filt.shape) === -1) return false;
    if (filt.avail && availOf(p) !== filt.avail) return false;
    if (filt.ctMin !== null && !(p.TOTAL_CT >= filt.ctMin)) return false;
    if (filt.ctMax !== null && !(p.TOTAL_CT <= filt.ctMax)) return false;
    if (filt.gwMin !== null && !(p.GROSS_WT_GM >= filt.gwMin)) return false;
    if (filt.gwMax !== null && !(p.GROSS_WT_GM <= filt.gwMax)) return false;
    if (filt.prMin !== null && !(sellOf(p) >= filt.prMin)) return false;
    if (filt.prMax !== null && !(sellOf(p) <= filt.prMax)) return false;
    if (q) {
      var hay = [p.SKU, p.DESCRIPTION, p.CATEGORY, p.SHAPES, p.CENTER_SHAPE, p.QUALITY,
                 p.METAL_RAW, p.CERT, p.CENTER_CERT].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  var s = filt.sort;
  VIEW.sort(function (a, b) {
    if (s === "ct-desc")    return (b.TOTAL_CT || 0) - (a.TOTAL_CT || 0);
    if (s === "ct-asc")     return (a.TOTAL_CT || 0) - (b.TOTAL_CT || 0);
    if (s === "price-desc") return (sellOf(b) || 0) - (sellOf(a) || 0);
    if (s === "price-asc")  return (sellOf(a) || 0) - (sellOf(b) || 0);
    if (s === "cat")        return (a.CATEGORY || "").localeCompare(b.CATEGORY || "") ||
                                   a.SKU.localeCompare(b.SKU);
    return a.SKU.localeCompare(b.SKU);
  });

  shown = 0;
  $("#grid").innerHTML = "";
  $("#main").scrollTop = 0;
  renderMore();
  stats();

  var n = activeCount(), fb = $("#filtN");
  fb.textContent = n; fb.hidden = n === 0;
}

function stats() {
  var ct = 0, val = 0;
  VIEW.forEach(function (p) { ct += p.TOTAL_CT || 0; val += sellOf(p) || 0; });
  $("#stats").innerHTML =
    "<b>" + VIEW.length + "</b> " + (VIEW.length === 1 ? "PIECE" : "PIECES") +
    " &nbsp;&middot;&nbsp; <b>" + ct.toFixed(2) + "</b> CT" +
    " &nbsp;&middot;&nbsp; <span class='gold'><b>" + money(val) + "</b></span>";
  $("#empty").hidden = VIEW.length > 0;
}

/* ---------------------------------------------------------- rendering */
function specCell(label, value) {
  var v = (value === "" || value === null || value === undefined) ? "&mdash;" : value;
  return "<div><span>" + label + "</span><b>" + v + "</b></div>";
}

function cardHTML(p) {
  var im = imgs(p)[0];
  var st = availOf(p);
  var sv = sellOf(p);
  var c = costOf(p);

  return '<article class="card' + (sel.has(p.SKU) ? " is-sel" : "") +
    (st !== "AVAILABLE" ? " row-" + esc(st.replace(/\s/g, "")) : "") +
    '" data-sku="' + esc(p.SKU) + '">' +
    '<div class="card-img">' +
      (im ? '<img loading="lazy" decoding="async" src="' + esc(srcFor(im)) + '" alt="' + esc(p.SKU) + '">'
          : '<span class="noimg">NO PHOTO</span>') +
      '<span class="card-loc loc-' + esc(p.LOC) + '">' + esc(p.LOC) + '</span>' +
      (st !== "AVAILABLE" ? '<span class="status st-' + esc(st.replace(/\s/g, "")) + '">' + esc(st) + '</span>' : "") +
    '</div>' +
    '<button class="card-pick" data-pick="1" title="Select">&#10003;</button>' +
    '<div class="card-body">' +
      '<div class="card-head">' +
        '<div class="card-top"><span class="card-sku">' + esc(p.SKU) + '</span>' +
          (st !== "AVAILABLE" ? '<span class="stchip st-' + esc(st.replace(/\s/g, "")) + '">' +
            esc(st) + '</span>' : "") +
          '<span class="card-cat">' + esc(p.CATEGORY) + '</span></div>' +
        '<span class="card-desc">' + esc(p.DESCRIPTION || "") + '</span>' +
      '</div>' +
      '<div class="specs">' +
        specCell("CARAT", num(p.TOTAL_CT)) +
        specCell("PCS", pcsOf(p) || "") +
        specCell("PURITY", p.METAL_KT ? p.METAL_KT + "K" : "") +
        specCell("GW gm", num(p.GROSS_WT_GM, 2)) +
        specCell("NW gm", num(p.NET_GOLD_WT_GM, 2)) +
        specCell("TONE", p.METAL_COLOR || "") +
      '</div>' +
      '<div class="card-price">' +
        '<span class="amt">' + (sv !== null ? money(sv) : "&mdash;") + '</span>' +
        (p.SELL_PER_CT_USD ? '<span class="perct">' + money(p.SELL_PER_CT_USD) + '/CT</span>' : "") +
      '</div>' +
      (c ? '<div class="card-cost">COST ' + money(c.cost) +
           (c.markup ? ' &middot; ' + Number(c.markup).toFixed(2) + 'x' : "") + '</div>' : "") +
    '</div></article>';
}

function renderMore() {
  var slice = VIEW.slice(shown, shown + PAGE_SIZE);
  var frag = document.createElement("div");
  frag.innerHTML = slice.map(cardHTML).join("");
  var g = $("#grid");
  while (frag.firstChild) g.appendChild(frag.firstChild);
  shown += slice.length;
  $("#more").hidden = shown >= VIEW.length;
}

function refreshCard(sku) {
  var p = ALL.find(function (x) { return x.SKU === sku; });
  var el = $('.card[data-sku="' + (window.CSS && CSS.escape ? CSS.escape(sku) : sku) + '"]');
  if (!p || !el) return;
  var tmp = document.createElement("div");
  tmp.innerHTML = cardHTML(p);
  el.replaceWith(tmp.firstChild);
}

/* ------------------------------------------------------------ detail */
var detailSku = null;

function openDetail(sku) {
  var p = ALL.find(function (x) { return x.SKU === sku; });
  if (!p) return;
  detailSku = sku;
  var list = imgs(p);

  $("#dSku").textContent = p.SKU;
  var loc = $("#dLoc");
  loc.textContent = p.LOC;
  loc.className = "badge loc-" + p.LOC;
  $("#dCat").textContent = p.CATEGORY || "";
  $("#dDesc").textContent = p.DESCRIPTION || "";

  var big = $("#dImg");
  if (list.length) { big.src = srcFor(list[0]); big.hidden = false; } else { big.hidden = true; }
  $("#dThumbs").innerHTML = list.length > 1 ? list.map(function (f, i) {
    return '<img src="' + esc(srcFor(f)) + '" data-full="' + esc(srcFor(f)) + '"' +
           (i === 0 ? ' class="is-on"' : "") + ' alt="">';
  }).join("") : "";

  // price band - selling price always, cost only when the internal view is open
  var c = costOf(p), band = [];
  band.push('<div class="big"><span>SELLING PRICE</span><b>' +
            (sellOf(p) !== null ? money(sellOf(p)) : "&mdash;") + '</b></div>');
  if (p.SELL_PER_CT_USD) band.push('<div><span>PER CARAT</span><b>' + money(p.SELL_PER_CT_USD) + '</b></div>');
  if (c) {
    band.push('<div><span>COST</span><b>' + money(c.cost) + '</b></div>');
    if (c.markup) band.push('<div><span>MARKUP</span><b>' + Number(c.markup).toFixed(2) + 'x</b></div>');
    if (c.dia) band.push('<div><span>DIAMOND</span><b>' + money(c.dia) + '</b></div>');
    if (c.gold) band.push('<div><span>GOLD' + (c.making ? "" : " + MAKING") + '</span><b>' + money(c.gold) + '</b></div>');
    if (c.making) band.push('<div><span>MAKING</span><b>' + money(c.making) + '</b></div>');
  }
  var pb = $("#dPrice");
  pb.innerHTML = band.join("");
  pb.className = "d-price" + (c ? " cost-on" : "");

  // One consolidated spec grid - no fact appears more than once anywhere on the
  // page: category/location already sit in the badges above, price already sits
  // in the price band above, so neither repeats down here.
  var core = [
    ["CARAT", num(p.TOTAL_CT)],
    ["PIECES", pcsOf(p) || ""],
    ["PURITY", p.METAL_KT ? p.METAL_KT + "K" : ""],
    ["TONE", p.METAL_COLOR || ""],
    ["GROSS WT", p.GROSS_WT_GM ? num(p.GROSS_WT_GM, 2) + " gm" : ""],
    ["NET GOLD", p.NET_GOLD_WT_GM ? num(p.NET_GOLD_WT_GM, 2) + " gm" : ""],
    ["SIZE", p.SIZE || ""]
  ];
  var extra = [
    ["CENTRE / SIDE", (p.CENTER_CT || p.SIDE_CT) ?
        (p.CENTER_CT ? num(p.CENTER_CT) + "ct" : "&mdash;") + " / " +
        (p.SIDE_CT ? num(p.SIDE_CT) + "ct" : "&mdash;") : ""],
    ["CENTRE STONE", p.CENTER_STONE_CT ?
        [num(p.CENTER_STONE_CT) + " ct", p.CENTER_SHAPE, p.CENTER_COLOR, p.CENTER_CLARITY]
          .filter(Boolean).join(" &middot; ") : ""],
    ["QUALITY", p.QUALITY || ""],
    ["SHAPES", p.SHAPES || ""],
    ["CERTIFICATE", p.CENTER_CERT || p.CERT || ""]
  ].filter(function (r) { return r[1] !== ""; });
  $("#dKeys").innerHTML =
    core.map(function (r) { return specCell(r[0], r[1]); }).join("") +
    extra.map(function (r) { return specCell(r[0], r[1]); }).join("");

  // diamond lines - the India breakdown is the customer-facing set; Dubai purchase
  // lines describe the same stones from the buying side, so never show both at once.
  var d = p.DIAMONDS || [];
  var brk = d.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
  if (brk.length) d = brk;
  if (!d.length) {
    $("#dDna").innerHTML = '<tr><td class="none">No stone-by-stone breakdown on file for this piece &mdash; ' +
      'total weight ' + num(p.TOTAL_CT) + ' ct.</td></tr>';
  } else {
    $("#dDna").innerHTML =
      "<tr><th>ROLE</th><th>SHAPE</th><th>PCS</th><th>CARAT</th><th>MM / SIEVE</th>" +
      "<th>COLOUR</th><th>CLARITY</th><th>PACKET</th><th>CERT</th><th>NOTE</th></tr>" +
      d.map(function (x) {
        return "<tr><td>" + esc(x.STONE_ROLE || "") + "</td><td>" + esc(x.SHAPE || "") + "</td><td>" +
          esc(x.PCS || "") + "</td><td>" + num(x.CARAT, 3) + "</td><td>" + esc(x.MM_SIEVE || "") +
          "</td><td>" + esc(x.COLOR || "") + "</td><td>" + esc(x.CLARITY || "") + "</td><td>" +
          esc(x.PACKET_NO || "") + "</td><td>" + esc(x.CERT_NO || "") + "</td><td>" +
          esc(x.NOTE || "") + "</td></tr>";
      }).join("") +
      "<tr><td colspan='3'>TOTAL</td><td>" +
      num(d.reduce(function (t, x) { return t + (x.CARAT || 0); }, 0), 2) +
      "</td><td colspan='6'></td></tr>";
  }

  var cur = availOf(p);
  $$("#dAvail .chip").forEach(function (b) { b.classList.toggle("is-on", b.dataset.set === cur); });
  $("#dPick").textContent = sel.has(sku) ? "REMOVE FROM SELECTION" : "ADD TO SELECTION";

  $("#detail").hidden = false;
  $(".modal-card.detail-card").scrollTop = 0;
}

function stepDetail(dir) {
  var i = -1;
  for (var k = 0; k < VIEW.length; k++) if (VIEW[k].SKU === detailSku) { i = k; break; }
  if (i === -1) return;
  var j = i + dir;
  if (j < 0 || j >= VIEW.length) return;
  while (j >= shown) renderMore();
  openDetail(VIEW[j].SKU);
}

/* ------------------------------------------------------- cost unlock */
function b64(s) {
  var bin = atob(s), a = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function decryptCost(pass) {
  return fetch(CFG.PRICES_COST || "data/prices.cost.enc.json")
    .then(function (r) { if (!r.ok) throw new Error("missing"); return r.json(); })
    .then(function (box) {
      var enc = new TextEncoder();
      return crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"])
        .then(function (base) {
          return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: b64(box.salt), iterations: box.iter, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        })
        .then(function (key) {
          return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.data));
        });
    })
    .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
}

function afterCost() {
  var on = !!cost;
  $("#costBtn").classList.toggle("is-open", on);
  $("#relock").hidden = !on;
  apply();
  if (detailSku && !$("#detail").hidden) openDetail(detailSku);
}
function restoreSession() {
  var p;
  try { p = sessionStorage.getItem("leeba.hk.cost"); } catch (e) { p = null; }
  if (p) decryptCost(p).then(function (payload) { cost = payload; afterCost(); })
                       .catch(function () { try { sessionStorage.removeItem("leeba.hk.cost"); } catch (e) {} });
}

/* ------------------------------------------------------------ export */
function exportRows(picked, label) {
  if (!picked.length) { toast("Nothing selected"); return; }
  if (typeof ExcelJS === "undefined") { exportCsv(picked); return; }

  var wb = new ExcelJS.Workbook();
  wb.creator = "LEEBA Jewels";

  var head = ["SR", "SKU", "LOCATION", "CATEGORY", "DESCRIPTION", "PURITY", "TONE", "SIZE",
              "GROSS WT (gm)", "NET GOLD (gm)", "CENTRE CT", "SIDE CT", "TOTAL CT", "PCS",
              "CENTRE STONE", "QUALITY", "SHAPES", "CERT", "AVAILABILITY",
              "SELLING PRICE (USD)", "PER CARAT (USD)"];
  if (cost) head = head.concat(["COST (USD)", "MARKUP"]);

  var s1 = wb.addWorksheet("COLLECTION");
  s1.addRow([SHOW_NAME]);
  s1.addRow([picked.length + " pieces - exported " + new Date().toLocaleString("en-GB")]);
  s1.addRow([]);
  s1.addRow(head);
  picked.forEach(function (p, i) {
    var row = [i + 1, p.SKU, p.LOC, p.CATEGORY, p.DESCRIPTION || "",
      p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.SIZE || "",
      p.GROSS_WT_GM || "", p.NET_GOLD_WT_GM || "", p.CENTER_CT || "", p.SIDE_CT || "",
      p.TOTAL_CT || "", pcsOf(p) || "",
      p.CENTER_STONE_CT ? [num(p.CENTER_STONE_CT) + " ct", p.CENTER_SHAPE, p.CENTER_COLOR, p.CENTER_CLARITY]
        .filter(Boolean).join(" ") : "",
      p.QUALITY || "", p.SHAPES || "", p.CENTER_CERT || p.CERT || "", availOf(p),
      sellOf(p) || "", p.SELL_PER_CT_USD || ""];
    if (cost) {
      var c = cost[p.SKU] || {};
      row = row.concat([c.cost || "", c.markup || ""]);
    }
    s1.addRow(row);
  });

  var s2 = wb.addWorksheet("DIAMOND DETAILS");
  s2.addRow(["SKU", "ROLE", "SHAPE", "PCS", "CARAT", "MM / SIEVE", "COLOUR", "CLARITY", "PACKET", "CERT", "NOTE"]);
  picked.forEach(function (p) {
    var lines = p.DIAMONDS || [];
    var brk = lines.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
    (brk.length ? brk : lines).forEach(function (d) {
      s2.addRow([p.SKU, d.STONE_ROLE || "", d.SHAPE || "", d.PCS || "", d.CARAT || "",
                 d.MM_SIEVE || "", d.COLOR || "", d.CLARITY || "", d.PACKET_NO || "",
                 d.CERT_NO || "", d.NOTE || ""]);
    });
  });

  [[s1, 4], [s2, 1]].forEach(function (pair) {
    var ws = pair[0], hr = pair[1];
    ws.getRow(hr).eachCell(function (c) {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4040" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    ws.views = [{ state: "frozen", ySplit: hr }];
    ws.columns.forEach(function (col) {
      var w = 10;
      col.eachCell({ includeEmpty: false }, function (c) {
        w = Math.max(w, Math.min(38, String(c.value === null || c.value === undefined ? "" : c.value).length + 3));
      });
      col.width = w;
      col.font = { name: "Arial", size: 10 };
    });
  });
  s1.getCell("A1").font = { bold: true, size: 13, name: "Arial", color: { argb: "FF0F4040" } };

  wb.xlsx.writeBuffer().then(function (buf) {
    download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
             "LEEBA-HK-" + label + "-" + new Date().toISOString().slice(0, 10) + ".xlsx");
    toast("Exported " + picked.length + " pieces");
  });
}

function exportCsv(picked) {
  var head = ["SR", "SKU", "LOCATION", "CATEGORY", "DESCRIPTION", "PURITY", "TONE",
              "GROSS WT", "NET GOLD", "TOTAL CT", "PCS", "QUALITY", "CERT",
              "AVAILABILITY", "SELLING PRICE"];
  if (cost) head.push("COST", "MARKUP");
  var lines = [head.join(",")];
  picked.forEach(function (p, i) {
    var r = [i + 1, p.SKU, p.LOC, p.CATEGORY, p.DESCRIPTION || "",
             p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.GROSS_WT_GM || "",
             p.NET_GOLD_WT_GM || "", p.TOTAL_CT || "", pcsOf(p) || "", p.QUALITY || "",
             p.CENTER_CERT || p.CERT || "", availOf(p), sellOf(p) || ""];
    if (cost) { var c = cost[p.SKU] || {}; r.push(c.cost || "", c.markup || ""); }
    lines.push(r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","));
  });
  download(new Blob([lines.join("\n")], { type: "text/csv" }),
           "LEEBA-HK-selection-" + new Date().toISOString().slice(0, 10) + ".csv");
  toast("Exported " + picked.length + " pieces (CSV)");
}

function download(blob, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ------------------------------------------------------------ wiring */
function chipGroup(root, attr, set) {
  $(root).addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    $$(".chip", $(root)).forEach(function (x) { x.classList.remove("is-on"); });
    b.classList.add("is-on");
    set(b.dataset[attr] || "");
    apply();
  });
}

function selbar() {
  $("#selN").textContent = sel.size;
  var v = 0;
  ALL.forEach(function (p) { if (sel.has(p.SKU)) v += sellOf(p) || 0; });
  $("#selVal").textContent = money(v);
  $("#selbar").hidden = sel.size === 0;
}

function wire() {
  chipGroup("#locChips",   "loc",   function (v) { filt.loc = v; });
  chipGroup("#catChips",   "cat",   function (v) { filt.cat = v; });
  chipGroup("#toneChips",  "tone",  function (v) { filt.tone = v; });
  chipGroup("#availChips", "avail", function (v) { filt.avail = v; });

  $("#purity").addEventListener("change", function () { filt.purity = this.value; apply(); });
  $("#shape").addEventListener("change", function () { filt.shape = this.value; apply(); });
  $("#sort").addEventListener("change", function () { filt.sort = this.value; apply(); });

  var t;
  $("#q").addEventListener("input", function () {
    var v = this.value;
    $("#qClear").hidden = !v;
    clearTimeout(t); t = setTimeout(function () { filt.q = v; apply(); }, 130);
  });
  $("#qClear").addEventListener("click", function () {
    $("#q").value = ""; filt.q = ""; this.hidden = true; apply(); $("#q").focus();
  });

  [["#ctMin", "ctMin"], ["#ctMax", "ctMax"], ["#prMin", "prMin"], ["#prMax", "prMax"],
   ["#gwMin", "gwMin"], ["#gwMax", "gwMax"]].forEach(function (pair) {
    $(pair[0]).addEventListener("input", function () {
      filt[pair[1]] = this.value === "" ? null : parseFloat(this.value);
      clearTimeout(t); t = setTimeout(apply, 180);
    });
  });

  $("#reset").addEventListener("click", function () {
    filt = { loc: "", cat: "", purity: "", tone: "", shape: "", q: "",
             ctMin: null, ctMax: null, prMin: null, prMax: null,
             gwMin: null, gwMax: null, avail: "", sort: "sku" };
    $$(".chip").forEach(function (c) {
      var isAll = c.dataset.loc === "" || c.dataset.cat === "" ||
                  c.dataset.tone === "" || c.dataset.avail === "";
      c.classList.toggle("is-on", isAll);
    });
    ["#q", "#ctMin", "#ctMax", "#prMin", "#prMax", "#gwMin", "#gwMax"].forEach(function (s) { $(s).value = ""; });
    $("#purity").value = ""; $("#shape").value = ""; $("#sort").value = "sku";
    $("#qClear").hidden = true;
    apply();
  });

  // view toggle
  function setView(list) {
    listView = list;
    $("#grid").classList.toggle("is-list", list);
    $("#vList").classList.toggle("is-on", list);
    $("#vGrid").classList.toggle("is-on", !list);
    try { localStorage.setItem("leeba.hk.view", list ? "list" : "grid"); } catch (e) {}
  }
  $("#vGrid").addEventListener("click", function () { setView(false); });
  $("#vList").addEventListener("click", function () { setView(true); });
  try { if (localStorage.getItem("leeba.hk.view") === "list") setView(true); } catch (e) {}

  // paging
  $("#moreBtn").addEventListener("click", renderMore);
  $("#main").addEventListener("scroll", function () {
    if (this.scrollTop + this.clientHeight > this.scrollHeight - 700 && shown < VIEW.length) renderMore();
  });

  // cards
  $("#grid").addEventListener("click", function (e) {
    var card = e.target.closest(".card"); if (!card) return;
    var sku = card.dataset.sku;
    if (e.target.closest("[data-pick]")) {
      if (sel.has(sku)) sel.delete(sku); else sel.add(sku);
      card.classList.toggle("is-sel");
      selbar();
      return;
    }
    openDetail(sku);
  });

  // selection
  $("#selClear").addEventListener("click", function () {
    sel.clear();
    $$(".card.is-sel").forEach(function (c) { c.classList.remove("is-sel"); });
    selbar();
  });
  $("#selExport").addEventListener("click", function () {
    exportRows(ALL.filter(function (p) { return sel.has(p.SKU); }), "selection");
  });
  $("#selAll").addEventListener("click", function () {
    VIEW.forEach(function (p) { sel.add(p.SKU); });
    $$(".card").forEach(function (c) { c.classList.add("is-sel"); });
    selbar(); toast(sel.size + " selected");
  });
  $("#expAll").addEventListener("click", function () { exportRows(VIEW.slice(), "list"); });

  // detail
  $("#dImg").addEventListener("click", function () {
    if (!this.src) return;
    $("#lbImg").src = this.src; $("#lightbox").hidden = false;
  });
  $("#dThumbs").addEventListener("click", function (e) {
    var im = e.target.closest("img"); if (!im) return;
    $("#dImg").src = im.dataset.full;
    $$("#dThumbs img").forEach(function (x) { x.classList.remove("is-on"); });
    im.classList.add("is-on");
  });
  $("#dAvail").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b || !detailSku) return;
    avail[detailSku] = b.dataset.set; saveAvail();
    $$("#dAvail .chip").forEach(function (x) { x.classList.remove("is-on"); });
    b.classList.add("is-on");
    refreshCard(detailSku);
    toast(detailSku + " - " + b.dataset.set);
    if (filt.avail) apply();
  });
  $("#dPick").addEventListener("click", function () {
    if (!detailSku) return;
    if (sel.has(detailSku)) sel.delete(detailSku); else sel.add(detailSku);
    this.textContent = sel.has(detailSku) ? "REMOVE FROM SELECTION" : "ADD TO SELECTION";
    refreshCard(detailSku); selbar();
  });
  $("#dPrev").addEventListener("click", function (e) { e.stopPropagation(); stepDetail(-1); });
  $("#dNext").addEventListener("click", function (e) { e.stopPropagation(); stepDetail(1); });

  // internal cost view. The button is hidden on phones, so #cost in the address
  // bar is the way in on a handset - nothing a customer would ever stumble into.
  function openCost() {
    $("#relock").hidden = !cost;
    $("#uErr").hidden = true; $("#pass").value = "";
    $("#unlock").hidden = false;
    setTimeout(function () { $("#pass").focus(); }, 30);
  }
  if (location.hash === "#cost") openCost();
  window.addEventListener("hashchange", function () { if (location.hash === "#cost") openCost(); });
  $("#costBtn").addEventListener("click", function () {
    $("#relock").hidden = !cost;
    $("#uErr").hidden = true; $("#pass").value = "";
    $("#unlock").hidden = false;
    setTimeout(function () { $("#pass").focus(); }, 30);
  });
  $("#unlockForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#uGo"); btn.disabled = true; btn.textContent = "CHECKING...";
    decryptCost($("#pass").value)
      .then(function (payload) {
        cost = payload;
        if ($("#keep").checked) { try { sessionStorage.setItem("leeba.hk.cost", $("#pass").value); } catch (e) {} }
        $("#unlock").hidden = true;
        afterCost(); toast("Cost view open");
      })
      .catch(function () { $("#uErr").hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "OPEN COST VIEW"; });
  });
  $("#relock").addEventListener("click", function () {
    cost = null;
    try { sessionStorage.removeItem("leeba.hk.cost"); } catch (e) {}
    $("#unlock").hidden = true;
    afterCost(); toast("Cost view closed");
  });

  // MORE FILTERS - a drawer on a phone, a collapsible rail on a desktop
  function moreLabel() {
    var shut = $("#side").classList.contains("is-shut");
    var phone = window.matchMedia("(max-width:860px)").matches;
    $("#moreFilt").firstChild.nodeValue = (!phone && !shut) ? "HIDE FILTERS " : "MORE FILTERS ";
  }
  $("#moreFilt").addEventListener("click", function () {
    var side = $("#side");
    if (window.matchMedia("(max-width:860px)").matches) side.classList.toggle("is-open");
    else side.classList.toggle("is-shut");
    moreLabel();
  });
  window.addEventListener("resize", moreLabel);
  moreLabel();
  $("#sideClose").addEventListener("click", function () { $("#side").classList.remove("is-open"); });

  // modals
  $$(".modal").forEach(function (m) {
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.closest("[data-close]")) m.hidden = true;
    });
  });

  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "Escape") {
      if (!$("#lightbox").hidden) { $("#lightbox").hidden = true; return; }
      $$(".modal").forEach(function (m) { m.hidden = true; });
      $("#side").classList.remove("is-open");
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); $("#q").focus(); return; }
    if (!$("#detail").hidden) {
      if (e.key === "ArrowRight") stepDetail(1);
      if (e.key === "ArrowLeft") stepDetail(-1);
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);
})();
