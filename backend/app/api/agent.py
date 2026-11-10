from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agents import shopping
from app.agents.gemini import GeminiClient, get_gemini_client
from app.api.deps import get_current_user
from app.database.session import get_db
from app.models import User
from app.schemas.purchase import AgentChatRequest
import re

from app.integrations.paypal import PayPalClient, get_paypal_client
from app.services import requests as svc
from app.services import wallet as wallet_svc
from app.services.serializers import payment_out, pr_out

WALLET_WORDS = re.compile(r"\b(agent|my)\s+wallet\b|\bagent\s+spending\b", re.I)

router = APIRouter(prefix="/agent", tags=["agent"])

REPLY = {
    "auto_approved": "Within your policy, so it is auto-approved. Pay with PayPal to complete it.",
    "needs_approval": "This needs your approval before any payment can happen. Open the Approval centre.",
    "blocked": "AgentGuard blocked this request. No payment can be made for it.",
}


@router.post("/chat")
def chat(body: AgentChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db),
         gemini: GeminiClient = Depends(get_gemini_client), client: PayPalClient = Depends(get_paypal_client)) -> dict:
    data, source = shopping.parse_goal(body.message, gemini)
    name = "Shopping Agent (Gemini)" if source == "gemini" else "Shopping Agent (rule-based)"
    pr = svc.create_purchase_request(db, user, data, gemini, agent_name=name, source_prompt=body.message)
    decision = pr.policy_evaluation["decision"]
    reply, charge = REPLY[decision], None
    if WALLET_WORDS.search(body.message):  # "use my agent wallet": parsed like any request, then policy + guardrails decide
        charge = wallet_svc.try_autonomous_charge(db, client, user, pr)
        if charge["outcome"] != "not_applicable" or decision == "auto_approved":
            reply = charge["message"]
    return {"reply": reply, "parser_source": source, "purchase_request": pr_out(pr), "wallet_outcome": charge["outcome"] if charge else None,
            "payment": payment_out(charge["payment"]) if charge and charge["payment"] else None}
