import SwiftUI
import WebKit

/// Full-screen WKWebView running the bundled single-file game (Resources/game.html).
/// The page is served through a custom URL scheme so it has a stable origin, which keeps
/// localStorage saves and Museum records between launches. No network access is needed.
struct GameView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(GameSchemeHandler(), forURLScheme: GameSchemeHandler.scheme)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if let url = URL(string: "\(GameSchemeHandler.scheme)://localhost/game.html") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

/// Serves game.html from the app bundle; every other request gets a 404.
final class GameSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "signalbreak"

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let requestURL = urlSchemeTask.request.url ?? URL(string: "\(Self.scheme)://localhost/")!
        guard requestURL.lastPathComponent == "game.html",
              let file = Self.gameFile(),
              let data = try? Data(contentsOf: file) else {
            let notFound = HTTPURLResponse(url: requestURL, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            urlSchemeTask.didReceive(notFound)
            urlSchemeTask.didFinish()
            return
        }
        let ok = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "text/html; charset=utf-8", "Content-Length": String(data.count)]
        )!
        urlSchemeTask.didReceive(ok)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    static func gameFile() -> URL? {
        #if SWIFT_PACKAGE
        if let url = Bundle.module.url(forResource: "game", withExtension: "html") {
            return url
        }
        #endif
        return Bundle.main.url(forResource: "game", withExtension: "html")
    }
}
