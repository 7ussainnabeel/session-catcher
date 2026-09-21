import asyncio
import logging
from typing import Dict, List, Set
from fastapi import WebSocket
import websockets
import json

logger = logging.getLogger("session_reserve.ws")

class DashboardWSManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        
        # Create a list of send coroutines
        disconnected_sockets = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error sending ws broadcast, marking for removal: {e}")
                disconnected_sockets.append(connection)
        
        for conn in disconnected_sockets:
            self.disconnect(conn)

# Singleton dashboard manager
dashboard_ws_manager = DashboardWSManager()


class CDPProxyManager:
    @staticmethod
    async def proxy_cdp(client_ws: WebSocket, browser_ws_url: str):
        """
        Establishes a bidirectional WebSocket proxy between the client frontend (React)
        and the Playwright/Chromium CDP debugger.
        """
        logger.info(f"Connecting proxy to browser CDP: {browser_ws_url}")
        
        try:
            # Connect to Chromium debugger websocket with Host header to pass security checks
            async with websockets.connect(browser_ws_url, max_size=10*1024*1024, additional_headers={"Host": "localhost"}) as browser_ws:
                logger.info("Successfully connected to Chromium CDP. Starting bidirectional pipe.")
                
                # Forward client (React) -> browser (Chromium)
                async def forward_to_browser():
                    try:
                        while True:
                            # Read data from React client
                            client_data = await client_ws.receive_text()
                            # Parse JSON to verify, and forward to CDP
                            await browser_ws.send(client_data)
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"CDP Proxy: client -> browser exception: {e}")

                # Forward browser (Chromium) -> client (React)
                async def forward_to_client():
                    try:
                        while True:
                            # Read data from Chromium CDP
                            browser_data = await browser_ws.recv()
                            # Send data to React client
                            await client_ws.send_text(str(browser_data))
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"CDP Proxy: browser -> client exception: {e}")

                # Run both tasks concurrently
                forward_task_1 = asyncio.create_task(forward_to_browser())
                forward_task_2 = asyncio.create_task(forward_to_client())
                
                # Wait until one task terminates
                done, pending = await asyncio.wait(
                    [forward_task_1, forward_task_2],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                for task in pending:
                    task.cancel()
                    
        except Exception as e:
            logger.error(f"Failed to establish or maintain CDP websocket connection: {e}")
            try:
                await client_ws.send_json({"error": f"Failed to connect to browser CDP: {str(e)}"})
            except Exception:
                pass
            raise
