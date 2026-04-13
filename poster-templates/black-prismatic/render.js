function setText(role, text) {
  const node = document.querySelector(`[data-role="${role}"]`);
  if (!node) return;
  node.textContent = text || "";
}

function setImage(role, src) {
  const node = document.querySelector(`[data-role="${role}"]`);
  if (!node || !src) return Promise.resolve();
  return new Promise((resolve) => {
    node.onload = () => resolve();
    node.onerror = () => resolve();
    node.src = src;
    if (node.complete) resolve();
  });
}

window.renderPoster = async function renderPoster(data) {
  setText("headline-kicker", data.kicker);
  setText("headline-title", data.title);
  setText("headline-subtitle", data.subtitle);
  setText("point-1", data.points?.[0] || "");
  setText("point-2", data.points?.[1] || "");
  setText("point-3", data.points?.[2] || "");
  setText("point-4", data.points?.[3] || "");

  await Promise.all([
    setImage("base-image", data.baseImageUrl),
    setImage("logo-image", data.logoImageUrl)
  ]);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  return true;
};
