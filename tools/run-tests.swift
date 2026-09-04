// Runs tests/*.test.js against the app's logic modules in JavaScriptCore (no browser needed).
// usage: swift tools/run-tests.swift
import Foundation
import JavaScriptCore

let root = FileManager.default.currentDirectoryPath
let ctx = JSContext()!
var failed = false
ctx.exceptionHandler = { _, exc in
    print("JS EXCEPTION:", exc?.toString() ?? "?", "line", exc?.objectForKeyedSubscript("line").toString() ?? "?")
    failed = true
}
// minimal browser-ish globals
ctx.evaluateScript("var window = this; var console = { log: function(){ __log(Array.prototype.slice.call(arguments).join(' ')); }, error: function(){ __log('ERR ' + Array.prototype.slice.call(arguments).join(' ')); } }; var localStorage = { _d:{}, getItem:function(k){ return this._d[k]==null?null:this._d[k]; }, setItem:function(k,v){ this._d[k]=String(v); }, removeItem:function(k){ delete this._d[k]; } }; var document = { querySelector:function(){return null;}, querySelectorAll:function(){return [];}, createElement:function(){ return {style:{}, setAttribute:function(){}, appendChild:function(){}}; }, getElementById:function(){return null;}, body:{appendChild:function(){}, removeChild:function(){}} };")
let log: @convention(block) (String) -> Void = { s in print(s) }
ctx.setObject(log, forKeyedSubscript: "__log" as NSString)

func load(_ rel: String) {
    let path = root + "/" + rel
    guard let src = try? String(contentsOfFile: path, encoding: .utf8) else { print("cannot read", rel); failed = true; return }
    ctx.evaluateScript(src, withSourceURL: URL(fileURLWithPath: path))
}
for f in ["js/util.js", "js/geometry.js", "js/store.js", "js/media.js", "js/rotation.js", "js/field.js"] { load(f) }

// tiny test harness
ctx.evaluateScript("""
var __pass = 0, __fail = 0;
function test(name, fn) { try { fn(); __pass++; } catch (e) { __fail++; console.log('FAIL ' + name + ': ' + (e && e.message || e)); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m||'') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function near(a, b, tol, m) { if (Math.abs(a - b) > (tol == null ? 1e-6 : tol)) throw new Error((m||'') + ' expected ~' + b + ' got ' + a); }
""")
let tests = (try? FileManager.default.contentsOfDirectory(atPath: root + "/tests"))?.filter { $0.hasSuffix(".test.js") }.sorted() ?? []
for t in tests { load("tests/" + t) }
let pass = ctx.evaluateScript("__pass").toInt32(), fail = ctx.evaluateScript("__fail").toInt32()
print("\(pass) passed, \(fail) failed")
exit(fail > 0 || failed ? 1 : 0)
