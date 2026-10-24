import AppKit
import UniformTypeIdentifiers
import WebKit

struct BridgeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// Receives `window.webkit.messageHandlers.native.postMessage({ action, payload })`
// from web/js/bridge.js and replies with the result (or an error message).
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var windowController: MainWindowController?
    var pendingFiles: [[String: Any]] = []
    var pageTookPendingFiles = false

    private let store = DiagramStore()
    private let defaults = UserDefaults.standard
    private var requests: [String: Task<String, Error>] = [:]

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else {
            return (nil, "Mensaje inválido")
        }
        let payload = body["payload"] as? [String: Any] ?? [:]
        do {
            return (try await handle(action, payload), nil)
        } catch is CancellationError {
            return (nil, "Cancelado")
        } catch let error as URLError where error.code == .cancelled {
            return (nil, "Cancelado")
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    private func handle(_ action: String, _ payload: [String: Any]) async throws -> Any {
        switch action {
        case "listDiagrams":
            return try store.list()
        case "loadDiagram":
            let id = try string(payload, "id")
            return ["id": id, "content": try store.load(id: id)]
        case "saveDiagram":
            let id = try string(payload, "id")
            let date = try store.save(id: id, content: try string(payload, "content"))
            return ["id": id, "updatedAt": DiagramStore.iso(date)]
        case "deleteDiagram":
            try store.delete(id: try string(payload, "id"))
            return true
        case "exportFile":
            return try await exportFile(name: try string(payload, "name"), content: try string(payload, "content"))
        case "importFile":
            return try await importFile()
        case "getPref":
            return defaults.string(forKey: "web." + (try string(payload, "key"))) ?? NSNull()
        case "setPref":
            let key = "web." + (try string(payload, "key"))
            if let value = payload["value"] as? String { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
            return true
        case "setSecret":
            let account = try string(payload, "account")
            try Keychain.set(payload["value"] as? String ?? "", account: account)
            return true
        case "hasSecrets":
            let accounts = payload["accounts"] as? [String] ?? []
            var result: [String: Bool] = [:]
            for account in accounts { result[account] = Keychain.exists(account: account) }
            return result
        case "llmChat":
            return ["content": try await chat(payload)]
        case "llmCancel":
            if let id = payload["requestId"] as? String { requests[id]?.cancel() }
            return true
        case "llmModels":
            let provider = try string(payload, "provider")
            let baseURL = payload["baseURL"] as? String ?? ""
            return try await LLMClient.models(provider: provider, baseURL: baseURL)
        case "setWindowTitle":
            windowController?.setTitle(payload["title"] as? String ?? "")
            return true
        case "takePendingFiles":
            pageTookPendingFiles = true
            let files = pendingFiles
            pendingFiles.removeAll()
            return files
        case "openURL":
            guard let text = payload["url"] as? String, let url = URL(string: text), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
                throw BridgeError(message: "URL no permitida")
            }
            NSWorkspace.shared.open(url)
            return true
        default:
            throw BridgeError(message: "Acción desconocida: \(action)")
        }
    }

    private func string(_ payload: [String: Any], _ key: String) throws -> String {
        guard let value = payload[key] as? String else { throw BridgeError(message: "Falta el parámetro \(key)") }
        return value
    }

    // MARK: LLM

    private func chat(_ payload: [String: Any]) async throws -> String {
        let provider = try string(payload, "provider")
        let model = try string(payload, "model")
        let baseURL = payload["baseURL"] as? String ?? ""
        let requestId = payload["requestId"] as? String ?? UUID().uuidString
        let raw = payload["messages"] as? [[String: Any]] ?? []
        let messages: [[String: String]] = raw.compactMap { item in
            guard let role = item["role"] as? String, let content = item["content"] as? String else { return nil }
            return ["role": role, "content": content]
        }
        let task = Task { try await LLMClient.chat(provider: provider, baseURL: baseURL, model: model, messages: messages) }
        requests[requestId] = task
        defer { requests[requestId] = nil }
        return try await task.value
    }

    // MARK: Files

    private func exportFile(name: String, content: String) async throws -> [String: Any] {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        let ext = (name as NSString).pathExtension.lowercased()
        if let type = UTType(filenameExtension: ext.isEmpty ? "sdll" : ext) {
            panel.allowedContentTypes = [type]
        }
        guard await present(panel) == .OK, let url = panel.url else { return ["saved": false] }
        try content.write(to: url, atomically: true, encoding: .utf8)
        return ["saved": true, "path": url.path]
    }

    private func importFile() async throws -> Any {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = ["sdll", "mmd", "mermaid", "txt"].compactMap { UTType(filenameExtension: $0) }
        guard await present(panel) == .OK, let url = panel.url else { return NSNull() }
        let content = try String(contentsOf: url, encoding: .utf8)
        return ["name": url.lastPathComponent, "content": content]
    }

    private func present(_ panel: NSSavePanel) async -> NSApplication.ModalResponse {
        guard let window = windowController?.window else { return panel.runModal() }
        return await withCheckedContinuation { continuation in
            panel.beginSheetModal(for: window) { response in
                continuation.resume(returning: response)
            }
        }
    }
}
