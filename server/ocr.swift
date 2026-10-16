import Foundation
import PDFKit
import Vision
import AppKit

struct TextLine: Codable {
    let text: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct RecognizedPage: Codable {
    let page: Int
    let width: Double
    let height: Double
    let lines: [TextLine]
}

do {
    guard CommandLine.arguments.count == 3,
          let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else {
        throw NSError(domain: "ResumeOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法读取 PDF 文件"])
    }
    let indices = CommandLine.arguments[2].split(separator: ",").compactMap { Int($0) }
    var pages: [RecognizedPage] = []
    for index in indices {
        guard let page = document.page(at: index - 1) else { continue }
        let bounds = page.bounds(for: .mediaBox)
        let scale = min(2400 / max(bounds.width, bounds.height), 3)
        let size = NSSize(width: bounds.width * scale, height: bounds.height * scale)
        let thumbnail = page.thumbnail(of: size, for: .mediaBox)
        guard let image = thumbnail.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw NSError(domain: "ResumeOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "无法读取扫描页面"])
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = true
        // 使用系统自带的本机识别能力，不上传页面或下载语言模型。
        let handler = VNImageRequestHandler(cgImage: image)
        try handler.perform([request])
        let width = Double(image.width), height = Double(image.height)
        let lines = (request.results ?? []).compactMap { observation -> TextLine? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let box = observation.boundingBox
            return TextLine(text: candidate.string, x: box.minX * width, y: (1 - box.maxY) * height,
                            width: box.width * width, height: box.height * height)
        }
        pages.append(RecognizedPage(page: index, width: width, height: height, lines: lines))
    }
    let result = try JSONEncoder().encode(pages)
    FileHandle.standardOutput.write(result)
} catch {
    FileHandle.standardError.write(Data(error.localizedDescription.utf8))
    exit(1)
}
