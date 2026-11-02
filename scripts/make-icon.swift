// Draws the app icon (assets/icon.png, 1024×1024, opaque): a stylised 广 — the dot as a coral circle,
// the horizontal and the sweeping 撇 as one rounded white stroke — on a teal-to-indigo gradient.
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

// Background: diagonal gradient, top-left teal to bottom-right indigo.
let gradient = CGGradient(colorsSpace: space, colors: [rgb(0x0F766E), rgb(0x1E1B4B)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size, y: size), options: [])

let stroke: CGFloat = 104
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
ctx.setLineWidth(stroke)
ctx.setStrokeColor(rgb(0xF8FAFC))

// 横 and 撇 as one stroke: the bar drawn right to left, a soft corner, then straight down and sweeping
// out to the lower left.
ctx.move(to: CGPoint(x: 790, y: 430))
ctx.addLine(to: CGPoint(x: 500, y: 430))
ctx.addQuadCurve(to: CGPoint(x: 380, y: 550), control: CGPoint(x: 380, y: 430))
ctx.addCurve(to: CGPoint(x: 240, y: 835), control1: CGPoint(x: 380, y: 680), control2: CGPoint(x: 350, y: 770))
ctx.strokePath()

// 点: the dot, a coral circle above the bar.
ctx.setFillColor(rgb(0xFB7185))
ctx.fillEllipse(in: CGRect(x: 565 - 70, y: 265 - 70, width: 140, height: 140))

let image = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: image)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print("wrote \(output)")
