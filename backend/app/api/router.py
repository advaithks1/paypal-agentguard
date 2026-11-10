from fastapi import APIRouter

from app.api import agent, agents, auth, dashboard, demo, health, lists, payments, policies, purchase_requests, transactions, wallet

api_router = APIRouter()
for r in (health.router, auth.router, dashboard.router, transactions.router, purchase_requests.router, policies.router, lists.router,
          payments.router, agent.router, demo.router, wallet.router, agents.router):
    api_router.include_router(r)
