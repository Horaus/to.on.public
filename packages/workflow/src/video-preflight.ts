import { classifyVisibleTransformations } from "@studio/domain/shot-classification";
import { getProviderVideoDurationPolicy } from "@studio/domain/duration-policy";
import type { Asset, AutomationJob, ProviderPlatform, QualityFailureOwner, Shot } from "@studio/types";
import type { VideoPreflightIssue, VideoPreflightValidation } from "@studio/domain/preflight-contract";
export { classifyVisibleTransformations } from "@studio/domain/shot-classification";
export type { VideoPreflightIssue, VideoPreflightValidation } from "@studio/domain/preflight-contract";

export const FLOW_PROMPT_HARD_LIMIT = 4000;
export const FLOW_PROMPT_SAFE_BYTES = 3600;

export function videoPreflightIssueOwner(code: string): QualityFailureOwner {
  if (/DUPLICATE_ACTIVE_SUBMIT/.test(code)) return "app_orchestration";
  if (/REFERENCE|KEYFRAME/.test(code)) return "identity_reference";
  if (/SPEECH|SPEAKER|RECORDING|VOICE/.test(code)) return "voice_audio";
  if (/DOMINANT|TRANSFORMATION|CUT_CONTRACT|PROP_STATE|ENTITY_TRANSFER|ACTION_OWNER|TIMING_/.test(code)) return "technical_compiler";
  return "provider_execution";
}

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

type ReferenceInput = {
  assetId: string;
  filePath: string;
  referenceRole?: "shot_keyframe" | "character_identity" | "character_detail" | "setting" | "prop" | "style";
  referenceLabel?: string;
};

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function defaultDelivery(shot: Shot) {
  if (shot.speechType === "inner_monologue") return "internal_voice";
  if (shot.speechType === "narration") return "offscreen_voiceover";
  if (shot.speechType === "silent" || !shot.dialogue?.trim()) return "none";
  return "onscreen_lipsync";
}

function expectedDelivery(shot: Shot) {
  if (shot.speechType === "inner_monologue") return "internal_voice";
  if (shot.speechType === "narration") return "offscreen_voiceover";
  if (shot.speechType === "silent") return "none";
  return undefined;
}

function aspectForAsset(asset: Asset | undefined) {
  const metadataAspect = String(asset?.metadata?.aspectRatio || "");
  if (metadataAspect) return metadataAspect;
  const width = Number(asset?.width ?? asset?.metadata?.width);
  const height = Number(asset?.height ?? asset?.metadata?.height);
  if (!(width > 0) || !(height > 0)) return undefined;
  const ratio = width / height;
  return ratio > 1.2 ? "16:9" : ratio < 0.85 ? "9:16" : "1:1";
}

type AddIssue = (code: string, message: string, repair: string, severity?: "error" | "warning") => void;

function validatePromptContract(prompt: string, add: AddIssue) {
  const promptCharacters = [...prompt].length;
  const promptBytes = utf8ByteLength(prompt);
  const requiresTextCompaction = promptCharacters > FLOW_PROMPT_HARD_LIMIT || promptBytes > FLOW_PROMPT_HARD_LIMIT;
  if (requiresTextCompaction) {
    add("FLOW_PROMPT_LIMIT_EXCEEDED", `Prompt có ${promptCharacters} ký tự / ${promptBytes} UTF-8 bytes, vượt hard limit ${FLOW_PROMPT_HARD_LIMIT}.`, `Chuyển prompt của riêng shot này qua text node/ChatGPT để rút xuống tối đa ${FLOW_PROMPT_SAFE_BYTES} UTF-8 bytes trước khi gửi Flow.`);
  } else if (promptBytes > FLOW_PROMPT_SAFE_BYTES) {
    add("FLOW_PROMPT_NEAR_LIMIT", `Prompt có ${promptCharacters} ký tự / ${promptBytes} UTF-8 bytes, gần hard limit ${FLOW_PROMPT_HARD_LIMIT}.`, `Nên rút xuống tối đa ${FLOW_PROMPT_SAFE_BYTES} UTF-8 bytes để chừa chỗ cho chỉ dẫn runtime.`, "warning");
  }
  return { promptCharacters, promptBytes, requiresTextCompaction };
}

function validateActionOwnership(shot: Shot, transformationKinds: string[], add: AddIssue) {
  const declaredCount = Number(shot.visualTransformationCount);
  const declaredTransformationCount = Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : 0;
  const transformationCount = Math.max(declaredTransformationCount, transformationKinds.length);
  const dominantAction = String(shot.dominantAction || "").trim();
  if (!dominantAction) add("DOMINANT_ACTION_MISSING", "Shot chưa khai báo hành động hình ảnh chủ đạo.", "Viết một hành động duy nhất mà người xem phải thấy hoàn tất trong clip.");
  if (transformationCount > 1) add("MULTIPLE_VISIBLE_TRANSFORMATIONS", `Shot có ${transformationCount} biến đổi vật lý độc lập (${transformationKinds.join(", ") || "khai báo thủ công"}).`, "Tách setup, hành động quyết định và hệ quả thành các shot riêng; mỗi render chỉ giữ một biến đổi chủ đạo.");
  const actionCueIds = shot.screenplayActionCueIds || [];
  const ownerBeats = (shot.actionBeats || []).filter((beat) => beat.actionCueId && beat.actionCueId === shot.ownerActionCueId);
  const actionOwnerValues = [actionCueIds.length, shot.ownerActionCueId === actionCueIds[0] ? 1 : 0, ownerBeats.length];
  if (actionCueIds.length && actionOwnerValues.some((value) => value !== 1)) add("ACTION_OWNER_INVALID", "Hành động chính chưa thuộc đúng một shot và một timed beat.", "Biên dịch lại shot contract từ screenplay cue; không sửa hoặc lặp hành động trong provider prompt.");
  return { dominantAction, ownerBeats };
}

function validateActionTiming(shot: Shot, ownerBeats: NonNullable<Shot["actionBeats"]>, add: AddIssue) {
  if (ownerBeats.some((beat) => beat.endSec - beat.startSec > 3.5 && !String(beat.dialogue || "").trim())) add("TIMING_ACTION_STRETCH", "Hành động vật lý đơn đang bị kéo dài quá 3.5 giây.", "Giữ action beat ngắn; dùng phần thời gian còn lại cho setup hoặc phản ứng/hệ quả có thể đọc được.");
  const hasEditorialTail = shot.actionBeats?.at(-1)?.beatFunction === "hold";
  if (shot.durationSec >= 6 && !hasEditorialTail && Number(shot.timingContract?.contentOccupancy) < 0.55) add("TIMING_SHOT_UNDERFILLED", `Nội dung chủ động chỉ lấp ${Math.round(Number(shot.timingContract?.contentOccupancy || 0) * 100)}% clip và chưa có ranh giới cắt.`, "Rút duration hoặc biên dịch lại với active-content boundary; không làm chậm/lặp hành động.");
  if (hasEditorialTail && Number(shot.timingContract?.estimatedActiveDurationSec) < shot.durationSec) add("EDITORIAL_TAIL_PLANNED", `Provider render ${shot.durationSec}s; Edit sẽ kết thúc gần ${Number(shot.timingContract?.estimatedActiveDurationSec).toFixed(1)}s.`, "Giữ đuôi render ổn định, không lặp hành động; dùng active-content boundary khi dựng.", "warning");
}

function validateActionContract(shot: Shot, provider: ProviderPlatform, transformationKinds: string[], add: AddIssue) {
  const { dominantAction, ownerBeats } = validateActionOwnership(shot, transformationKinds, add);
  validateActionTiming(shot, ownerBeats, add);
  const policy = getProviderVideoDurationPolicy(provider);
  if (policy.supportedDurationsSec.length && !policy.supportedDurationsSec.includes(shot.durationSec)) add("UNSUPPORTED_DURATION", `${shot.durationSec}s không nằm trong duration provider hỗ trợ: ${policy.supportedDurationsSec.join(", ")}s.`, "Chọn duration được provider hỗ trợ trước khi queue.");
  return dominantAction;
}

function stateTags(value: string) {
  const text = String(value || "").toLowerCase();
  return new Set([
    /(?:collar|neck|cổ)/u.test(text) ? "collar" : "",
    /(?:hand|paw|tay|chân)/u.test(text) ? "hand" : "",
    /(?:model|prop|mô hình|đạo cụ)/u.test(text) ? "prop" : "",
    /(?:absent|missing|removed|không còn|đã tháo)/u.test(text) ? "absent" : ""
  ].filter(Boolean));
}

function entityOwnershipMoved(before: Set<string>, after: Set<string>) {
  const locations = ["collar", "hand", "prop"];
  const beforeLocation = locations.find((location) => before.has(location));
  const afterLocation = locations.find((location) => after.has(location));
  return Boolean(beforeLocation && (after.has("absent") || (afterLocation && afterLocation !== beforeLocation)));
}

function validateCutContract(shot: Shot, add: AddIssue) {
  for (const field of ["transitionIn", "transitionOut", "screenDirection"] as const) {
    if (!String(shot[field] || "").trim()) add("CUT_CONTRACT_MISSING", `Thiếu ${field} trong cut contract.`, "Mô tả trạng thái được nhận, trạng thái bàn giao và địa lý màn hình.");
  }
  const states = [shot.continuityContract?.incomingState || shot.transitionIn, shot.continuityContract?.outgoingState || shot.transitionOut];
  if (states.some((state) => /(?:open|mở).{0,24}(?:closed|đóng)|(?:closed|đóng).{0,24}(?:open|mở)/i.test(String(state || "")))) add("CONTRADICTORY_PROP_STATE", "Cut contract chứa trạng thái đạo cụ mở/đóng mâu thuẫn trong cùng một handoff.", "Chọn đúng một incoming state và một outgoing state; nếu trạng thái đổi, mô tả hành động đổi trạng thái nhìn thấy được.");
}

function validateEntityTransfers(shot: Shot, previousShot: Shot | undefined, transformationKinds: string[], add: AddIssue) {
  if (!previousShot?.continuityContract?.entities?.length || !shot.continuityContract?.entities?.length) return;
  const transferVisible = transformationKinds.some((kind) => ["detach_remove", "attach_install", "lift_weight", "transfer", "extract_rescue"].includes(kind));
  for (const incoming of shot.continuityContract.entities) {
    const outgoing = previousShot.continuityContract.entities.find((entity) => entity.id === incoming.id);
    if (!outgoing || !/(?:^|_)(?:prop|accessory|item|bow|ribbon)(?:_|$)/iu.test(incoming.id)) continue;
    const before = stateTags(`${outgoing.owner || ""} ${outgoing.state || ""}`);
    const after = stateTags(`${incoming.owner || ""} ${incoming.state || ""}`);
    const ownershipJump = entityOwnershipMoved(before, after);
    if (ownershipJump && !transferVisible) add("UNSEEN_ENTITY_TRANSFER_AT_CUT", `${incoming.id} đổi owner/state giữa frame cuối shot trước và frame đầu shot này mà không có hành động onscreen.`, "Giữ nguyên owner ở cut hoặc đưa thao tác tháo/chuyển/gắn vào dominant action và timed action beats của shot.");
  }
}

function validateContinuityContract(shot: Shot, previousShot: Shot | undefined, transformationKinds: string[], add: AddIssue) {
  validateCutContract(shot, add);
  validateEntityTransfers(shot, previousShot, transformationKinds, add);
}

function validateSpeechDelivery(shot: Shot, speechType: string, speechDelivery: string, add: AddIssue) {
  if (!shot.speechDelivery) add("SPEECH_DELIVERY_MISSING", "Shot chưa khai báo nguồn phát thoại rõ ràng.", "Gán speechDelivery rõ ràng; không tự mặc định thành lip-sync.");
  const requiredDelivery = expectedDelivery(shot);
  if (requiredDelivery && speechDelivery !== requiredDelivery) add("SPEECH_DELIVERY_MISMATCH", `${speechType} phải dùng ${requiredDelivery}, hiện là ${speechDelivery}.`, "Sửa Delivery để nguồn âm thanh và lip-sync đúng ngữ nghĩa.");
  if (speechType === "dialogue" && speechDelivery === "none") add("SPEECH_DELIVERY_MISMATCH", "Dialogue không thể dùng delivery none.", "Chọn on-screen lip-sync hoặc recording/off-screen khi nguồn thoại phù hợp.");
  if (speechDelivery === "recording" && !shot.recordingSource?.trim()) add("RECORDING_SOURCE_MISSING", "Thoại recording chưa chỉ rõ thiết bị phát.", "Ghi rõ radio, điện thoại, loa hoặc thiết bị hiện diện trong shot.");
}

function validateSpeechBeats(shot: Shot, add: AddIssue) {
  for (const [index, beat] of (shot.actionBeats ?? []).entries()) {
    if (!beat.speechDelivery) add("BEAT_SPEECH_DELIVERY_MISSING", `Action beat ${index + 1} chưa có speechDelivery.`, "Giữ delivery tường minh trên từng beat để compiler không đoán người nói.");
    if (beat.speechType !== "silent" && beat.dialogue?.trim() && !beat.speaker?.trim()) add("BEAT_SPEAKER_MISSING", `Action beat ${index + 1} có thoại nhưng không có speaker.`, "Gán đúng stable speaker name từ character registry.");
  }
}

function validateAudioBinding(shot: Shot, speechDelivery: string, add: AddIssue) {
  const audio = shot.audioContract;
  validateVoiceOwnership(shot, audio, add);
  validateAudioFields(shot, audio, add);
  const binding = audio?.voiceBinding as { voiceId?: string; voiceSignature?: string; lockedAt?: string; provider?: string } | undefined;
  validateVoiceBinding(binding, add);
  validateLipSyncSpeaker(shot, speechDelivery, add);
}

function validateVoiceOwnership(shot: Shot, audio: Shot["audioContract"], add: AddIssue) {
  if (!shot.speakerCharacterId || !audio?.speakerCharacterId || shot.speakerCharacterId !== audio.speakerCharacterId) add("VOICE_OWNERSHIP_UNRESOLVED", "Speaker chưa được bind nhất quán với character registry.", "Compile lại audio ownership từ screenplay cue và character registry; không đoán speaker ở adapter.");
}

function validateAudioFields(shot: Shot, audio: Shot["audioContract"], add: AddIssue) {
  const matches = audio ? [audio.speaker === shot.speaker, audio.exactDialogue === shot.dialogue, audio.allowedSpeakers.includes(String(shot.speaker || ""))] : [];
  if (!matches.length || !matches.every(Boolean)) add("AUDIO_CONTRACT_MISMATCH", "Audio contract không giữ nguyên speaker hoặc exact dialogue của shot.", "Trả lỗi về Voice/Audio Casting; không sửa lời thoại trong provider prompt.");
}

function validateVoiceBinding(binding: { voiceId?: string; voiceSignature?: string; lockedAt?: string; provider?: string } | undefined, add: AddIssue) {
  const fields = binding ? [binding.voiceId, binding.voiceSignature, binding.lockedAt] : [];
  if (!fields.length || fields.some((value) => !value) || binding?.provider === "google-flow") add("VOICE_CASTING_REQUIRED", "Shot có thoại nhưng chưa có executable audio-pass voice binding.", "Khóa một voice ở audio provider hỗ trợ ID/reference ổn định trước khi queue video.");
}

function validateLipSyncSpeaker(shot: Shot, speechDelivery: string, add: AddIssue) {
  if (speechDelivery === "onscreen_lipsync" && !shot.visibleEntityIds?.includes(String(shot.speaker || ""))) add("LIPSYNC_SPEAKER_NOT_VISIBLE", "On-screen lipsync speaker không tồn tại trong visible entity set của shot.", "Thêm đúng identity reference của speaker vào composition hoặc đổi delivery tại screenplay nếu thật sự off-screen.");
}

function validateSpeechContract(shot: Shot, add: AddIssue) {
  const speechType = shot.speechType || (shot.dialogue?.trim() ? "dialogue" : "silent");
  const speechDelivery = shot.speechDelivery || defaultDelivery(shot);
  validateSpeechDelivery(shot, speechType, speechDelivery, add);
  validateSpeechBeats(shot, add);
  const spokenWordCount = String(shot.dialogue || "").trim().split(/\s+/).filter(Boolean).length;
  const spokenWordBudget = Math.max(0, Math.floor(shot.durationSec * 2 - 1));
  if (speechType !== "silent" && spokenWordCount > spokenWordBudget) add("SPEECH_BUDGET_EXCEEDED", `Thoại có ${spokenWordCount} từ, vượt ngân sách ${spokenWordBudget} từ cho ${shot.durationSec}s.`, "Rút ngắn câu hoặc chuyển sang provider duration dài hơn.");
  if (speechType !== "silent") validateAudioBinding(shot, speechDelivery, add);
  return { spokenWordCount, spokenWordBudget };
}

function validateKeyframeReference(shot: Shot, references: ReferenceInput[], assets: Asset[], aspectRatio: string, add: AddIssue) {
  validateReferenceDuplicates(references, add);
  if (!references.length) add("SHOT_KEYFRAME_MISSING", "Video job chưa có shot keyframe.", "Tạo và duyệt keyframe đúng shot trước khi queue video.");
  const first = references[0];
  const asset = assets.find((item) => item.id === first?.assetId);
  validateReferenceScope(shot, first, asset, add);

  validateReferenceAspect(asset, aspectRatio, add);
}

function validateReferenceDuplicates(references: ReferenceInput[], add: AddIssue) {
  const ids = references.map((reference) => String(reference.assetId || "")).filter(Boolean);
  const duplicates = ids.filter((value, index) => ids.indexOf(value) !== index);
  if (duplicates.length) add("DUPLICATE_REFERENCE", `Reference bị lặp: ${Array.from(new Set(duplicates)).join(", ")}.`, "Chỉ gửi mỗi asset một lần theo đúng vai trò.");
}

function validateReferenceScope(shot: Shot, first: ReferenceInput | undefined, asset: Asset | undefined, add: AddIssue) {
  if (first && (!asset || (!shot.assetIds.includes(first.assetId) && asset.shotId !== shot.id))) add("REFERENCE_NOT_SHOT_SCOPED", `Reference đầu tiên không thuộc shot ${shot.id}.`, "Dùng keyframe hiện hành được liên kết trực tiếp với shot.");
  if (first?.referenceRole && first.referenceRole !== "shot_keyframe") add("REFERENCE_ORDER_INVALID", "Reference đầu tiên phải là shot_keyframe.", "Đặt keyframe hoàn chỉnh ở vị trí đầu; semantic references chỉ là continuity phụ.");
}

function validateReferenceAspect(asset: Asset | undefined, aspectRatio: string, add: AddIssue) {
  const referenceAspect = aspectForAsset(asset);
  if (referenceAspect && aspectRatio && referenceAspect !== aspectRatio) add("REFERENCE_ASPECT_MISMATCH", `Keyframe ${referenceAspect} không khớp output ${aspectRatio}.`, "Regenerate hoặc chọn keyframe đúng khung trước khi gửi Flow.");
}

function validateIdentityReferences(shot: Shot, references: ReferenceInput[], add: AddIssue) {
  const identityLabels = new Set(references.filter((reference) => reference.referenceRole === "character_identity" || reference.referenceRole === "character_detail").map((reference) => String(reference.referenceLabel || "").trim().toLowerCase()).filter(Boolean));
  for (const entity of shot.visibleEntityIds || []) {
    if (!identityLabels.has(String(entity).trim().toLowerCase())) add("IDENTITY_REFERENCE_MISSING", `Nhân vật hiện hình ${entity} chưa có semantic identity reference trong payload.`, "Gửi keyframe cùng đúng character identity asset của nhân vật hiện hình; không dựa duy nhất vào storyboard frame.");
  }
}

function validateReferenceContract(shot: Shot, references: ReferenceInput[], assets: Asset[], aspectRatio: string, add: AddIssue) {
  validateKeyframeReference(shot, references, assets, aspectRatio, add);
  validateIdentityReferences(shot, references, add);
}

export function validateVideoPreflight({
  shot,
  previousShot,
  prompt,
  references,
  assets,
  jobs,
  provider,
  aspectRatio,
  providerRoute = "Studio Shot Bridge"
}: {
  shot: Shot;
  previousShot?: Shot;
  prompt: string;
  references: ReferenceInput[];
  assets: Asset[];
  jobs: AutomationJob[];
  provider: ProviderPlatform;
  aspectRatio: string;
  providerRoute?: string;
}): VideoPreflightValidation {
  const issues: VideoPreflightIssue[] = [];
  const add = (code: string, message: string, repair: string, severity: "error" | "warning" = "error") => issues.push({ code, severity, message, repair, owner: videoPreflightIssueOwner(code) });
  const transformationKinds = classifyVisibleTransformations(shot);
  const { promptCharacters, promptBytes, requiresTextCompaction } = validatePromptContract(prompt, add);
  const dominantAction = validateActionContract(shot, provider, transformationKinds, add);
  validateContinuityContract(shot, previousShot, transformationKinds, add);
  const { spokenWordCount, spokenWordBudget } = validateSpeechContract(shot, add);
  validateReferenceContract(shot, references, assets, aspectRatio, add);

  const promptHash = stableHash(prompt);
  const referenceHashes = references.map((reference) => stableHash(`${reference.assetId}|${reference.filePath}|${reference.referenceRole || "unknown"}`));
  const idempotencyKey = stableHash([provider, shot.id, promptHash, ...referenceHashes, providerRoute].join("|"));
  const duplicateActiveJob = jobs.find((job) =>
    job.shotId === shot.id &&
    job.jobType === "video" &&
    ["pending", "opening_provider", "submitting", "generating", "downloading"].includes(job.status) &&
    (job.idempotencyKey === idempotencyKey || (job.input as { bridgeMessage?: { settings?: { idempotencyKey?: string } } })?.bridgeMessage?.settings?.idempotencyKey === idempotencyKey)
  );
  if (duplicateActiveJob) add("DUPLICATE_ACTIVE_SUBMIT", `Payload này đang chạy ở job ${duplicateActiveJob.id}.`, "Chờ job hiện hành hoàn tất; không submit lại cùng payload.");

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    shotId: shot.id,
    issues,
    dominantAction,
    transformationKinds,
    spokenWordCount,
    spokenWordBudget,
    promptHash,
    referenceHashes,
    idempotencyKey,
    providerRoute,
    estimatedSubmits: issues.some((issue) => issue.severity === "error") ? 0 : 1,
    promptCharacters,
    promptBytes,
    promptHardLimit: FLOW_PROMPT_HARD_LIMIT,
    promptSafeLimit: FLOW_PROMPT_SAFE_BYTES,
    requiresTextCompaction
  };
}

export function preflightIssueSummary(validation: VideoPreflightValidation) {
  const blocking = validation.issues.filter((issue) => issue.severity === "error");
  return blocking.length ? blocking.map((issue) => `${issue.code}: ${issue.message} ${issue.repair}`).join(" · ") : "Preflight hợp lệ: 1 submit dự kiến.";
}
