import React, { useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../utils/api';
import { Loader2, MonitorOff, Keyboard } from 'lucide-react';

interface BrowserViewerProps {
  jobId: number;
  onClose: () => void;
}

export const BrowserViewer: React.FC<BrowserViewerProps> = ({ jobId, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [browserUrl, setBrowserUrl] = useState<string>('');

  // Dimensions of virtual browser viewport
  const VIEWPORT_WIDTH = 1280;
  const VIEWPORT_HEIGHT = 720;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/browser/${jobId}?token=${getAccessToken()}`;
    
    setStatus('connecting');
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('connected');
      // Initialize screencast on port/debugger
      const startScreencastCmd = {
        id: 1,
        method: 'Page.startScreencast',
        params: {
          format: 'jpeg',
          quality: 60,
          maxWidth: VIEWPORT_WIDTH,
          maxHeight: VIEWPORT_HEIGHT,
          everyNthFrame: 1
        }
      };
      socket.send(jsonCdp(startScreencastCmd));
      // Also request browser version/URL
      socket.send(jsonCdp({ id: 2, method: 'Page.getNavigationHistory' }));
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        
        // Handle error message sent by FastAPI CDP proxy
        if (parsed.error) {
          setErrorMsg(parsed.error);
          setStatus('error');
          return;
        }

        // Render Frame
        if (parsed.method === 'Page.screencastFrame') {
          const { data, sessionId } = parsed.params;
          
          // Ack frame
          const ackCmd = {
            id: 3,
            method: 'Page.screencastFrameAck',
            params: { sessionId }
          };
          socket.send(jsonCdp(ackCmd));
          
          // Draw base64 image onto canvas
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
              }
            }
          };
          img.src = `data:image/jpeg;base64,${data}`;
        }
        
        // Handle current URL history updates
        if (parsed.id === 2 && parsed.result) {
          const { currentIndex, entries } = parsed.result;
          if (entries && entries[currentIndex]) {
            setBrowserUrl(entries[currentIndex].url);
          }
        }
      } catch (err) {
        // Suppress parsing issues of non-JSON frames if any
      }
    };

    socket.onerror = (err) => {
      loggerError('Socket error', err);
      setStatus('error');
      setErrorMsg('Websocket connection failed.');
    };

    socket.onclose = () => {
      setStatus((prev) => prev === 'connecting' || prev === 'connected' ? 'disconnected' : prev);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        // Stop screencast
        try {
          socket.send(jsonCdp({ id: 4, method: 'Page.stopScreencast' }));
        } catch(e){}
      }
      socket.close();
    };
  }, [jobId]);

  const jsonCdp = (obj: any) => JSON.stringify(obj);
  const loggerError = (msg: string, err: any) => console.error(msg, err);

  // Dispatch mouse inputs to CDP
  const handleMouseEvent = (type: 'mousePressed' | 'mouseReleased' | 'mouseMoved', e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || status !== 'connected' || !socketRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = VIEWPORT_WIDTH / rect.width;
    const scaleY = VIEWPORT_HEIGHT / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    let button = 'left';
    if (e.button === 1) button = 'middle';
    if (e.button === 2) button = 'right';

    const cmd = {
      id: 10,
      method: 'Input.dispatchMouseEvent',
      params: {
        type,
        x,
        y,
        button,
        clickCount: type === 'mousePressed' ? 1 : 0
      }
    };
    
    socketRef.current.send(jsonCdp(cmd));
  };

  // Keyboard Event Handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (status !== 'connected' || !socketRef.current) return;
    e.preventDefault();

    const socket = socketRef.current;
    const key = e.key;
    let code = e.code;
    let keyCode = e.keyCode;

    // Handle standard keys
    if (key.length === 1) {
      // Character key
      socket.send(jsonCdp({
        id: 11,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyDown',
          text: key,
          unmodifiedText: key,
          key: key,
          code: code,
          windowsVirtualKeyCode: keyCode
        }
      }));
      // Dispatch char event for input fields
      socket.send(jsonCdp({
        id: 12,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'char',
          text: key,
          unmodifiedText: key
        }
      }));
      socket.send(jsonCdp({
        id: 13,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyUp',
          key: key,
          code: code
        }
      }));
    } else {
      // Control keys (Backspace, Enter, Tab, etc)
      socket.send(jsonCdp({
        id: 14,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyDown',
          key: key,
          code: code,
          windowsVirtualKeyCode: keyCode
        }
      }));
      socket.send(jsonCdp({
        id: 15,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyUp',
          key: key,
          code: code,
          windowsVirtualKeyCode: keyCode
        }
      }));
    }

    // Refresh navigation URL indicator after typing/enter
    if (key === 'Enter') {
      setTimeout(() => {
        socket.send(jsonCdp({ id: 16, method: 'Page.getNavigationHistory' }));
      }, 1000);
    }
  };

  const handleNavigateToUrl = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const url = data.get('url') as string;
    if (url && socketRef.current && status === 'connected') {
      socketRef.current.send(jsonCdp({
        id: 20,
        method: 'Page.navigate',
        params: { url }
      }));
      setTimeout(() => {
        socketRef.current?.send(jsonCdp({ id: 21, method: 'Page.getNavigationHistory' }));
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden bg-zinc-950 border border-zinc-800">
        
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="font-semibold text-sm">Live Browser Session</span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 max-w-xs truncate hidden sm:inline" title={browserUrl}>
              {browserUrl || 'Opening targeted page...'}
            </span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Exit View
            </button>
          </div>
        </div>

        {/* Browser address bar to navigate manual setup */}
        {status === 'connected' && (
          <form onSubmit={handleNavigateToUrl} className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800 flex gap-2">
            <input 
              name="url" 
              type="text" 
              defaultValue={browserUrl}
              placeholder="https://example.com/login"
              className="flex-1 text-xs px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 focus:outline-none focus:border-blue-500"
            />
            <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium transition-colors">
              Go
            </button>
          </form>
        )}

        {/* Viewport Canvas area */}
        <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-auto">
          {status === 'connecting' && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-zinc-400">Establishing secure connection to browser CDP...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 p-6 text-center max-w-md">
              <MonitorOff className="h-10 w-10 text-red-500" />
              <h3 className="text-base font-bold text-zinc-200">Failed to Connect</h3>
              <p className="text-xs text-zinc-400">{errorMsg || 'The browser is offline or the worker has closed.'}</p>
              <button onClick={onClose} className="glass-button px-4 py-2 mt-2 text-xs">Back to Dashboard</button>
            </div>
          )}

          {status === 'disconnected' && (
            <div className="flex flex-col items-center gap-2">
              <MonitorOff className="h-8 w-8 text-zinc-500" />
              <p className="text-sm text-zinc-400">Connection to browser session closed.</p>
              <button onClick={onClose} className="glass-button-secondary px-4 py-2 mt-2 text-xs">Close</button>
            </div>
          )}

          {status === 'connected' && (
            <div className="relative w-full h-full flex flex-col justify-center items-center p-4">
              <canvas
                ref={canvasRef}
                width={VIEWPORT_WIDTH}
                height={VIEWPORT_HEIGHT}
                tabIndex={0} // Allows capturing keyboard events
                onMouseDown={(e) => handleMouseEvent('mousePressed', e)}
                onMouseUp={(e) => handleMouseEvent('mouseReleased', e)}
                onMouseMove={(e) => handleMouseEvent('mouseMoved', e)}
                onKeyDown={handleKeyDown}
                onContextMenu={(e) => e.preventDefault()} // Block browser context menu
                className="max-w-full max-h-full aspect-video shadow-2xl rounded border border-zinc-700 bg-black cursor-crosshair focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              
              {/* Keyboard status tip */}
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950/80 text-[10px] text-zinc-400 backdrop-blur pointer-events-none">
                <Keyboard size={12} />
                Click canvas to focus keyboard controls. Press Enter to submit values.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
