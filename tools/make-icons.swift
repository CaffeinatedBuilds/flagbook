// Generates PWA icons (PNG) without any external tooling.  usage: swift tools/make-icons.swift
import AppKit
func icon(_ size: CGFloat, _ path: String) {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    let ctx = NSGraphicsContext.current!.cgContext
    let r = CGRect(x: 0, y: 0, width: size, height: size)
    // background
    ctx.setFillColor(NSColor(calibratedRed: 0.09, green: 0.10, blue: 0.13, alpha: 1).cgColor)
    ctx.fill(r)
    // field line
    ctx.setStrokeColor(NSColor.white.cgColor); ctx.setLineWidth(size * 0.035)
    ctx.move(to: CGPoint(x: 0, y: size * 0.36)); ctx.addLine(to: CGPoint(x: size, y: size * 0.36)); ctx.strokePath()
    // route: up then out, red (hot)
    ctx.setStrokeColor(NSColor(calibratedRed: 0.90, green: 0.21, blue: 0.17, alpha: 1).cgColor)
    ctx.setLineWidth(size * 0.06); ctx.setLineCap(.round); ctx.setLineJoin(.round)
    ctx.move(to: CGPoint(x: size * 0.36, y: size * 0.36)); ctx.addLine(to: CGPoint(x: size * 0.36, y: size * 0.66)); ctx.addLine(to: CGPoint(x: size * 0.68, y: size * 0.66)); ctx.strokePath()
    // arrowhead
    ctx.setFillColor(NSColor(calibratedRed: 0.90, green: 0.21, blue: 0.17, alpha: 1).cgColor)
    ctx.move(to: CGPoint(x: size * 0.80, y: size * 0.66)); ctx.addLine(to: CGPoint(x: size * 0.66, y: size * 0.75)); ctx.addLine(to: CGPoint(x: size * 0.66, y: size * 0.57)); ctx.closePath(); ctx.fillPath()
    // token
    ctx.setFillColor(NSColor(calibratedRed: 0.29, green: 0.44, blue: 0.77, alpha: 1).cgColor)
    ctx.fillEllipse(in: CGRect(x: size * 0.36 - size * 0.11, y: size * 0.30 - size * 0.11, width: size * 0.22, height: size * 0.22))
    let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: size * 0.16), .foregroundColor: NSColor.white]
    let s = NSAttributedString(string: "Y", attributes: attrs)
    let sz = s.size(); s.draw(at: CGPoint(x: size * 0.36 - sz.width / 2, y: size * 0.30 - sz.height / 2))
    img.unlockFocus()
    let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
    // force pixel size
    let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)
    rep.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    print("wrote", path)
}
icon(192, "icons/icon-192.png"); icon(512, "icons/icon-512.png"); icon(180, "icons/apple-touch-icon.png")
