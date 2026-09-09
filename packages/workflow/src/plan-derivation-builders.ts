type PlanContext = {
  projectId: string;
  beats: string[];
  sceneCount: number;
  vietnamese: boolean;
  shotCount: number;
  plannedDurations: number[];
  preferredDurationSec: number;
};

export function buildPlannedScenes(context: PlanContext) {
  return context.beats.map((beat, index) => ({
    // Plan entities are persisted across projects; scope their identity to the
    // owning project so SQLite projection cannot overwrite another project's
    // scene with the same ordinal.
    id: `scene_plan_${context.projectId}_${index + 1}`,
    projectId: context.projectId,
    // Give locally planned scenes the same durable screenplay handoff used by
    // provider-generated architecture. Without this identity the next
    // screenplay stage has no target and the action can only stop silently.
    screenplaySceneId: `screenplay_scene_${context.projectId}_${index + 1}`,
    title: index === 0
      ? (context.vietnamese ? "Mở đầu" : "Opening Hook")
      : index === context.sceneCount - 1
        ? (context.vietnamese ? "Kết quả" : "Payoff Beat")
        : (context.vietnamese ? `Diễn tiến ${index}` : `Progression Beat ${index}`),
    summary: beat,
    location: index === 0
      ? (context.vietnamese ? "Bối cảnh mở đầu" : "Establishing location")
      : (context.vietnamese ? "Chi tiết trong cùng bối cảnh" : "Focused set detail"),
    timeOfDay: index === 0 ? (context.vietnamese ? "Chạng vạng" : "Dusk") : (context.vietnamese ? "Liên tục" : "Continuous"),
    emotionalTone: index === 0
      ? (context.vietnamese ? "Tò mò" : "Intrigue")
      : index === 1
        ? (context.vietnamese ? "Căng thẳng" : "Suspense")
        : (context.vietnamese ? "Khám phá" : "Discovery"),
    order: index + 1
  }));
}

export function buildPlannedShots(context: PlanContext, scenes: Array<{ id: string; summary: string }>) {
  let remainingShots = context.shotCount;
  let durationIndex = 0;
  return scenes.flatMap((scene, sceneIndex) => {
    const remainingScenes = scenes.length - sceneIndex;
    const sceneShotCount = Math.ceil(remainingShots / remainingScenes);
    remainingShots -= sceneShotCount;
    return Array.from({ length: sceneShotCount }, (_, shotIndex) => {
      const firstShot = shotIndex === 0;
      const description = firstShot
        ? `${scene.summary} ${context.vietnamese ? "Giữ hành động rõ ràng trong một keyframe duy nhất." : "Keep the action readable as a single storybook keyframe."}`
        : (context.vietnamese
          ? "Phản ứng hoặc chi tiết ngắn, giữ nguyên nhân vật, trang phục, bối cảnh và bảng màu."
          : "A short reaction/detail shot that preserves the same character, outfit, set, and color palette.");
      return {
        id: `shot_plan_${context.projectId}_${sceneIndex + 1}_${shotIndex + 1}`,
        sceneId: scene.id,
        order: shotIndex + 1,
        description,
        camera: firstShot
          ? (context.vietnamese ? "Toàn đến trung cảnh, máy quay cố định." : "Wide-to-medium composition, locked camera.")
          : (context.vietnamese ? "Cận cảnh ngang mắt, không lia máy nhanh." : "Close detail, eye-level, no fast camera move."),
        motion: firstShot
          ? (context.vietnamese ? "Chỉ chuyển động nhẹ của môi trường hoặc đạo cụ." : "Subtle fog or prop movement only.")
          : (context.vietnamese ? "Chuyển động nhỏ của đầu, tay hoặc đạo cụ." : "Tiny head turn or object twitch, stop-motion jitter."),
        dominantAction: firstShot
          ? (context.vietnamese ? "Một chuyển động môi trường hoặc đạo cụ làm rõ beat của cảnh." : "One environmental or prop motion reveals the scene beat.")
          : (context.vietnamese ? "Một phản ứng nhỏ hoàn tất trong khung." : "One small reaction completes in frame."),
        visualTransformationCount: 1,
        transitionIn: context.vietnamese ? "Nhận nguyên trạng thái hình ảnh và cảm xúc từ shot trước." : "Inherit the exact visual and emotional state from the previous shot.",
        transitionOut: context.vietnamese ? "Kết trên một trạng thái rõ để shot sau tiếp nhận." : "End on one explicit state for the next shot to inherit.",
        screenDirection: context.vietnamese ? "Giữ nguyên vị trí trái/phải, hướng nhìn và trục 180 độ." : "Preserve left/right placement, eyeline, and the 180-degree axis.",
        continuityContract: {
          geography: context.vietnamese ? "Giữ nguyên bố cục trái/giữa/phải và trục 180 độ." : "Preserve left/center/right geography and the 180-degree axis.",
          incomingState: context.vietnamese ? "Nhận nguyên trạng thái cuối shot trước." : "Inherit the exact previous end state.",
          outgoingState: context.vietnamese ? "Bàn giao một trạng thái kết rõ ràng." : "Hand off one explicit end state.",
          entities: []
        },
        durationSec: context.plannedDurations[durationIndex++] ?? context.preferredDurationSec,
        prompt: "",
        providerId: firstShot ? "chatgpt-web" : "google-flow-web",
        status: "draft" as const,
        assetIds: []
      };
    });
  });
}
