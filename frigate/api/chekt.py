from fastapi import APIRouter, Request, HTTPException
from frigate.app import FrigateApp
from frigate.config import FrigateConfig
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chekt"])

@router.post("/chekt/test")
async def test_chekt(request: Request, body: dict):
    frigate: FrigateApp = request.app
    camera = body.get("camera")
    if not camera:
        raise HTTPException(status_code=400, detail="Camera name required")
    if not frigate.chekt_notifier:
        raise HTTPException(status_code=400, detail="Chekt not enabled")
    camera_config = frigate.config.cameras.get(camera)
    if not camera_config or not camera_config.chekt or not camera_config.chekt.chan_num:
        raise HTTPException(status_code=400, detail="Invalid camera or no channel")
    success = await frigate.chekt_notifier.test(camera, camera_config)
    if not success:
        raise HTTPException(status_code=500, detail="Test notification failed")
    return {"success": True}