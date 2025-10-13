window.addEventListener("pageswap", async (e) => {
  console.log("swap", e);
  if (!e.viewTransition) return;
});

// NEW PAGE LOGIC
window.addEventListener("pagereveal", async (e) => {
  console.log("reveal", e);
  if (!e.viewTransition) return;
});
