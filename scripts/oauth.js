"use strict";

// Google OAuth connection and session restoration.
function oauthUrl(silent, state) {
  const config = window.JIAYOU_CONFIG;
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.redirectUri || location.origin + location.pathname,
    response_type: "token",
    scope: "https://www.googleapis.com/auth/drive.appdata",
    state,
    include_granted_scopes: "true",
  });
  if (silent) params.set("prompt", "none");
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params;
}
function startOAuth(silent = false) {
  const config = window.JIAYOU_CONFIG;
  if (!config?.googleClientId) {
    if (!silent) openDialog($("#setup"));
    else {
      try {
        localStorage.removeItem(DRIVE_REMEMBERED_KEY);
      } catch {
        /* Storage may be restricted. */
      }
      setDriveLoading(false);
    }
    return false;
  }
  setDriveLoading(true, "Connecting to Drive…");
  try {
    const state = uid() + uid();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(OAUTH_MODE_KEY, silent ? "silent" : "interactive");
    location.assign(oauthUrl(silent, state));
    return true;
  } catch {
    setDriveLoading(false);
    announce("Sign-in needs browser storage enabled.");
    return false;
  }
}
$("#save").addEventListener("click", () => {
  if (drive.ready) {
    drive.pending = true;
    flushDrive(true);
    return;
  }
  if (drive.token && Date.now() < drive.expires) {
    connectDrive();
    return;
  }
  try {
    sessionStorage.removeItem(OAUTH_SILENT_ATTEMPT_KEY);
    startOAuth(false);
  } catch {
    announce("Sign-in needs session storage enabled in your browser.");
  }
});
function restoreAuth() {
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("access_token") || fragment.has("error")) {
      const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
      const mode = sessionStorage.getItem(OAUTH_MODE_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_MODE_KEY);
      history.replaceState(null, "", location.pathname + location.search);
      if (!expected || fragment.get("state") !== expected)
        throw new Error("Sign-in could not be verified. Please try again.");
      if (fragment.has("error") && mode === "silent") {
        localStorage.removeItem(DRIVE_REMEMBERED_KEY);
        sessionStorage.removeItem(OAUTH_SILENT_ATTEMPT_KEY);
        clearAuth(false);
        saveLabel("Save to Drive", false);
        announce("Your Google session ended. Connect Drive to sign in again.");
        showDriveDisconnectedDialog();
        return;
      }
      if (fragment.has("error"))
        throw new Error("Google sign-in was cancelled or denied.");
      const seconds = Number(fragment.get("expires_in"));
      if (!(seconds > 0) || !fragment.get("access_token"))
        throw new Error("Google returned an invalid session.");
      sessionStorage.setItem(
        OAUTH_TOKEN_KEY,
        JSON.stringify({
          token: fragment.get("access_token"),
          expires: Date.now() + seconds * 1000 - 30000,
        }),
      );
      sessionStorage.removeItem(OAUTH_SILENT_ATTEMPT_KEY);
      localStorage.setItem(DRIVE_REMEMBERED_KEY, "1");
    }
    const saved = JSON.parse(sessionStorage.getItem(OAUTH_TOKEN_KEY));
    if (saved?.token && saved.expires > Date.now()) {
      drive.token = saved.token;
      drive.expires = saved.expires;
      connectDrive();
      return;
    }
    if (
      navigator.onLine &&
      localStorage.getItem(DRIVE_REMEMBERED_KEY) === "1" &&
      !sessionStorage.getItem(OAUTH_SILENT_ATTEMPT_KEY)
    ) {
      sessionStorage.setItem(OAUTH_SILENT_ATTEMPT_KEY, "1");
      setDriveLoading(true);
      saveLabel("Connecting…", true);
      startOAuth(true);
    }
  } catch (error) {
    clearAuth(false);
    announce(error.message || "Could not restore Google session.");
  }
}
window.addEventListener("online", () => {
  if (drive.ready) {
    drive.pending = true;
    flushDrive();
  } else {
    restoreAuth();
  }
});
