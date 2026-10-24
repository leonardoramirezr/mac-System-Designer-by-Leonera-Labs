import Foundation

// Minimal client for OpenAI-compatible APIs (POST /chat/completions, GET /models).
enum LLMClient {
    // Built-in providers always use their own URL, whatever the page sends,
    // so a stored key can only reach the provider it belongs to.
    static let builtIn: [String: String] = [
        "groq": "https://api.groq.com/openai/v1",
        "openai": "https://api.openai.com/v1",
        "itera": "https://api.iteracompute.com/v1",
    ]

    static func baseURL(provider: String, requested: String) throws -> URL {
        let text: String
        if let fixed = builtIn[provider] {
            text = fixed
        } else if provider == "custom" {
            text = requested.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            throw BridgeError(message: "Proveedor desconocido: \(provider)")
        }
        var trimmed = text
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http", url.host != nil else {
            throw BridgeError(message: "URL base inválida: \(text)")
        }
        return url
    }

    private static func makeRequest(_ url: URL, provider: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let key = Keychain.get(account: provider), !key.isEmpty {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    static func chat(provider: String, baseURL: String, model: String, messages: [[String: String]]) async throws -> String {
        let base = try self.baseURL(provider: provider, requested: baseURL)
        var request = makeRequest(base.appendingPathComponent("chat/completions"), provider: provider)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["model": model, "messages": messages, "stream": false]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        try check(response, json: json, data: data)

        guard let choices = json?["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any]
        else {
            throw BridgeError(message: "Respuesta inesperada del proveedor")
        }
        if let content = message["content"] as? String {
            return content
        }
        // some providers return content as a list of parts
        if let parts = message["content"] as? [[String: Any]] {
            return parts.compactMap { $0["text"] as? String }.joined()
        }
        throw BridgeError(message: "El modelo no devolvió texto")
    }

    static func models(provider: String, baseURL: String) async throws -> [String] {
        let base = try self.baseURL(provider: provider, requested: baseURL)
        let request = makeRequest(base.appendingPathComponent("models"), provider: provider)
        let (data, response) = try await URLSession.shared.data(for: request)
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        try check(response, json: json, data: data)
        let list = json?["data"] as? [[String: Any]] ?? []
        return list.compactMap { $0["id"] as? String }.sorted()
    }

    private static func check(_ response: URLResponse, json: [String: Any]?, data: Data) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard !(200..<300).contains(status) else { return }
        var detail: String?
        if let error = json?["error"] as? [String: Any] {
            detail = error["message"] as? String
        } else if let error = json?["error"] as? String {
            detail = error
        } else if let message = json?["message"] as? String {
            detail = message
        }
        if detail == nil, let text = String(data: data.prefix(300), encoding: .utf8), !text.isEmpty {
            detail = text
        }
        let prefix = status == 401 || status == 403 ? "API key rechazada" : "Error HTTP \(status)"
        throw BridgeError(message: detail.map { "\(prefix): \($0)" } ?? prefix)
    }
}
