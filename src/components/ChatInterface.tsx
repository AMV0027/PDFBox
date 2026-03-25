import { ChevronDown, FileText, Globe, Paperclip, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { LANGUAGES, getLabels } from "../lib/translations";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  socket: Socket | null;
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  onMessageSent?: (message: string) => void;
  sessionId: string | null;
  uploadedFilename: string | null;
  language: string;
  onLanguageChange: (lang: string) => void;
}

export function ChatInterface({
  socket,
  onFileUpload,
  isUploading,
  onMessageSent,
  sessionId,
  uploadedFilename,
  language,
  onLanguageChange
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);

  const labels = getLabels(language);

  // Load chat history when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetch(`http://localhost:8888/api/chats/${sessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            const loadedMessages = data.messages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }));
            setMessages(loadedMessages);
          } else {
            setMessages([]);
          }
        })
        .catch((err) => console.error("Failed to load chat:", err));
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!socket) return;

    socket.on("ai_response", (response: string) => {
      if (language !== "english") {
        socket.emit("translate_ai_response", {
          text: response,
          language: language,
        });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "ai",
            content: response,
            timestamp: new Date(),
          },
        ]);
      }
    });

    socket.on("ai_response_translated", (data: { text: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "ai",
          content: data.text,
          timestamp: new Date(),
        },
      ]);
    });

    socket.on("summary_start", () => {
      setIsSummarizing(true);
    });

    socket.on("summary_complete", (data: { summary: string }) => {
      setIsSummarizing(false);
      
      const summaryText = `## 📄 ${labels.summarize}\n\n${data.summary}`;
      if (language !== "english") {
        socket.emit("translate_ai_response", { text: summaryText, language });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "ai",
            content: summaryText,
            timestamp: new Date(),
          },
        ]);
      }
    });

    return () => {
      socket.off("ai_response");
      socket.off("ai_response_translated");
      socket.off("summary_start");
      socket.off("summary_complete");
    };
  }, [socket, language, labels.summarize]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !socket || !sessionId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    socket.emit("chat_message", {
      message: input,
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      sessionId,
      responseLanguage: language !== "english" ? language : undefined,
    });
    onMessageSent?.(input);
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleSummarize = () => {
    if (!socket || isSummarizing) return;
    setIsSummarizing(true);
    setMessages((prev) => [
      ...prev,
      {
        id: "summarizing-" + Date.now(),
        role: "ai",
        content: "⏳ " + labels.summarizing,
        timestamp: new Date(),
      },
    ]);
    socket.emit("summarize_document");
  };

  const selectedLangLabel = LANGUAGES.find((l) => l.code === language)?.label ?? "English";

  return (
    <div className="flex flex-col h-full bg-background border-l relative">
      {/* Header */}
      <div className="relative w-full p-3 border-b bg-primary text-primary-foreground shadow-sm z-10">
        <div className="flex items-center justify-between gap-2">
          {/* Title */}
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{labels.title}</h2>
            <p className="text-[10px] text-primary-foreground/80 truncate">
              {labels.subtitle}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSummarize}
              disabled={isSummarizing || !uploadedFilename}
              title={!uploadedFilename ? labels.noPdf : labels.summarize}
              className="h-8 gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white border-0"
            >
              {isSummarizing ? (
                <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <FileText size={13} />
              )}
              <span className="hidden sm:inline">{labels.summarize}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white border-0"
                >
                  <Globe size={13} />
                  <span className="hidden sm:inline max-w-[64px] truncate">
                    {selectedLangLabel}
                  </span>
                  <ChevronDown size={11} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {labels.translateInterface}
                </div>
                <ScrollArea className="h-48">
                  {LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => onLanguageChange(lang.code)}
                      className="flex items-center justify-between"
                    >
                      {lang.label}
                      {language === lang.code && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active language indicator */}
        {language !== "english" && (
          <div className="mt-2 flex items-center justify-between bg-black/10 rounded-lg px-2.5 py-1">
            <span className="text-[10px]">
              🌐 {labels.translating}{" "}
              <span className="font-semibold">{selectedLangLabel}</span>
            </span>
            <button
              onClick={() => onLanguageChange("english")}
              className="hover:text-primary-foreground/80 transition-colors"
              title={labels.backToOriginal}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 overflow-auto">
        <div className="space-y-4 pb-20">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 shadow-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-muted text-foreground rounded-bl-none"
                }`}
              >
                <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }) => (
                        <p className="mb-1 last:mb-0 leading-relaxed" {...props} />
                      ),
                      a: ({ node, ...props }) => (
                        <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc ml-4 mb-2" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal ml-4 mb-2" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="mb-1" {...props} />
                      ),
                      code: ({ node, ...props }) => (
                        <code className="bg-black/10 rounded px-1.5 py-0.5 text-[0.9em]" {...props} />
                      ),
                      pre: ({ node, ...props }) => (
                        <pre className="bg-black/80 text-white rounded-lg p-3 overflow-x-auto mb-2 text-xs" {...props} />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                <div
                  className={`text-[10px] mt-1.5 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm space-y-2">
              <p>{labels.noMessages}</p>
              <p>{labels.uploadPrompt}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-card mt-auto z-10 w-full relative">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title={labels.uploadPrompt}
            disabled={isUploading}
            className="rounded-full shrink-0"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
            ) : (
              <Paperclip size={18} />
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
          </Button>

          <div className="flex-1 relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={labels.placeholder}
              className="rounded-full pl-4 pr-10 border-muted bg-background focus-visible:ring-1"
            />
          </div>

          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || !socket}
            className="rounded-full shrink-0"
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
