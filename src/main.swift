import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: MainWindowController?
    private var pendingURLs: [URL] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.build(target: self)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = MainWindowController()
        windowController = controller
        controller.showWindow(nil)
        if !pendingURLs.isEmpty {
            controller.open(urls: pendingURLs)
            pendingURLs.removeAll()
        }
        NSApp.activate()

        let arguments = CommandLine.arguments
        if let index = arguments.firstIndex(of: "--self-test"), index + 1 < arguments.count {
            controller.runSelfTest(outputDirectory: URL(fileURLWithPath: arguments[index + 1], isDirectory: true))
        }
    }

    // Double-clicked .sdll files (also called before launch finishes).
    func application(_ application: NSApplication, open urls: [URL]) {
        if let controller = windowController {
            controller.open(urls: urls)
        } else {
            pendingURLs.append(contentsOf: urls)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    // Give the page a chance to write its pending autosave before quitting.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let controller = windowController else { return .terminateNow }
        controller.flushBeforeQuit {
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }

    // MARK: Menu actions

    @objc func menuCommand(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        windowController?.send(command: name)
    }

    @objc func editCommand(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        windowController?.performEdit(name)
    }

    @objc func showAbout(_ sender: Any?) {
        let credits = NSAttributedString(
            string: "Diagramas de diseño de sistemas sobre Mermaid.\nRender: Mermaid (MIT) · Íconos: Lucide (ISC)",
            attributes: [
                .font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize),
                .foregroundColor: NSColor.secondaryLabelColor,
            ]
        )
        NSApp.orderFrontStandardAboutPanel(options: [.credits: credits])
    }
}

@main
struct Main {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
