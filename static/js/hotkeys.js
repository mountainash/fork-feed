// hotkeys.js — keyboard shortcuts for kontrolplane/feed
// in a real Go app this lives in static/js/ and calls htmx.ajax() directly.
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
    if (items[next]) items[next].click();
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
});
