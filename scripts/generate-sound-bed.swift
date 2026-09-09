import AVFoundation
import Foundation

guard CommandLine.arguments.count >= 4 else {
    FileHandle.standardError.write(Data("Usage: generate-sound-bed.swift <output.caf> <rain|machine|horn> <duration-seconds>\n".utf8))
    exit(1)
}

let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let kind = CommandLine.arguments[2]
let duration = max(0.2, Double(CommandLine.arguments[3]) ?? 1)
let sampleRate = 48_000.0
let channels: AVAudioChannelCount = 2
let frameCount = AVAudioFrameCount(duration * sampleRate)
guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channels),
      let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
    fatalError("Unable to create sound-bed buffer")
}
buffer.frameLength = frameCount

var randomState: UInt64 = 0x4d375f617564696f
func noise() -> Float {
    randomState = randomState &* 6364136223846793005 &+ 1442695040888963407
    return Float(Int32(truncatingIfNeeded: randomState >> 32)) / Float(Int32.max)
}

for channel in 0..<Int(channels) {
    guard let samples = buffer.floatChannelData?[channel] else { continue }
    var low: Float = 0
    var previousNoise: Float = 0
    for frame in 0..<Int(frameCount) {
        let t = Double(frame) / sampleRate
        let value: Float
        switch kind {
        case "rain":
            let white = noise()
            low += 0.025 * (white - low)
            let hiss = white - previousNoise * 0.55
            previousNoise = white
            let swell = Float(0.82 + 0.18 * sin(t * 0.37))
            let drop = frame % 13_711 < 80 ? Float(exp(-Double(frame % 13_711) / 22.0)) * noise() * 0.13 : 0
            value = (low * 0.3 + hiss * 0.075 + drop) * swell
        case "machine":
            let attack = min(1, t / 0.12)
            let release = min(1, max(0, (duration - t) / 0.18))
            let frequency = 220 + 520 * min(1, t / duration)
            let phase = 2 * Double.pi * frequency * t
            value = Float((sin(phase) * 0.16 + sin(phase * 2.01) * 0.06) * attack * release)
        case "horn":
            let attack = min(1, t / 0.08)
            let release = min(1, max(0, (duration - t) / 0.28))
            let vibrato = sin(t * 2 * Double.pi * 3.1) * 3.5
            let phase = 2 * Double.pi * (185 + vibrato) * t
            value = Float((sin(phase) * 0.2 + sin(phase * 2) * 0.055) * attack * release)
        default:
            FileHandle.standardError.write(Data("Unknown sound-bed kind: \(kind)\n".utf8))
            exit(2)
        }
        samples[frame] = value * (channel == 0 ? 1 : 0.96)
    }
}

try? FileManager.default.removeItem(at: outputURL)
let output = try AVAudioFile(forWriting: outputURL, settings: format.settings)
try output.write(from: buffer)
print(outputURL.path)
