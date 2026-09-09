import type { Asset, AutomationJob, EditSequence, EditSequenceClip, Scene, Shot, VideoEditorialReview } from "@studio/types";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

type TimelineClip = EditSequenceClip & { sourceDurationSec?: number; label: string };

type EditPanelModelArgs = {
  shots: Shot[];
  scenes: Scene[];
  assets: Asset[];
  jobs: AutomationJob[];
  selectedShotId: string;
  onSelectShot: (shotId: string) => void;
  insertAfterShotId: string | undefined;
  onSelectInsertCut: (shotId: string | undefined) => void;
  sequenceModel: EditSequence;
  onUpdateSequence: (sequence: EditSequence) => Promise<void>;
  onGenerateSoundBed: (payload: { kind: "rain" | "machine" | "horn"; timelineStartSec: number; durationSec: number; label?: string; shotId?: string; gain?: number }) => Promise<void>;
  onSaveVideoReviewFrame: (payload: { assetId: string; kind: "first" | "last"; dataUrl: string; timeSeconds: number }) => Promise<void>;
  onUpdateVideoReview: (assetId: string, review: Omit<VideoEditorialReview, "reviewedAt">) => Promise<void>;
  exportJobs: AutomationJob[];
  finalExportAllowed?: boolean;
  finalExportBlockReason?: string;
  onExportSequence: (draft: boolean) => Promise<void>;
  onCancelExport: (jobId: string) => Promise<void>;
  selectShotKeyframes: (assets: Asset[], shot: Shot, jobs: AutomationJob[]) => Asset[];
  selectShotVideos: (assets: Asset[], shot: Shot, jobs: AutomationJob[]) => Asset[];
};

function videoForShot(args: EditPanelModelArgs, shot: Shot) {
  return args.selectShotVideos(args.assets, shot, args.jobs)[0];
}

function imageForShot(args: EditPanelModelArgs, shot: Shot) {
  return args.selectShotKeyframes(args.assets, shot, args.jobs)[0];
}

function sourceDuration(args: EditPanelModelArgs, shot: Shot | undefined) {
  if (!shot) return undefined;
  const video = videoForShot(args, shot);
  const value = Number(video?.durationSeconds ?? video?.metadata?.durationSeconds ?? video?.metadata?.duration);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function hydrateTimelineClips(args: EditPanelModelArgs): TimelineClip[] {
  return args.sequenceModel.clips.slice().sort((a, b) => a.order - b.order).map((clip) => {
    const shot = args.shots.find((item) => item.id === clip.shotId);
    return { ...clip, sourceDurationSec: sourceDuration(args, shot), label: `SH${shot?.order ?? clip.order + 1}` };
  });
}

function persistableClips(clips: TimelineClip[]) {
  return clips.map(({ sourceDurationSec: _sourceDurationSec, label: _label, ...clip }, order) => ({ ...clip, order }));
}

function clipStart(clips: TimelineClip[], clipId: string) {
  return clips.slice(0, Math.max(0, clips.findIndex((clip) => clip.id === clipId))).reduce((total, clip) => total + clip.timelineDurationSec, 0);
}

function clipAtTime(clips: TimelineClip[], timeSec: number) {
  let cursor = 0;
  return clips.find((clip) => {
    const start = cursor;
    cursor += clip.timelineDurationSec;
    return timeSec >= start && timeSec < cursor;
  }) ?? clips.at(-1);
}

function useTimelineCore(args: EditPanelModelArgs) {
  const [clips, setClips] = useState<TimelineClip[]>(() => hydrateTimelineClips(args));
  const [selectedClipId, setSelectedClipId] = useState(() => args.sequenceModel.clips.find((clip) => clip.shotId === args.selectedShotId)?.id ?? args.sequenceModel.clips[0]?.id ?? "");
  const [playheadSec, setPlayheadSec] = useState(0);
  const clipsRef = useRef<TimelineClip[]>(clips);
  const historyRef = useRef<{ past: EditSequenceClip[][]; future: EditSequenceClip[][] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => setClips(hydrateTimelineClips(args)), [args.sequenceModel.revision, args.sequenceModel.updatedAt]);
  const sequence = args.shots.map((shot) => ({ shot, scene: args.scenes.find((item) => item.id === shot.sceneId), video: videoForShot(args, shot), image: imageForShot(args, shot) }));
  const itemForClip = (clip: TimelineClip) => sequence.find((item) => item.shot.id === clip.shotId);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? clips.find((clip) => clip.shotId === args.selectedShotId) ?? clips[0];
  const selectedIndex = Math.max(0, clips.findIndex((clip) => clip.id === selectedClip?.id));
  const selectedItem = selectedClip ? itemForClip(selectedClip) ?? sequence[0] : sequence[0];
  const selectedVideo = args.assets.find((asset) => asset.id === selectedClip?.sourceAssetId && asset.type === "video") ?? selectedItem?.video;
  const totalDuration = clips.reduce((total, clip) => total + clip.timelineDurationSec, 0);
  const persist = (next: TimelineClip[]) => args.onUpdateSequence({ ...args.sequenceModel, revision: args.sequenceModel.revision + 1, clips: persistableClips(next), updatedAt: new Date().toISOString() });
  const recordHistory = (previous: TimelineClip[], next: TimelineClip[]) => {
    const before = persistableClips(previous);
    const after = persistableClips(next);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    historyRef.current.past.push(before);
    historyRef.current.future = [];
    setHistoryTick((value) => value + 1);
    return true;
  };
  const commitClips = (next: TimelineClip[], previous = clipsRef.current) => {
    recordHistory(previous, next);
    setClips(next);
    clipsRef.current = next;
    void persist(next);
  };
  const restoreHistory = (direction: "undo" | "redo") => {
    const source = direction === "undo" ? historyRef.current.past : historyRef.current.future;
    if (!source.length) return;
    const current = persistableClips(clipsRef.current);
    const target = source.pop()!;
    (direction === "undo" ? historyRef.current.future : historyRef.current.past).push(current);
    const hydrated = target.map((clip) => {
      const shot = args.shots.find((item) => item.id === clip.shotId);
      return { ...clip, sourceDurationSec: sourceDuration(args, shot), label: `SH${shot?.order ?? clip.order + 1}` };
    });
    setClips(hydrated); clipsRef.current = hydrated; void persist(hydrated); setHistoryTick((value) => value + 1);
  };
  const seekTo = (timeSec: number, updateSelection = true) => {
    // Keep millisecond precision so frame-step controls (1/30s) and precise
    // trim navigation are not flattened to a tenth of a second.
    const next = Math.max(0, Math.min(totalDuration, Math.round(timeSec * 1000) / 1000));
    setPlayheadSec(next);
    const clip = updateSelection ? clipAtTime(clips, next) : undefined;
    if (clip && clip.id !== selectedClipId) { setSelectedClipId(clip.id); args.onSelectShot(clip.shotId); }
  };
  return { clips, clipsRef, canRedo: historyRef.current.future.length > 0, canUndo: historyRef.current.past.length > 0, commitClips, historyTick, itemForClip, persist, recordHistory, redo: () => restoreHistory("redo"), undo: () => restoreHistory("undo"), playheadSec, seekTo, selectedClip, selectedClipId, selectedIndex, selectedItem, selectedVideo, sequence, setClips, setPlayheadSec, setSelectedClipId, totalDuration };
}

type TimelineCore = ReturnType<typeof useTimelineCore>;

function moveClip(core: TimelineCore, dragId: string, targetIndex: number) {
  const current = core.clipsRef.current;
  {
    const dragIndex = current.findIndex((clip) => clip.id === dragId);
    if (dragIndex < 0) return;
    const next = [...current];
    const [dragged] = next.splice(dragIndex, 1);
    next.splice(Math.max(0, Math.min(next.length, targetIndex)), 0, dragged);
    core.commitClips(next, current);
  }
}

function useTimelineEditing(args: EditPanelModelArgs, core: TimelineCore, timelineUnit: number) {
  const rafRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  const selectClip = (clip: TimelineClip) => { core.setSelectedClipId(clip.id); args.onSelectShot(clip.shotId); core.seekTo(clipStart(core.clips, clip.id)); };
  const moveSelectedBy = (delta: number) => {
    if (!core.selectedClip) return;
    moveClip(core, core.selectedClip.id, core.clips.findIndex((clip) => clip.id === core.selectedClip!.id) + delta);
  };
  const beginPlayheadDrag = (event: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault();
    const moveTo = (clientX: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => { const rect = viewportRef.current?.getBoundingClientRect(); if (rect && viewportRef.current) core.seekTo((clientX - rect.left + viewportRef.current.scrollLeft) / timelineUnit); });
    };
    moveTo(event.clientX);
    const onMove = (moveEvent: PointerEvent) => moveTo(moveEvent.clientX);
    const onUp = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };
  return { beginPlayheadDrag, moveSelectedBy, rafRef, selectClip, timelineViewportRef: viewportRef };
}

function clipInsertIndex(core: TimelineCore, viewport: HTMLDivElement | null, clientX: number, ignoreClipId: string, timelineUnit: number) {
  if (!viewport) return core.clipsRef.current.length;
  const x = clientX - viewport.getBoundingClientRect().left + viewport.scrollLeft;
  let cursor = 0;
  const visible = core.clipsRef.current.filter((clip) => clip.id !== ignoreClipId);
  const found = visible.findIndex((clip) => { const midpoint = cursor + clip.timelineDurationSec * timelineUnit / 2; cursor += clip.timelineDurationSec * timelineUnit; return x < midpoint; });
  return found === -1 ? visible.length : found;
}

function useClipPointerEditing(core: TimelineCore, editing: ReturnType<typeof useTimelineEditing>, timelineUnit: number) {
  const beginClipDrag = (event: React.PointerEvent<HTMLButtonElement>, clip: TimelineClip) => {
    if ((event.target as HTMLElement).closest(".clip-trim-handle")) return;
    event.preventDefault(); const startX = event.clientX; const element = event.currentTarget;
    element.setPointerCapture(event.pointerId); element.classList.add("dragging");
    const onMove = (moveEvent: PointerEvent) => { if (editing.rafRef.current) cancelAnimationFrame(editing.rafRef.current); editing.rafRef.current = requestAnimationFrame(() => { element.style.transform = `translateX(${moveEvent.clientX - startX}px)`; }); };
    const onUp = (upEvent: PointerEvent) => {
      if (editing.rafRef.current) cancelAnimationFrame(editing.rafRef.current); editing.rafRef.current = null; element.style.transform = ""; element.classList.remove("dragging"); element.releasePointerCapture(event.pointerId);
      if (Math.abs(upEvent.clientX - startX) > 8) moveClip(core, clip.id, clipInsertIndex(core, editing.timelineViewportRef.current, upEvent.clientX, clip.id, timelineUnit)); else editing.selectClip(clip);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };
  const beginTrim = (event: React.PointerEvent<HTMLSpanElement>, clipId: string, edge: "start" | "end") => {
    event.preventDefault(); event.stopPropagation(); const startX = event.clientX;
    const before = core.clipsRef.current;
    const startDuration = core.clips.find((clip) => clip.id === clipId)?.timelineDurationSec ?? 1;
    const onMove = (moveEvent: PointerEvent) => { if (editing.rafRef.current) cancelAnimationFrame(editing.rafRef.current); editing.rafRef.current = requestAnimationFrame(() => {
      const delta = Math.round((moveEvent.clientX - startX) / timelineUnit); const duration = Math.max(0.1, edge === "end" ? startDuration + delta : startDuration - delta);
      core.setClips((current) => current.map((clip) => clip.id !== clipId ? clip : edge === "start" ? { ...clip, sourceInSec: Math.max(0, clip.sourceOutSec - Math.min(clip.sourceOutSec, duration)), timelineDurationSec: Math.min(clip.sourceOutSec, duration) } : { ...clip, sourceOutSec: Math.min(clip.sourceDurationSec ?? clip.sourceOutSec, clip.sourceInSec + duration), timelineDurationSec: Math.min(clip.sourceDurationSec ?? clip.sourceOutSec, clip.sourceInSec + duration) - clip.sourceInSec }));
    }); };
    const onUp = () => { if (editing.rafRef.current) cancelAnimationFrame(editing.rafRef.current); editing.rafRef.current = null; core.recordHistory(before, core.clipsRef.current); void core.persist(core.clipsRef.current); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };
  return { beginClipDrag, beginTrim };
}

function useClipCommands(args: EditPanelModelArgs, core: TimelineCore) {
  const splitSelectedClip = () => {
    const clip = core.selectedClip;
    if (!clip || clip.timelineDurationSec < 0.2) return;
    const local = Math.max(0, Math.min(clip.timelineDurationSec, core.playheadSec - clipStart(core.clips, clip.id)));
    const firstDuration = Math.max(0.1, Math.min(clip.timelineDurationSec - 0.1, local || clip.timelineDurationSec / 2));
    const splitAt = clip.sourceInSec + firstDuration;
    const next = core.clips.flatMap((item) => item.id === clip.id ? [{ ...item, id: `${item.id}:a${Date.now()}`, sourceOutSec: splitAt, timelineDurationSec: firstDuration, splitFromClipId: item.id }, { ...item, id: `${item.id}:b${Date.now()}`, sourceInSec: splitAt, timelineDurationSec: item.timelineDurationSec - firstDuration, splitFromClipId: item.id, segment: item.segment + 1 }] : [item]);
    core.commitClips(next, core.clipsRef.current);
  };
  const duplicateSelectedClip = () => {
    const clip = core.selectedClip; if (!clip) return; const index = core.clips.findIndex((item) => item.id === clip.id);
    const duplicate = { ...clip, id: `${clip.id}:insert:${Date.now()}`, splitFromClipId: clip.splitFromClipId ?? clip.id, segment: clip.segment + 1 };
    const next = [...core.clips.slice(0, index + 1), duplicate, ...core.clips.slice(index + 1)]; core.commitClips(next, core.clipsRef.current); core.setSelectedClipId(duplicate.id);
  };
  const deleteSelectedClip = () => {
    const clip = core.selectedClip; if (!clip || core.clips.length <= 1) return; const index = core.clips.findIndex((item) => item.id === clip.id);
    const next = core.clips.filter((item) => item.id !== clip.id); const fallback = next[Math.min(index, next.length - 1)]; core.commitClips(next, core.clipsRef.current); core.setSelectedClipId(fallback.id); args.onSelectShot(fallback.shotId);
  };
  return { deleteSelectedClip, duplicateSelectedClip, splitSelectedClip };
}

function playbackCannotAdvance(core: TimelineCore, video: HTMLVideoElement | null, readyClipId: string | undefined, transitionLocked: boolean, advancingClipId: string | undefined) {
  const clip = core.selectedClip;
  if (!clip || transitionLocked || advancingClipId === clip.id || readyClipId !== clip.id) return true;
  if (video?.dataset.clipId !== clip.id) return true;
  if (core.selectedVideo && video.currentSrc && video.currentSrc !== core.selectedVideo.filePath) return true;
  return Boolean(video && video.currentTime < clip.sourceOutSec - 0.03);
}

function useTimelinePlayback(args: EditPanelModelArgs, core: TimelineCore) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null); const advancingRef = useRef<string | undefined>(undefined); const readyRef = useRef<string | undefined>(undefined); const pendingRef = useRef<string | undefined>(undefined); const lockRef = useRef(0);
  const sequencePlayingRef = useRef(false); const autoAdvancePlayRef = useRef(false); const [sequencePlaying, setSequencePlaying] = useState(false);
  const advancePlayback = (sourceVideo?: HTMLVideoElement) => {
    const clip = core.selectedClip; const video = sourceVideo ?? previewVideoRef.current;
    if (!clip || playbackCannotAdvance(core, video, readyRef.current, Date.now() < lockRef.current, advancingRef.current)) return;
    advancingRef.current = clip.id;
    advanceToNextClip(core, clip, args, pendingRef, lockRef, sequencePlayingRef, autoAdvancePlayRef, setSequencePlaying);
  };
  useEffect(() => {
    const video = previewVideoRef.current; const clip = core.selectedClip; if (!video || !clip) return;
    advancingRef.current = undefined; readyRef.current = undefined;
    const seek = () => { video.currentTime = clip.sourceInSec; requestAnimationFrame(() => { readyRef.current = clip.id; if (autoAdvancePlayRef.current || pendingRef.current === clip.id) { sequencePlayingRef.current = true; setSequencePlaying(true); void video.play().catch(() => undefined); } }); };
    if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [core.selectedClip?.id, core.selectedVideo?.id]);
  const updatePlaybackPosition = (sourceVideo?: HTMLVideoElement) => { const video = sourceVideo ?? previewVideoRef.current; const clip = core.selectedClip; if (!video || !clip || readyRef.current !== clip.id) return; core.setPlayheadSec(Math.min(core.totalDuration, clipStart(core.clips, clip.id) + Math.max(0, video.currentTime - clip.sourceInSec))); if (video.currentTime >= clip.sourceOutSec - 0.03) advancePlayback(video); };
  return { advancePlayback, autoAdvancePlayRef, pendingAutoPlayClipIdRef: pendingRef, previewVideoRef, sequencePlaying, sequencePlayingRef, setSequencePlaying, updatePlaybackPosition };
}

function advanceToNextClip(core: TimelineCore, clip: NonNullable<TimelineCore["selectedClip"]>, args: EditPanelModelArgs, pendingRef: MutableRefObject<string | undefined>, lockRef: MutableRefObject<number>, sequencePlayingRef: MutableRefObject<boolean>, autoAdvancePlayRef: MutableRefObject<boolean>, setSequencePlaying: (value: boolean) => void) {
  const next = core.clips[core.selectedIndex + 1];
  if (!next) { sequencePlayingRef.current = false; autoAdvancePlayRef.current = false; setSequencePlaying(false); core.setPlayheadSec(core.totalDuration); return; }
  core.setSelectedClipId(next.id); pendingRef.current = next.id; lockRef.current = Date.now() + 350;
  args.onSelectShot(next.shotId); core.setPlayheadSec(clipStart(core.clips, next.id)); sequencePlayingRef.current = true; autoAdvancePlayRef.current = true; setSequencePlaying(true);
}

function useAudioPlayback(args: EditPanelModelArgs, core: TimelineCore, playback: ReturnType<typeof useTimelinePlayback>) {
  const audioMix = args.sequenceModel.audioMix ?? { sourceGain: 0.65, dialogueGain: 1, voiceoverGain: 1, ambienceGain: 0.7, musicGain: 0.45 };
  const audioClips = args.sequenceModel.audioClips ?? []; const audioElementRefs = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => { if (playback.previewVideoRef.current) playback.previewVideoRef.current.volume = Math.max(0, Math.min(1, audioMix.sourceGain)); }, [audioMix.sourceGain, core.selectedVideo?.id]);
  useEffect(() => { audioClips.forEach((clip) => syncAudioClip(clip, audioElementRefs.current.get(clip.id), audioMix, core.playheadSec, playback.sequencePlaying)); }, [audioClips, audioMix, core.playheadSec, playback.sequencePlaying]);
  const nudgeAudioClip = (id: string, deltaSec: number) => nudgeAudioClipPosition(id, deltaSec, audioClips, core, args);
  return { audioClips, audioElementRefs, audioMix, nudgeAudioClip };
}

function audioGainForClip(kind: string, mix: NonNullable<EditSequence["audioMix"]>) {
  if (kind === "dialogue") return mix.dialogueGain;
  if (["internal_voice", "narration", "recording"].includes(kind)) return mix.voiceoverGain;
  return kind === "ambience" ? mix.ambienceGain : mix.musicGain;
}

function syncAudioClip(clip: NonNullable<EditSequence["audioClips"]>[number], element: HTMLAudioElement | undefined, mix: NonNullable<EditSequence["audioMix"]>, playheadSec: number, sequencePlaying: boolean) {
  if (!element) return;
  const local = playheadSec - clip.timelineStartSec + clip.sourceInSec;
  const active = local >= clip.sourceInSec && local < clip.sourceOutSec;
  element.volume = Math.max(0, Math.min(1, clip.gain * audioGainForClip(clip.kind, mix)));
  if (!active) { element.pause(); return; }
  if (Math.abs(element.currentTime - local) > 0.2) element.currentTime = local;
  if (sequencePlaying && element.paused) void element.play().catch(() => undefined);
  if (!sequencePlaying && !element.paused) element.pause();
}

function nudgeAudioClipPosition(id: string, deltaSec: number, audioClips: NonNullable<EditSequence["audioClips"]>, core: TimelineCore, args: EditPanelModelArgs) {
  const target = audioClips.find((clip) => clip.id === id);
  if (!target) return;
  let start = 0; let end = core.totalDuration;
  for (const clip of core.clips) { end = start + clip.timelineDurationSec; if (clip.shotId === target.shotId) break; start = end; }
  const next = Math.max(start, Math.min(Math.max(start, end - target.timelineDurationSec), Math.round((target.timelineStartSec + deltaSec) * 100) / 100));
  if (next === target.timelineStartSec) return;
  void args.onUpdateSequence({ ...args.sequenceModel, audioClips: audioClips.map((clip) => clip.id === id ? { ...clip, timelineStartSec: next, updatedAt: new Date().toISOString() } : clip), revision: args.sequenceModel.revision + 1, updatedAt: new Date().toISOString() });
}

function useSoundBed(args: EditPanelModelArgs, core: TimelineCore) {
  const [soundBedKind, setSoundBedKind] = useState<"rain" | "machine" | "horn">("rain"); const [soundBedStartSec, setSoundBedStartSec] = useState(0); const [soundBedDurationSec, setSoundBedDurationSec] = useState(8); const [soundBedGain, setSoundBedGain] = useState(0.7); const [soundBedBusy, setSoundBedBusy] = useState(false); const [soundBedError, setSoundBedError] = useState("");
  const generateSoundBed = async () => { setSoundBedError(""); setSoundBedBusy(true); try { await args.onGenerateSoundBed({ kind: soundBedKind, timelineStartSec: soundBedStartSec, durationSec: soundBedKind === "rain" ? Math.max(0.2, core.totalDuration - soundBedStartSec) : soundBedDurationSec, gain: soundBedGain, shotId: soundBedKind === "rain" ? undefined : core.selectedItem?.shot.id, label: soundBedKind === "rain" ? "Continuous rain ambience" : soundBedKind === "machine" ? "Machine activation" : "Offscreen horn" }); } catch (error) { setSoundBedError(error instanceof Error ? error.message : String(error)); } finally { setSoundBedBusy(false); } };
  return { generateSoundBed, setSoundBedDurationSec, setSoundBedGain, setSoundBedKind, setSoundBedStartSec, soundBedBusy, soundBedDurationSec, soundBedError, soundBedGain, soundBedKind, soundBedStartSec };
}

function useExportModel(args: EditPanelModelArgs, clips: TimelineClip[]) {
  const [exportError, setExportError] = useState(""); const sorted = [...args.exportJobs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const latestExport = sorted[0]; const activeExport = [...args.exportJobs].reverse().find((job) => ["pending", "submitting", "generating", "downloading"].includes(job.status)); const latestMasterJob = sorted.find((job) => job.resultAssetIds.length > 0); const masterAsset = args.assets.find((asset) => latestMasterJob?.resultAssetIds.includes(asset.id));
  const unacceptedClips = clips.filter((clip) => {
    // Review is editorially optional. Export only needs a real video source
    // and a valid trim range; users can inspect/review media when they want.
    const shot = args.shots.find((item) => item.id === clip.shotId);
    const linkedAsset = args.assets.find((item) => item.id === clip.sourceAssetId);
    const asset = linkedAsset?.type === "video" ? linkedAsset : (shot ? videoForShot(args, shot) : undefined);
    return asset?.type !== "video" || !(Number(clip.sourceOutSec) > Number(clip.sourceInSec));
  });
  const requestExport = async (draft: boolean) => { setExportError(""); try { await args.onExportSequence(draft); } catch (error) { setExportError(error instanceof Error ? error.message : String(error)); } };
  return { activeExport, exportError, finalExportBlockReason: args.finalExportAllowed === false ? (args.finalExportBlockReason || "Bản dựng đang bị QA chặn; hãy xử lý các cảnh báo trước khi xuất bản cuối.") : undefined, finalExportEligible: args.finalExportAllowed !== false && clips.length > 0 && unacceptedClips.length === 0, latestExport, masterAsset, requestExport, unacceptedClips };
}

export function useEditPanelModel(args: EditPanelModelArgs) {
  const timelineUnit = 52; const core = useTimelineCore(args); const editing = useTimelineEditing(args, core, timelineUnit); const pointer = useClipPointerEditing(core, editing, timelineUnit); const commands = useClipCommands(args, core); const playback = useTimelinePlayback(args, core); const audio = useAudioPlayback(args, core, playback); const sound = useSoundBed(args, core); const exports = useExportModel(args, core.clips);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (event.shiftKey) core.redo(); else core.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [core.redo, core.undo]);
  useEffect(() => { if (core.playheadSec > core.totalDuration) core.setPlayheadSec(core.totalDuration); }, [core.totalDuration, core.playheadSec]);
  // Historical sequences may predate persisted sourceAssetId. Resolve the
  // selected video through the shot in that case so the source-duration
  // metric remains truthful for existing video-rich projects.
  const sourceIds = Array.from(new Set(core.clips.map((clip) => clip.sourceAssetId ?? core.itemForClip(clip)?.video?.id).filter(Boolean)));
  const totalSourceDuration = sourceIds.reduce((total, id) => { const asset = args.assets.find((item) => item.id === id); const duration = Number(asset?.durationSeconds ?? asset?.metadata?.durationSeconds ?? asset?.metadata?.duration); return total + (Number.isFinite(duration) && duration > 0 ? duration : 0); }, 0);
  return { ...exports, ...playback, ...audio, ...sound, ...commands, ...pointer, approvedCount: args.shots.filter((shot) => Boolean(videoForShot(args, shot))).length, assets: args.assets, beginPlayheadDrag: editing.beginPlayheadDrag, canRedo: core.canRedo, canUndo: core.canUndo, clampedPlayheadSec: Math.max(0, Math.min(core.totalDuration, core.playheadSec)), clips: core.clips, itemForClip: core.itemForClip, moveSelectedBy: editing.moveSelectedBy, onCancelExport: args.onCancelExport, onSaveVideoReviewFrame: args.onSaveVideoReviewFrame, onSelectInsertCut: args.onSelectInsertCut, onUpdateSequence: args.onUpdateSequence, onUpdateVideoReview: args.onUpdateVideoReview, redo: core.redo, seekTo: core.seekTo, selectedClip: core.selectedClip, selectedIndex: core.selectedIndex, selectedItem: core.selectedItem, selectedVideo: core.selectedVideo, sequenceModel: args.sequenceModel, shots: args.shots, timelineUnit, timelineViewportRef: editing.timelineViewportRef, totalDuration: core.totalDuration, timelineWidth: Math.max(720, core.totalDuration * timelineUnit), totalPlannedDuration: args.shots.reduce((total, shot) => total + shot.durationSec, 0), totalSourceDuration, undo: core.undo, videoCount: core.clips.filter((clip) => core.itemForClip(clip)?.video).length };
}
