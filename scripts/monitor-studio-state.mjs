#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2).filter((argument, index) => argument !== "--" || index > 0);
const [statePath, logPath, intervalMinutesRaw = "30", checksRaw = "5"] = args;
if (!statePath || !logPath) {
  console.error("Usage: node scripts/monitor-studio-state.mjs <state.json> <log.jsonl> [interval-minutes] [checks]");
  process.exit(1);
}
const intervalMs = Math.max(1, Number(intervalMinutesRaw)) * 60_000;
const checks = Math.max(1, Number(checksRaw));
const active = new Set(["pending", "opening_provider", "submitting", "generating", "downloading"]);
const manualAction = new Set(["waiting_login", "waiting_manual_action"]);

async function sample(index) {
  const state = JSON.parse(await readFile(resolve(statePath), "utf8"));
  const projectId = state.activeProjectId;
  const project = state.projects.find((item) => item.id === projectId);
  const jobs = state.jobs.filter((job) => job.projectId === projectId);
  const activeJobs = jobs.filter((job) => active.has(job.status));
  const manualActionJobs = jobs.filter((job) => manualAction.has(job.status));
  const failures = jobs.filter((job) => job.status?.startsWith("failed"));
  const latest = [...jobs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  const record = {
    checkedAt: new Date().toISOString(), index, projectId, projectName: project?.name,
    activeJobs: activeJobs.length, manualActionJobs: manualActionJobs.length, totalJobs: jobs.length, failureEvents: failures.length,
    latestJob: latest && { id: latest.id, task: latest.input?.bridgeMessage?.task || latest.jobType, status: latest.status, updatedAt: latest.updatedAt, error: latest.error || latest.statusMessage },
    sequenceQA: project?.storyDocument?.sequenceQA?.status,
    classification: activeJobs.length ? "running" : manualActionJobs.length ? "manual_action_required" : latest?.status?.startsWith("failed") ? "blocked_or_retryable" : "idle_or_stage_complete"
  };
  await appendFile(resolve(logPath), `${JSON.stringify(record)}\n`, "utf8");
  console.log(JSON.stringify(record));
}

for (let index = 1; index <= checks; index += 1) {
  await sample(index);
  if (index < checks) await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
}
