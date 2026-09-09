import AVFoundation
import CoreMedia
import Foundation
import QuartzCore

struct ClipInput: Decodable {
    let id: String
    let filePath: String
    let sourceInSec: Double
    let sourceOutSec: Double
}

struct ExportManifest: Decodable {
    let outputPath: String
    let clips: [ClipInput]
    let audioClips: [AudioClipInput]?
    let sourceAudioGain: Float?
    let width: Int?
    let height: Int?
    let frameRate: Int?
    let draftWatermark: Bool?
}

struct AudioClipInput: Decodable {
    let id: String
    let filePath: String
    let timelineStartSec: Double
    let sourceInSec: Double
    let sourceOutSec: Double
    let gain: Float
    let fadeInSec: Double?
    let fadeOutSec: Double?
    let sourceDuckGain: Float?
    let sourceDuckStartSec: Double?
    let sourceDuckEndSec: Double?
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

func fourCC(_ value: FourCharCode) -> String {
    let bytes: [UInt8] = [UInt8((value >> 24) & 0xff), UInt8((value >> 16) & 0xff), UInt8((value >> 8) & 0xff), UInt8(value & 0xff)]
    return String(bytes: bytes, encoding: .ascii)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? String(value)
}

guard CommandLine.arguments.count >= 2 else { fail("Usage: export-sequence.swift <manifest.json>") }
let manifestURL = URL(fileURLWithPath: CommandLine.arguments[1])
let manifest: ExportManifest
do {
    manifest = try JSONDecoder().decode(ExportManifest.self, from: Data(contentsOf: manifestURL))
} catch {
    fail("Invalid export manifest: \(error)")
}
guard !manifest.clips.isEmpty else { fail("Export sequence has no clips") }

let composition = AVMutableComposition()
guard let compositionVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
    fail("Could not create composition video track")
}
let compositionAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
var audioParameters: [AVMutableAudioMixInputParameters] = []
var sourceAudioParameters: AVMutableAudioMixInputParameters?
var sourceDuckRequests: [(start: Double, end: Double, gain: Float)] = []
var cursor = CMTime.zero
var instructions: [AVMutableVideoCompositionInstruction] = []
var firstDisplaySize = CGSize(width: 1920, height: 1080)

struct Segment {
    let clip: ClipInput
    let asset: AVURLAsset
    let videoTrack: AVAssetTrack
    let timeRange: CMTimeRange
}
var segments: [Segment] = []
for clip in manifest.clips {
    guard clip.sourceOutSec > clip.sourceInSec else { fail("Invalid source range for \(clip.id)") }
    let assetURL = URL(fileURLWithPath: clip.filePath)
    guard FileManager.default.fileExists(atPath: assetURL.path) else { fail("Missing source file: \(assetURL.path)") }
    let asset = AVURLAsset(url: assetURL)
    guard let sourceVideo = asset.tracks(withMediaType: .video).first else { fail("No video track in \(assetURL.path)") }
    let start = CMTime(seconds: clip.sourceInSec, preferredTimescale: 600)
    let duration = CMTime(seconds: clip.sourceOutSec - clip.sourceInSec, preferredTimescale: 600)
    let range = CMTimeRange(start: start, duration: duration)
    if CMTimeCompare(CMTimeAdd(start, duration), asset.duration) == 1 { fail("Source range exceeds media duration for \(clip.id)") }
    do { try compositionVideo.insertTimeRange(range, of: sourceVideo, at: cursor) } catch { fail("Video insert failed for \(clip.id): \(error)") }
    if let sourceAudio = asset.tracks(withMediaType: .audio).first, let compositionAudio {
        do { try compositionAudio.insertTimeRange(range, of: sourceAudio, at: cursor) } catch { fail("Audio insert failed for \(clip.id): \(error)") }
    }
    let transformed = sourceVideo.naturalSize.applying(sourceVideo.preferredTransform)
    let displaySize = CGSize(width: abs(transformed.width), height: abs(transformed.height))
    if segments.isEmpty { firstDisplaySize = displaySize }
    segments.append(Segment(clip: clip, asset: asset, videoTrack: sourceVideo, timeRange: CMTimeRange(start: cursor, duration: duration)))
    cursor = CMTimeAdd(cursor, duration)
}

let renderSize = CGSize(width: manifest.width ?? Int(firstDisplaySize.width), height: manifest.height ?? Int(firstDisplaySize.height))
for segment in segments {
    let sourceTrack = segment.videoTrack
    let transformed = sourceTrack.naturalSize.applying(sourceTrack.preferredTransform)
    let displaySize = CGSize(width: abs(transformed.width), height: abs(transformed.height))
    let scale = min(renderSize.width / max(1, displaySize.width), renderSize.height / max(1, displaySize.height))
    var transform = sourceTrack.preferredTransform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    let fitted = CGSize(width: displaySize.width * scale, height: displaySize.height * scale)
    transform = transform.concatenating(CGAffineTransform(translationX: (renderSize.width - fitted.width) / 2, y: (renderSize.height - fitted.height) / 2))
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideo)
    layer.setTransform(transform, at: segment.timeRange.start)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = segment.timeRange
    instruction.layerInstructions = [layer]
    instructions.append(instruction)
}

if let compositionAudio {
    let sourceParameters = AVMutableAudioMixInputParameters(track: compositionAudio)
    sourceParameters.setVolume(max(0, min(1, manifest.sourceAudioGain ?? 0.65)), at: .zero)
    sourceAudioParameters = sourceParameters
    audioParameters.append(sourceParameters)
}
for audioClip in manifest.audioClips ?? [] {
    let url = URL(fileURLWithPath: audioClip.filePath)
    guard FileManager.default.fileExists(atPath: url.path) else { fail("Missing audio source: \(url.path)") }
    let asset = AVURLAsset(url: url)
    guard let sourceTrack = asset.tracks(withMediaType: .audio).first,
          let targetTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { fail("No audio track for \(audioClip.id)") }
    let sourceStart = CMTime(seconds: audioClip.sourceInSec, preferredTimescale: 48_000)
    let duration = CMTime(seconds: audioClip.sourceOutSec - audioClip.sourceInSec, preferredTimescale: 48_000)
    let timelineStart = CMTime(seconds: audioClip.timelineStartSec, preferredTimescale: 48_000)
    do { try targetTrack.insertTimeRange(CMTimeRange(start: sourceStart, duration: duration), of: sourceTrack, at: timelineStart) } catch { fail("Audio insert failed for \(audioClip.id): \(error)") }
    let parameters = AVMutableAudioMixInputParameters(track: targetTrack)
    let gain = max(0, min(1, audioClip.gain))
    parameters.setVolume(gain, at: timelineStart)
    let fadeIn = min(audioClip.fadeInSec ?? 0, audioClip.sourceOutSec - audioClip.sourceInSec)
    if fadeIn > 0 { parameters.setVolumeRamp(fromStartVolume: 0, toEndVolume: gain, timeRange: CMTimeRange(start: timelineStart, duration: CMTime(seconds: fadeIn, preferredTimescale: 48_000))) }
    let fadeOut = min(audioClip.fadeOutSec ?? 0, audioClip.sourceOutSec - audioClip.sourceInSec)
    if fadeOut > 0 {
        let fadeStart = CMTimeAdd(timelineStart, CMTime(seconds: audioClip.sourceOutSec - audioClip.sourceInSec - fadeOut, preferredTimescale: 48_000))
        parameters.setVolumeRamp(fromStartVolume: gain, toEndVolume: 0, timeRange: CMTimeRange(start: fadeStart, duration: CMTime(seconds: fadeOut, preferredTimescale: 48_000)))
    }
    audioParameters.append(parameters)
    if sourceAudioParameters != nil, let requestedDuck = audioClip.sourceDuckGain {
        let normalGain = max(0, min(1, manifest.sourceAudioGain ?? 0.65))
        let duckGain = max(0, min(normalGain, requestedDuck))
        let duckStartSeconds = max(0, audioClip.sourceDuckStartSec ?? audioClip.timelineStartSec)
        let duckEndSeconds = max(duckStartSeconds, audioClip.sourceDuckEndSec ?? (audioClip.timelineStartSec + audioClip.sourceOutSec - audioClip.sourceInSec))
        sourceDuckRequests.append((duckStartSeconds, duckEndSeconds, duckGain))
    }
}

if let sourceParameters = sourceAudioParameters, !sourceDuckRequests.isEmpty {
    let normalGain = max(0, min(1, manifest.sourceAudioGain ?? 0.65))
    let sorted = sourceDuckRequests.sorted { $0.start < $1.start }
    var merged: [(start: Double, end: Double, gain: Float)] = []
    for request in sorted {
        if let last = merged.last, request.start <= last.end + 0.001 {
            merged[merged.count - 1] = (last.start, max(last.end, request.end), min(last.gain, request.gain))
        } else {
            merged.append(request)
        }
    }
    for range in merged {
        if range.start <= 0.001 {
            sourceParameters.setVolume(range.gain, at: .zero)
        } else {
            let rampDuration = min(0.04, range.start)
            sourceParameters.setVolumeRamp(fromStartVolume: normalGain, toEndVolume: range.gain, timeRange: CMTimeRange(start: CMTime(seconds: range.start - rampDuration, preferredTimescale: 48_000), duration: CMTime(seconds: rampDuration, preferredTimescale: 48_000)))
        }
        sourceParameters.setVolumeRamp(fromStartVolume: range.gain, toEndVolume: normalGain, timeRange: CMTimeRange(start: CMTime(seconds: range.end, preferredTimescale: 48_000), duration: CMTime(seconds: 0.1, preferredTimescale: 48_000)))
    }
}

let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(manifest.frameRate ?? 30))
videoComposition.instructions = instructions
if manifest.draftWatermark == true {
    let parent = CALayer()
    let videoLayer = CALayer()
    parent.frame = CGRect(origin: .zero, size: renderSize)
    videoLayer.frame = parent.frame
    parent.addSublayer(videoLayer)
    let label = CATextLayer()
    label.string = "DRAFT · EDITORIAL REVIEW REQUIRED"
    label.fontSize = max(20, renderSize.height * 0.035)
    label.foregroundColor = CGColor(gray: 1, alpha: 0.82)
    label.backgroundColor = CGColor(gray: 0, alpha: 0.55)
    label.alignmentMode = .center
    label.contentsScale = 2
    label.frame = CGRect(x: 0, y: renderSize.height * 0.06, width: renderSize.width, height: renderSize.height * 0.07)
    parent.addSublayer(label)
    videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)
}

let outputURL = URL(fileURLWithPath: manifest.outputPath)
try? FileManager.default.removeItem(at: outputURL)
try? FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { fail("Could not create AVAssetExportSession") }
exporter.outputURL = outputURL
exporter.outputFileType = .mp4
exporter.shouldOptimizeForNetworkUse = true
exporter.videoComposition = videoComposition
if !audioParameters.isEmpty {
    let audioMix = AVMutableAudioMix()
    audioMix.inputParameters = audioParameters
    exporter.audioMix = audioMix
}
let semaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { semaphore.signal() }
while semaphore.wait(timeout: .now() + 0.2) == .timedOut {
    print("PROGRESS \(exporter.progress)")
    fflush(stdout)
}
switch exporter.status {
case .completed:
    let seconds = CMTimeGetSeconds(composition.duration)
    let renderedAsset = AVURLAsset(url: outputURL)
    let renderedVideo = renderedAsset.tracks(withMediaType: .video).first
    let renderedAudio = renderedAsset.tracks(withMediaType: .audio).first
    let videoDescription = renderedVideo?.formatDescriptions.first.map { $0 as! CMFormatDescription }
    let audioDescription = renderedAudio?.formatDescriptions.first.map { $0 as! CMAudioFormatDescription }
    let audioFormat = audioDescription.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee }
    let codec = videoDescription.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) } ?? "unknown"
    let audioCodec = audioDescription.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) } ?? "none"
    let escapedPath = outputURL.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    print("RESULT {\"outputPath\":\"\(escapedPath)\",\"durationSeconds\":\(seconds),\"width\":\(Int(renderSize.width)),\"height\":\(Int(renderSize.height)),\"frameRate\":\(manifest.frameRate ?? 30),\"codec\":\"\(codec)\",\"audioCodec\":\"\(audioCodec)\",\"audioSampleRate\":\(audioFormat?.mSampleRate ?? 0),\"audioChannels\":\(audioFormat?.mChannelsPerFrame ?? 0)}")
case .cancelled:
    fail("Export cancelled", code: 2)
default:
    fail("Export failed: \(exporter.error?.localizedDescription ?? "unknown error")")
}
