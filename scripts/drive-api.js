"use strict";

// Google Drive request and file primitives.
function saveLabel(text, disabled) {
  $("#save").textContent = text;
  $("#save").disabled = disabled;
}
function setDriveLoading(loading, text = "Loading board…") {
  document.body.classList.toggle("drive-loading", loading);
  $("#board").inert = loading;
  $(".toolbar").inert = loading;
  $(".board-actions").inert = loading;
  $("#board-manager").inert = loading;
  if (loading) {
    $("#board-loading-text").textContent = text;
    $("#board-loading").hidden = false;
  } else {
    $("#board-loading").hidden = true;
  }
  if (loading) $("#board").setAttribute("aria-busy", "true");
  else $("#board").removeAttribute("aria-busy");
}
function clearAuth(forget = false) {
  clearTimeout(drive.timer);
  drive.ready = false;
  drive.token = "";
  drive.expires = 0;
  drive.fileId = "";
  drive.fileName = "";
  drive.boards = [];
  drive.pending = false;
  drive.operating = false;
  try {
    sessionStorage.removeItem(OAUTH_TOKEN_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(OAUTH_MODE_KEY);
    if (forget) {
      sessionStorage.removeItem(OAUTH_SILENT_ATTEMPT_KEY);
      localStorage.removeItem(DRIVE_REMEMBERED_KEY);
      localStorage.removeItem(DRIVE_CONTEXT_KEY);
      cachedDriveContext = null;
    }
  } catch {
    /* Storage may be restricted. */
  }
  renderDriveBoards();
  setDriveLoading(false);
}
function driveError(error, action = "save") {
  saveLabel(error.status === 401 ? "Save to Drive" : "Retry Drive save", false);
  if (error.status === 401) clearAuth(false);
  announce(
    `Drive could not ${action}. Your board is kept on this device. ${error.message}`,
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
function boardNameFromFile(file) {
  if (file.name === LEGACY_DRIVE_FILE) return "My Board";
  if (file.name?.endsWith(DRIVE_FILE_SUFFIX))
    return file.name.slice(0, -DRIVE_FILE_SUFFIX.length);
  return file.name || "Untitled Board";
}
function driveFileName(name) {
  return name + DRIVE_FILE_SUFFIX;
}
function sortDriveBoards(items = drive.boards) {
  return [...items].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
function activeDriveBoard() {
  return drive.boards.find((item) => item.id === drive.fileId);
}
function renderDriveBoards() {
  const manager = $("#board-manager");
  $("#drive-connection-status").hidden = !drive.ready;
  manager.hidden = !drive.ready;
  if (!drive.ready) return;
  const disabled = drive.operating || !!drive.flushPromise;
  const select = $("#board-select");
  select.replaceChildren(
    ...sortDriveBoards().map((item) => {
      const option = node("option", "", item.name);
      option.value = item.id;
      return option;
    }),
  );
  select.value = drive.fileId;
  select.disabled = disabled;
  $("#new-board").disabled = disabled;
  $("#manage-board").disabled = disabled || !drive.fileId;
  $("#manage-board-name").textContent = drive.fileName || "Current board";
  $("#delete-board").disabled = disabled || drive.boards.length <= 1;
}
function rememberActiveBoard(item) {
  drive.fileId = item.id;
  drive.fileName = item.name;
  cachedDriveContext = { fileId: item.id, name: item.name };
  try {
    localStorage.setItem(DRIVE_CONTEXT_KEY, JSON.stringify(cachedDriveContext));
  } catch {
    storageAvailable = false;
  }
}
function normalizeDriveFile(file) {
  return {
    id: file.id,
    name: boardNameFromFile(file),
    modifiedTime: file.modifiedTime || "",
    legacy: file.name === LEGACY_DRIVE_FILE,
  };
}
async function listDriveBoards() {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "trashed = false",
      fields: "nextPageToken,files(id,name,modifiedTime,appProperties)",
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveRequest("drive/v3/files?" + params);
    files.push(
      ...(result.files || []).filter(
        (file) =>
          file.id &&
          (file.name === LEGACY_DRIVE_FILE ||
            file.appProperties?.jiayouType === "board"),
      ),
    );
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return files.map(normalizeDriveFile);
}
function uniqueBoardName(base, excludeId = "") {
  let candidate = base.trim() || "My Board";
  let suffix = 2;
  const exists = (name) =>
    drive.boards.some(
      (item) =>
        item.id !== excludeId &&
        item.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
    );
  while (exists(candidate)) candidate = `${base.trim() || "My Board"} ${suffix++}`;
  return candidate;
}
async function createDriveBoard(name, contents) {
  const boundary = "jiayou_" + uid();
  const metadataObject = {
    name: driveFileName(name),
    parents: ["appDataFolder"],
    mimeType: "application/json",
    appProperties: { jiayouType: "board", jiayouSchema: "1" },
  };
  const metadata = JSON.stringify(metadataObject);
  const body = JSON.stringify(contents);
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const result = await driveRequest(
    "upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,appProperties",
    {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipart,
    },
  );
  return normalizeDriveFile({
    id: result.id,
    name: result.name || metadataObject.name,
    modifiedTime: result.modifiedTime || new Date().toISOString(),
    appProperties: result.appProperties || metadataObject.appProperties,
  });
}
async function updateDriveBoard(fileId, contents) {
  await driveRequest(
    `upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contents),
    },
  );
}
async function downloadDriveBoard(item) {
  const remote = await driveRequest(
    `drive/v3/files/${encodeURIComponent(item.id)}?alt=media`,
  );
  if (!validBoard(remote))
    throw new Error(`${item.name} has an unsupported board format.`);
  return remote;
}
async function migrateLegacyBoard(item) {
  if (!item.legacy) return item;
  const name = uniqueBoardName("My Board", item.id);
  const metadata = {
    name: driveFileName(name),
    appProperties: { jiayouType: "board", jiayouSchema: "1" },
  };
  const result = await driveRequest(
    `drive/v3/files/${encodeURIComponent(item.id)}?fields=id,name,modifiedTime,appProperties`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    },
  );
  return normalizeDriveFile({
    id: item.id,
    name: result.name || metadata.name,
    modifiedTime: result.modifiedTime || item.modifiedTime,
    appProperties: result.appProperties || metadata.appProperties,
  });
}

