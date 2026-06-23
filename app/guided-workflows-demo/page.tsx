import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guided Workflows Demo | Scout",
  description: "Demo page for recording and playing guided workflow walkthroughs."
};

export default function GuidedWorkflowsDemoPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header className="rounded-lg bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Demo workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Order Dashboard</h1>
        </header>

        <section className="grid gap-4 md:grid-cols-[1fr_360px]">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-normal">Recent orders</h2>
              <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white" data-testid="create-order-button" type="button">
                Create Order
              </button>
            </div>
            <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {["SO-1001", "SO-1002", "SO-1003"].map((order) => (
                <div className="flex items-center justify-between px-4 py-3 text-sm" key={order}>
                  <span>{order}</span>
                  <span className="text-slate-500">Processing</span>
                </div>
              ))}
            </div>
          </div>

          <form className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-normal">Create order</h2>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Customer Name</span>
              <input className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900" data-testid="customer-name-field" name="customerName" />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Product</span>
              <input className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900" data-testid="product-field" name="product" />
            </label>
            <button className="mt-5 h-10 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white" data-testid="submit-order-button" type="submit">
              Submit Order
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
