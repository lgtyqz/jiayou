"use strict";

// Shared modal animation and dismissal behavior.
const DIALOG_CLOSE_MS = 140;
const dialogClosePromises = new WeakMap();

function openDialog(dialog) {
  dialog.classList.remove("closing");
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (!dialog.open) return Promise.resolve();
  const pending = dialogClosePromises.get(dialog);
  if (pending) return pending;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return Promise.resolve();
  }
  dialog.classList.add("closing");
  const promise = new Promise((resolve) => {
    setTimeout(() => {
      dialog.close();
      dialog.classList.remove("closing");
      dialogClosePromises.delete(dialog);
      resolve();
    }, DIALOG_CLOSE_MS);
  });
  dialogClosePromises.set(dialog, promise);
  return promise;
}

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => closeDialog(button.closest("dialog")));
});

function showDriveDisconnectedDialog() {
  openDialog($("#drive-disconnected-dialog"));
}
