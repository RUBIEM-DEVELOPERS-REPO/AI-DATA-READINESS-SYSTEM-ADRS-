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

export function AiCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: "Hi! I'm the ADRS Copilot. I can answer questions based on the documents you've uploaded to the system." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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
      
      // Deduplicate sources
      const uniqueSources = Array.from(new Set(data.sources)) as string[];

      setMessages(prev => [...prev, { 
        role: "system", 
        content: data.reply,
        sources: uniqueSources 
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: "system", 
        content: "Sorry, I encountered an error connecting to the knowledge base." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-700 hover:scale-105 transition-all duration-300 z-50 flex items-center justify-center group"
        >
          <Sparkles className="h-6 w-6 text-white absolute group-hover:opacity-0 transition-opacity" />
          <MessageSquare className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity absolute" />
        </Button>
      )}

      {/* Chat Window */}
      <Card 
        className={`fixed bottom-6 right-6 w-80 sm:w-[380px] h-[550px] shadow-2xl flex flex-col z-50 overflow-hidden border border-indigo-100 dark:border-slate-800 transition-all duration-300 transform origin-bottom-right ${isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="bg-indigo-600 p-4 flex items-center justify-between text-white shadow-md relative z-10">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-1.5 rounded-md backdrop-blur-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">ADRS Copilot</h3>
              <p className="text-xs text-indigo-100 opacity-80">Layer 9 RAG System</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:bg-indigo-700 rounded-full h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4 bg-slate-50 dark:bg-slate-950/50" viewportRef={scrollRef}>
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    msg.role === "user" 
                      ? "bg-indigo-600 text-white rounded-tr-sm" 
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  
                  {/* Sources display */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                      {msg.sources.map((src, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100">
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
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-sm max-w-[85%]">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="text-xs text-slate-500 font-medium">Scanning knowledge base...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents..."
              className="flex-1 rounded-full border-slate-300 dark:border-slate-700 focus-visible:ring-indigo-500 pr-4"
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
    </>
  );
}
