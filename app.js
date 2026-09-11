"use strict";

const STORAGE_KEY = "jiayou.board.v1";
const COLORS = ["soul", "orange", "yellow", "green", "aqua", "blue", "seth"];
const ASSET_INDEX = {
  soul: 1,
  orange: 7,
  yellow: 6,
  green: 2,
  aqua: 3,
  blue: 4,
  seth: 5,
};

const SUBHEADERS = [
  "a simple kanban board for simple people",
  "a small kanban board for people of all sizes",
  "a kanban board!",
  "an easy kanban board",
  "it's no JIRA (complimentary)",
  "surely won't get absorbed by Atlassian",
  "birthplace of evil schemes",
  "made to keep track of all your sh*t",
  "all according to plant",
  "who up kanning their ban",
  "right click a card to prioritize!",
  "(jiayou is encouragement in Chinese btw)",
  "(jiayou translates literally to \"add oil\")",
  "you just lost the game"
];

const $ = (selector) => document.querySelector(selector);
const uid = () => crypto.randomUUID();
const seedCard = ({
  title,
  description,
  color,
  category = "GUIDE",
  priority = false,
  expanded = false,
}) => ({
  id: uid(),
  category,
  title,
  description,
  color,
  priority,
  expanded,
});
const initialBoard = () => ({
  version: 1,
  updatedAt: 0,
  columns: [
    {
      id: "todo",
      title: "To-Do",
      collapsed: false,
      priorityOpen: true,
      cards: [
        seedCard({
          title: "Type here to edit!",
          description:
            "You can edit this too!",
          color: "seth",
          category: "Type to edit!",
          priority: true,
        }),
        seedCard({
          title: "Move me around!",
          description:
            "Drag a card to reorder it, move it to another column, or drop it into Priority.",
          color: "seth",
          category: "Step 1",
          priority: true,
        }),
        seedCard({
          title: "Set my color with the star!",
          description:
            "Select the star in the upper-left of a card, then choose one of seven colors. Changes save automatically.",
          category: "Step 2",
          color: "soul",
          priority: true,
        }),
        seedCard({
          title: "Expand cards over here ->",
          description:
            "Select the circle beside a card title to reveal its description. Select it again to collapse the card.",
          color: "orange",
          category: "Step 3",
          expanded: true,
        }),
      ],
    },
    {
      id: "progress",
      title: "In Progress",
      collapsed: false,
      priorityOpen: false,
      cards: [
        seedCard({
          title: "Set card category",
          description:
            "Select the category at the top of a card and type a label. Press Enter or click elsewhere when finished.",
          color: "yellow",
          category: "Step 4"
        }),
        seedCard({
          title: "Drag from Create to make a card",
          description:
            "Select Create to add a card to the first open column, or drag Create to place a new card exactly where you want it.",
          category: "Step 5",
          color: "green",
        }),
        seedCard({
          title: "Drag to Destroy to destroy me!",
          description:
            "Drag a card onto Destroy and release it when the drop target is highlighted.",
          color: "aqua",
          category: "Step 6"
        }),
        seedCard({
          title: "You can also search for cards!",
          description:
            "Search by card title or category. Select the star beside Search to filter the results by color.",
          category: "Step 7",
          color: "blue",
        }),
      ],
    },
    {
      id: "done",
      title: "Done",
      collapsed: false,
      priorityOpen: false,
      cards: [
        seedCard({
          title: "How to destroy all cards",
          description:
            "Press Destroy for 3 seconds to clear the board!",
          category: "Step 8",
          color: "seth",
        }),
      ],
    },
  ],
});
function validBoard(value) {
  const ids = new Set();
  return (
    value?.version === 1 &&
    Number.isFinite(value.updatedAt) &&
    Array.isArray(value.columns) &&
    value.columns.length === 3 &&
    value.columns.every(
      (column, i) =>
        column.id === ["todo", "progress", "done"][i] &&
        typeof column.title === "string" &&
        typeof column.collapsed === "boolean" &&
        typeof column.priorityOpen === "boolean" &&
        Array.isArray(column.cards) &&
        column.cards.every((card) => {
          if (typeof card.id !== "string" || ids.has(card.id)) return false;
          ids.add(card.id);
          return (
            ["category", "title", "description"].every(
              (key) => typeof card[key] === "string",
            ) &&
            COLORS.includes(card.color) &&
            typeof card.priority === "boolean" &&
            typeof card.expanded === "boolean"
          );
        }),
    )
  );
}
let board = initialBoard();
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (validBoard(saved)) board = saved;
} catch {
  storageAvailable = false;
}
let query = "",
  colorFilter = "",
  drag = null,
  suppressClick = false,
  messageTimer;
const drive = {
  token: "",
  expires: 0,
  fileId: "",
  ready: false,
  busy: false,
  pending: false,
  timer: null,
};
function announce(text) {
  $("#message").textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    $("#message").textContent = "";
  }, 6000);
}
function persist(changed = true) {
  if (changed) board.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  $("#local-status").textContent = storageAvailable
    ? "Saved on this device"
    : "Device storage unavailable — keep this tab open";
  if (drive.ready && changed) {
    drive.pending = true;
    saveLabel("Saving…", true);
    clearTimeout(drive.timer);
    drive.timer = setTimeout(flushDrive, 650);
  }
}
function resetFilters() {
  query = "";
  colorFilter = "";
  $("#search").value = "";
}
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
const marker = node("div", "drop-marker");
function placeDropMarker(list, clientX, clientY, draggedId) {
  const listRect = list.getBoundingClientRect();
  const cards = [...list.querySelectorAll(".card")]
    .filter((card) => card.dataset.card !== draggedId)
    .map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        card,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });
  marker.remove();
  marker.classList.toggle("empty-list", !cards.length);
  list.append(marker);
  if (!cards.length) {
    marker.style.left = listRect.width / 2 + "px";
    marker.style.top = Math.min(20, listRect.height / 2) + "px";
    marker.style.height = "4px";
    return;
  }

  const rows = [];
  cards.forEach((item) => {
    let row = rows.find(
      (candidate) => Math.abs(candidate.centerY - item.centerY) < 8,
    );
    if (!row) {
      row = {
        centerY: item.centerY,
        top: item.rect.top,
        bottom: item.rect.bottom,
        items: [],
      };
      rows.push(row);
    }
    row.items.push(item);
    row.top = Math.min(row.top, item.rect.top);
    row.bottom = Math.max(row.bottom, item.rect.bottom);
  });
  rows.sort((a, b) => a.centerY - b.centerY);
  rows.forEach((row) => row.items.sort((a, b) => a.centerX - b.centerX));
  const distanceToRow = (row) =>
    clientY < row.top
      ? row.top - clientY
      : clientY > row.bottom
        ? clientY - row.bottom
        : 0;
  const row = rows.reduce((nearest, candidate) =>
    distanceToRow(candidate) < distanceToRow(nearest) ? candidate : nearest,
  );
  const itemAfterPointer = row.items.find((item) => clientX < item.centerX);
  const itemIndex = itemAfterPointer
    ? row.items.indexOf(itemAfterPointer)
    : row.items.length;
  const previousItem = row.items[itemIndex - 1];
  const boundaryX = itemAfterPointer
    ? previousItem
      ? (previousItem.rect.right + itemAfterPointer.rect.left) / 2
      : itemAfterPointer.rect.left - 5
    : row.items.at(-1).rect.right + 5;
  const lastRowCard = row.items.at(-1).card;
  const lastRowCardIndex = cards.findIndex((item) => item.card === lastRowCard);
  const before = itemAfterPointer?.card || cards[lastRowCardIndex + 1]?.card;
  marker.style.left =
    Math.max(2, Math.min(listRect.width - 2, boundaryX - listRect.left)) + "px";
  marker.style.top = row.top - listRect.top - 2 + "px";
  marker.style.height = row.bottom - row.top + 4 + "px";
  return before;
}
document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || drag) return;
  const create = event.target.closest("#create");
  const cardEl = event.target.closest(".card");
  if (
    !create &&
    (!cardEl ||
      event.target.closest("button,select") ||
      (event.target.isContentEditable &&
        document.activeElement === event.target))
  )
    return;
  const card = create
    ? {
        id: uid(),
        title: "",
        category: "",
        description: "",
        color: "soul",
        priority: false,
        expanded: false,
      }
    : findCard(cardEl.dataset.card).card;
  drag = {
    id: event.pointerId,
    card,
    create: !!create,
    source: cardEl,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    rotation: 0,
    active: false,
  };
});
document.addEventListener(
  "pointermove",
  (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6
    )
      return;
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      document.activeElement?.blur();
      window.getSelection()?.removeAllRanges();
      drag.ghost = renderCard(drag.card);
      drag.ghost.classList.add("drag-ghost");
      drag.ghost.setAttribute("aria-hidden", "true");
      drag.ghost.inert = true;
      document.body.append(drag.ghost);
      drag.ghost.animate(
        [
          { opacity: 0.8, boxShadow: "0 0 0 #0000" },
          { opacity: 1, boxShadow: "0 12px 25px #0003" },
        ],
        { duration: 180, fill: "forwards" },
      );
      drag.source?.classList.add("dragging-source");
      document.body.classList.add("is-dragging");
    }
    const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
    const horizontalSpeed = (event.clientX - drag.lastX) / elapsed;
    const targetRotation = Math.max(-14, Math.min(14, horizontalSpeed * 12));
    drag.rotation += (targetRotation - drag.rotation) * 0.45;
    drag.ghost.style.setProperty("--drag-rotation", `${drag.rotation}deg`);
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    drag.ghost.style.left = event.clientX - 90 + "px";
    drag.ghost.style.top = event.clientY - 20 + "px";
    marker.remove();
    document
      .querySelectorAll(".drop-target")
      .forEach((el) => el.classList.remove("drop-target"));
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const destroy = hit?.closest("#destroy");
    const section = hit?.closest(".column");
    drag.target = null;
    if (destroy) {
      destroy.classList.add("drop-target");
      drag.target = { destroy: true };
    } else if (section) {
      const priority = !!hit.closest(".priority");
      const list = section.querySelector(
        `[data-list="${priority ? "priority" : "regular"}"]`,
      );
      const before = placeDropMarker(
        list,
        event.clientX,
        event.clientY,
        drag.card.id,
      );
      section.classList.add("drop-target");
      drag.target = {
        column: section.dataset.column,
        priority,
        before: before?.dataset.card,
      };
      const rect = $("#board").getBoundingClientRect();
      if (event.clientX > rect.right - 35) $("#board").scrollLeft += 12;
      if (event.clientX < rect.left + 35) $("#board").scrollLeft -= 12;
    }
    if (event.clientY > innerHeight - 45) window.scrollBy(0, 10);
    if (event.clientY < 45) window.scrollBy(0, -10);
  },
  { passive: false },
);
function finishDrag(cancel = false) {
  if (!drag) return;
  const current = drag;
  drag = null;
  current.ghost?.remove();
  marker.remove();
  current.source?.classList.remove("dragging-source");
  document.body.classList.remove("is-dragging");
  document
    .querySelectorAll(".drop-target")
    .forEach((el) => el.classList.remove("drop-target"));
  if (!current.active) return;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  if (!cancel && current.target) {
    const old = findCard(current.card.id);
    if (old) old.column.cards.splice(old.column.cards.indexOf(old.card), 1);
    if (!current.target.destroy) {
      if (current.create) resetFilters();
      const column = board.columns.find(
        (item) => item.id === current.target.column,
      );
      current.card.priority = current.target.priority;
      column.collapsed = false;
      if (current.card.priority) column.priorityOpen = true;
      const index = column.cards.findIndex(
        (item) => item.id === current.target.before,
      );
      column.cards.splice(
        index < 0 ? column.cards.length : index,
        0,
        current.card,
      );
    }
    persist();
    render();
    announce(
      current.target.destroy
        ? "Card destroyed."
        : current.create
          ? "Card created. Click any field to edit."
          : "Card moved.",
    );
  }
}
document.addEventListener("pointerup", () => finishDrag());
document.addEventListener("pointercancel", () => finishDrag(true));
window.addEventListener("blur", () => {
  finishDrag(true);
  cancelBoardDestruction();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") finishDrag(true);
});
document.addEventListener(
  "click",
  (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);
$("#create").addEventListener("click", () => {
  resetFilters();
  const column =
    board.columns.find((item) => !item.collapsed) || board.columns[0];
  const card = {
    id: uid(),
    category: "",
    title: "",
    description: "",
    color: "soul",
    priority: false,
    expanded: false,
  };
  column.cards.push(card);
  column.collapsed = false;
  persist();
  render();
  document.querySelector(`[data-card="${card.id}"] .text-card-title`).focus();
});

const boardFileInput = $("#board-file-input");
$("#import-board").addEventListener("click", () => {
  boardFileInput.value = "";
  boardFileInput.click();
});
boardFileInput.addEventListener("change", async () => {
  const file = boardFileInput.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("That board file is too large.");
    const imported = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (!validBoard(imported))
      throw new Error("That file is not a valid JIAYOU board.");
    if (!confirm("Import this board and replace the current board?")) return;
    board = imported;
    resetFilters();
    persist();
    render();
    announce("Board imported.");
  } catch (error) {
    announce(error.message || "The board could not be imported.");
  } finally {
    boardFileInput.value = "";
  }
});
$("#download-board").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(board, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = node("a");
  link.href = url;
  link.download = `jiayou-board-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  announce("Board downloaded.");
});

const DESTROY_HOLD_MS = 3000;
const BOARD_CLEAR_FADE_MS = 360;
const destroyButton = $("#destroy");
const destroyStatus = $("#destroy-status");
let destroyHold = null;
let boardClearTimer = null;
let suppressDestroyClick = false;

function boardHasCards() {
  return board.columns.some((column) => column.cards.length);
}
function resetDestroyInterface() {
  document.body.classList.remove("is-destroying-board");
  destroyButton.classList.remove("is-holding");
  destroyStatus.textContent = "DRAG TO...";
  $("#board").inert = false;
  $("#board").removeAttribute("aria-busy");
}
function updateDestroyCountdown() {
  if (!destroyHold || destroyHold.completed) return;
  const remaining = Math.max(
    1,
    Math.ceil(
      (DESTROY_HOLD_MS - (performance.now() - destroyHold.startedAt)) / 1000,
    ),
  );
  if (remaining === destroyHold.remaining) return;
  destroyHold.remaining = remaining;
  destroyStatus.textContent = `Destroying board in ${remaining}…`;
}
function completeBoardDestruction() {
  if (!destroyHold || destroyHold.completed) return;
  destroyHold.completed = true;
  clearInterval(destroyHold.countdownTimer);
  clearTimeout(destroyHold.completionTimer);
  document.body.classList.remove("is-destroying-board");
  document.body.classList.add("is-clearing-board");
  destroyButton.classList.remove("is-holding");
  destroyStatus.textContent = "Board cleared";
  board.columns.forEach((column) => column.cards.splice(0));
  persist();
  const fadeTime = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : BOARD_CLEAR_FADE_MS;
  boardClearTimer = setTimeout(() => {
    boardClearTimer = null;
    document.body.classList.remove("is-clearing-board");
    render();
    resetDestroyInterface();
    announce("Board cleared.");
  }, fadeTime);
}
function startBoardDestruction(input) {
  if (destroyHold || boardClearTimer || drag || !boardHasCards()) return false;
  closeColorPalette();
  destroyHold = {
    ...input,
    startedAt: performance.now(),
    remaining: 0,
    completed: false,
    countdownTimer: null,
    completionTimer: null,
  };
  const boardElement = $("#board");
  boardElement.inert = true;
  boardElement.setAttribute("aria-busy", "true");
  document.body.classList.add("is-destroying-board");
  destroyButton.classList.add("is-holding");
  updateDestroyCountdown();
  destroyHold.countdownTimer = setInterval(updateDestroyCountdown, 100);
  destroyHold.completionTimer = setTimeout(
    completeBoardDestruction,
    DESTROY_HOLD_MS,
  );
  return true;
}
function cancelBoardDestruction() {
  if (!destroyHold) return false;
  const completed = destroyHold.completed;
  clearInterval(destroyHold.countdownTimer);
  clearTimeout(destroyHold.completionTimer);
  destroyHold = null;
  if (!completed) resetDestroyInterface();
  return completed;
}

destroyButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (!startBoardDestruction({ pointerId: event.pointerId })) return;
  destroyButton.setPointerCapture(event.pointerId);
});
destroyButton.addEventListener("pointerup", (event) => {
  if (destroyHold?.pointerId !== event.pointerId) return;
  suppressDestroyClick = cancelBoardDestruction();
});
destroyButton.addEventListener("pointercancel", (event) => {
  if (destroyHold?.pointerId === event.pointerId) cancelBoardDestruction();
});
destroyButton.addEventListener("lostpointercapture", (event) => {
  if (destroyHold?.pointerId === event.pointerId) cancelBoardDestruction();
});
destroyButton.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.repeat) return;
  if (startBoardDestruction({ key: event.key })) event.preventDefault();
});
destroyButton.addEventListener("keyup", (event) => {
  if (!destroyHold?.key || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const completed = cancelBoardDestruction();
  if (!completed)
    announce("Keep holding Destroy for 3 seconds to clear the board.");
});
destroyButton.addEventListener("click", (event) => {
  if (suppressDestroyClick) {
    suppressDestroyClick = false;
    event.preventDefault();
    return;
  }
  announce(
    boardHasCards()
      ? "Drag a card here to delete it, or hold for 3 seconds to clear the board."
      : "The board is already empty.",
  );
});

function saveLabel(text, disabled) {
  $("#save").textContent = text;
  $("#save").disabled = disabled;
}
function clearAuth() {
  drive.ready = false;
  drive.token = "";
  drive.fileId = "";
  try {
    sessionStorage.removeItem("jiayou.oauth.token");
  } catch {
    /* Storage may be restricted. */
  }
}
function driveError(error) {
  saveLabel(error.status === 401 ? "Save to Drive" : "Retry Drive save", false);
  if (error.status === 401) clearAuth();
  announce(
    "Drive could not save. Your board is kept on this device. " + error.message,
  );
}
async function driveRequest(path, options = {}) {
  if (!drive.token || Date.now() >= drive.expires)
    throw Object.assign(new Error("Please reconnect Google Drive."), {
      status: 401,
    });
  const response = await fetch("https://www.googleapis.com/" + path, {
    ...options,
    headers: { Authorization: "Bearer " + drive.token, ...options.headers },
  });
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Please reconnect Google Drive."
          : `Google returned ${response.status}. Try again.`,
      ),
      { status: response.status },
    );
  return response.status === 204 ? null : response.json();
}
async function connectDrive() {
  saveLabel("Saving…", true);
  try {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "name = 'jiayou-board.json' and trashed = false",
      fields: "files(id)",
      orderBy: "modifiedTime desc",
      pageSize: "1",
    });
    const result = await driveRequest("drive/v3/files?" + params);
    drive.fileId = result.files[0]?.id || "";
    if (drive.fileId) {
      const remote = await driveRequest(
        `drive/v3/files/${encodeURIComponent(drive.fileId)}?alt=media`,
      );
      if (!validBoard(remote))
        throw new Error("The Drive board has an unsupported format.");
      if (remote.updatedAt > board.updatedAt) {
        board = remote;
        persist(false);
        render();
      }
    }
    drive.ready = true;
    drive.pending = true;
    await flushDrive();
  } catch (error) {
    driveError(error);
  }
}
async function flushDrive() {
  if (drive.busy || !drive.ready) return;
  drive.busy = true;
  try {
    while (drive.pending) {
      drive.pending = false;
      saveLabel("Saving…", true);
      const body = JSON.stringify(board);
      if (drive.fileId) {
        await driveRequest(
          `upload/drive/v3/files/${encodeURIComponent(drive.fileId)}?uploadType=media`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );
      } else {
        const boundary = "jiayou_" + uid();
        const metadata = JSON.stringify({
          name: "jiayou-board.json",
          parents: ["appDataFolder"],
          mimeType: "application/json",
        });
        const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const result = await driveRequest(
          "upload/drive/v3/files?uploadType=multipart&fields=id",
          {
            method: "POST",
            headers: {
              "Content-Type": "multipart/related; boundary=" + boundary,
            },
            body: multipart,
          },
        );
        drive.fileId = result.id;
      }
    }
    saveLabel("Autosaved", true);
  } catch (error) {
    drive.pending = true;
    driveError(error);
  } finally {
    drive.busy = false;
  }
}
$("#save").addEventListener("click", () => {
  if (drive.ready) {
    drive.pending = true;
    flushDrive();
    return;
  }
  if (drive.token && Date.now() < drive.expires) {
    connectDrive();
    return;
  }
  const config = window.JIAYOU_CONFIG;
  if (!config?.googleClientId) {
    $("#setup").showModal();
    return;
  }
  try {
    const state = uid() + uid();
    sessionStorage.setItem("jiayou.oauth.state", state);
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.redirectUri || location.origin + location.pathname,
      response_type: "token",
      scope: "https://www.googleapis.com/auth/drive.appdata",
      state,
      include_granted_scopes: "true",
    });
    location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + params);
  } catch {
    announce("Sign-in needs session storage enabled in your browser.");
  }
});
function restoreAuth() {
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("access_token") || fragment.has("error")) {
      const expected = sessionStorage.getItem("jiayou.oauth.state");
      sessionStorage.removeItem("jiayou.oauth.state");
      history.replaceState(null, "", location.pathname + location.search);
      if (!expected || fragment.get("state") !== expected)
        throw new Error("Sign-in could not be verified. Please try again.");
      if (fragment.has("error"))
        throw new Error("Google sign-in was cancelled or denied.");
      const seconds = Number(fragment.get("expires_in"));
      if (!(seconds > 0) || !fragment.get("access_token"))
        throw new Error("Google returned an invalid session.");
      sessionStorage.setItem(
        "jiayou.oauth.token",
        JSON.stringify({
          token: fragment.get("access_token"),
          expires: Date.now() + seconds * 1000 - 30000,
        }),
      );
    }
    const saved = JSON.parse(sessionStorage.getItem("jiayou.oauth.token"));
    if (saved?.token && saved.expires > Date.now()) {
      drive.token = saved.token;
      drive.expires = saved.expires;
      connectDrive();
    }
  } catch (error) {
    clearAuth();
    announce(error.message || "Could not restore Google session.");
  }
}
window.addEventListener("online", () => {
  if (drive.ready) {
    drive.pending = true;
    flushDrive();
  }
});
function setRandomTagline() {
  const tagline = document.querySelector("#tagline");
  tagline.classList.remove("refreshing");
  void tagline.offsetWidth;
  tagline.textContent = SUBHEADERS[Math.floor(Math.random() * SUBHEADERS.length)];
  tagline.classList.add("refreshing");
}

render();
persist(false);
restoreAuth();
setRandomTagline();

document.querySelector("#tagline").addEventListener("click", setRandomTagline);
