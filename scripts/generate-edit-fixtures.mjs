import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("tests/fixtures/edit-sequence");
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();

for (const fixture of [
  { name: "red-440hz", color: "#ff0000", frequency: 440 },
  { name: "green-550hz", color: "#00ff00", frequency: 550 },
  { name: "blue-660hz", color: "#0000ff", frequency: 660 }
]) {
  const base64 = await page.evaluate(async ({ color, frequency }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const destination = audio.createMediaStreamDestination();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const stream = new MediaStream([...canvas.captureStream(24).getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    recorder.stop();
    await new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    oscillator.stop();
    await audio.close();
    const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, fixture);
  fs.writeFileSync(path.join(outputDir, `${fixture.name}.webm`), Buffer.from(base64, "base64"));
}

await browser.close();
