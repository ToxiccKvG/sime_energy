from fastapi import APIRouter
from .processing import router as processing_router
from .ai.router import router as ai_router

router = APIRouter()

# Inclusion des routers avec leurs préfixes
# auth router non implémenté (auth gérée côté Supabase)
router.include_router(processing_router, prefix="/processing", tags=["processing"])
router.include_router(ai_router, prefix="/ai", tags=["ai"])



