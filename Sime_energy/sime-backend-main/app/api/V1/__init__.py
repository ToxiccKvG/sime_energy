from fastapi import APIRouter
from .auth import router as auth_router
from .processing import router as processing_router

router = APIRouter()

# Inclusion des routers avec leurs préfixes
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(processing_router, prefix="/processing", tags=["processing"])



