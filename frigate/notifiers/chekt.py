import asyncio
import base64
import logging
from datetime import datetime, timedelta
import aiofiles
import aiohttp
import cv2
from pathlib import Path
from typing import Dict, Any
from frigate.config import CameraConfig, FrigateConfig
from frigate.models import Event
from frigate.util import run_async_shell
from frigate.object_processing import draw_box  # Adapted from object_processing

logger = logging.getLogger(__name__)

class ChektNotifier:
    def __init__(self, config: FrigateConfig) -> None:
        self.config = config.chekt
        self.last_send_times: Dict[str, datetime] = {}
        self.lock = asyncio.Lock()

    async def send_event(self, event: Dict[str, Any], camera_config: CameraConfig) -> None:
        chan_num = camera_config.chekt.chan_num
        async with self.lock:
            now = datetime.now()
            if chan_num in self.last_send_times and (now - self.last_send_times[chan_num]).total_seconds() < self.config.rate_limit_seconds:
                logger.debug(f"Skipping Chekt send for {chan_num}: rate limit.")
                return
            self.last_send_times[chan_num] = now

        clip_path = Path(f"/media/frigate/clips/{event['id']}.mp4")
        if not clip_path.exists():
            logger.error(f"Clip not found for event {event['id']}")
            return

        duration = min(self.config.video_duration, event.get('end_time', now.timestamp()) - event['start_time'])
        temp_video = f"/tmp/trimmed_{event['id']}.mp4"
        output_video = f"/tmp/processed_{event['id']}.mp4" if camera_config.chekt.draw_bounding_boxes else temp_video

        # Trim and scale with ffmpeg
        cmd = [
            "ffmpeg", "-y", "-i", str(clip_path),
            "-t", str(duration), "-vf", "scale=640:480",
            "-c:a", "copy", temp_video
        ]
        process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        await process.communicate()

        if camera_config.chekt.draw_bounding_boxes:
            # Draw bounding boxes (simple: use event box on all frames)
            box = event.get('box', (0, 0, 0, 0))  # (x1, y1, x2, y2)
            label = event['label']
            score = event['score']
            cap = cv2.VideoCapture(temp_video)
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_video, fourcc, cap.get(cv2.CAP_PROP_FPS), (640, 480))

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                # Scale box to 640x480
                scaled_box = [int(coord * 640 / camera_config.detect.width) if i % 2 == 0 else int(coord * 480 / camera_config.detect.height) for i, coord in enumerate(box)]
                draw_box(frame, scaled_box, label, score)  # Use Frigate's draw function
                out.write(frame)

            cap.release()
            out.release()

        # Base64 encode
        async with aiofiles.open(output_video, "rb") as f:
            video_bytes = await f.read()
        video_base64 = base64.b64encode(video_bytes).decode('utf-8')

        # Clean up
        Path(temp_video).unlink(missing_ok=True)
        Path(output_video).unlink(missing_ok=True)

        # Post to Chekt
        url = f"http://{self.config.host}:{self.config.port}/api/v1/channels/{chan_num}/events"
        payload = {
            "event_description": f"{event['label'].capitalize()} detected",
            "video_content": f"data:video/mp4;base64,{video_base64}",
            "detections": [{
                "entity_name": event['label'],
                "confidence": {"avg": event['score'], "max": event.get('top_score', event['score'])}
            }]
        }
        headers = {"Authorization": f"Bearer {self.config.token}", "Content-Type": "application/json"}

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status in (200, 202):
                    logger.info(f"Posted to Chekt: {resp.status}")
                else:
                    logger.error(f"Chekt post failed: {resp.status} - {await resp.text()}")