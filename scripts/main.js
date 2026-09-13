"use strict";

// Application startup and tagline behavior.
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
