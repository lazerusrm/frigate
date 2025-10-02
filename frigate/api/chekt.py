from fastapi import APIRouter, Request, HTTPException
from frigate.app import FrigateApp
from frigate.config import FrigateConfig
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chekt"])

@router.post("/chekt/test")
async def test_chekt(request: Request, camera: str):
    frigate: FrigateApp = request.app
    if not frigate.chekt_notifier:
        raise HTTPException(status_code=400, detail="Chekt not enabled")

    camera_config = frigate.config.cameras.get(camera)
    if not camera_config or not camera_config.chekt or not camera_config.chekt.chan_num:
        raise HTTPException(status_code=400, detail="Invalid camera or no channel")

    # Dummy event for test
    dummy_event = {
        "id": "test",
        "label": "test_object",
        "score": 0.9,
        "box": (100, 100, 200, 200),
        "start_time": asyncio.get_event_loop().time() - 5,
        "end_time": asyncio.get_event_loop().time(),
        "has_clip": True,
        "false_positive": False,
    }
    # Use a sample clip or generate empty 1s video for test
    test_clip = "/tmp/test_clip.mp4"
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=640x480:d=1", "-c:v", "libx264", test_clip]
    process = await asyncio.create_subprocess_exec(*cmd)
    await process.communicate()

    await frigate.chekt_notifier.send_event(dummy_event, camera_config)
    Path(test_clip).unlink(missing_ok=True)
    return {"success": True}