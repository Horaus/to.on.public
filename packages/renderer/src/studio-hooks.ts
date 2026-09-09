import type { StudioState } from "@studio/types";
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { BridgeStatus, SkillDoc } from "@studio/workflow/studio-types";

type StudioStateHookOptions = {
  seededState: StudioState; fallbackSkills: SkillDoc[];
  onStateUpdate?: (incoming: StudioState) => void;
  onInitialState?: (incoming: StudioState, skills: SkillDoc[]) => void;
};

type StudioStateHookResult = {
  state: StudioState; setState: React.Dispatch<React.SetStateAction<StudioState>>;
  stateRef: React.MutableRefObject<StudioState>; bridgeStatus: BridgeStatus;
  refreshBridgeStatus: () => Promise<BridgeStatus | undefined>;
  setBridgeStatus: React.Dispatch<React.SetStateAction<BridgeStatus>>;
  skills: SkillDoc[]; setSkills: React.Dispatch<React.SetStateAction<SkillDoc[]>>;
};

const defaultBridgeStatus: BridgeStatus = {
  connectedExtensions: 0,
  expectedVersion: "0.1.67",
  versions: [],
  updateRequired: false,
  identifying: false
};

function useStudioBridgeSync({
  fallbackSkills,
  setState,
  setBridgeStatus,
  setSkills,
  onStateUpdateRef,
  onInitialStateRef
}: {
  fallbackSkills: SkillDoc[];
  setState: Dispatch<SetStateAction<StudioState>>;
  setBridgeStatus: Dispatch<SetStateAction<BridgeStatus>>;
  setSkills: Dispatch<SetStateAction<SkillDoc[]>>;
  onStateUpdateRef: MutableRefObject<StudioStateHookOptions["onStateUpdate"]>;
  onInitialStateRef: MutableRefObject<StudioStateHookOptions["onInitialState"]>;
}) {
  useEffect(() => {
    let currentSkills = fallbackSkills;
    let pendingState: StudioState | undefined;
    let stateCommitTimer: number | undefined;
    const commitState = (incoming: StudioState) => {
      pendingState = undefined;
      setState(incoming);
      onStateUpdateRef.current?.(incoming);
    };
    const scheduleState = (incoming: StudioState) => {
      pendingState = incoming;
      if (stateCommitTimer !== undefined) return;
      stateCommitTimer = window.setTimeout(() => {
        stateCommitTimer = undefined;
        if (pendingState) commitState(pendingState);
      }, 120);
    };
    const updateBridgeStatus = (incoming: BridgeStatus) => {
      setBridgeStatus((current) => JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming);
    };
    window.studioBridge?.getBridgeStatus().then(updateBridgeStatus);
    window.studioBridge?.getSkills().then((incoming) => {
      if (incoming.length > 0) { setSkills(incoming); currentSkills = incoming; }
    });
    const syncState = () => window.studioBridge?.getState().then((incoming) => {
      setState(incoming);
      onInitialStateRef.current?.(incoming, currentSkills);
    });
    syncState();
    // State events are the normal synchronization path. Keep a slow safety
    // reconcile for missed events; cloning the durable ledger is expensive
    // because it can contain thousands of historical jobs.
    const stateReconcileTimer = window.setInterval(syncState, 60_000);
    // Bridge topology can change independently of renderer state (for
    // example after the extension reloads or a Flow tab is opened/closed).
    // Reconcile at a low frequency so the UI does not keep showing a stale
    // "Cần mở project Flow" state while the bridge is already ready.
    const bridgeReconcileTimer = window.setInterval(() => {
      window.studioBridge?.getBridgeStatus().then(updateBridgeStatus).catch(() => undefined);
    }, 5_000);
    const offState = window.studioBridge?.onState(scheduleState);
    const offBridge = window.studioBridge?.onBridge(updateBridgeStatus);
    return () => {
      window.clearInterval(stateReconcileTimer);
      window.clearInterval(bridgeReconcileTimer);
      if (stateCommitTimer !== undefined) window.clearTimeout(stateCommitTimer);
      offState?.();
      offBridge?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useStudioState({
  seededState,
  fallbackSkills,
  onStateUpdate,
  onInitialState
}: StudioStateHookOptions): StudioStateHookResult {
  const [state, setState] = useState<StudioState>(seededState);
  const stateRef = useRef(state);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(defaultBridgeStatus);
  const [skills, setSkills] = useState<SkillDoc[]>(fallbackSkills);

  const onStateUpdateRef = useRef(onStateUpdate);
  const onInitialStateRef = useRef(onInitialState);

  useEffect(() => {
    onStateUpdateRef.current = onStateUpdate;
    onInitialStateRef.current = onInitialState;
  }, [onStateUpdate, onInitialState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useStudioBridgeSync({ fallbackSkills, setState, setBridgeStatus, setSkills, onStateUpdateRef, onInitialStateRef });

  const refreshBridgeStatus = async () => {
    const incoming = await window.studioBridge?.getBridgeStatus();
    if (incoming) setBridgeStatus(incoming);
    return incoming;
  };

  return { state, setState, stateRef, bridgeStatus, refreshBridgeStatus, setBridgeStatus, skills, setSkills };
}
