// swift-tools-version: 5.8

// Swift Playgrounds (iPad) / Xcode app project for SIGNAL//BREAK.
// Swift Playgrounds rewrites this file when you change App Settings (team, bundle ID, version);
// set those in the app rather than by hand.
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "SIGNAL BREAK",
    platforms: [
        .iOS("16.0")
    ],
    products: [
        .iOSApplication(
            name: "SIGNAL BREAK",
            targets: ["AppModule"],
            bundleIdentifier: "com.example.signalbreak",
            displayVersion: "0.1.0",
            bundleVersion: "1",
            appIcon: .asset("AppIcon"),
            accentColor: .presetColor(.orange),
            appCategory: .games,
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .landscapeRight,
                .landscapeLeft
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            resources: [
                .copy("Resources/game.html")
            ]
        )
    ]
)
