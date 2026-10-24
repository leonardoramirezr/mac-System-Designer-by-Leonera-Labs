import Foundation

// The in-app library: one .sdll file per diagram in
// ~/Library/Application Support/System Designer/Diagrams.
struct DiagramStore {
    let directory: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        directory = base
            .appendingPathComponent("System Designer", isDirectory: true)
            .appendingPathComponent("Diagrams", isDirectory: true)
    }

    private func ensureDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    // ids come from the page; only accept UUID-like names so a crafted id
    // can never point outside the library directory.
    private func url(for id: String) throws -> URL {
        guard id.range(of: "^[A-Za-z0-9-]{1,64}$", options: .regularExpression) != nil else {
            throw BridgeError(message: "Identificador de diagrama inválido")
        }
        return directory.appendingPathComponent(id).appendingPathExtension("sdll")
    }

    func list() throws -> [[String: Any]] {
        try ensureDirectory()
        let urls = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )
        let items: [(id: String, name: String, date: Date)] = urls
            .filter { $0.pathExtension.lowercased() == "sdll" }
            .map { url in
                let id = url.deletingPathExtension().lastPathComponent
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
                return (id, Self.name(of: url) ?? id, date)
            }
        return items
            .sorted { $0.date > $1.date }
            .map { ["id": $0.id, "name": $0.name, "updatedAt": Self.iso($0.date)] }
    }

    func load(id: String) throws -> String {
        let file = try url(for: id)
        guard FileManager.default.fileExists(atPath: file.path) else {
            throw BridgeError(message: "El diagrama ya no existe")
        }
        return try String(contentsOf: file, encoding: .utf8)
    }

    func save(id: String, content: String) throws -> Date {
        try ensureDirectory()
        try content.write(to: try url(for: id), atomically: true, encoding: .utf8)
        return Date()
    }

    // Deleted diagrams go to the Trash, so they can still be recovered.
    func delete(id: String) throws {
        let file = try url(for: id)
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        do {
            try FileManager.default.trashItem(at: file, resultingItemURL: nil)
        } catch {
            try FileManager.default.removeItem(at: file)
        }
    }

    // Reads the diagram name from the `%% @meta {...}` line.
    static func name(of url: URL) -> String? {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        for line in text.split(separator: "\n", maxSplits: 8, omittingEmptySubsequences: true) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("%%"), let brace = trimmed.firstIndex(of: "{"), trimmed.contains("@meta") else { continue }
            let json = String(trimmed[brace...])
            if let data = json.data(using: .utf8),
               let meta = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let name = meta["name"] as? String, !name.isEmpty {
                return name
            }
        }
        return nil
    }

    static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
