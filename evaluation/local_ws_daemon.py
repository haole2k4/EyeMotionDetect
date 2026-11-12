#!/usr/bin/env python3
"""
EyeMotionDetect: R&D WebSocket Daemon
Runs at ws://127.0.0.1:8765.
Compatible with IGazeEngine frontend protocol:
{
  "timestamp": int,
  "rawX": float,
  "rawY": float,
  "snappedX": float,
  "snappedY": float,
  "activeTargetId": str | null,
  "gestureCode": "NONE" | "BLINK_LEFT" | "BLINK_RIGHT" | "DOUBLE_BLINK" | "LOOK_AWAY",
  "earLeft": float,
  "earRight": float,
  "fps": float
}

Self-contained pure Python asyncio RFC 6455 WebSocket implementation
(no third-party pip dependencies required).
"""

import asyncio
import base64
import hashlib
import json
import math
import random
import struct
import sys
import time

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

class GazeSimulatorState:
    def __init__(self):
        self.screen_w = 1920.0
        self.screen_h = 1080.0
        self.targets = []
        self.current_x = self.screen_w / 2.0
        self.current_y = self.screen_h / 2.0
        self.magnetic_strength = 0.8
        self.magnetic_radius = 80.0
        self.fps = 60.0
        self.t = 0.0

    def register_targets(self, targets):
        self.targets = targets

    def update_frame(self):
        self.t += 1.0 / self.fps
        # Simulate smooth Lissajous figure gaze motion across the screen
        freq_x = 0.35
        freq_y = 0.25
        target_x = (self.screen_w / 2.0) + (self.screen_w * 0.38) * math.sin(2.0 * math.pi * freq_x * self.t)
        target_y = (self.screen_h / 2.0) + (self.screen_h * 0.32) * math.cos(2.0 * math.pi * freq_y * self.t)
        
        # Add micro-saccades and jitter
        jitter_x = random.gauss(0, 1.8)
        jitter_y = random.gauss(0, 1.8)
        raw_x = target_x + jitter_x
        raw_y = target_y + jitter_y
        
        # Check magnetic snapping against registered UI targets
        snapped_x = raw_x
        snapped_y = raw_y
        active_target_id = None
        
        for t in self.targets:
            tx = t.get("x", 0) + t.get("width", 0) / 2.0
            ty = t.get("y", 0) + t.get("height", 0) / 2.0
            dist = math.hypot(raw_x - tx, raw_y - ty)
            if dist < self.magnetic_radius:
                alpha = self.magnetic_strength * (1.0 - dist / self.magnetic_radius)
                snapped_x = (1.0 - alpha) * raw_x + alpha * tx
                snapped_y = (1.0 - alpha) * raw_y + alpha * ty
                active_target_id = t.get("id")
                break
                
        # Simulate blinks periodically (e.g. every ~4-5 seconds)
        is_blinking = (int(self.t * 10) % 45 == 0)
        ear_left = 0.10 if is_blinking else 0.29 + random.gauss(0, 0.01)
        ear_right = 0.10 if is_blinking else 0.29 + random.gauss(0, 0.01)
        gesture = "DOUBLE_BLINK" if is_blinking else "NONE"
        
        return {
            "timestamp": int(time.time() * 1000),
            "rawX": round(raw_x, 1),
            "rawY": round(raw_y, 1),
            "snappedX": round(snapped_x, 1),
            "snappedY": round(snapped_y, 1),
            "activeTargetId": active_target_id,
            "gestureCode": gesture,
            "earLeft": round(ear_left, 3),
            "earRight": round(ear_right, 3),
            "fps": self.fps,
        }


class StandaloneWebSocketConnection:
    def __init__(self, reader, writer, state):
        self.reader = reader
        self.writer = writer
        self.state = state
        self.closed = False

    async def handshake(self):
        req_line = await self.reader.readline()
        if not req_line:
            return False
            
        headers = {}
        while True:
            line = await self.reader.readline()
            if not line or line == b"\r\n":
                break
            line_str = line.decode('utf-8', errors='ignore').strip()
            if ":" in line_str:
                k, v = line_str.split(":", 1)
                headers[k.strip().lower()] = v.strip()
                
        ws_key = headers.get("sec-websocket-key")
        if not ws_key:
            return False
            
        # Compute accept hash
        accept_raw = hashlib.sha1((ws_key + WS_GUID).encode('utf-8')).digest()
        accept_b64 = base64.b64encode(accept_raw).decode('utf-8')
        
        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_b64}\r\n\r\n"
        )
        self.writer.write(response.encode('utf-8'))
        await self.writer.drain()
        return True

    def encode_frame(self, message: str) -> bytes:
        data = message.encode('utf-8')
        length = len(data)
        frame = bytearray([0x81]) # FIN + Text frame
        
        if length <= 125:
            frame.append(length)
        elif length <= 65535:
            frame.append(126)
            frame.extend(struct.pack("!H", length))
        else:
            frame.append(127)
            frame.extend(struct.pack("!Q", length))
            
        frame.extend(data)
        return bytes(frame)

    async def send_message(self, message: str):
        if self.closed:
            return
        frame = self.encode_frame(message)
        self.writer.write(frame)
        await self.writer.drain()

    async def read_frame(self):
        header = await self.reader.read(2)
        if len(header) < 2:
            return None
        byte1, byte2 = header
        opcode = byte1 & 0x0F
        masked = (byte2 & 0x80) != 0
        length = byte2 & 0x7F
        
        if opcode == 0x08: # Close
            self.closed = True
            return None
            
        if length == 126:
            ext = await self.reader.read(2)
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = await self.reader.read(8)
            length = struct.unpack("!Q", ext)[0]
            
        mask_key = None
        if masked:
            mask_key = await self.reader.read(4)
            
        payload = await self.reader.read(length)
        if masked and mask_key:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
            
        if opcode == 0x01: # Text frame
            return payload.decode('utf-8', errors='ignore')
        return None


async def handle_client(reader, writer, state):
    ws = StandaloneWebSocketConnection(reader, writer, state)
    try:
        if not await ws.handshake():
            writer.close()
            await writer.wait_closed()
            return
    except Exception as e:
        writer.close()
        return

    client_addr = writer.get_extra_info('peername')
    print(f"[+] Client connected from {client_addr}")
    
    # Broadcast task at 60 FPS
    async def sender_loop():
        interval = 1.0 / state.fps
        try:
            while not ws.closed:
                payload = state.update_frame()
                msg = json.dumps(payload)
                await ws.send_message(msg)
                await asyncio.sleep(interval)
        except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError):
            pass

    # Receiver task for client messages
    async def receiver_loop():
        try:
            while not ws.closed:
                msg = await ws.read_frame()
                if msg is None:
                    break
                try:
                    data = json.loads(msg)
                    msg_type = data.get("type")
                    if msg_type == "PING":
                        await ws.send_message(json.dumps({"type": "PONG", "timestamp": int(time.time() * 1000)}))
                    elif msg_type == "REGISTER_TARGETS":
                        state.register_targets(data.get("targets", []))
                        print(f"[*] Registered {len(state.targets)} UI magnetic targets.")
                    elif msg_type == "SET_CONFIG":
                        if "magneticStrength" in data:
                            state.magnetic_strength = float(data["magneticStrength"])
                        if "screenW" in data:
                            state.screen_w = float(data["screenW"])
                        if "screenH" in data:
                            state.screen_h = float(data["screenH"])
                except Exception:
                    pass
        except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError):
            pass

    sender_task = asyncio.create_task(sender_loop())
    receiver_task = asyncio.create_task(receiver_loop())

    done, pending = await asyncio.wait(
        [sender_task, receiver_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()

    print(f"[-] Client {client_addr} disconnected.")
    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass


async def main():
    host = "127.0.0.1"
    port = 8765
    state = GazeSimulatorState()
    
    print("=" * 70)
    print("  EyeMotionDetect: R&D WebSocket Daemon")
    print(f"  Listening on: ws://{host}:{port}")
    print("  Compatible with IGazeEngine streaming protocol (60 FPS)")
    print("=" * 70)

    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, state),
        host,
        port
    )

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Daemon terminated gracefully.")
