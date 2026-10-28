import StoreKit
import UIKit

@objc(CRBridgeViewController)
class CRBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // Capacitor uses WKWebView as its root view. A separate native root
        // clips scrolling content to the safe area instead of just padding it.
        guard let webView = webView else { return }
        let container = UIView()
        container.backgroundColor = UIColor(red: 0.055, green: 0.090, blue: 0.133, alpha: 1)
        view = container
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        container.addSubview(webView)
        let safeArea = container.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safeArea.topAnchor),
            webView.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor)
        ])
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CRStoreKitPlugin())
    }
}

@objc(CRStoreKitPlugin)
public class CRStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CRStoreKitPlugin"
    public let jsName = "CRStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]
    private let productId = "com.calcioreport.app.pro30"
    private var transactions: [String: StoreKit.Transaction] = [:]
    private var finished: [String: String] = [:]
    private var updates: Task<Void, Never>?
    private var purchasing = false

    public override func load() {
        updates = Task { @MainActor [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self = self else { return }
                if let payload = self.payload(result) {
                    self.notifyListeners("transaction", data: payload, retainUntilConsumed: true)
                }
            }
        }
    }

    deinit { updates?.cancel() }

    @MainActor private func payload(_ result: VerificationResult<StoreKit.Transaction>) -> [String: Any]? {
        guard case .verified(let transaction) = result,
              transaction.productID == productId,
              let token = transaction.appAccountToken else { return nil }
        let id = String(transaction.id)
        transactions[id] = transaction
        return ["transactionId": id, "appAccountToken": token.uuidString.lowercased(),
                "signedPayload": result.jwsRepresentation]
    }

    @MainActor private func loadProduct() async throws -> Product {
        let products = try await Product.products(for: [productId])
        guard let product = products.first(where: { $0.id == productId }),
              product.type == .nonRenewable else { throw PurchaseError.unavailable }
        return product
    }

    @objc func product(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let product = try await loadProduct()
                call.resolve(["productId": product.id, "displayPrice": product.displayPrice,
                              "displayName": product.displayName])
            } catch { call.reject("Prodotto non disponibile. Riprova più tardi.", "PRODUCT_UNAVAILABLE") }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let rawToken = call.getString("appAccountToken"), let token = UUID(uuidString: rawToken) else {
            call.reject("Account non valido.", "ACCOUNT_INVALID"); return
        }
        Task { @MainActor in
            guard !purchasing else { call.reject("Acquisto già in corso.", "PURCHASE_BUSY"); return }
            purchasing = true
            defer { purchasing = false }
            do {
                let product = try await loadProduct()
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verification):
                    guard let item = payload(verification) else {
                        call.reject("Acquisto da verificare.", "TRANSACTION_UNVERIFIED"); return
                    }
                    call.resolve(["state": "purchased", "transaction": item])
                case .userCancelled: call.resolve(["state": "cancelled"])
                case .pending: call.resolve(["state": "pending"])
                @unknown default: call.reject("Stato acquisto sconosciuto.", "PURCHASE_UNKNOWN")
                }
            } catch { call.reject("Acquisto non completato. Riprova più tardi.", "PURCHASE_FAILED") }
        }
    }

    @objc func unfinished(_ call: CAPPluginCall) {
        Task { @MainActor in
            var items: [[String: Any]] = []
            for await result in StoreKit.Transaction.unfinished {
                if let item = payload(result) { items.append(item) }
                if items.count > 500 { call.reject("Troppi acquisti da verificare.", "HISTORY_LIMIT"); return }
            }
            call.resolve(["transactions": items])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        // AppStore.sync may prompt for Apple authentication: user initiated only.
        Task { @MainActor in
            do {
                try await AppStore.sync()
                var items: [[String: Any]] = []
                for await result in StoreKit.Transaction.all {
                    if let item = payload(result) { items.append(item) }
                    if items.count > 500 { call.reject("Troppi acquisti da verificare.", "HISTORY_LIMIT"); return }
                }
                call.resolve(["transactions": items])
            } catch { call.reject("Ripristino non completato.", "RESTORE_FAILED") }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId"), let token = call.getString("appAccountToken") else {
            call.reject("Transazione non valida.", "TRANSACTION_INVALID"); return
        }
        Task { @MainActor in
            if finished[id] == token.lowercased() { call.resolve(); return }
            guard let transaction = transactions[id],
                  transaction.appAccountToken?.uuidString.lowercased() == token.lowercased() else {
                call.reject("Transazione non associata a questo account.", "TRANSACTION_ACCOUNT_MISMATCH"); return
            }
            // JS calls this only after the backend returns durable state=applied.
            await transaction.finish()
            finished[id] = token.lowercased()
            transactions.removeValue(forKey: id)
            call.resolve()
        }
    }
    private enum PurchaseError: Error { case unavailable }
}
