import AppKit

// Native menu bar. App commands are forwarded to the web UI by name
// (see `commands` in web/js/app.js); text editing uses the standard selectors.
@MainActor
enum MainMenu {
    static func build(target: AppDelegate) -> NSMenu {
        let main = NSMenu()
        main.addItem(submenu(appMenu(target)))
        main.addItem(submenu(fileMenu(target)))
        main.addItem(submenu(editMenu(target)))
        main.addItem(submenu(diagramMenu(target)))
        main.addItem(submenu(viewMenu(target)))
        let window = windowMenu()
        main.addItem(submenu(window))
        NSApp.windowsMenu = window
        return main
    }

    private static func submenu(_ menu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: menu.title, action: nil, keyEquivalent: "")
        item.submenu = menu
        return item
    }

    private static func command(
        _ title: String,
        _ name: String,
        key: String = "",
        modifiers: NSEvent.ModifierFlags = [.command],
        target: AppDelegate,
        action: Selector = #selector(AppDelegate.menuCommand(_:))
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        item.target = target
        item.representedObject = name
        return item
    }

    private static func appMenu(_ target: AppDelegate) -> NSMenu {
        let menu = NSMenu(title: "System Designer")
        let about = NSMenuItem(title: "Acerca de System Designer", action: #selector(AppDelegate.showAbout(_:)), keyEquivalent: "")
        about.target = target
        menu.addItem(about)
        menu.addItem(.separator())
        menu.addItem(command("Ajustes…", "settings", key: ",", target: target))
        menu.addItem(.separator())
        let services = NSMenuItem(title: "Servicios", action: nil, keyEquivalent: "")
        let servicesMenu = NSMenu(title: "Servicios")
        services.submenu = servicesMenu
        NSApp.servicesMenu = servicesMenu
        menu.addItem(services)
        menu.addItem(.separator())
        menu.addItem(withTitle: "Ocultar System Designer", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = menu.addItem(withTitle: "Ocultar otros", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        menu.addItem(withTitle: "Mostrar todo", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Salir de System Designer", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        return menu
    }

    private static func fileMenu(_ target: AppDelegate) -> NSMenu {
        let menu = NSMenu(title: "Archivo")
        menu.addItem(command("Nuevo diagrama", "new", key: "n", target: target))
        menu.addItem(command("Importar .sdll…", "import", key: "o", target: target))
        menu.addItem(.separator())
        menu.addItem(command("Guardar", "save", key: "s", target: target))
        menu.addItem(command("Exportar .sdll…", "export", key: "e", target: target))
        menu.addItem(command("Exportar SVG…", "exportSvg", key: "e", modifiers: [.command, .shift], target: target))
        menu.addItem(command("Copiar Mermaid", "copyMermaid", target: target))
        menu.addItem(.separator())
        menu.addItem(withTitle: "Cerrar ventana", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        return menu
    }

    private static func editMenu(_ target: AppDelegate) -> NSMenu {
        let menu = NSMenu(title: "Edición")
        menu.addItem(command("Deshacer", "undo", key: "z", target: target, action: #selector(AppDelegate.editCommand(_:))))
        menu.addItem(command("Rehacer", "redo", key: "z", modifiers: [.command, .shift], target: target, action: #selector(AppDelegate.editCommand(_:))))
        menu.addItem(.separator())
        menu.addItem(withTitle: "Cortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        menu.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        menu.addItem(withTitle: "Pegar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        menu.addItem(withTitle: "Seleccionar todo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        return menu
    }

    private static func diagramMenu(_ target: AppDelegate) -> NSMenu {
        let menu = NSMenu(title: "Diagrama")
        menu.addItem(command("Añadir componente…", "addComponent", key: "k", target: target))
        menu.addItem(command("Agrupar selección", "group", key: "g", target: target))
        menu.addItem(command("Conectar selección", "connect", target: target))
        menu.addItem(command("Eliminar selección", "delete", target: target))
        menu.addItem(.separator())
        menu.addItem(command("Asistente de IA", "focusAI", key: "j", target: target))
        return menu
    }

    private static func viewMenu(_ target: AppDelegate) -> NSMenu {
        let menu = NSMenu(title: "Visualización")
        menu.addItem(command("Acercar", "zoomIn", key: "=", target: target))
        menu.addItem(command("Alejar", "zoomOut", key: "-", target: target))
        menu.addItem(command("Ver todo el diagrama", "fit", key: "0", target: target))
        menu.addItem(.separator())
        menu.addItem(command("Mostrar u ocultar barra lateral", "toggleSidebar", key: "b", target: target))
        menu.addItem(command("Biblioteca de diagramas", "showLibrary", target: target))
        menu.addItem(command("Código Mermaid", "showCode", target: target))
        menu.addItem(.separator())
        let fullScreen = menu.addItem(withTitle: "Pantalla completa", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        return menu
    }

    private static func windowMenu() -> NSMenu {
        let menu = NSMenu(title: "Ventana")
        menu.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        menu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Traer todo al frente", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        return menu
    }
}
