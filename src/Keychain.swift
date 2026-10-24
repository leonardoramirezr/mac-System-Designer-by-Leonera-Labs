import Foundation
import Security

// API keys for the LLM providers, stored as generic passwords in the login keychain.
enum Keychain {
    private static let service = "com.leoneralabs.systemdesigner.llm"

    private static func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    // An empty value removes the key.
    static func set(_ value: String, account: String) throws {
        SecItemDelete(query(account) as CFDictionary)
        guard !value.isEmpty else { return }
        var attributes = query(account)
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrLabel as String] = "System Designer — \(account)"
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            let reason = SecCopyErrorMessageString(status, nil) as String? ?? "código \(status)"
            throw BridgeError(message: "No se pudo guardar en el Llavero: \(reason)")
        }
    }

    static func get(account: String) -> String? {
        var request = query(account)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // Checks for the item without reading the secret (no Keychain prompt).
    static func exists(account: String) -> Bool {
        var request = query(account)
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        return SecItemCopyMatching(request as CFDictionary, nil) == errSecSuccess
    }
}
