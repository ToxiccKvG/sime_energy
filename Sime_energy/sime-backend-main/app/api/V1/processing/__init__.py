from .proccesing import router as processing_router
from fastapi import APIRouter

router = APIRouter()
router.include_router(processing_router, prefix="/process-file")