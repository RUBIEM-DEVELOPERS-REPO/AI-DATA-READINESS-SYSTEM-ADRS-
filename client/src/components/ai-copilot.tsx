import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, Bot, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  role: "user" | "system";
  content: string;
  sources?: string[];
}

interface AiCopilotProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  initialMessage?: string;
}

const BTN_SIZE = 56; // px - explicit size to avoid Tailwind custom class issues

export function AiCopilot({
  title = "IntelliNexus Copilot",
  subtitle = "AI Workspace · RAG System",
  placeholder = "Ask about your documents...",
  initialMessage = "Hi! I'm the IntelliNexus Copilot. I can answer questions based on the documents you've uploaded to the system.",
}: AiCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: initialMessage }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Position is stored as distance from top-left viewport origin
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Initialize position after mount so window dimensions are available
  useEffect(() => {
    setPos({
      x: window.innerWidth - BTN_SIZE - 24,
      y: window.innerHeight - BTN_SIZE - 24,
    });
  }, []);

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        return {
          x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, prev.x)),
          y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, prev.y)),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !pos) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = pos.x;
    const initY = pos.y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, initX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, initY + dy)),
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!moved) setIsOpen((v) => !v);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!pos) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const initX = pos.x;
    const initY = pos.y;
    let moved = false;

    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - BTN_SIZE - 10, initX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - BTN_SIZE - 10, initY + dy)),
      });
    };

    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      if (!moved) setIsOpen((v) => !v);
    };

    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
  };

  // Calculate card position relative to button, staying inside viewport
  const getCardStyle = (): React.CSSProperties => {
    if (!pos) return { display: "none" };
    const cardW = window.innerWidth < 640 ? 320 : 380;
    const cardH = 550;
    let left = pos.x + BTN_SIZE - cardW;
    let top = pos.y - cardH - 12;
    if (left < 12) left = 12;
    if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
    if (top < 12) top = pos.y + BTN_SIZE + 12;
    if (top + cardH > window.innerHeight - 12) top = window.innerHeight - cardH - 12;
    return { left: `${left}px`, top: `${top}px` };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    try {
      const response = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages.filter(m => m.role === "user" || m.role === "system").map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      const uniqueSources = Array.from(new Set(data.sources)) as string[];
      setMessages(prev => [...prev, { role: "system", content: data.reply, sources: uniqueSources }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "system", content: "Sorry, I encountered an error connecting to the knowledge base." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render until we have a position (after mount)
  if (!pos) return null;

  return (
    <>
      {/* Floating Draggable Button */}
      <button
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          position: "fixed",
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${BTN_SIZE}px`,
          height: `${BTN_SIZE}px`,
          zIndex: 9999,
          borderRadius: "50%",
          background: isOpen
            ? "linear-gradient(135deg, #4338ca, #6366f1)"
            : "linear-gradient(135deg, #4f46e5, #6366f1)",
          boxShadow: "0 8px 32px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.18)",
          border: "none",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          touchAction: "none",
          transition: "box-shadow 0.2s, transform 0.15s",
          outline: "3px solid rgba(255,255,255,0.18)",
        }}
        title="IntelliNexus Copilot — drag to move, click to open"
        aria-label="Toggle IntelliNexus Copilot"
      >
        {isOpen ? (
          <X size={24} color="white" />
        ) : (
          <>
            <Sparkles size={22} color="white" style={{ position: "absolute", transition: "opacity 0.2s" }} />
            <MessageSquare size={22} color="white" style={{ position: "absolute", opacity: 0, transition: "opacity 0.2s" }} className="group-hover:opacity-100" />
          </>
        )}
        {/* Pulse ring */}
        {!isOpen && (
          <span style={{
            position: "absolute",
            inset: "-4px",
            borderRadius: "50%",
            border: "2px solid rgba(99,102,241,0.4)",
            animation: "copilot-pulse 2s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        )}
      </button>

      {/* Chat Window Card */}
      <Card
        style={{ ...getCardStyle(), zIndex: 9998, position: "fixed" }}
        className={`w-80 sm:w-[380px] h-[550px] shadow-2xl flex flex-col overflow-hidden border border-indigo-200 dark:border-slate-800 transition-all duration-200 transform ${
          isOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-4 flex items-center justify-between text-white shadow-md flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">{title}</h3>
              <p className="text-xs text-indigo-100 opacity-80 leading-tight">{subtitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/10 rounded-full h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4 bg-slate-50 dark:bg-slate-950/50" viewportRef={scrollRef}>
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                      {msg.sources.map((src, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">
                          {src}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="text-xs text-slate-500 font-medium">Scanning knowledge base...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              className="flex-1 rounded-full border-slate-300 dark:border-slate-700 focus-visible:ring-indigo-500"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="rounded-full h-10 w-10 bg-indigo-600 hover:bg-indigo-700 shadow-sm shrink-0 transition-transform active:scale-95"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>

      <style>{`
        @keyframes copilot-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.2); }
        }
      `}</style>
    </>
  );
}
