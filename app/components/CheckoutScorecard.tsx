import type { CheckoutScorecardData, PaymentMethods } from "@/lib/types";

const PAYMENT_LABELS: Record<keyof PaymentMethods, string> = {
  cod: "COD",
  netBanking: "Net Banking",
  upi: "UPI",
  bnpl: "BNPL",
  emi: "EMI",
  giftCard: "Gift Card",
  paypal: "PayPal",
  googlePay: "Google Pay",
  applePay: "Apple Pay",
  shopPay: "Shop Pay",
  creditCard: "Credit Card",
  debitCard: "Debit Card",
  wallet: "Wallet",
  crypto: "Crypto",
};

export function CheckoutScorecard({ data }: { data: CheckoutScorecardData }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold">Checkout Scorecard</h3>
          <div className="text-xs text-zinc-400 capitalize mt-1">
            {data.type.replace("-", " ")} • {data.steps} step{data.steps > 1 ? "s" : ""}
          </div>
        </div>
        <div className="text-3xl font-semibold text-violet-400">{data.score}<span className="text-base text-zinc-400">/100</span></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-sm">
        <Pill label="Guest checkout" on={data.guestCheckout} />
        <Pill label="Social login" on={data.socialLogin} />
        <Pill label="Address autofill" on={data.addressAutocomplete} />
        <Pill label="Trust badges" on={data.trustBadges} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
          Payment methods detected ({data.paymentCount}/14)
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PAYMENT_LABELS) as Array<keyof PaymentMethods>).map((k) => {
            const on = data.payments[k];
            return (
              <span
                key={k}
                className={`px-2.5 py-1 rounded-md text-xs border ${
                  on
                    ? "border-green-700/60 bg-green-950/40 text-green-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                {PAYMENT_LABELS[k]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Pill({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`px-3 py-2 rounded-lg border text-center ${
        on ? "border-green-700/60 bg-green-950/30 text-green-300" : "border-zinc-800 bg-zinc-900 text-zinc-400"
      }`}
    >
      {on ? "✓" : "✗"} {label}
    </div>
  );
}
