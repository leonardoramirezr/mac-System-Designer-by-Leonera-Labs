import AppKit
import WebKit

// Matches --canvas in web/css/app.css so the title bar blends in.
private let canvasColor = NSColor(name: "canvas") { appearance in
    if appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua {
        return NSColor(srgbRed: 0x19 / 255.0, green: 0x19 / 255.0, blue: 0x1B / 255.0, alpha: 1)
    }
    return NSColor(srgbRed: 0xF6 / 255.0, green: 0xF6 / 255.0, blue: 0xF7 / 255.0, alpha: 1)
}

// One window hosting the web UI (web/index.html) in a WKWebView.
@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate {
    private let webView: WKWebView
    private let bridge: Bridge
    private var isLoaded = false
    private var queuedScripts: [String] = []

    init() {
        let bridge = Bridge()
        let contentController = WKUserContentController()
        contentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "native")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        webView.underPageBackgroundColor = canvasColor
        webView.isInspectable = true

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "System Designer"
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.backgroundColor = canvasColor
        window.minSize = NSSize(width: 980, height: 620)
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.contentView = webView
        window.center()
        _ = window.setFrameAutosaveName("SystemDesignerMainWindow")

        self.webView = webView
        self.bridge = bridge
        super.init(window: window)

        bridge.windowController = self
        window.delegate = self
        webView.navigationDelegate = self
        load()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    private func load() {
        guard let webDirectory = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) else { return }
        let index = webDirectory.appendingPathComponent("index.html")
        webView.loadFileURL(index, allowingReadAccessTo: webDirectory)
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.makeFirstResponder(webView)
    }

    // MARK: Talking to the page

    func run(_ script: String) {
        guard isLoaded else {
            queuedScripts.append(script)
            return
        }
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func send(command: String) {
        run("window.SD && SD.app && SD.app.command(\(Self.jsString(command)));")
    }

    // Undo/Redo from the menu: text fields use the window's undo manager
    // (where WebKit records typing); everything else is the diagram history.
    func performEdit(_ name: String) {
        guard isLoaded else { return }
        let probe = "(function(){var a=document.activeElement;return !!(a&&(a.isContentEditable||/^(INPUT|TEXTAREA)$/.test(a.tagName)));})()"
        webView.evaluateJavaScript(probe) { [weak self] result, _ in
            let editingText = (result as? Bool) == true
            Task { @MainActor in
                guard let self else { return }
                if editingText, let undoManager = self.window?.undoManager {
                    if name == "undo" { undoManager.undo() } else { undoManager.redo() }
                } else {
                    self.send(command: name)
                }
            }
        }
    }

    func setTitle(_ title: String) {
        window?.title = title.isEmpty ? "System Designer" : title
    }

    // Files opened from Finder. Before the page is ready they wait in the
    // bridge until the page asks for them.
    func open(urls: [URL]) {
        let files: [[String: Any]] = urls.compactMap { url in
            guard let content = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            return ["name": url.lastPathComponent, "content": content]
        }
        guard !files.isEmpty else { return }
        if bridge.pageTookPendingFiles, let json = Self.json(files) {
            run("window.SD && SD.app && SD.app.openFiles(\(json));")
        } else {
            bridge.pendingFiles.append(contentsOf: files)
        }
        window?.makeKeyAndOrderFront(nil)
    }

    // MARK: Self-test (CI)

    // Runs SD.app.selfTest() in the page, writes report.json and a snapshot
    // of the web view into `directory`, then quits.
    func runSelfTest(outputDirectory directory: URL) {
        guard isLoaded else {
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 300_000_000)
                self?.runSelfTest(outputDirectory: directory)
            }
            return
        }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        webView.callAsyncJavaScript("return JSON.stringify(await SD.app.selfTest());", arguments: [:], in: nil, in: .page) { [weak self] result in
            let text: String
            switch result {
            case .success(let value): text = value as? String ?? "{\"ok\":false,\"error\":\"no report\"}"
            case .failure(let error): text = "{\"ok\":false,\"error\":\(MainWindowController.jsString(error.localizedDescription))}"
            }
            Task { @MainActor in
                self?.finishSelfTest(report: text, directory: directory)
            }
        }
    }

    private func finishSelfTest(report: String, directory: URL) {
        try? report.write(to: directory.appendingPathComponent("report.json"), atomically: true, encoding: .utf8)
        webView.takeSnapshot(with: nil) { image, _ in
            if let image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
               let png = bitmap.representation(using: .png, properties: [:]) {
                try? png.write(to: directory.appendingPathComponent("snapshot.png"))
            }
            Task { @MainActor in NSApp.terminate(nil) }
        }
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoaded = true
        let scripts = queuedScripts
        queuedScripts.removeAll()
        scripts.forEach { webView.evaluateJavaScript($0, completionHandler: nil) }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.isFileURL || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(.allow)
            return
        }
        if url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoaded = false
        bridge.pageTookPendingFiles = false
        load()
    }

    // MARK: Helpers

    nonisolated static func jsString(_ value: String) -> String {
        json([value]).map { String($0.dropFirst().dropLast()) } ?? "\"\""
    }

    nonisolated static func json(_ object: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8)
        else { return nil }
        // U+2028/2029 are valid JSON but end lines in JavaScript source.
        return text.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }
}
