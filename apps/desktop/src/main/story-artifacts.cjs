function clean(value) {
  return String(value || "").trim();
}

function formatSceneBreakdown(scenes) {
  return (scenes || []).map((scene, index) => {
    const heading = `SC${String(index + 1).padStart(2, "0")} · ${clean(scene.title) || `Scene ${index + 1}`}`;
    const situation = clean(scene.summary);
    const dramaticLine = [
      clean(scene.objective) && `Mục tiêu: ${clean(scene.objective)}`,
      clean(scene.conflict) && `Trở lực: ${clean(scene.conflict)}`,
      clean(scene.dramaticTurn) && `Bước ngoặt: ${clean(scene.dramaticTurn)}`
    ].filter(Boolean).join(" · ");
    const stateLine = clean(scene.entryState) || clean(scene.exitState)
      ? `Chuyển trạng thái: ${clean(scene.entryState) || "—"} → ${clean(scene.exitState) || "—"}`
      : "";
    return [heading, situation, dramaticLine, stateLine].filter(Boolean).join("\n");
  }).join("\n\n");
}

function storyWordRange(targetDurationSec) {
  const seconds = Math.max(15, Number(targetDurationSec || 60));
  const target = Math.min(420, Math.max(120, Math.round(seconds)));
  return {
    minimum: Math.max(90, Math.round(target * 0.75)),
    target,
    maximum: Math.round(target * 1.3)
  };
}

module.exports = { formatSceneBreakdown, storyWordRange };
