(function () {
  "use strict";

  var PAGE_SIZE = 15;
  var GAMES = [
    ["apex-legends", "Apex Legends"],
    ["arc-raiders", "Arc Raiders"],
    ["battlefield-6", "Battlefield 6"],
    ["black-ops-6-warzone", "Black Ops 6 & Warzone"],
    ["bo6-bo7-warzone", "BO7 & Warzone"],
    ["dayz", "DayZ"],
    ["dead-by-daylight", "Dead By Daylight"],
    ["escape-from-tarkov", "Escape from Tarkov"],
    ["fortnite", "Fortnite"],
    ["hunt-showdown", "Hunt Showdown"],
    ["hwid-spoofers", "HWID Spoofers"],
    ["marvel-rivals", "Marvel Rivals"],
    ["meccha-chameleon", "Meccha Chameleon"],
    ["modern-warfare-4", "Modern Warfare 4"],
    ["palworld", "Palworld"],
    ["pubg", "PUBG"],
    ["siege-x", "Rainbow Six Siege"],
    ["rust", "Rust"]
  ];

  var all = [];
  var page = 1;
  var voted = {};
  var reported = {};

  try {
    voted = JSON.parse(localStorage.getItem("gc_review_helpful") || "{}") || {};
    reported = JSON.parse(localStorage.getItem("gc_review_report") || "{}") || {};
  } catch (e) {
    voted = {};
    reported = {};
  }

  var els = {
    score: document.getElementById("rvScore"),
    stars: document.getElementById("rvSummaryStars"),
    count: document.getElementById("rvScoreCount"),
    recommend: document.getElementById("rvRecommendLine"),
    dist: document.getElementById("rvDist"),
    summaryScore: document.getElementById("rvSummaryScore"),
    summaryEmpty: document.getElementById("rvSummaryEmpty"),
    list: document.getElementById("rvList"),
    listCount: document.getElementById("rvCount"),
    pager: document.getElementById("rvPagination"),
    search: document.getElementById("rvSearch"),
    product: document.getElementById("rvFilterProduct"),
    sort: document.getElementById("rvSort"),
    chips: document.querySelectorAll("#rvChips input[name='rating']")
  };

  function qs(name) {
    return new URLSearchParams(location.search).get(name) || "";
  }

  function authorLabel(name) {
    var s = String(name || "").trim();
    return s || "user";
  }

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (!then) return "";
    var sec = Math.max(0, (Date.now() - then) / 1000);
    if (sec < 3600) return "just now";
    if (sec < 86400) {
      var h = Math.round(sec / 3600);
      return h + (h === 1 ? " hour ago" : " hours ago");
    }
    var days = Math.round(sec / 86400);
    if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
    var weeks = Math.round(days / 7);
    if (weeks < 5) return weeks + (weeks === 1 ? " week ago" : " weeks ago");
    var months = Math.round(days / 30);
    if (months < 18) return months + (months === 1 ? " month ago" : " months ago");
    var years = Math.round(days / 365);
    return years + (years === 1 ? " year ago" : " years ago");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function starsPct(rating) {
    return Math.max(0, Math.min(5, Number(rating) || 0)) * 20 + "%";
  }

  function starsTiles() {
    return "<i></i><i></i><i></i><i></i><i></i>";
  }

  function starsHtml(rating, size) {
    var n = Number(rating) || 0;
    return (
      '<span class="rating-stars" role="img" aria-label="Rated ' +
      n +
      ' out of 5" style="--stars-pct:' +
      starsPct(n) +
      "; --star-size:" +
      size +
      'px;">' +
      '<span class="rating-stars-track" aria-hidden="true">' +
      starsTiles() +
      "</span>" +
      '<span class="rating-stars-fill" aria-hidden="true"><span class="rating-stars-fill-inner">' +
      starsTiles() +
      "</span></span></span>"
    );
  }

  function gameLabel(slug) {
    for (var i = 0; i < GAMES.length; i++) {
      if (GAMES[i][0] === slug) return GAMES[i][1];
    }
    return "";
  }

  function whereLine(row) {
    var game = gameLabel(row.game) || "";
    var product = row.product || "Script Engine";
    if (game && product) return game + " · " + product;
    return product || game || "Script Engine";
  }

  function filters() {
    var rating = "";
    els.chips.forEach(function (input) {
      if (input.checked) rating = input.value;
    });
    return {
      q: (els.search && els.search.value) || "",
      rating: rating,
      product: (els.product && els.product.value) || "",
      sort: (els.sort && els.sort.value) || "recent"
    };
  }

  function filtered() {
    var f = filters();
    var q = f.q.trim().toLowerCase();
    var rows = all.filter(function (row) {
      if (f.rating && String(row.rating) !== String(f.rating)) return false;
      if (f.product && row.product !== f.product) return false;
      if (q) {
        var blob = ((row.title || "") + " " + (row.body || "") + " " + (row.author_name || "")).toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) {
      if (f.sort === "highest") return (b.rating || 0) - (a.rating || 0);
      if (f.sort === "lowest") return (a.rating || 0) - (b.rating || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }

  function renderSummary() {
    var n = all.length;
    if (!n) {
      if (els.summaryScore) els.summaryScore.hidden = true;
      if (els.dist) els.dist.hidden = true;
      if (els.summaryEmpty) els.summaryEmpty.hidden = false;
      return;
    }
    if (els.summaryScore) els.summaryScore.hidden = false;
    if (els.dist) els.dist.hidden = false;
    if (els.summaryEmpty) els.summaryEmpty.hidden = true;

    var sum = 0;
    var dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var rec = 0;
    all.forEach(function (row) {
      var r = Number(row.rating) || 0;
      sum += r;
      if (dist[r] != null) dist[r] += 1;
      if (row.recommended !== false && r >= 4) rec += 1;
    });
    var avg = sum / n;
    var recPct = Math.round((rec / n) * 100);
    var maxBar = Math.max(dist[1], dist[2], dist[3], dist[4], dist[5], 1);

    if (els.score) els.score.textContent = avg.toFixed(1);
    if (els.stars) {
      els.stars.setAttribute("aria-label", "Rated " + avg.toFixed(1) + " out of 5");
      els.stars.style.setProperty("--stars-pct", Math.round((avg / 5) * 100) + "%");
    }
    if (els.count) els.count.textContent = "out of " + n + " review" + (n === 1 ? "" : "s");
    if (els.recommend) {
      els.recommend.innerHTML =
        '<span class="rv-check" aria-hidden="true">✓</span>' + recPct + "% would recommend Script Engine";
    }
    if (els.dist) {
      els.dist.innerHTML = [5, 4, 3, 2, 1]
        .map(function (star) {
          var w = Math.round((dist[star] / maxBar) * 100);
          return (
            '<div class="rv-dist-row">' +
            '<span class="rv-dist-label">' +
            star +
            ' <span class="rv-dist-star" aria-hidden="true"></span></span>' +
            '<span class="rv-bar"><span class="rv-bar-fill" style="width: ' +
            w +
            '%"></span></span>' +
            '<span class="rv-dist-count">' +
            dist[star] +
            "</span></div>"
          );
        })
        .join("");
    }
  }

  function rowHtml(row) {
    var id = row.id;
    var helpful = Number(row.helpful_count) || 0;
    var isVoted = !!voted[id];
    var isReported = !!reported[id];
    var title = row.title ? '<h3 class="rv-row-title">' + escapeHtml(row.title) + "</h3>" : "";
    var rec =
      row.recommended !== false && Number(row.rating) >= 4
        ? '<span class="rv-recommend"><span class="rv-check" aria-hidden="true">✓</span>Recommended</span>'
        : "";
    return (
      '<article class="rv-row" data-id="' +
      escapeHtml(id) +
      '">' +
      '<div class="rv-row-main">' +
      '<div class="rv-row-head">' +
      starsHtml(row.rating, 15) +
      '<span class="rv-row-where">' +
      escapeHtml(whereLine(row)) +
      "</span></div>" +
      title +
      '<p class="rv-row-body">' +
      escapeHtml(row.body) +
      "</p>" +
      '<p class="rv-row-by">by ' +
      escapeHtml(authorLabel(row.author_name)) +
      "</p>" +
      '<div class="rv-row-actions">' +
      '<button type="button" class="rv-helpful' +
      (isVoted ? " is-voted" : "") +
      '"' +
      (isVoted ? " disabled" : "") +
      ' data-action="helpful">' +
      '<svg class="rv-helpful-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v10H4V10z" /><path d="M7 10l4.5-7a2 2 0 0 1 2.8 2.3L13 10h5.5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 17 20H7" /></svg>' +
      "Helpful" +
      (helpful ? '<span class="rv-helpful-n">' + helpful + "</span>" : '<span class="rv-helpful-n"></span>') +
      "</button>" +
      '<button type="button" class="rv-report' +
      (isReported ? " is-done" : "") +
      '"' +
      (isReported ? " disabled" : "") +
      ' data-action="report">' +
      (isReported ? "Reported" : "Report") +
      "</button></div></div>" +
      '<div class="rv-row-side">' +
      '<span class="rv-row-time">' +
      escapeHtml(timeAgo(row.created_at)) +
      "</span>" +
      rec +
      '<span class="rv-verified-key"><svg class="rv-key-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z" /><path d="M9 12.2l2 2 4-4.2" /></svg>Verified Customer</span>' +
      "</div></article>"
    );
  }

  function pagerPages(current, total) {
    if (total <= 9) {
      var allPages = [];
      for (var i = 1; i <= total; i++) allPages.push(i);
      return allPages;
    }
    var pages = [];
    var head = Math.min(6, total);
    for (var p = 1; p <= head; p++) pages.push(p);
    if (current > 6 && current < total - 1 && pages.indexOf(current) < 0) {
      pages.push("…");
      pages.push(current);
    }
    pages.push("…");
    if (total - 1 > head) pages.push(total - 1);
    pages.push(total);
    return pages;
  }

  function renderList() {
    var rows = filtered();
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    if (page > pages) page = pages;
    var start = (page - 1) * PAGE_SIZE;
    var slice = rows.slice(start, start + PAGE_SIZE);

    if (els.listCount) {
      if (!total) {
        els.listCount.textContent = "No reviews match these filters";
      } else {
        var from = start + 1;
        var to = start + slice.length;
        els.listCount.textContent = "Showing " + from + "–" + to + " of " + total + " reviews";
      }
    }

    if (els.list) {
      els.list.innerHTML = slice.map(rowHtml).join("");
    }

    if (els.pager) {
      if (pages <= 1) {
        els.pager.innerHTML = "";
        els.pager.hidden = true;
      } else {
        els.pager.hidden = false;
        var html = "";
        if (page <= 1) {
          html += '<span class="pagination-link is-disabled" aria-disabled="true">‹ Prev</span>';
        } else {
          html += '<a href="#" class="pagination-link" data-page="' + (page - 1) + '">‹ Prev</a>';
        }
        pagerPages(page, pages).forEach(function (item) {
          if (item === "…") {
            html += '<span class="pagination-ellipsis" aria-hidden="true">...</span>';
            return;
          }
          if (item === page) {
            html += '<span aria-current="page" class="pagination-link is-current">' + item + "</span>";
          } else {
            html +=
              '<a href="#" class="pagination-link" data-page="' +
              item +
              '" aria-label="Go to page ' +
              item +
              '">' +
              item +
              "</a>";
          }
        });
        if (page >= pages) {
          html += '<span class="pagination-link is-disabled" aria-disabled="true">Next ›</span>';
        } else {
          html += '<a href="#" class="pagination-link" rel="next" data-page="' + (page + 1) + '">Next ›</a>';
        }
        els.pager.innerHTML = html;
      }
    }
  }

  function render() {
    renderSummary();
    renderList();
  }

  function bind() {
    if (document.getElementById("rvToolbar")) {
      document.getElementById("rvToolbar").addEventListener("submit", function (event) {
        event.preventDefault();
      });
    }
    if (els.search) {
      els.search.addEventListener("input", function () {
        page = 1;
        renderList();
      });
    }
    els.chips.forEach(function (input) {
      input.addEventListener("change", function () {
        document.querySelectorAll("#rvChips .rv-chip").forEach(function (lab) {
          var inp = lab.querySelector("input");
          lab.classList.toggle("is-active", !!(inp && inp.checked));
        });
        page = 1;
        renderList();
      });
    });
    if (els.product) {
      els.product.addEventListener("change", function () {
        page = 1;
        renderList();
      });
    }
    if (els.sort) {
      els.sort.addEventListener("change", function () {
        page = 1;
        renderList();
      });
    }
    if (els.pager) {
      els.pager.addEventListener("click", function (event) {
        var link = event.target.closest("[data-page]");
        if (!link) return;
        event.preventDefault();
        page = Number(link.getAttribute("data-page")) || 1;
        renderList();
        var listWrap = document.querySelector(".rv-list-wrap");
        if (listWrap) listWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (els.list) {
      els.list.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-action]");
        if (!btn) return;
        var row = event.target.closest(".rv-row");
        if (!row) return;
        var id = row.getAttribute("data-id");
        if (btn.getAttribute("data-action") === "report") {
          reported[id] = true;
          try {
            localStorage.setItem("gc_review_report", JSON.stringify(reported));
          } catch (e) {}
          btn.textContent = "Reported";
          btn.classList.add("is-done");
          btn.disabled = true;
          return;
        }
        if (btn.getAttribute("data-action") === "helpful") {
          if (voted[id]) return;
          voted[id] = true;
          try {
            localStorage.setItem("gc_review_helpful", JSON.stringify(voted));
          } catch (e) {}
          var match = all.filter(function (r) {
            return r.id === id;
          })[0];
          if (match) match.helpful_count = (Number(match.helpful_count) || 0) + 1;
          btn.classList.add("is-voted");
          btn.disabled = true;
          var nEl = btn.querySelector(".rv-helpful-n");
          if (nEl) nEl.textContent = match ? match.helpful_count : "";
          fetch("/api/reviews/" + encodeURIComponent(id) + "/helpful", { method: "POST" }).catch(function () {});
        }
      });
    }
  }

  async function loadFromSupabase() {
    var client = window.gcAuth && window.gcAuth.client;
    if (!client) return null;
    var result = await client
      .from("reviews")
      .select("id, created_at, rating, body, title, author_name, product, game, helpful_count, recommended, published")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadFromApi() {
    var res = await fetch("/api/reviews");
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(json.error || "Could not load reviews.");
    return json.reviews || [];
  }

  async function boot() {
    bind();
    try {
      all = await loadFromSupabase();
    } catch (e) {
      try {
        all = await loadFromApi();
      } catch (err) {
        all = [];
      }
    }
    var startPage = Number(qs("page")) || 1;
    page = startPage < 1 ? 1 : startPage;
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
