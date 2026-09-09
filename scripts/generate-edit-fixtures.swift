import AVFoundation
import CoreVideo
import Foundation

struct Fixture { let name: String; let red: UInt8; let green: UInt8; let blue: UInt8; let frequency: Double }
let fixtures = [
    Fixture(name: "red-440hz", red: 255, green: 0, blue: 0, frequency: 440),
    Fixture(name: "green-550hz", red: 0, green: 255, blue: 0, frequency: 550),
    Fixture(name: "blue-660hz", red: 0, green: 0, blue: 255, frequency: 660)
]
let outputDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("tests/fixtures/edit-sequence")
try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
let width = 160, height = 90, frameRate = 30, duration = 1.2

func waitForWriter(_ writer: AVAssetWriter) {
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    if writer.status != .completed { fatalError(writer.error?.localizedDescription ?? "Fixture writer failed") }
}

func waitForExport(_ exporter: AVAssetExportSession) {
    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    if exporter.status != .completed { fatalError(exporter.error?.localizedDescription ?? "Fixture export failed") }
}

for fixture in fixtures {
    let silentURL = outputDir.appendingPathComponent(".\(fixture.name)-silent.mp4")
    let audioURL = outputDir.appendingPathComponent(".\(fixture.name).caf")
    let outputURL = outputDir.appendingPathComponent("\(fixture.name).mp4")
    try? FileManager.default.removeItem(at: silentURL)
    try? FileManager.default.removeItem(at: audioURL)
    try? FileManager.default.removeItem(at: outputURL)
    let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mp4)
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
    writer.add(videoInput)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    for frame in 0..<Int(duration * Double(frameRate)) {
        while !videoInput.isReadyForMoreMediaData { usleep(1_000) }
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, nil, &pixelBuffer)
        guard let buffer = pixelBuffer else { fatalError("Pixel buffer failed") }
        CVPixelBufferLockBaseAddress(buffer, [])
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<height {
            for x in 0..<width {
                let offset = y * rowBytes + x * 4
                base[offset] = fixture.blue; base[offset + 1] = fixture.green; base[offset + 2] = fixture.red; base[offset + 3] = 255
            }
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: CMTimeScale(frameRate)))
    }
    videoInput.markAsFinished()
    waitForWriter(writer)

    let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
    let audioFile = try AVAudioFile(forWriting: audioURL, settings: format.settings)
    let frameCount = AVAudioFrameCount(duration * 48_000)
    let audioBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    audioBuffer.frameLength = frameCount
    for channel in 0..<Int(format.channelCount) {
        let samples = audioBuffer.floatChannelData![channel]
        for frame in 0..<Int(frameCount) { samples[frame] = Float(sin(2 * Double.pi * fixture.frequency * Double(frame) / 48_000) * 0.12) }
    }
    try audioFile.write(from: audioBuffer)

    let composition = AVMutableComposition()
    let videoAsset = AVURLAsset(url: silentURL)
    let audioAsset = AVURLAsset(url: audioURL)
    let range = CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 600))
    let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try videoTrack.insertTimeRange(range, of: videoAsset.tracks(withMediaType: .video)[0], at: .zero)
    let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try audioTrack.insertTimeRange(range, of: audioAsset.tracks(withMediaType: .audio)[0], at: .zero)
    let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    waitForExport(exporter)
    try? FileManager.default.removeItem(at: silentURL)
    try? FileManager.default.removeItem(at: audioURL)
    print(outputURL.path)
}
