import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '../utils/api';
import { 
  Loader2, 
  MonitorOff, 
  Keyboard, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Send, 
  Copy, 
  Check, 
  Globe, 
  RefreshCw,
  X
} from 'lucide-react';

interface BrowserViewerProps {
  jobId: number;
  jobName?: string;
  onClose: () => void;
}

export const BrowserViewer: React.FC<BrowserViewerProps> = ({ jobId, jobName, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const cmdIdRef = useRef<number>(1);
  const isImageRenderingRef = useRef<boolean>(false);
  const nextFrameDataRef = useRef<string | null>(null);

  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [browserUrl, setBrowserUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [quickInput, setQuickInput] = useState<string>('');
  const [fps, setFps] = useState<number>(0);
  const frameCountRef = useRef<number>(0);

  // Virtual browser viewport dimensions (16:9 standard)
  const VIEWPORT_WIDTH = 1280;
  const VIEWPORT_HEIGHT = 720;

  const nextId = () => ++cmdIdRef.current;
  const sendCdp = useCallback((method: string, params?: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        id: nextId(),
        method,
        params
      }));
    }
  }, []);

  // Frame rendering queue to eliminate image decode flickering
  const renderFrame = useCallback((base64Data: string) => {
    if (isImageRenderingRef.current) {
      nextFrameDataRef.current = base64Data;
      return;
    }

    isImageRenderingRef.current = true;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.drawImage(img, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        }
      }
      frameCountRef.current += 1;
      isImageRenderingRef.current = false;

      // Render next pending frame if any
      if (nextFrameDataRef.current) {
        const nextData = nextFrameDataRef.current;
        nextFrameDataRef.current = null;
        renderFrame(nextData);
      }
    };
    img.onerror = () => {
      isImageRenderingRef.current = false;
    };
    img.src = `data:image/jpeg;base64,${base64Data}`;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/browser/${jobId}?token=${getAccessToken()}`;

    setStatus('connecting');
    setErrorMsg('');

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('connected');

      // 1. Enable Page domain to receive Page events (screencast frames, navigations)
      socket.send(JSON.stringify({ id: nextId(), method: 'Page.enable' }));

      // 2. Focus and activate window
      socket.send(JSON.stringify({ id: nextId(), method: 'Emulation.setFocusEmulationEnabled', params: { enabled: true } }));
      socket.send(JSON.stringify({ id: nextId(), method: 'Page.bringToFront' }));

      // 3. Start high-performance Screencast stream
      socket.send(JSON.stringify({
        id: nextId(),
        method: 'Page.startScreencast',
        params: {
          format: 'jpeg',
          quality: 80,
          maxWidth: VIEWPORT_WIDTH,
          maxHeight: VIEWPORT_HEIGHT,
          everyNthFrame: 1
        }
      }));

      // 4. Request current page URL
      socket.send(JSON.stringify({ id: nextId(), method: 'Page.getNavigationHistory' }));
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        // Handle error message from backend proxy
        if (parsed.error) {
          if (parsed.error.toLowerCase().includes('starting up') || parsed.error.toLowerCase().includes('initialize')) {
            // Browser container is spinning up, keep loading spinner and auto-reconnect
            setTimeout(() => {
              connectWebSocket();
            }, 2500);
            return;
          }
          setErrorMsg(parsed.error);
          setStatus('error');
          return;
        }

        // Screencast Frame Event
        if (parsed.method === 'Page.screencastFrame') {
          const { data, sessionId } = parsed.params;

          // Immediately acknowledge frame so Chromium sends subsequent frames
          socket.send(JSON.stringify({
            id: nextId(),
            method: 'Page.screencastFrameAck',
            params: { sessionId }
          }));

          renderFrame(data);
        }

        // Page navigation events
        if (parsed.method === 'Page.frameNavigated' && parsed.params?.frame?.url) {
          setBrowserUrl(parsed.params.frame.url);
          setUrlInput(parsed.params.frame.url);
        }

        if (parsed.method === 'Page.navigatedWithinDocument' && parsed.params?.url) {
          setBrowserUrl(parsed.params.url);
          setUrlInput(parsed.params.url);
        }

        // Navigation history response
        if (parsed.result?.entries && parsed.result.currentIndex !== undefined) {
          const current = parsed.result.entries[parsed.result.currentIndex];
          if (current?.url) {
            setBrowserUrl(current.url);
            setUrlInput(current.url);
          }
        }
      } catch {
        // Ignore non-JSON or partial frames
      }
    };

    socket.onerror = () => {
      setStatus('error');
      setErrorMsg('WebSocket connection to browser session failed or closed.');
    };

    socket.onclose = () => {
      setStatus((prev) => (prev === 'connecting' || prev === 'connected' ? 'disconnected' : prev));
    };
  }, [jobId, renderFrame]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (socketRef.current) {
        try {
          if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ id: nextId(), method: 'Page.stopScreencast' }));
          }
        } catch {}
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Restart Screencast Stream
  const handleRestartStream = () => {
    sendCdp('Page.stopScreencast');
    setTimeout(() => {
      sendCdp('Page.startScreencast', {
        format: 'jpeg',
        quality: 80,
        maxWidth: VIEWPORT_WIDTH,
        maxHeight: VIEWPORT_HEIGHT,
        everyNthFrame: 1
      });
      sendCdp('Page.getNavigationHistory');
    }, 200);
  };

  // Convert client click coordinates to virtual viewport coordinates
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = VIEWPORT_WIDTH / rect.width;
    const scaleY = VIEWPORT_HEIGHT / rect.height;

    const x = Math.max(0, Math.min(VIEWPORT_WIDTH, Math.round((e.clientX - rect.left) * scaleX)));
    const y = Math.max(0, Math.min(VIEWPORT_HEIGHT, Math.round((e.clientY - rect.top) * scaleY)));

    return { x, y };
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status !== 'connected') return;
    const { x, y } = getCanvasCoordinates(e);

    let button = 'left';
    if (e.button === 1) button = 'middle';
    if (e.button === 2) button = 'right';

    sendCdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount: e.detail || 1
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status !== 'connected') return;
    const { x, y } = getCanvasCoordinates(e);

    let button = 'left';
    if (e.button === 1) button = 'middle';
    if (e.button === 2) button = 'right';

    sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount: 1
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status !== 'connected') return;
    const { x, y } = getCanvasCoordinates(e);
    let button = 'none';
    if (e.buttons === 1) button = 'left';
    if (e.buttons === 2) button = 'right';

    sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button
    });
  };

  // Mouse wheel scroll handler (non-passive native listener to prevent native page scroll and allow e.preventDefault())
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || status !== 'connected') return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const scaleX = VIEWPORT_WIDTH / rect.width;
      const scaleY = VIEWPORT_HEIGHT / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);

      sendCdp('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: e.deltaX,
        deltaY: e.deltaY
      });
    };

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, [status, sendCdp]);

  // Key Down & Single Character typing handler (eliminates double typing bug)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (status !== 'connected') return;

    if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
      return;
    }

    e.preventDefault();
    const key = e.key;
    const code = e.code;
    const keyCode = e.keyCode;

    // Handle Ctrl/Cmd+V paste
    if ((e.ctrlKey || e.metaKey) && (key === 'v' || key === 'V')) {
      navigator.clipboard.readText().then((text) => {
        if (text) {
          sendCdp('Input.insertText', { text });
        }
      }).catch(() => {});
      return;
    }

    if (key.length === 1) {
      // Printable character: Send single keyDown with text payload, followed by keyUp
      sendCdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: key,
        unmodifiedText: key,
        key,
        code,
        windowsVirtualKeyCode: keyCode
      });
      sendCdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: keyCode
      });
    } else {
      // Special / control keys (Enter, Backspace, Tab, Arrow keys, Delete, etc.)
      sendCdp('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key,
        code,
        windowsVirtualKeyCode: keyCode
      });
      sendCdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: keyCode
      });
    }

    if (key === 'Enter') {
      setTimeout(() => {
        sendCdp('Page.getNavigationHistory');
      }, 800);
    }
  };

  // Native clipboard paste onto canvas
  const handlePaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
    if (status !== 'connected') return;
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      sendCdp('Input.insertText', { text: pastedText });
    }
  };

  // Direct Text / OTP Quick Send Bar
  const handleSendQuickInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput || status !== 'connected') return;
    sendCdp('Input.insertText', { text: quickInput });
    setQuickInput('');
  };

  // Browser Navigation Actions
  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput && status === 'connected') {
      let target = urlInput.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `https://${target}`;
      }
      sendCdp('Page.navigate', { url: target });
      setTimeout(() => sendCdp('Page.getNavigationHistory'), 1000);
    }
  };

  const handleReload = () => {
    sendCdp('Page.reload', { ignoreCache: true });
    setTimeout(() => sendCdp('Page.getNavigationHistory'), 1000);
  };

  const handleCopyUrl = () => {
    if (browserUrl) {
      navigator.clipboard.writeText(browserUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-0 ${
        isFullscreen ? 'w-screen h-screen' : 'sm:p-4'
      }`}
    >
      <div 
        className={`flex flex-col overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl transition-all duration-200 ${
          isFullscreen 
            ? 'w-full h-full rounded-none border-0' 
            : 'w-full max-w-6xl h-full sm:h-[92vh] sm:rounded-2xl border-zinc-800'
        }`}
      >
        {/* Top App Bar */}
        <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                status === 'connected' ? 'bg-green-500 animate-pulse' : status === 'connecting' ? 'bg-yellow-500 animate-ping' : 'bg-red-500'
              }`} />
              <span className="font-bold text-sm text-zinc-100 hidden sm:inline">
                {jobName ? `${jobName} (Job #${jobId})` : `Live Browser Session #${jobId}`}
              </span>
              <span className="font-bold text-xs text-zinc-100 sm:hidden">
                #{jobId}
              </span>
            </div>

            {status === 'connected' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono hidden md:inline">
                {fps} FPS | 1280x720
              </span>
            )}
          </div>

          {/* Quick OTP / Password Input Bar */}
          {status === 'connected' && (
            <form onSubmit={handleSendQuickInput} className="hidden lg:flex items-center gap-1.5 flex-1 max-w-sm mx-4">
              <input
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Type OTP / Text & Send..."
                className="w-full text-xs px-2.5 py-1 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-blue-500"
              />
              <button 
                type="submit" 
                title="Send text directly into focused field"
                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
              >
                <Send size={11} />
                Send
              </button>
            </form>
          )}

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartStream}
              title="Refresh Video Stream"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={15} />
            </button>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              onClick={onClose}
              title="Close Browser View"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Browser URL Navigation Bar */}
        {status === 'connected' && (
          <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-800 flex items-center gap-2 shrink-0">
            <button
              onClick={handleReload}
              title="Reload Page"
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw size={13} />
            </button>

            <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-2">
              <div className="flex-1 relative flex items-center">
                <Globe size={13} className="absolute left-2.5 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/login"
                  className="w-full text-xs pl-8 pr-8 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  title="Copy Page URL"
                  className="absolute right-2 text-zinc-500 hover:text-zinc-300 p-0.5"
                >
                  {copiedUrl ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
              >
                Go
              </button>
            </form>
          </div>
        )}

        {/* Main Canvas Viewport Area */}
        <div className="flex-1 relative flex items-center justify-center bg-zinc-950/80 overflow-hidden select-none">
          {status === 'connecting' && (
            <div className="flex flex-col items-center gap-3 p-8 text-center animate-fade-in">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-base font-bold text-zinc-200">Connecting to Chromium CDP Stream</h4>
                <p className="text-xs text-zinc-400 max-w-sm">
                  Establishing real-time bidirectional pipe to the browser container...
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 p-8 text-center max-w-md animate-fade-in">
              <MonitorOff className="h-12 w-12 text-red-500" />
              <h3 className="text-base font-bold text-zinc-200">Browser Connection Unavailable</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {errorMsg || 'The browser is offline or the monitoring worker has not started yet.'}
              </p>
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={connectWebSocket} 
                  className="glass-button px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Retry Connection
                </button>
                <button 
                  onClick={onClose} 
                  className="glass-button-secondary px-4 py-2 text-xs"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}

          {status === 'disconnected' && (
            <div className="flex flex-col items-center gap-3 p-8 text-center animate-fade-in">
              <MonitorOff className="h-10 w-10 text-zinc-500" />
              <h3 className="text-base font-bold text-zinc-300">Session Closed</h3>
              <p className="text-xs text-zinc-400">The remote browser stream was terminated.</p>
              <div className="flex gap-2 mt-2">
                <button onClick={connectWebSocket} className="glass-button px-4 py-2 text-xs">Reconnect</button>
                <button onClick={onClose} className="glass-button-secondary px-4 py-2 text-xs">Close View</button>
              </div>
            </div>
          )}

          {status === 'connected' && (
            <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={VIEWPORT_WIDTH}
                height={VIEWPORT_HEIGHT}
                tabIndex={0}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onContextMenu={(e) => e.preventDefault()}
                className="max-w-full max-h-full aspect-video shadow-2xl rounded-lg border border-zinc-800 bg-black cursor-crosshair focus:outline-none focus:ring-2 focus:ring-blue-500/80 transition-all object-contain"
              />

              {/* Floating Bottom Help Badge */}
              <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-300 backdrop-blur-md pointer-events-none shadow-lg">
                <Keyboard size={13} className="text-blue-400" />
                <span>Click inside to focus keyboard & mouse. Supports typing, scroll & paste (Cmd/Ctrl+V).</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
