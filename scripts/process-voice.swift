import AVFoundation
import Foundation

guard CommandLine.arguments.count >= 4 else {
    FileHandle.standardError.write(Data("Usage: process-voice.swift <input> <output.caf> <recording|internal_voice>\n".utf8))
    exit(1)
}
let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let mode = CommandLine.arguments[3]
let input = try AVAudioFile(forReading: inputURL)
let format = input.processingFormat
let frames = AVAudioFrameCount(input.length)
guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { fatalError("Audio buffer unavailable") }
try input.read(into: buffer)
buffer.frameLength = frames
let sampleRate = format.sampleRate
for channelIndex in 0..<Int(format.channelCount) {
    guard let samples = buffer.floatChannelData?[channelIndex] else { continue }
    if mode == "recording" {
        var previousInput: Float = 0
        var previousHigh: Float = 0
        var low: Float = 0
        let delay = max(1, Int(sampleRate * 0.055))
        let longDelay = max(1, Int(sampleRate * 0.11))
        var delayed = Array(repeating: Float(0), count: delay)
        var longDelayed = Array(repeating: Float(0), count: longDelay)
        for index in 0..<Int(frames) {
            let current = samples[index]
            let high = current - previousInput + 0.965 * previousHigh
            previousInput = current
            previousHigh = high
            low += 0.11 * (high - low)
            let echo = delayed[index % delay]
            let longEcho = longDelayed[index % longDelay]
            let activationEnvelope = max(0, 1 - Float(index) / Float(max(1, Int(sampleRate * 0.16))))
            let activationTone = sin(Float(index) * 2 * .pi * 1040 / Float(sampleRate)) * activationEnvelope * 0.13
            let filtered = tanh(low * 3.6) * 0.52 + echo * 0.28 + longEcho * 0.16 + activationTone
            delayed[index % delay] = filtered
            longDelayed[index % longDelay] = filtered
            samples[index] = filtered
        }
    } else if mode == "internal_voice" {
        // Give authored thoughts a clearly younger, distinct timbre even when
        // macOS only exposes one voice for the selected language. Reading the
        // source buffer 12% faster raises the pitch and shortens the delivery;
        // the subtle early reflection keeps it feeling internal rather than
        // like a second on-screen speaker.
        let original = Array(UnsafeBufferPointer(start: samples, count: Int(frames)))
        let pitchRatio: Float = 1.12
        let delay = max(1, Int(sampleRate * 0.018))
        var delayed = Array(repeating: Float(0), count: delay)
        for index in 0..<Int(frames) {
            let sourcePosition = Float(index) * pitchRatio
            let lower = Int(sourcePosition)
            let fraction = sourcePosition - Float(lower)
            let pitched: Float
            if lower + 1 < original.count {
                pitched = original[lower] * (1 - fraction) + original[lower + 1] * fraction
            } else {
                pitched = 0
            }
            let echo = delayed[index % delay]
            delayed[index % delay] = pitched
            samples[index] = pitched * 0.9 + echo * 0.1
        }
    }
}
try? FileManager.default.removeItem(at: outputURL)
let output = try AVAudioFile(forWriting: outputURL, settings: format.settings)
try output.write(from: buffer)
print(outputURL.path)
