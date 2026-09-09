const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const projectRoot = path.resolve(__dirname, "../../../..");

const copyPromise = import(pathToFileURL(path.resolve(__dirname, "../core/shot-copy.ts")));

test("shot narrative separates action and dialogue for human editing", async () => {
  const { shotTimelineNotes, parseShotTimelineNotes } = await copyPromise;
  const narrative = shotTimelineNotes({
    id: "shot_1", order: 1, durationSec: 4, description: "Mai đứng cạnh bàn điều khiển.",
    motion: "", camera: "medium, eye_level, lock", prompt: "", status: "planned", assetIds: [],
    actionBeats: [{ startSec: 0, endSec: 4, beatFunction: "dialogue", action: "Mai phát hiện file bị thay.", camera: "medium, eye_level, lock", dialogue: "Ai đã thay file này?", speaker: "Mai" }]
  });
  assert.match(narrative, /1\. Hành động\nMai phát hiện file bị thay\./);
  assert.match(narrative, /Lời thoại — Mai\n“Ai đã thay file này\?”/);
  const parsed = parseShotTimelineNotes(narrative);
  assert.deepEqual(parsed[0], { action: "Mai phát hiện file bị thay.", speaker: "Mai", dialogue: "Ai đã thay file này?", beatFunction: "dialogue" });
});

test("technical provider hold instruction is localized for the editor", async () => {
  const { shotTimelineNotes } = await copyPromise;
  const narrative = shotTimelineNotes({
    id: "shot_2", order: 2, durationSec: 4, description: "Mai nói tại bàn.", motion: "", camera: "medium, eye_level, lock", prompt: "", status: "planned", assetIds: [],
    actionBeats: [{ startSec: 0, endSec: 4, beatFunction: "hold", action: "Maintain the inherited physical state while the named speaker delivers the line; do not begin the dependent action.", camera: "medium, eye_level, lock", dialogue: "Chờ đã.", speaker: "Mai" }]
  });
  assert.match(narrative, /Giữ nguyên vị trí và trạng thái trong lúc nhân vật nói\./);
  assert.doesNotMatch(narrative, /Maintain the inherited/);
});

test("action-only shot cards do not add a redundant no-dialogue placeholder", async () => {
  const { shotDialogueLines } = await copyPromise;
  assert.equal(shotDialogueLines({
    id: "shot_action_only", order: 1, durationSec: 4, description: "Mai đặt hồ sơ xuống bàn.",
    motion: "Mai đặt hồ sơ xuống bàn.", camera: "medium, eye_level, lock", prompt: "", status: "planned", assetIds: []
  }), "");
});

test("flow map source contract uses readable shot direction without provider timeline jargon", () => {
  const graph = fs.readFileSync(path.resolve(__dirname, "../views/production-graph-view.tsx"), "utf8");
  assert.match(graph, /shotTimelineNotes/);
  assert.match(graph, /Góc máy: \$\{camera\}/);
  assert.match(graph, /Diễn biến\\n\$\{shotTimelineNotes\(shot\)\}/);
  assert.doesNotMatch(graph, /Nhịp theo thời gian/);
  assert.doesNotMatch(graph, /\$\{beat\.startSec\}-\$\{beat\.endSec\}s/);
  assert.match(graph, /shot\.description \|\| "Khung hình chưa có mô tả\."/);
  assert.match(graph, /const beats = sceneShots\.map\(\(shot\) => \[/);
  assert.match(graph, /shotTimelineNotes\(shot\)\n\s*\]\.?filter/);
  assert.match(graph, /text_to_image\|image_to_video/);
  assert.match(graph, /create\|generate\|rewrite this as/);
});

test("shot breakdown import keeps shots scoped to their owning project", () => {
  const pipeline = fs.readFileSync(path.resolve(projectRoot, "apps/desktop/src/main/story-pipeline/shot-breakdown.cjs"), "utf8");
  assert.match(pipeline, /id: id\("shot"\), projectId: project\.id, sceneId: scene\.id/);
});

test("character readiness treats detail sheets as optional continuity evidence", () => {
  const source = fs.readFileSync(path.resolve(projectRoot, "packages/renderer/src/studio-project-slice.tsx"), "utf8");
  assert.match(source, /const allReady = slots\.length > 0 && slots\.every\(\(slot\) => primarySlots\.has\(slot\)\)/);
  assert.match(source, /Detail sheets are optional continuity evidence/);
});

test("editable shot narrative parses multiple speakers without dropping later lines", async () => {
  const { parseShotTimelineNotes } = await copyPromise;
  const parsed = parseShotTimelineNotes([
    "1. Hành động\nMai đặt tập hồ sơ xuống bàn.\nLời thoại — Mai\n\"Ai đã thay file này?\"",
    "2. Phản ứng\nHưng quay lại, giữ khoảng cách.\nLời thoại — Hưng\n\"Tôi chỉ làm theo lệnh.\""
  ].join("\n\n"));
  assert.deepEqual(parsed.map((beat) => ({ speaker: beat.speaker, dialogue: beat.dialogue })), [
    { speaker: "Mai", dialogue: "Ai đã thay file này?" },
    { speaker: "Hưng", dialogue: "Tôi chỉ làm theo lệnh." }
  ]);
});

test("storyboard keeps one rail contract and changes the existing-video action to regenerate", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  const cards = fs.readFileSync(path.resolve(__dirname, "../views/shot-review-views.tsx"), "utf8");
  const panel = fs.readFileSync(path.resolve(__dirname, "../storyboard-shot-panel.tsx"), "utf8");
  const pipeline = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline.ts"), "utf8");
  assert.match(application, /<details className="automation-disclosure" open=\{projectBusyJobs\.length > 0 \|\| projectBlockedJobs\.length > 0 \? true : undefined\}/);
  assert.match(application, /<summary><span>Vận hành tự động<\/span><strong>\{(?:automationStatus|displayedAutomationStatus)\}<\/strong><ChevronRight/);
  assert.match(application, /bridgeCount <= 0 \? "Chưa kết nối"/);
  assert.doesNotMatch(application, /open=\{bridgeCount <= 0 \|\|/);
  assert.match(application, /const showTopbarNext = \["overview", "flow", "story"\]\.includes\(activeView\)/);
  assert.match(application, /className="rail-help automation-help"/);
  const automationStart = application.indexOf('<details className="automation-disclosure"');
  const automationMarkup = application.slice(automationStart, application.indexOf('</details>', automationStart));
  assert.doesNotMatch(automationMarkup, /<summary>[\s\S]*className="rail-help"/);
  assert.match(application, /const \{ projectBusyJobs, state \} = useStudioApplicationContext\(\);/);
  assert.doesNotMatch(application, /const currentJobs = projectBusyJobs\.length \? projectBusyJobs : projectBlockedJobs/);
  assert.doesNotMatch(application, /Flow source/);
  assert.match(application, /formatSkillPipelineStages\(selectedVideoSkill\.pipelineStages\)/);
  assert.match(cards, /formatSkillPipelineStages\(activeSkill\.pipelineStages\)/);
  assert.doesNotMatch(application, /selectedVideoSkill\.pipelineStages\.join\(" → "\)/);
  assert.doesNotMatch(cards, /activeSkill\.pipelineStages\.join\(" → "\)/);
  assert.match(cards, /formatSkillCategory\(activeSkill\.category\)/);
  assert.match(cards, /formatSkillEntitlement\(activeSkill\.entitlement\)/);
  assert.doesNotMatch(cards, /\{sections\.length\}\/\{requiredSections\.length\} sections/);
  assert.match(cards, /Nội dung kỹ thuật được hệ thống lưu nội bộ/);
  assert.doesNotMatch(cards, /activeSkill\.content\.slice\(0, 680\)/);
  assert.match(pipeline, /labels\[stage\] \|\| "Bước sản xuất"/);
  assert.match(cards, /hasVideo \? <RefreshCcw/);
  assert.match(cards, /aria-selected=\{shot\.id === selectedShotId\}/);
  assert.match(panel, /dialogue: parsedBeats\.filter\(\(beat\) => beat\.dialogue\)/);
  assert.match(panel, /actionBeats: parsedBeats\.map\(\(parsedBeat, index\) =>/);
  assert.match(panel, /sameAuthoredBeat = Boolean\(previous && previous\.action\.trim\(\) === parsedBeat\.action\.trim\(\)/);
  assert.match(panel, /\.\.\.\(sameAuthoredBeat \? previous : \{\}\)/);
  assert.doesNotMatch(panel, /actionBeats: \(storyboardSideShot\.actionBeats \|\| \[\]\)\.map/);
});

test("current attention ignores older retry attempts", () => {
  const pipeline = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline.ts"), "utf8");
  assert.match(pipeline, /!jobWasSupersededByNewerAttempt\(job, jobs\)/);
});

test("flow canvas removes duplicate edge identities before React Flow reconciliation", async () => {
  const { uniqueCanvasEdges } = await import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));
  const edges = uniqueCanvasEdges([
    { id: "continuity:scene-1", source: "a", target: "b" },
    { id: "continuity:scene-1", source: "a", target: "b" },
    { id: "lineage:scene-shot", source: "a", target: "c" }
  ]);
  assert.deepEqual(edges.map((edge) => edge.id), ["continuity:scene-1", "lineage:scene-shot"]);
});

test("portrait production rows use a compact bounded slot", async () => {
  const layout = fs.readFileSync(path.resolve(__dirname, "../studio-canvas-layout.ts"), "utf8");
  assert.match(layout, /CANVAS_LAYOUT_VERSION = "lineage-v17"/);
  assert.match(layout, /return 1300;/);
  assert.doesNotMatch(layout, /return 1600;/);
});

test("English navigation labels do not leak Vietnamese copy", async () => {
  const { createTranslator } = await import(pathToFileURL(path.resolve(__dirname, "../core/i18n.ts")));
  const t = createTranslator("en");
  assert.equal(t("nav.projects"), "Projects");
  assert.equal(t("nav.review"), "Edit");
  assert.equal(t("nav.source"), "Source");
  assert.equal(t("phase.reviewContinuity"), "Edit and review");
  assert.equal(t("phase.reviewContinuityDetail"), "Preview, compare, approve");
});

test("navigation status titles stay localized", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /navigationStatusLabel/);
  assert.doesNotMatch(application, /title=\{`\$\{label\} · \$\{status\}`\}/);
  assert.match(application, /Hoàn tất/);
  assert.match(application, /Cần xử lý/);
});

test("account help exposes the ordered provider onboarding path", () => {
  const manager = fs.readFileSync(path.resolve(__dirname, "../overlays/app-manager-open.tsx"), "utf8");
  const composition = fs.readFileSync(path.resolve(__dirname, "../studio-application-composition.ts"), "utf8");
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(manager, /Kết nối Google Flow/);
  assert.match(manager, /Mở Google Flow/);
  assert.match(manager, /Kiểm tra workspace/);
  assert.match(manager, /Đăng nhập Flow/);
  assert.match(manager, /Mở một project/);
  assert.match(manager, /Mở Công cụ/);
  assert.match(manager, /Đã kết nối Flow \(UI-direct\)/);
  assert.match(manager, /Nhiều tab Flow đang mở/);
  assert.match(manager, /flowHasDuplicateTabs/);
  assert.match(manager, /flowWorkspaceTabCount/);
  assert.match(composition, /flowProjectOpen: flowWorkspaceTabCount > 0/);
  assert.match(composition, /flowCustomToolTabCount > 1/);
  assert.match(composition, /flowRuntimeToolTabCount > 1/);
  assert.match(manager, /mỗi shot vẫn phải qua bước kiểm tra trước khi tạo video/);
  assert.match(application, /Mở hướng dẫn kết nối/);
  assert.match(application, /setAppManagerTab\("account"\)/);
});

test("app manager tabs are linked to their panels for assistive technology", () => {
  const manager = fs.readFileSync(path.resolve(__dirname, "../overlays/app-manager-open.tsx"), "utf8");
  for (const tab of ["projects", "settings", "account"]) {
    assert.match(manager, new RegExp(`id=\\"app-manager-tab-${tab}\\"`));
    assert.match(manager, new RegExp(`aria-controls=\\"app-manager-panel-${tab}\\"`));
    assert.match(manager, new RegExp(`id=\\"app-manager-panel-${tab}\\" role=\\"tabpanel\\"`));
  }
  assert.match(manager, /handleAppManagerTabKey/);
  assert.match(manager, /ArrowRight/);
  assert.match(manager, /event\.key === "End"/);
  assert.match(manager, /AppManagerFocusTrap/);
  assert.match(manager, /Shift\+Tab|event\.shiftKey/);
});

test("account app-manager overlay preserves the shared tab ids for keyboard focus", () => {
  const account = fs.readFileSync(path.resolve(__dirname, "../overlays/app-manager-account-overlay.tsx"), "utf8");
  assert.match(account, /id=\{`app-manager-tab-\$\{id\}`\}/);
  assert.match(account, /document\.getElementById\(`app-manager-tab-\$\{next\}`\)/);
  assert.doesNotMatch(account, /app-manager-account-tab-/);
});

test("account help distinguishes an incomplete Flow runtime from a connected bridge", async () => {
  const source = await fs.promises.readFile(path.resolve(__dirname, "../overlays/app-manager-open.tsx"), "utf8");
  assert.match(source, /flowRuntimeNeedsUpdate/);
  assert.match(source, /Cần kiểm tra Flow UI/);
});

test("reference editor modal keeps its keyboard focus boundary", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../overlays/selected-reference.tsx"), "utf8");
  assert.match(source, /ReferenceModalFocusTrap/);
  assert.match(source, /\.reference-modal/);
  assert.match(source, /event\.shiftKey/);
});

test("generated asset preview modal keeps its keyboard focus boundary", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../overlays/preview-generated-asset.tsx"), "utf8");
  assert.match(source, /GeneratedAssetPreviewFocusTrap/);
  assert.match(source, /\.ai-review-preview-modal/);
  assert.match(source, /event\.shiftKey/);
});

test("canvas media preview keeps its keyboard focus boundary", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(source, /FlowMediaPreviewFocusTrap/);
  assert.match(source, /\.flow-media-preview-dialog/);
  assert.match(source, /event\.shiftKey/);
});

test("upload preview copy stays fully localized", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../overlays/preview-upload.tsx"), "utf8");
  assert.match(source, /Ảnh tham chiếu đã tải lên/);
  assert.doesNotMatch(source, /Reference đã tải lên/);
});

test("generate banner does not equate extension handshake with Flow readiness", () => {
  const screen = fs.readFileSync(path.resolve(__dirname, "../screens/generate-screen.tsx"), "utf8");
  assert.match(screen, /flowProjectTabIsReady/);
  assert.match(screen, /Flow chưa sẵn sàng/);
  assert.match(screen, /một dự án Flow/);
  assert.doesNotMatch(screen, /runtime không bắt buộc|UI-direct|DRAFT/);
});

test("sidebar distinguishes connected extension from an invalid Flow route", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /flowProjectTabIsReady/);
  assert.match(application, /Flow cần kiểm tra tab/);
});

test("flow profile keeps AI routing secondary to the right rail", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  const profileStart = canvas.indexOf("function FlowProfileDocument");
  const profileEnd = canvas.indexOf("function FlowGroupFrameNode", profileStart);
  const profile = canvas.slice(profileStart, profileEnd);
  assert.doesNotMatch(profile, /aria-label=\"Định tuyến AI (văn bản|hình ảnh|video)\"/);
  assert.doesNotMatch(profile, /AI: \{providerName/);
  assert.match(profile, /flow-profile-facts/);
});

test("flow rail does not duplicate profile language and frame controls", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /activeView !== "flow"/);
  assert.match(application, /activeView !== "flow" && activeView !== "overview"/);
  assert.match(application, /aria-label="Ngôn ngữ sản xuất"/);
  assert.match(application, /aria-label="Khung hình video"/);
});

test("storyboard action label describes video instruction preparation", () => {
  const panel = fs.readFileSync(path.resolve(__dirname, "../storyboard-script-panel.tsx"), "utf8");
  const i18n = fs.readFileSync(path.resolve(__dirname, "../core/i18n.ts"), "utf8");
  assert.match(panel, /t\("common\.buildPrompt"\)/);
  assert.doesNotMatch(panel, /t\("storyboard\.generateBrief"\)/);
  assert.match(i18n, /"common\.buildPrompt": "Chuẩn bị chỉ dẫn video"/);
});

test("flow text nodes lead with production stage, not provider name", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /function flowTextProviderLabel\(kind: FlowDocument\["kind"\], providerName\?: string\)/);
  assert.match(canvas, /provider === flowTextSourceLabel\(kind\)/);
  assert.match(canvas, /title=\{providerLabel \? `Công cụ xử lý:/);
  assert.match(canvas, /\{flowTextSourceLabel\(kind\)\}/);
  assert.doesNotMatch(canvas, /<small className=\"flow-node-drag-handle\">\{providerName \|\| flowTextSourceLabel/);
});

test("Vietnamese media controls do not leak English tooltips", () => {
  const media = fs.readFileSync(path.resolve(__dirname, "../views/asset-video-views.tsx"), "utf8");
  assert.doesNotMatch(media, /title=\{playing \? "Pause video"/);
  assert.doesNotMatch(media, /Turn on loop for all storyboard videos/);
  assert.match(media, /Tạm dừng video/);
  assert.match(media, /Bật lặp cho toàn bộ video storyboard/);
  assert.match(media, /Tạm dừng video storyboard/);
  assert.doesNotMatch(media, /Pause storyboard video/);
});

test("flow text editing labels remain localized", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /aria-label=\{`Nội dung \$\{title\}`\}/);
  assert.match(canvas, /aria-label=\{`Yêu cầu chỉnh sửa cho \$\{title\}`\}/);
  assert.doesNotMatch(canvas, /Revision request for/);
});

test("flow canvas uses one localized control dock without duplicate React Flow chrome", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /aria-label="Phóng to sơ đồ"/);
  assert.match(canvas, /aria-label="Thu nhỏ sơ đồ"/);
  assert.match(canvas, /aria-label="Vừa khung sơ đồ"/);
  assert.doesNotMatch(canvas, /<Controls\b/);
  assert.doesNotMatch(canvas, /<MiniMap\b/);
});

test("flow navigation fits document children instead of oversized group frames", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /function fitGroupView\(flowInstance: ReactFlowInstance, groupId: string\)/);
  assert.match(canvas, /node\.type === "document" && node\.parentId === `group:\$\{groupId\}`/);
  assert.match(canvas, /const initialNodes = visibleLayout\.nodes\.filter\(\(node\) => node\.type === "document"/);
  assert.doesNotMatch(canvas, /nodes: \[\{ id: `group:\$\{group\.id\}` \}\]/);
});

test("source empty state uses user-facing Vietnamese labels", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../views/source-library-view.tsx"), "utf8");
  assert.match(source, /Video, ảnh, âm thanh và ảnh tham chiếu đã tạo/);
  assert.doesNotMatch(source, /Video, ảnh, audio và reference đã tạo/);
});

test("legacy board presentation does not expose implementation prompt nodes", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application-presentations.ts"), "utf8");
  assert.doesNotMatch(source, /kind: "Prompt"/);
  assert.doesNotMatch(source, /Project brain|Continuity Prompt|Review lane|MVP 3 ready/);
  assert.match(source, /Bộ quy tắc hình ảnh/);
});

test("story intake keeps internal skill filenames out of user-facing copy", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../screens/story-screen.tsx"), "utf8");
  assert.match(source, /<summary>Tài liệu nền series/);
  assert.doesNotMatch(source, /Kinh thánh series \/ SKILL\.md/);
});

test("generate rail localizes the browser extension status", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(source, /Tiện ích trình duyệt v\$\{bridgeVersionLabel\} đã kết nối/);
  assert.doesNotMatch(source, /Extension v\$\{bridgeVersionLabel\} đã kết nối/);
  assert.match(source, /Studio Shot Bridge\|Flow picker/);
  assert.match(source, /projectBlockedJobs\.length \|\| flowPreflightBlocked \? "Cần xử lý"/);
});

test("fallback labels and cancellation messages stay localized", () => {
  const projectSlice = fs.readFileSync(path.resolve(__dirname, "../studio-project-slice.tsx"), "utf8");
  const reference = fs.readFileSync(path.resolve(__dirname, "../overlays/selected-reference.tsx"), "utf8");
  const pipeline = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline-domain.ts"), "utf8");
  const graph = fs.readFileSync(path.resolve(__dirname, "../production-graph-controller.ts"), "utf8");
  assert.match(projectSlice, /Nhân vật tạm/);
  assert.doesNotMatch(projectSlice, /Character candidate/);
  assert.match(reference, /Tham chiếu chưa gán/);
  assert.match(pipeline, /Đã hủy từ ứng dụng/);
  assert.doesNotMatch(pipeline, /Cancelled by the user/);
  assert.match(graph, /Công cụ chưa trả về nội dung chỉnh sửa/);
});

test("renderer orchestration uses the injectable workflow bridge", () => {
  for (const file of ["studio-media-actions.ts", "studio-pipeline-domain.ts", "studio-prompt-compaction.ts", "production-graph-controller.ts", "studio-application-composition.ts"]) {
    const source = fs.readFileSync(path.resolve(__dirname, `../${file}`), "utf8");
    assert.doesNotMatch(source, /window\.studioBridge/);
    assert.match(source, /getWorkflowBridge/);
  }
});

test("media nodes distinguish create from regenerate actions", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /isPlaceholder \? <Play size=\{13\} \/> : <Sparkles size=\{13\} \/>/);
  assert.match(canvas, /aria-label=\{`\$\{isPlaceholder \? "Tạo" : "Tạo lại"\} \$\{title\} · Chạy`\}/);
});

test("image generator nodes lead with media state and keep provider secondary", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  const start = canvas.indexOf("function FlowImageGeneratorDocument");
  const end = canvas.indexOf("const inlineGuidanceDrafts", start);
  const imageGenerator = canvas.slice(start, end);
  assert.match(imageGenerator, /const mediaStateLabel = active \? "Đang tạo" : document\.generatedAsset \? "Sẵn sàng" : "Chưa tạo"/);
  assert.match(imageGenerator, /<strong>\{mediaStateLabel\}<\/strong><small title=\{document\.providerName/);
  assert.doesNotMatch(imageGenerator, /<strong>\{document\.generatedAsset \? document\.providerName/);
});

test("flow map does not surface persisted provider payloads", () => {
  const graph = fs.readFileSync(path.resolve(__dirname, "../views/production-graph-view.tsx"), "utf8");
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(graph, /export function readableAuthoredFlowText/);
  assert.match(graph, /bridgeMessage\|providerPayload\|integrationPayload/);
  assert.match(graph, /providerConversationUrl\|jobId\|sceneOrder\|shotId/);
  assert.ok(graph.includes("attached\\s+(?:approved|reference)\\s+(?:keyframe|image)"));
  assert.match(graph, /const authoredText = readableAuthoredFlowText\(scene\.flowText\)/);
  assert.match(graph, /const authoredText = readableAuthoredFlowText\(shot\.flowText\)/);
  assert.doesNotMatch(graph, /if \(scene\.flowText\?\.trim\(\)\) return scene\.flowText/);
  assert.doesNotMatch(graph, /if \(shot\.flowText\?\.trim\(\)\) return shot\.flowText/);
  assert.match(canvas, /function flowTextProviderLabel\(kind: FlowDocument\["kind"\], providerName\?: string\)/);
  assert.match(canvas, /provider === flowTextSourceLabel\(kind\)/);
});

test("visible production labels stay localized", () => {
  const graph = fs.readFileSync(path.join(projectRoot, "packages/renderer/src/views/production-graph-view.tsx"), "utf8");
  assert.match(graph, /title: intake\.quickVisualInput\?\.name \|\| "Ảnh tham chiếu"/);
  assert.doesNotMatch(graph, /"Reference hình ảnh"/);
  const story = fs.readFileSync(path.join(projectRoot, "packages/renderer/src/screens/story-screen.tsx"), "utf8");
  assert.match(story, /Đã nhập kịch bản thành công/);
  assert.doesNotMatch(story, /Story imported successfully/);
  const reference = fs.readFileSync(path.join(projectRoot, "packages/renderer/src/overlays/selected-reference.tsx"), "utf8");
  assert.match(reference, /Ảnh tham chiếu gốc/);
  assert.doesNotMatch(reference, /Reference hình ảnh gốc/);
  const i18n = fs.readFileSync(path.join(projectRoot, "packages/renderer/src/core/i18n.ts"), "utf8");
  assert.match(i18n, /"sidebar\.aiRouting": "Định tuyến AI"/);
});

test("source library keeps asset labels localized", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../views/source-library-view.tsx"), "utf8");
  assert.match(source, /Video tạo bằng AI/);
  assert.match(source, /Ảnh tham chiếu đã khóa/);
  assert.match(source, /Hộp thư · chưa phân loại/);
  assert.match(source, /Hộp thư · cần đối chiếu/);
  assert.match(source, /Hộp thư · cần phân loại/);
  assert.doesNotMatch(source, /Inbox · cần/);
  assert.match(source, /\$\{dragAssets\.length\} tài nguyên/);
  assert.doesNotMatch(source, /Inbox · imported/);
  assert.doesNotMatch(source, /\$\{dragAssets\.length\} assets/);
});

test("source library does not expose data-url asset ids as filenames", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../views/source-library-view.tsx"), "utf8");
  assert.match(source, /const authoredFilename = typeof asset\.metadata\?\.filename/);
  assert.match(source, /technicalGeneratedName/);
  assert.match(source, /google\[_-\]flow\[_-\]job/);
  assert.match(source, /chatgpt\[_-\]\(\?:storyboard\|image\)/);
  assert.match(source, /anh-tham-chieu/);
  assert.match(source, /video-tao/);
  assert.doesNotMatch(source, /return `\$\{asset\.type\}-\$\{asset\.id\}\.\$\{extension\}`/);
  assert.match(source, /studio-\(\?:shot-bridge\|flow\)/);
  assert.match(source, /Video tạo bằng AI/);
});

test("storyboard scene script never falls back to the brief", () => {
  const panel = fs.readFileSync(path.resolve(__dirname, "../storyboard-script-panel.tsx"), "utf8");
  assert.match(panel, /value=\{project\.storyDocument\?\.sceneBreakdown \?\? ""\}/);
  assert.match(panel, /disabled=\{!project\.storyDocument\?\.sceneBreakdown\?\.trim\(\)\}/);
  assert.doesNotMatch(panel, /sceneBreakdown \|\| project\.sourceDraft/);
  assert.doesNotMatch(panel, /sceneBreakdown \|\| project\.description/);
});

test("flow map preserves the brief → story → scene document boundaries", () => {
  const graph = fs.readFileSync(path.resolve(__dirname, "../views/production-graph-view.tsx"), "utf8");
  const storyLine = graph.split("\n").find((line) => line.includes('id: `story:${project.id}`')) || "";
  const sceneLine = graph.split("\n").find((line) => line.includes('id: `architecture:${project.id}`')) || "";
  assert.match(storyLine, /project\.storyDocument\?\.story/);
  assert.match(sceneLine, /project\.storyDocument\?\.sceneBreakdown/);
  assert.doesNotMatch(storyLine, /sourceDraft|description/);
  assert.doesNotMatch(sceneLine, /sourceDraft|description/);
  assert.match(storyLine, /Đang chờ/);
  assert.match(sceneLine, /hoàn tất câu chuyện trước khi tách cảnh/);
});

test("story status uses the newest attempt and distinguishes screenplay input", () => {
  const slice = fs.readFileSync(path.resolve(__dirname, "../studio-project-slice.tsx"), "utf8");
  assert.match(slice, /\.filter\(\(job\) => job\.projectId === core\.project\.id[^]*\.sort\(\(a, b\) => Date\.parse\(b\.updatedAt\) - Date\.parse\(a\.updatedAt\)\)\[0\]/);
  const story = fs.readFileSync(path.resolve(__dirname, "../screens/story-screen.tsx"), "utf8");
  assert.match(story, /intake\.sourceType === "screenplay" \? "Đã nhận kịch bản" : "Đã tạo câu chuyện"/);
});

test("application model does not rebuild unused legacy board nodes", () => {
  const model = fs.readFileSync(path.resolve(__dirname, "../studio-application-model.tsx"), "utf8");
  assert.doesNotMatch(model, /const boardNodes = useMemo/);
  assert.doesNotMatch(model, /buildBoardNodes\(/);
});

test("live pipeline rail leads with the production step and keeps provider secondary", () => {
  const rail = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline-rail.tsx"), "utf8");
  assert.match(rail, /<strong>\{pipelineStepLabel\(jobPipelineStep\(job\)/);
  assert.match(rail, /<span>\{provider\?\.name/);
  assert.doesNotMatch(rail, /<span>\{provider\?\.name[^]*<strong>\{pipelineStepLabel/);
});

test("live activity toast leads with localized production stage instead of provider internals", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /taskStageLabel\(task\.stage\)/);
  assert.match(application, /<small>\{taskStageLabel\(task\.stage\)\} · \{provider\}<\/small>/);
  assert.match(application, /aria-live=\{isUrgent \? "assertive" : "polite"\}/);
  assert.doesNotMatch(application, /provider\}\{job\.statusMessage/);
});

test("global topbar defers blocked retry actions to the active screen", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /topbarNext && showTopbarNext && !projectBlockedJobs\.length/);
  assert.match(application, /A blocked\/retry action belongs to the active screen/);
});

test("story intake exposes adaptation rules without provider prompt jargon", () => {
  const story = fs.readFileSync(path.resolve(__dirname, "../screens/story-screen.tsx"), "utf8");
  assert.match(story, /<strong>Xem quy tắc<\/strong>/);
  assert.doesNotMatch(story, /Xem logic prompt/);
});

test("flow and navigation accessibility labels follow the selected language", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  const storyboard = fs.readFileSync(path.resolve(__dirname, "../views/shot-review-views.tsx"), "utf8");
  const presentation = fs.readFileSync(path.resolve(__dirname, "../studio-application-presentations.ts"), "utf8");
  assert.match(canvas, /Tham chiếu hình ảnh bắt buộc cho/);
  assert.match(canvas, /Nhóm \$\{legacyLabel\}/);
  assert.match(storyboard, /alt=\{`Khung storyboard cảnh \$\{scene\.order\}`\}/);
  assert.match(presentation, /ariaLabel: t\("nav\.flow"\)/);
  assert.doesNotMatch(canvas, /Required visual references/);
  assert.doesNotMatch(storyboard, /Scene \$\{scene\.order\} storyboard sketch/);
});

test("flow map separates shot instructions from the generated keyframe", async () => {
  const { buildSpatialFlow } = await import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));
  const noop = () => {};
  const docs = [
    { id: "shot:s1", groupId: "shots", row: 1, slot: "shot", kind: "shot", title: "Phân rã shot", text: "Action", sceneDocumentId: "scene:sc1" },
    { id: "output:s1:image", groupId: "shots", row: 1, slot: "keyframe", kind: "image", title: "Ảnh shot", aspectRatio: "9:16", sceneDocumentId: "scene:sc1", parentDocumentId: "provider-compilation:s1", asset: { id: "asset:s1", type: "image", filePath: "" } }
  ];
  const { nodes } = buildSpatialFlow(docs, {}, {}, {}, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  const shot = nodes.find((node) => node.id === "document:shot:s1");
  const keyframe = nodes.find((node) => node.id === "document:output:s1:image");
  assert.ok(shot && keyframe);
  assert.notEqual(shot.position.y, keyframe.position.y);
  assert.ok(shot.position.y > keyframe.position.y, "shot instructions should follow the keyframe in the lane");
});

test("flow map repairs a persisted shot/keyframe collision", async () => {
  const { buildSpatialFlow, CANVAS_LAYOUT_VERSION } = await import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));
  const noop = () => {};
  const docs = [
    { id: "shot:s2", groupId: "shots", row: 1, slot: "shot", kind: "shot", title: "Phân rã shot", text: "Action", sceneDocumentId: "scene:sc2" },
    { id: "output:s2:image", groupId: "shots", row: 1, slot: "keyframe", kind: "image", title: "Ảnh shot", aspectRatio: "9:16", sceneDocumentId: "scene:sc2", parentDocumentId: "provider-compilation:s2", asset: { id: "asset:s2", type: "image", filePath: "" } }
  ];
  const saved = {
    [`${CANVAS_LAYOUT_VERSION}:shot:s2`]: { x: 24, y: 117 },
    [`${CANVAS_LAYOUT_VERSION}:output:s2:image`]: { x: 24, y: 117 }
  };
  const { nodes } = buildSpatialFlow(docs, saved, {}, {}, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  const shot = nodes.find((node) => node.id === "document:shot:s2");
  const keyframe = nodes.find((node) => node.id === "document:output:s2:image");
  assert.ok(shot && keyframe);
  assert.equal(keyframe.position.y, 117);
  assert.equal(shot.position.y, 1217);
});

test("flow map expands media lanes before placing sibling nodes", async () => {
  const { buildSpatialFlow } = await import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));
  const noop = () => {};
  const docs = [1, 2, 3].map((order) => ({
    id: `output:s${order}:video`, groupId: "video", row: 1, slot: "video", kind: "video",
    title: `Video shot ${order}`, aspectRatio: "16:9", sceneDocumentId: "scene:sc1",
    parentDocumentId: `provider-compilation:s${order}`, asset: { id: `asset:s${order}`, type: "video", filePath: "" }
  })).concat([{ id: "scene-image:sc1", groupId: "scene-images", row: 1, slot: "scene-keyframe", kind: "image", title: "Ảnh cảnh", aspectRatio: "16:9", asset: { id: "asset:scene-1", type: "image", filePath: "" } }]);
  const { groups } = buildSpatialFlow(docs, {}, {}, {}, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  const video = groups.find((group) => group.id === "video");
  const sceneImages = groups.find((group) => group.id === "scene-images");
  assert.equal(video?.width, 1218);
  assert.ok(sceneImages && video && video.x > sceneImages.x + sceneImages.width, "media lanes should not overlap");
});

test("empty optional media lanes stay hidden until they contain output", async () => {
  const { buildSpatialFlow } = await import(pathToFileURL(path.resolve(__dirname, "../studio-canvas-layout.ts")));
  const noop = () => {};
  const docs = [{ id: "shot:s1", groupId: "shots", row: 1, slot: "shot", kind: "shot", title: "Phân rã shot", text: "Action" }];
  const { groups } = buildSpatialFlow(docs, {}, {}, {}, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop);
  assert.equal(groups.find((group) => group.id === "assets"), undefined);
  assert.equal(groups.find((group) => group.id === "scene-images"), undefined);
  assert.equal(groups.find((group) => group.id === "video"), undefined);
});

test("empty flow uploads stay compact until a real reference is selected", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
  assert.match(canvas, /document\.dataUrl \? "has-image" : "empty"/);
  assert.match(styles, /\.flow-upload-surface\.empty[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(styles, /\.flow-upload-surface\.empty[\s\S]*min-height: 148px/);
});

test("flow map starts at a readable intake handoff instead of fitting every stage", () => {
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(canvas, /String\(node\.parentId\) === "group:intake"/);
  assert.doesNotMatch(canvas, /\["group:intake", "group:story", "group:architecture"\]\.includes/);
});

test("custom flow nodes use localized user-facing labels", () => {
  const controller = fs.readFileSync(path.resolve(__dirname, "../production-graph-controller.ts"), "utf8");
  assert.match(controller, /"Đầu vào văn bản"/);
  assert.match(controller, /"Đầu vào hình ảnh"/);
  assert.match(controller, /"Tạo hình ảnh"/);
  assert.match(controller, /"Gom ngữ cảnh"/);
  assert.doesNotMatch(controller, /"Text input"|"Image input"|"Image generation"|"Context bundle"/);
});

test("empty storyboard overview frames stay compact", () => {
  const views = fs.readFileSync(path.resolve(__dirname, "../views/shot-review-views.tsx"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
  assert.match(views, /sceneKeyframe \? "" : "empty"/);
  assert.match(views, /style=\{sceneKeyframe \? aspectStyle : undefined\}/);
  assert.match(views, /isLikelyEphemeralMediaUrl/);
  assert.match(views, /Boolean\(preview\)/);
  assert.match(styles, /\.storyboard-sheet-sketch\.empty[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(styles, /\.storyboard-sheet-sketch\.empty[\s\S]*min-height: 112px/);
});

test("storyboard media preserves source composition inside the shared frame", () => {
  const styles = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
  const start = styles.indexOf("/* Media and its card frame must share one crop boundary. */");
  const block = styles.slice(start, styles.indexOf("/* 2026-08 storyboard clarity pass", start));
  assert.match(block, /object-fit: contain/);
  assert.doesNotMatch(block, /object-fit: cover/);
});

test("navigation limits status marks to the three production gates", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  const overview = fs.readFileSync(path.resolve(__dirname, "../screens/overview-screen.tsx"), "utf8");
  const rail = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline-rail.tsx"), "utf8");
  assert.match(application, /review: \["video", "audio", "export"\], generate: \["video", "audio", "export"\]/);
  assert.match(application, /const showWorkflowStatus = id === "story" \|\| id === "assets" \|\| id === "storyboard"/);
  assert.match(application, /data-status=\{showWorkflowStatus \? status : undefined\}/);
  assert.doesNotMatch(application, /\(group==="production" \|\| status!=="pending"\)/);
  assert.match(overview, /Clock3/);
  assert.match(overview, /aria-label=\{`\$\{step\.label\} · \$\{status\}`\}/);
  assert.match(overview, /Mở log \$\{productionTaskPresentation\(job\)\.label\} · \$\{statusLabel\(job\.status\)\} · \$\{job\.id\?\.slice\(-6\)(?: \|\| '')?\}/);
  assert.match(overview, /job\.id\?\.slice\(-6\) \|\| ''/);
  assert.match(rail, /Clock3/);
  assert.match(rail, /className=\{`\$\{step\.ready/);
});

test("semantic role and visual style labels stay localized", () => {
  const format = fs.readFileSync(path.resolve(__dirname, "../core/ui-format.ts"), "utf8");
  assert.match(format, /realistic:\s*"Người đóng chân thực"/);
  assert.match(format, /main:\s*"Nhân vật chính"/);
  const assets = fs.readFileSync(path.resolve(__dirname, "../screens/assets-screen.tsx"), "utf8");
  assert.match(assets, /formatLabel\(item\.role\)/);
  assert.match(assets, /aria-label="Vai trò nhân vật"/);
  assert.match(assets, /<option value="main">Nhân vật chính<\/option>/);
  const slice = fs.readFileSync(path.resolve(__dirname, "../studio-project-slice.tsx"), "utf8");
  assert.doesNotMatch(slice, /role:\s*authored\?\.role \|\| "Main character"/);
});

test("selected skill names stay localized across shared rails", () => {
  const pipeline = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline.ts"), "utf8");
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  const review = fs.readFileSync(path.resolve(__dirname, "../views/shot-review-views.tsx"), "utf8");
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(pipeline, /formatSkillName/);
  assert.match(application, /formatSkillName\(skill\.name, skill\.id\)/);
  assert.match(review, /formatSkillName\(skill\.name, skill\.id\)/);
  assert.match(canvas, /"short-drama-video": "Phim ngắn kịch tính"/);
});

test("story sidebar status is sourced from the authored story artifact", () => {
  const presentations = fs.readFileSync(path.resolve(__dirname, "../studio-application-presentations.ts"), "utf8");
  assert.match(presentations, /buildPhaseStatusByView\(phaseStatus: boolean\[\], jobs: AutomationJob\[\] = \[\], project\?: Pick<Project, "storyDocument">/);
  assert.match(presentations, /stateFor\(Boolean\(project\?\.storyDocument\?\.story\?\.trim\(\)\)/);
  const composition = fs.readFileSync(path.resolve(__dirname, "../studio-application-composition.ts"), "utf8");
  assert.match(composition, /buildPhaseStatusByView\(deps\.phaseStatus, deps\.projectJobs, deps\.project\)/);
});

test("production gate status is not inferred from stale downstream rows", () => {
  const metrics = fs.readFileSync(path.resolve(__dirname, "../studio-pipeline-metrics.ts"), "utf8");
  assert.match(metrics, /const storyReady = Boolean\(project\.storyDocument\?\.story\?\.trim\(\)\)/);
  assert.match(metrics, /const referencesReady = lockedProjectReferences\.length > 0/);
  assert.match(metrics, /const keyframesReady = projectShots\.length > 0 && projectShots\.every\(\(shot\) => input\.shotHasVisibleKeyframe\(shot\.id\)\)/);
  assert.match(metrics, /phaseStatus: \[storyReady, referencesReady, keyframesReady, generated, approved\]/);
});

test("story rail copy distinguishes missing, active and authored story states", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /const hasStoryArtifact = Boolean\(project\.storyDocument\?\.story\?\.trim\(\)\)/);
  assert.match(application, /storyJob && isActiveJob\(storyJob\)/);
  assert.match(application, /Chưa có câu chuyện hoàn chỉnh; chạy bước phát triển/);
  assert.doesNotMatch(application, /const storyStatus = storyJob \? "Kịch bản đã có dữ liệu/);
});

test("story screen does not expose stale scene rows before narrative output", () => {
  const story = fs.readFileSync(path.resolve(__dirname, "../screens/story-screen.tsx"), "utf8");
  assert.match(story, /const hasNarrativeArtifact = Boolean\(project\.storyDocument\?\.story\?\.trim\(\) \|\| project\.storyDocument\?\.sceneBreakdown\?\.trim\(\) \|\| \(intake\.sourceType === "screenplay" && projectScenes\.length > 0\)\)/);
  assert.match(story, /hasNarrativeArtifact \? <div className="scene-list"/);
  assert.match(story, /Chưa có phân cảnh để hiển thị/);
});

test("automation rail avoids repeated status copy and duplicate punctuation", () => {
  const application = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(application, /Mở Chrome và kết nối tiện ích để chạy tự động\./);
  assert.match(application, /Đang ở bước \$\{pipelineStepLabel\(pipelineStep\)\}\./);
  assert.doesNotMatch(application, /<strong>\{automationStatus\}<\/strong>\}\{bridgeCount <= 0/);
});

test("storyboard preloads only active-scene keyframes", () => {
  const cards = fs.readFileSync(path.resolve(__dirname, "../views/shot-review-views.tsx"), "utf8");
  assert.match(cards, /const preloadImageUrls = Array\.from\(new Set\(activeSceneShots/);
  assert.match(cards, /loading="lazy" decoding="async"/);
  assert.doesNotMatch(cards, /assets\n\s*\.filter\(\(asset\) => asset\.type === "image"\)/);
});

test("flow map omits execution-only context and continuity nodes", () => {
  const graph = fs.readFileSync(path.resolve(__dirname, "../views/production-graph-view.tsx"), "utf8");
  const canvas = fs.readFileSync(path.resolve(__dirname, "../studio-canvas.tsx"), "utf8");
  assert.match(graph, /if \(node\.kind === "context-bundle"\) continue/);
  assert.doesNotMatch(graph, /documents\.push\(\{ id: `scene-continuity:/);
  assert.match(graph, /machine-readable JSON contract/);
  assert.doesNotMatch(canvas, /Thêm nút gom ngữ cảnh/);
});

test("generate connection banner uses user-facing terminology", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../screens/generate-screen.tsx"), "utf8");
  assert.match(source, /Tiện ích v\$\{bridgeVersionLabel\}/);
  assert.doesNotMatch(source, /`Extension v\$\{bridgeVersionLabel\}/);
  assert.match(source, /các tab công cụ đang đăng nhập/);
});

test("global retry rail names the exact blocked shot", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../studio-application.tsx"), "utf8");
  assert.match(source, /const blockedShot = blockedJob\?\.shotId/);
  assert.match(source, /const blockedTargetLabel = blockedShot/);
  assert.match(source, /Thử lại \$\{blockedTargetLabel\}/);
});

test("insert controls keep wrapped labels centered inside their buttons", () => {
  const styles = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
  const controls = styles.slice(styles.indexOf(".insert-kind-tabs button {"), styles.indexOf(".insert-kind-tabs button.active {"));
  assert.match(controls, /min-height:\s*44px/);
  assert.match(controls, /line-height:\s*1\.1/);
  assert.match(controls, /text-align:\s*center/);
  assert.match(controls, /white-space:\s*normal/);
});

test("downstream regeneration follows scene order when shot numbers restart", () => {
  const panel = fs.readFileSync(path.resolve(__dirname, "../storyboard-shot-panel.tsx"), "utf8");
  assert.match(panel, /const sceneOrderById = new Map\(projectScenes\.map/);
  assert.match(panel, /candidateSceneOrder > currentSceneOrder/);
  assert.match(panel, /\.sort\(\(left, right\) => sceneForShot\(left\) - sceneForShot\(right\) \|\| left\.order - right\.order\)/);
});

test("shot regeneration preserves a usable prompt for queue admission", () => {
  const panel = fs.readFileSync(path.resolve(__dirname, "../storyboard-shot-panel.tsx"), "utf8");
  assert.match(panel, /const prompt = shot\.prompt\?\.trim\(\) \|\| draft\.description\.trim\(\)/);
  assert.doesNotMatch(panel, /prompt: ""/);
});

test("generated media review copy is optional and does not ask users to approve assets", () => {
  const i18n = fs.readFileSync(path.resolve(__dirname, "../core/i18n.ts"), "utf8");
  assert.match(i18n, /"common\.reviewGeneratedAssets": "Kiểm tra media đã tạo \(tuỳ chọn\)"/);
  assert.doesNotMatch(i18n, /"common\.reviewGeneratedAssets": "Duyệt tài nguyên đã tạo"/);
});

test("timeline editor exposes undo and redo for persisted clip edits", () => {
  const model = fs.readFileSync(path.resolve(__dirname, "../views/edit-panel-model.tsx"), "utf8");
  const view = fs.readFileSync(path.resolve(__dirname, "../views/edit-panel-view.tsx"), "utf8");
  assert.match(model, /historyRef = useRef/);
  assert.match(model, /restoreHistory = \(direction: "undo" \| "redo"\)/);
  assert.match(model, /canUndo: historyRef\.current\.past\.length > 0/);
  assert.match(view, /Hoàn tác thao tác vừa làm/);
  assert.match(view, /Làm lại thao tác vừa hoàn tác/);
  assert.match(model, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(model, /if \(event\.shiftKey\) core\.redo\(\); else core\.undo\(\)/);
});
