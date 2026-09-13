"use strict";

// Pointer and keyboard card movement.
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
