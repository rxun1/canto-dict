// Draws the app icon (assets/icon.png, 1024×1024, opaque): a stylised 广 in monoline — the 横 and the sweeping
// 撇 as the outline of one rounded stroke, and the dot as a ring of the same weight — on a navy gradient.
// Run: swift scripts/make-icon.swift assets/icon.png
import AppKit

let size = 1024
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/icon.png"

func rgb(_ hex: UInt32) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(
  data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
// Draw in top-left-origin coordinates, like the design notes.
ctx.translateBy(x: 0, y: CGFloat(size))
ctx.scaleBy(x: 1, y: -1)

// Background: diagonal gradient, top-left slate to bottom-right navy.
let gradient = CGGradient(colorsSpace: space, colors: [rgb(0x1E293B), rgb(0x0F172A)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size, y: size), options: [])

let stroke: CGFloat = 130  // width of the (unseen) stroke whose outline is drawn
let line: CGFloat = 20  // weight of every visible line
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.setStrokeColor(rgb(0xE2E8F0))

// 横 and 撇 as one stroke: the bar drawn right to left, a soft corner, then straight down and sweeping
// out to the lower left. Only its outline is drawn.
ctx.move(to: CGPoint(x: 790, y: 430))
ctx.addLine(to: CGPoint(x: 500, y: 430))
ctx.addQuadCurve(to: CGPoint(x: 380, y: 550), control: CGPoint(x: 380, y: 430))
ctx.addCurve(to: CGPoint(x: 240, y: 835), control1: CGPoint(x: 380, y: 680), control2: CGPoint(x: 350, y: 770))
ctx.setLineWidth(stroke)
ctx.replacePathWithStrokedPath()
ctx.setLineWidth(line)
ctx.strokePath()

// 点: the dot, a ring above the bar.
let dotRadius: CGFloat = 70
ctx.strokeEllipse(in: CGRect(x: 580 - dotRadius, y: 235 - dotRadius, width: dotRadius * 2, height: dotRadius * 2))

let image = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: image)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print("wrote \(output)")
