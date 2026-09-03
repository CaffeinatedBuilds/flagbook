import Foundation
import JavaScriptCore
let ctx = JSContext()!
var bad = false
ctx.exceptionHandler = { _, e in print("EXC:", e?.toString() ?? "?", "line", e?.objectForKeyedSubscript("line")?.toString() ?? "?", "col", e?.objectForKeyedSubscript("column")?.toString() ?? "?"); bad = true }
for f in CommandLine.arguments.dropFirst() {
    let src = try! String(contentsOfFile: f, encoding: .utf8)
    // parse-only: wrap in a function that is never called
    ctx.evaluateScript("(function(){\n" + src + "\n})", withSourceURL: URL(fileURLWithPath: f))
    print(bad ? "FAIL" : "ok  ", f); if bad { exit(1) }
}
