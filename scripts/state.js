"use strict";

// Shared board model, application state, and local persistence.

const STORAGE_KEY = "jiayou.board.v1";
const DRIVE_CONTEXT_KEY = "jiayou.drive.active.v1";
const DRIVE_REMEMBERED_KEY = "jiayou.drive.remembered";
const OAUTH_TOKEN_KEY = "jiayou.oauth.token";
const OAUTH_STATE_KEY = "jiayou.oauth.state";
const OAUTH_MODE_KEY = "jiayou.oauth.mode";
const OAUTH_SILENT_ATTEMPT_KEY = "jiayou.oauth.silent-attempt";
const LEGACY_DRIVE_FILE = "jiayou-board.json";
const DRIVE_FILE_SUFFIX = ".jiayou.json";
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
let cachedDriveContext = null;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (validBoard(saved)) board = saved;
  const context = JSON.parse(localStorage.getItem(DRIVE_CONTEXT_KEY));
  if (typeof context?.fileId === "string" && typeof context?.name === "string")
    cachedDriveContext = context;
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
  fileName: "",
  boards: [],
  ready: false,
  pending: false,
  timer: null,
  flushPromise: null,
  operating: false,
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
    if (drive.fileId) {
      cachedDriveContext = { fileId: drive.fileId, name: drive.fileName };
      localStorage.setItem(
        DRIVE_CONTEXT_KEY,
        JSON.stringify(cachedDriveContext),
      );
    }
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
