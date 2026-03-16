from fastapi import APIRouter
from .processing import router as processing_router

router = APIRouter()

# Inclusion des routers avec leurs préfixes
router.include_router(processing_router, prefix="/processing", tags=["processing"])

