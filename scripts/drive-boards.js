"use strict";

// Drive board loading, saving, switching, and lifecycle controls.
let conflictResolver = null;
function chooseStartupCopy(name) {
  $("#conflict-board-name").textContent = name;
  $("#conflict-dialog").showModal();
  return new Promise((resolve) => {
    conflictResolver = resolve;
  });
}
$("#conflict-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const choice = event.submitter?.value === "local" ? "local" : "drive";
  const resolve = conflictResolver;
  conflictResolver = null;
  $("#conflict-dialog").close();
  resolve?.(choice);
});
$("#conflict-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  const resolve = conflictResolver;
  conflictResolver = null;
  $("#conflict-dialog").close();
  resolve?.("drive");
});

async function connectDrive() {
  if (drive.operating) return;
  drive.operating = true;
  drive.ready = false;
  setDriveLoading(true, "Loading boards from Drive…");
  saveLabel("Loading Drive…", true);
  try {
    localStorage.setItem(DRIVE_REMEMBERED_KEY, "1");
  } catch {
    storageAvailable = false;
  }
  let connected = false;
  try {
    drive.boards = await listDriveBoards();
    let active = drive.boards.find(
      (item) => item.id === cachedDriveContext?.fileId,
    );
    if (!active)
      active = [...drive.boards].sort((a, b) =>
        (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
      )[0];

    if (!active) {
      if (!board.updatedAt) board.updatedAt = Date.now();
      active = await createDriveBoard(uniqueBoardName("My Board"), board);
      drive.boards.push(active);
      rememberActiveBoard(active);
      persist(false);
    } else {
      const localBoard = board;
      const remoteBoard = await downloadDriveBoard(active);
      const localMatches =
        cachedDriveContext?.fileId === active.id ||
        (!cachedDriveContext && active.legacy);
      const choice =
        localMatches && localBoard.updatedAt > remoteBoard.updatedAt
          ? await chooseStartupCopy(active.name)
          : "drive";
      if (active.legacy) {
        const migrated = await migrateLegacyBoard(active);
        drive.boards.splice(drive.boards.indexOf(active), 1, migrated);
        active = migrated;
      }
      rememberActiveBoard(active);
      board = choice === "local" ? localBoard : remoteBoard;
      resetFilters();
      persist(false);
      render();
      if (choice === "local") {
        drive.ready = true;
        connected = true;
        drive.pending = true;
        if (!(await flushDrive())) return;
      }
    }
    drive.ready = true;
    connected = true;
    saveLabel("Autosaved", true);
    renderDriveBoards();
  } catch (error) {
    driveError(error, "load boards");
  } finally {
    drive.operating = false;
    setDriveLoading(false);
    if (connected) renderDriveBoards();
  }
}
function flushDrive(showLoading = false) {
  if (!drive.ready) return Promise.resolve(false);
  if (drive.flushPromise) return drive.flushPromise;
  clearTimeout(drive.timer);
  if (showLoading) setDriveLoading(true, "Saving board to Drive…");
  drive.flushPromise = (async () => {
    let saved = true;
    renderDriveBoards();
    try {
      while (drive.pending) {
        drive.pending = false;
        saveLabel("Saving…", true);
        const fileId = drive.fileId;
        const snapshot = JSON.parse(JSON.stringify(board));
        await updateDriveBoard(fileId, snapshot);
        const item = drive.boards.find((candidate) => candidate.id === fileId);
        if (item) item.modifiedTime = new Date().toISOString();
      }
      saveLabel("Autosaved", true);
    } catch (error) {
      drive.pending = true;
      saved = false;
      driveError(error);
    } finally {
      drive.flushPromise = null;
      if (showLoading) setDriveLoading(false);
      renderDriveBoards();
    }
    return saved;
  })();
  return drive.flushPromise;
}
async function flushBeforeBoardOperation() {
  clearTimeout(drive.timer);
  return drive.pending || drive.flushPromise ? flushDrive() : true;
}
async function switchDriveBoard(fileId) {
  if (!drive.ready || fileId === drive.fileId || drive.operating) return;
  const previousId = drive.fileId;
  const target = drive.boards.find((item) => item.id === fileId);
  if (!target) return;
  drive.operating = true;
  setDriveLoading(true, `Loading ${target.name}…`);
  renderDriveBoards();
  try {
    if (!(await flushBeforeBoardOperation())) return;
    const remote = await downloadDriveBoard(target);
    rememberActiveBoard(target);
    board = remote;
    resetFilters();
    persist(false);
    render();
    saveLabel("Autosaved", true);
    announce(`Opened ${target.name}.`);
  } catch (error) {
    driveError(error, "open that board");
  } finally {
    drive.operating = false;
    setDriveLoading(false);
    $("#board-select").value = drive.fileId || previousId;
    renderDriveBoards();
  }
}

let nameDialogRequest = null;
function requestBoardName(mode, initialValue, excludeId = "") {
  const labels = {
    create: ["Create board", "Create"],
    rename: ["Rename board", "Rename"],
    duplicate: ["Duplicate board", "Duplicate"],
  };
  $("#board-name-title").textContent = labels[mode][0];
  $("#board-name-submit").textContent = labels[mode][1];
  $("#board-name-input").value = initialValue;
  $("#board-name-error").textContent = "";
  $("#board-name-dialog").showModal();
  $("#board-name-input").focus();
  $("#board-name-input").select();
  return new Promise((resolve) => {
    nameDialogRequest = { resolve, excludeId };
  });
}
$("#board-name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!nameDialogRequest) return;
  const name = $("#board-name-input").value.trim();
  const duplicate = drive.boards.some(
    (item) =>
      item.id !== nameDialogRequest.excludeId &&
      item.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
  );
  if (!name || name.length > 80) {
    $("#board-name-error").textContent = "Enter a name from 1 to 80 characters.";
    return;
  }
  if (duplicate) {
    $("#board-name-error").textContent = "A board with that name already exists.";
    return;
  }
  const resolve = nameDialogRequest.resolve;
  nameDialogRequest = null;
  $("#board-name-dialog").close();
  resolve(name);
});
$("#board-name-dialog").addEventListener("close", () => {
  if ($("#board-name-dialog").open || !nameDialogRequest) return;
  const resolve = nameDialogRequest.resolve;
  nameDialogRequest = null;
  resolve(null);
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

async function createNamedBoard(name, source, loadingText = "Creating board…") {
  drive.operating = true;
  setDriveLoading(true, loadingText);
  renderDriveBoards();
  try {
    if (!(await flushBeforeBoardOperation())) return false;
    const item = await createDriveBoard(name, source);
    drive.boards.push(item);
    rememberActiveBoard(item);
    board = source;
    resetFilters();
    persist(false);
    render();
    saveLabel("Autosaved", true);
    announce(`Created ${name}.`);
    return true;
  } catch (error) {
    driveError(error, "create the board");
    return false;
  } finally {
    drive.operating = false;
    setDriveLoading(false);
    renderDriveBoards();
  }
}
$("#board-select").addEventListener("change", (event) =>
  switchDriveBoard(event.target.value),
);
$("#new-board").addEventListener("click", async () => {
  const name = await requestBoardName("create", uniqueBoardName("New Board"));
  if (!name) return;
  const created = initialBoard();
  created.updatedAt = Date.now();
  await createNamedBoard(name, created, "Creating board…");
});
const MANAGE_DIALOG_CLOSE_MS = 140;
let manageDialogClosePromise = null;
function openManageDialog() {
  const dialog = $("#manage-dialog");
  dialog.classList.remove("closing");
  renderDriveBoards();
  dialog.showModal();
}
function closeManageDialog() {
  const dialog = $("#manage-dialog");
  if (!dialog.open) return Promise.resolve();
  if (manageDialogClosePromise) return manageDialogClosePromise;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return Promise.resolve();
  }
  dialog.classList.add("closing");
  manageDialogClosePromise = new Promise((resolve) => {
    setTimeout(() => {
      dialog.close();
      dialog.classList.remove("closing");
      manageDialogClosePromise = null;
      resolve();
    }, MANAGE_DIALOG_CLOSE_MS);
  });
  return manageDialogClosePromise;
}
$("#manage-board").addEventListener("click", openManageDialog);
$("#close-manage-dialog").addEventListener("click", closeManageDialog);
$("#manage-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeManageDialog();
});
$("#rename-board").addEventListener("click", async () => {
  await closeManageDialog();
  const current = activeDriveBoard();
  if (!current) return;
  const name = await requestBoardName("rename", current.name, current.id);
  if (!name || name === current.name) return;
  drive.operating = true;
  setDriveLoading(true, "Renaming board…");
  renderDriveBoards();
  try {
    if (!(await flushBeforeBoardOperation())) return;
    const metadata = {
      name: driveFileName(name),
      appProperties: { jiayouType: "board", jiayouSchema: "1" },
    };
    await driveRequest(
      `drive/v3/files/${encodeURIComponent(current.id)}?fields=id,name,modifiedTime,appProperties`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      },
    );
    current.name = name;
    current.legacy = false;
    rememberActiveBoard(current);
    persist(false);
    announce(`Renamed the board to ${name}.`);
  } catch (error) {
    driveError(error, "rename the board");
  } finally {
    drive.operating = false;
    setDriveLoading(false);
    renderDriveBoards();
  }
});
$("#duplicate-board").addEventListener("click", async () => {
  await closeManageDialog();
  const current = activeDriveBoard();
  if (!current) return;
  const suggested = uniqueBoardName(`${current.name} copy`);
  const name = await requestBoardName("duplicate", suggested);
  if (!name) return;
  const copy = JSON.parse(JSON.stringify(board));
  copy.columns.forEach((column) =>
    column.cards.forEach((card) => {
      card.id = uid();
    }),
  );
  copy.updatedAt = Date.now();
  await createNamedBoard(name, copy, "Duplicating board…");
});
$("#delete-board").addEventListener("click", async () => {
  if (drive.boards.length <= 1) return;
  await closeManageDialog();
  $("#delete-board-message").textContent = `Delete ${drive.fileName}?`;
  $("#delete-board-dialog").showModal();
});
$("#delete-board-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#delete-board-dialog").close();
  if (drive.boards.length <= 1 || drive.operating) return;
  const current = activeDriveBoard();
  const sorted = sortDriveBoards();
  const index = sorted.findIndex((item) => item.id === current.id);
  const next = sorted[index + 1] || sorted[index - 1];
  drive.operating = true;
  setDriveLoading(true, "Deleting board…");
  renderDriveBoards();
  try {
    if (!(await flushBeforeBoardOperation())) return;
    const nextBoard = await downloadDriveBoard(next);
    await driveRequest(`drive/v3/files/${encodeURIComponent(current.id)}`, {
      method: "DELETE",
    });
    drive.boards = drive.boards.filter((item) => item.id !== current.id);
    rememberActiveBoard(next);
    board = nextBoard;
    resetFilters();
    persist(false);
    render();
    saveLabel("Autosaved", true);
    announce(`Deleted ${current.name}.`);
  } catch (error) {
    driveError(error, "delete the board");
  } finally {
    drive.operating = false;
    setDriveLoading(false);
    renderDriveBoards();
  }
});
$("#disconnect-drive").addEventListener("click", async () => {
  await closeManageDialog();
  drive.operating = true;
  setDriveLoading(true, "Disconnecting Drive…");
  renderDriveBoards();
  if (!(await flushBeforeBoardOperation())) {
    drive.operating = false;
    setDriveLoading(false);
    renderDriveBoards();
    return;
  }
  clearAuth(true);
  persist(false);
  saveLabel("Save to Drive", false);
  announce("Google Drive disconnected. This board is still saved on this device.");
});

