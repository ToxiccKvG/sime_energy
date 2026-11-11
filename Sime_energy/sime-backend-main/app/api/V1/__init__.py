from fastapi import APIRouter, Depends

from app.core.auth import utilisateur_courant
from .processing import router as processing_router
from .ai.router import router as ai_router
from .calendrier.router import router as calendrier_router

router = APIRouter()

# Tous les endpoints exigent un jeton Supabase (AUTH_REQUIRED=false pour une transition de déploiement)
# auth router non implémenté (auth gérée côté Supabase)
router.include_router(processing_router, prefix="/processing", tags=["processing"],
                      dependencies=[Depends(utilisateur_courant)])
router.include_router(ai_router, prefix="/ai", tags=["ai"],
                      dependencies=[Depends(utilisateur_courant)])
router.include_router(calendrier_router, prefix="/calendrier", tags=["calendrier"],
                      dependencies=[Depends(utilisateur_courant)])
