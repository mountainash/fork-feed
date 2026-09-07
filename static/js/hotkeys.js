// hotkeys.js - keyboard shortcuts for kontrolplane/feed

function activateItem(el) {
  var prev = document.querySelector(".list-body .item.active");
  if (prev) prev.classList.remove("active");
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ block: "nearest" });
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

// Set active on any item click, and on mobile switch to the reader pane
document.addEventListener("click", function (e) {
  var item = e.target.closest(".list-body .item");
  if (item) {
    activateItem(item);
    if (isMobileViewport()) {
      document.querySelector(".app").classList.add("mobile-reader-open");
    }
    return;
  }

  var back = e.target.closest(".reader-back");
  if (back) {
    document.querySelector(".app").classList.remove("mobile-reader-open");
    return;
  }

  if (!isMobileViewport()) return;

  var app = document.querySelector(".app");
  var sidebar = e.target.closest("#sidebar");
  var navLink = e.target.closest(
    "#sidebar .nav-item, #sidebar .feed-item, #sidebar .add"
  );

  if (app.classList.contains("mobile-sidebar-open")) {
    // navigating (or tapping outside the sidebar) collapses it back to the rail
    if (navLink || !sidebar) app.classList.remove("mobile-sidebar-open");
  } else if (sidebar && !navLink) {
    app.classList.add("mobile-sidebar-open");
  }
});

document.addEventListener("keydown", function (e) {
  var tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    if (e.key === "Escape") e.target.blur();
    return;
  }

  if (e.key === "/") {
    e.preventDefault();
    var search = document.querySelector('input[name="q"]');
    if (search) search.focus();
    return;
  }

  if (e.key === "n") {
    htmx.ajax("GET", "/feeds/new", { target: "#modal", swap: "innerHTML" });
    return;
  }

  if (e.key === "j" || e.key === "k") {
    e.preventDefault();
    var items = Array.from(document.querySelectorAll(".list-body .item"));
    var active = document.querySelector(".list-body .item.active");
    var idx = active ? items.indexOf(active) : -1;
    var next =
      e.key === "j"
        ? Math.min(items.length - 1, idx + 1)
        : Math.max(0, idx - 1);
    if (items[next]) {
      activateItem(items[next]);
      items[next].click();
    }
    return;
  }

  if (e.key === "s") {
    var starBtn = document.querySelector("#reader .actions .rh button");
    if (starBtn) starBtn.click();
    return;
  }

  if (e.key === "m") {
    var btns = document.querySelectorAll("#reader .actions .rh button");
    if (btns.length >= 2) btns[1].click();
    return;
  }

  if (e.key === "o" || e.key === "Enter") {
    var activeItem = document.querySelector(".list-body .item.active");
    if (activeItem) activeItem.click();
    return;
  }

  if (e.key === "1") {
    togglePane("sidebar");
    return;
  }

  if (e.key === "2") {
    togglePane("list");
    return;
  }
});
