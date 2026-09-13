"use strict";

// Board rendering, editing, filtering, and color controls.
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function iconButton(label, expanded, className = "") {
  const button = node("button", "icon-button " + className);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", String(expanded));
  const img = node("img");
  img.src =
    "./assets/" +
    (expanded ? "imgMinimizeButton.svg" : "imgMaximizeButton.svg");
  img.alt = "";
  button.append(img);
  return button;
}
function editable(className, value, label, onChange, multiline = false) {
  const el = node("div", className, value);
  el.contentEditable = "plaintext-only";
  el.setAttribute("role", "textbox");
  el.setAttribute("aria-label", label);
  el.setAttribute("aria-multiline", String(multiline));
  el.dataset.placeholder = label;
  el.spellcheck = true;
  el.addEventListener("input", () => onChange(el.textContent));
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || (!multiline && event.key === "Enter")) {
      event.preventDefault();
      el.blur();
    }
  });
  return el;
}
function findCard(id) {
  for (const column of board.columns) {
    const card = column.cards.find((item) => item.id === id);
    if (card) return { card, column };
  }
}
function matches(card) {
  if (colorFilter && card.color !== colorFilter) return false;
  const normalize = (text) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const haystack = normalize(card.category + " " + card.title);
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => {
      if (haystack.includes(term)) return true;
      let position = 0;
      for (const char of haystack) if (char === term[position]) position++;
      return position === term.length;
    });
}
function renderCard(card) {
  const el = node("article", "card" + (card.expanded ? " expanded" : ""));
  el.dataset.card = card.id;
  el.style.setProperty("--card-bg", `var(--task-${card.color})`);
  el.style.setProperty("--card-border", `var(--border-${card.color})`);
  el.tabIndex = 0;
  el.setAttribute("aria-label", card.title || "Untitled task");
  const top = node("div", "card-top");
  const star = node("button", "icon-button star");
  star.title = "Change card color";
  star.setAttribute("aria-label", "Change card color");
  star.setAttribute("aria-haspopup", "dialog");
  star.setAttribute("aria-expanded", "false");
  const starImage = node("img");
  starImage.alt = "";
  starImage.src = `./assets/component-imgStar${ASSET_INDEX[card.color]}.svg`;
  star.append(starImage);
  star.addEventListener("click", () =>
    openColorPalette(star, card.color, (color) => {
      card.color = color;
      persist();
      render();
      const replacement = [...document.querySelectorAll("[data-card]")].find(
        (item) => item.dataset.card === card.id,
      );
      (replacement?.querySelector(".star") || $("#search-color")).focus();
    }),
  );
  top.append(
    star,
    editable("text-category", card.category, "Category", (value) => {
      card.category = value;
      persist();
    }),
  );
  const line = node("img", "divider");
  line.src = `./assets/component-imgLine${ASSET_INDEX[card.color]}.svg`;
  line.alt = "";
  const row = node("div", "card-row");
  const toggle = iconButton(
    card.expanded ? "Shrink card" : "Expand card",
    card.expanded,
    "card-toggle",
  );
  toggle.addEventListener("click", () => {
    card.expanded = !card.expanded;
    el.classList.toggle("expanded", card.expanded);
    details.inert = !card.expanded;
    updateToggle(toggle, card.expanded, "card");
    persist();
  });
  row.append(
    editable("text-card-title", card.title, "Task title", (value) => {
      card.title = value;
      el.setAttribute("aria-label", value || "Untitled task");
      persist();
    }),
    toggle,
  );
  const details = node("div", "details-wrap");
  details.inert = !card.expanded;
  const inner = node("div", "details-inner");
  inner.append(
    editable(
      "text-description",
      card.description,
      "Add a description…",
      (value) => {
        card.description = value;
        persist();
      },
      true,
    ),
  );
  details.append(inner);
  el.append(top, line, row, details);
  el.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    prioritize(card.id);
  });
  el.addEventListener("keydown", (event) => {
    if (event.target !== el) return;
    if (event.key.toLowerCase() === "p") {
      event.preventDefault();
      prioritize(card.id);
    }
    if (
      event.altKey &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const current = findCard(card.id).column;
      const index = current.cards.indexOf(card);
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const otherIndex = index + (event.key === "ArrowUp" ? -1 : 1);
        if (current.cards[otherIndex])
          [current.cards[index], current.cards[otherIndex]] = [
            current.cards[otherIndex],
            current.cards[index],
          ];
      } else {
        const target =
          board.columns[
            board.columns.indexOf(current) +
              (event.key === "ArrowLeft" ? -1 : 1)
          ];
        if (target) {
          current.cards.splice(index, 1);
          target.cards.push(card);
          target.collapsed = false;
        }
      }
      persist();
      render();
      [...document.querySelectorAll("[data-card]")]
        .find((el) => el.dataset.card === card.id)
        ?.focus();
    }
  });
  return el;
}
function updateToggle(button, expanded, thing) {
  const label = (expanded ? "Shrink " : "Expand ") + thing;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-expanded", String(expanded));
  button.querySelector("img").src =
    "./assets/" +
    (expanded ? "imgMinimizeButton.svg" : "imgMaximizeButton.svg");
}
function render() {
  closeColorPalette();
  updateSearchColor();
  const filtering = !!(query || colorFilter);
  const root = $("#board");
  root.replaceChildren();
  let total = 0;
  board.columns.forEach((column) => {
    const section = node(
      "section",
      "column" + (column.collapsed ? " collapsed" : ""),
    );
    section.dataset.column = column.id;
    const header = node("div", "column-header");
    const toggle = iconButton(
      column.collapsed ? "Expand column" : "Shrink column",
      !column.collapsed,
      "column-toggle",
    );
    header.append(
      editable("text-column", column.title, "Column title", (value) => {
        column.title = value;
        persist();
      }),
      toggle,
    );
    const content = node("div", "column-content");
    content.inert = column.collapsed;
    toggle.addEventListener("click", () => {
      column.collapsed = !column.collapsed;
      section.classList.toggle("collapsed", column.collapsed);
      content.inert = column.collapsed;
      updateToggle(toggle, !column.collapsed, "column");
      persist();
    });
    const priority = node(
      "div",
      "priority" + (column.priorityOpen || filtering ? "" : " closed"),
    );
    priority.dataset.zone = "priority";
    const priorityHeader = node("div", "priority-header");
    const priorityToggle = iconButton(
      "Toggle Priority bin",
      column.priorityOpen || filtering,
      "priority-toggle",
    );
    priorityHeader.append(
      node("h2", "text-priority", "PRIORITY"),
      priorityToggle,
    );
    const wrap = node("div", "priority-wrap");
    wrap.inert = !column.priorityOpen && !filtering;
    const inner = node("div", "priority-inner");
    const priorityList = node("div", "card-list");
    priorityList.dataset.list = "priority";
    const regular = node("div", "card-list regular");
    regular.dataset.list = "regular";
    column.cards.filter(matches).forEach((card) => {
      (card.priority ? priorityList : regular).append(renderCard(card));
      total++;
    });
    // The reference omits the Done bin until it is needed.
    if (
      column.id === "done" &&
      !column.cards.some((card) => card.priority) &&
      !drag
    )
      priority.hidden = true;
    priorityToggle.addEventListener("click", () => {
      column.priorityOpen = priority.classList.contains("closed");
      priority.classList.toggle("closed", !column.priorityOpen);
      wrap.inert = !column.priorityOpen;
      updateToggle(priorityToggle, column.priorityOpen, "Priority bin");
      persist();
    });
    inner.append(priorityList);
    wrap.append(inner);
    priority.append(priorityHeader, wrap);
    content.append(priority, regular);
    section.append(header, content);
    root.append(section);
  });
  $("#local-status").textContent = filtering
    ? `${total} matching task${total === 1 ? "" : "s"}`
    : storageAvailable
      ? "Saved on this device"
      : "Device storage unavailable";
}
function prioritize(id) {
  const found = findCard(id);
  if (!found) return;
  found.card.priority = true;
  found.column.priorityOpen = true;
  persist();
  render();
  announce("Moved to Priority. Drag it below the bin to remove priority.");
}
$("#search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

// One shared, viewport-positioned palette avoids clipping inside collapsed columns.
const palette = node("div", "color-palette");
palette.id = "color-palette";
palette.hidden = true;
palette.setAttribute("role", "dialog");
document.body.append(palette);
let paletteAnchor = null;
function closeColorPalette(restoreFocus = false) {
  const anchor = paletteAnchor;
  palette.hidden = true;
  paletteAnchor = null;
  anchor?.setAttribute("aria-expanded", "false");
  if (restoreFocus && anchor?.isConnected) anchor.focus();
}
function openColorPalette(anchor, selected, onSelect, allowAll = false) {
  if (paletteAnchor === anchor) {
    closeColorPalette(true);
    return;
  }
  closeColorPalette();
  paletteAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  anchor.setAttribute("aria-controls", palette.id);
  palette.setAttribute(
    "aria-label",
    allowAll ? "Filter tasks by color" : "Choose card color",
  );
  palette.replaceChildren();
  const choose = (color) => {
    closeColorPalette(true);
    onSelect(color);
  };
  if (allowAll) {
    const all = node("button", "all-colors", "All colors");
    all.type = "button";
    all.dataset.color = "";
    all.setAttribute("aria-pressed", String(!selected));
    all.addEventListener("click", () => choose(""));
    palette.append(all);
  }
  const surface = node("div", "palette-surface");
  const artwork = node("img", "palette-artwork");
  artwork.src = "./assets/color-palette.svg";
  artwork.alt = "";
  surface.append(artwork);
  COLORS.forEach((color, index) => {
    // Transparent hit targets preserve the exact exported star shapes and spacing.
    const option = node("button", "palette-option");
    option.type = "button";
    option.dataset.color = color;
    option.title = color;
    option.setAttribute("aria-label", color);
    option.setAttribute("aria-pressed", String(selected === color));
    option.style.left =
      (index < 4 ? 5 + index * 14 : 12 + (index - 4) * 14) + "px";
    option.style.top = (index < 4 ? 4 : 18) + "px";
    option.addEventListener("click", () => choose(color));
    surface.append(option);
  });
  palette.append(surface);
  palette.hidden = false;
  const rect = anchor.getBoundingClientRect();
  palette.style.left =
    Math.max(8, Math.min(innerWidth - 74, rect.left + rect.width / 2 - 33)) +
    "px";
  palette.style.top =
    Math.max(
      8,
      Math.min(
        innerHeight - palette.offsetHeight - 8,
        rect.top - palette.offsetHeight - 2,
      ),
    ) + "px";
  const options = [...palette.querySelectorAll("button")];
  (
    options.find((option) => option.dataset.color === selected) || options[0]
  ).focus({ preventScroll: true });
}
function updateSearchColor() {
  const button = $("#search-color");
  button.querySelector("img").src = colorFilter
    ? `./assets/component-imgStar${ASSET_INDEX[colorFilter]}.svg`
    : "./assets/search-star.svg";
  button.classList.toggle("active", !!colorFilter);
  button.title = "Filter by color: " + (colorFilter || "all colors");
  button.setAttribute("aria-label", button.title);
}
$("#search-color").addEventListener("click", () =>
  openColorPalette(
    $("#search-color"),
    colorFilter,
    (color) => {
      colorFilter = color;
      render();
    },
    true,
  ),
);
palette.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeColorPalette(true);
  }
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches("button")
  ) {
    event.preventDefault();
    event.target.click();
  }
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
      event.key,
    )
  ) {
    event.preventDefault();
    const options = [...palette.querySelectorAll("button")];
    const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (options.indexOf(document.activeElement) +
              direction +
              options.length) %
            options.length;
    options[index].focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (
    paletteAnchor &&
    !palette.contains(event.target) &&
    !paletteAnchor.contains(event.target)
  )
    closeColorPalette();
});
document.addEventListener("focusin", (event) => {
  if (
    paletteAnchor &&
    !palette.contains(event.target) &&
    !paletteAnchor.contains(event.target)
  )
    closeColorPalette();
});
window.addEventListener("resize", () => closeColorPalette());
document.addEventListener("scroll", () => closeColorPalette(), true);

// Pointer dragging keeps the live drag preview animated and works with mouse, pen, and touch.
