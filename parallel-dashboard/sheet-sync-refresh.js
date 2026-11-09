(() => {
  const minAwayMs = 45_000;
  let hiddenAt = 0;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= minAwayMs) {
      window.location.reload();
    }
    hiddenAt = 0;
  });
})();
