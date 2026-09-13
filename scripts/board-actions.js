"use strict";

// Card creation, board import/export, and board clearing.
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
  setDriveLoading(true, "Importing board…");
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
    setDriveLoading(false);
  }
});
$("#download-board").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(board, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = node("a");
  link.href = url;
  const baseName = (drive.fileName || "jiayou-board")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .toLowerCase() || "jiayou-board";
  link.download = `${baseName}-${new Date().toISOString().slice(0, 10)}.json`;
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

