"""Real PayPal SANDBOX smoke test: create order -> you approve in the browser -> capture -> optional refund.

Run from the backend folder with the venv active (reads backend/.env):
    cd backend
    python ..\\scripts\\paypal_smoke_test.py            (Windows)
    python ../scripts/paypal_smoke_test.py             (macOS/Linux)
Nothing here touches the database. Use a SANDBOX business app and a SANDBOX personal (buyer) account only.
"""
import os
import sys
import uuid
import webbrowser
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from app.core.config import get_settings  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.integrations.paypal import PayPalClient  # noqa: E402


def main() -> int:
    s = get_settings()
    if not s.paypal_configured:
        print("FAIL: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing in backend/.env"); return 1
    if "sandbox" not in s.paypal_base_url:
        print(f"REFUSING: PAYPAL_BASE_URL is {s.paypal_base_url}, not sandbox."); return 1
    client = PayPalClient()
    try:
        print("1/4 Creating a $5.00 sandbox order ...")
        order = client.create_order(amount=5.00, currency="USD", reference_id="smoke-" + uuid.uuid4().hex[:8], description="AgentGuard smoke test",
                                    request_id=str(uuid.uuid4()), return_url="http://localhost:5173/paypal/return", cancel_url="http://localhost:5173/paypal/cancel")
        print(f"    order id: {order.id}   status: {order.status}")
        if not order.approval_url:
            print("FAIL: no approval link returned"); return 1
        print(f"2/4 Approve it as the SANDBOX BUYER:\n    {order.approval_url}")
        try:
            webbrowser.open(order.approval_url)
        except Exception:
            pass
        print("    (After approving, the browser lands on localhost:5173, which may show an error. That is fine.)")
        input("    Press Enter once you have approved the payment ... ")
        print("3/4 Capturing ...")
        cap = client.capture_order(order.id, request_id=str(uuid.uuid4()))
        print(f"    order status: {cap.order_status}   capture: {cap.capture_id} ({cap.capture_status})   {cap.amount} {cap.currency}")
        if cap.capture_status != "COMPLETED":
            print("WARN: capture not COMPLETED. Check the sandbox buyer account and funding."); return 2
        if input("4/4 Refund it now? [y/N] ").strip().lower() == "y":
            r = client.refund_capture(cap.capture_id, request_id=str(uuid.uuid4()), note="AgentGuard smoke test")
            print(f"    refund: {r.get('id')} status {r.get('status')}")
        print("\nSUCCESS: PayPal sandbox create -> approve -> capture works with your credentials.")
        return 0
    except AppError as e:
        print(f"\nFAIL: {e.message}\n    details: {e.details}")
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
