import { execFileSync } from "node:child_process";

const sampleCount = Math.max(2, Number(process.env.STUDIO_IDLE_SAMPLES || 6));
const intervalMs = Math.max(100, Number(process.env.STUDIO_IDLE_INTERVAL_MS || 1000));
const warmupMs = Math.max(0, Number(process.env.STUDIO_IDLE_WARMUP_MS || 1000));
const maxCpuPercent = Math.max(0.1, Number(process.env.STUDIO_IDLE_MAX_CPU_PERCENT || 5));
const maxRssGrowthBytes = Math.max(1024 * 1024, Number(process.env.STUDIO_IDLE_MAX_RSS_GROWTH_BYTES || 16 * 1024 * 1024));

function psLines(args) {
  return execFileSync("ps", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean);
}

function findElectronPid() {
  const rows = psLines(["-axo", "pid=,command="]);
  const match = rows.find((row) => /(?:electron|Electron).*--remote-debugging-port=\d+/i.test(row) && !/Antigravity IDE/i.test(row));
  return match ? Number(match.trim().split(/\s+/, 1)[0]) : 0;
}

function readProcessSample(pid) {
  const row = psLines(["-p", String(pid), "-o", "%cpu=,rss="])[0];
  if (!row) throw new Error(`Electron process ${pid} is no longer running.`);
  const [cpu, rss] = row.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(cpu) || !Number.isFinite(rss)) throw new Error(`Could not parse idle sample for Electron process ${pid}: ${row}`);
  return { cpuPercent: cpu, rssBytes: rss * 1024 };
}

const pid = Number(process.env.STUDIO_ELECTRON_PID || findElectronPid());
if (!pid) {
  console.error(JSON.stringify({ passed: false, error: "No Electron desktop process with a remote debugging port was found. Start the desktop app first." }, null, 2));
  process.exitCode = 1;
} else {
  try {
    const samples = [];
    if (warmupMs) await new Promise((resolve) => setTimeout(resolve, warmupMs));
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push({ index: index + 1, ...readProcessSample(pid) });
      if (index + 1 < sampleCount) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const cpuValues = samples.map((sample) => sample.cpuPercent);
    const rssValues = samples.map((sample) => sample.rssBytes);
    const averageCpuPercent = cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length;
    const maxObservedCpuPercent = Math.max(...cpuValues);
    const rssGrowthBytes = Math.max(0, rssValues.at(-1) - rssValues[0]);
    const passed = maxObservedCpuPercent <= maxCpuPercent && rssGrowthBytes <= maxRssGrowthBytes;
    console.log(JSON.stringify({
      passed,
      scope: "Electron desktop process while no provider job is submitted",
      pid,
      sampleCount,
      intervalMs,
      warmupMs,
      thresholds: { maxCpuPercent, maxRssGrowthBytes },
      summary: { averageCpuPercent, maxObservedCpuPercent, rssStartBytes: rssValues[0], rssEndBytes: rssValues.at(-1), rssGrowthBytes },
      samples
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ passed: false, pid, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}
