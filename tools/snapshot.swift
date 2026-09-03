// Headless WebKit screenshot + console capture for the app.
// usage: swift tools/snapshot.swift <url> <out.png> [width] [height] [js-to-run-before-snapshot]
import AppKit
import WebKit

let args = CommandLine.arguments
let url = URL(string: args[1])!
let out = args[2]
let w = args.count > 3 ? Double(args[3])! : 430
let h = args.count > 4 ? Double(args[4])! : 900
let preJS = args.count > 5 ? args[5] : ""

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

class Handler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var webView: WKWebView!
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { print("CONSOLE:", m.body) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            let run: (String, @escaping () -> Void) -> Void = { js, done in
                if js.isEmpty { done(); return }
                webView.evaluateJavaScript(js) { r, e in if let e = e { print("JS ERROR:", e.localizedDescription) } else if let r = r { print("JS RESULT:", r) }; done() }
            }
            run(preJS) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    let cfg = WKSnapshotConfiguration()
                    webView.takeSnapshot(with: cfg) { img, err in
                        if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                            try? png.write(to: URL(fileURLWithPath: out)); print("wrote", out)
                        } else { print("snapshot failed", err?.localizedDescription ?? "") }
                        exit(0)
                    }
                }
            }
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print("NAV FAIL", error.localizedDescription); exit(1) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print("NAV FAIL", error.localizedDescription); exit(1) }
}
let handler = Handler()
let cfg = WKWebViewConfiguration()
let ucc = WKUserContentController()
ucc.add(handler, name: "log")
let hook = """
(function(){ function send(t, a){ try { window.webkit.messageHandlers.log.postMessage(t + ' ' + Array.prototype.map.call(a, function(x){ try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch(e){ return String(x); } }).join(' ')); } catch(e){} }
 var oe = console.error, ol = console.log, ow = console.warn; console.error = function(){ send('error', arguments); oe.apply(console, arguments); }; console.warn = function(){ send('warn', arguments); ow.apply(console, arguments); }; console.log = function(){ send('log', arguments); ol.apply(console, arguments); };
 window.addEventListener('error', function(e){ send('uncaught', [e.message + ' @ ' + e.filename + ':' + e.lineno]); });
 window.addEventListener('unhandledrejection', function(e){ send('rejection', [String(e.reason)]); }); })();
"""
ucc.addUserScript(WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
cfg.userContentController = ucc
cfg.websiteDataStore = WKWebsiteDataStore.nonPersistent()
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
handler.webView = webView
webView.navigationDelegate = handler
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = webView
webView.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 20) { print("timeout"); exit(2) }
app.run()
