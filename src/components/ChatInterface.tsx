import {
  ChevronDown,
  FileText,
  Globe,
  Paperclip,
  Send,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  StopCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  onMessageSent?: (message: string) => void;
  sessionId: string | null;
  uploadedFilename: string | null;
  language: string;
  onLanguageChange: (lang: string) => void;
}

export function ChatInterface({
  onFileUpload,
  isUploading,
  onMessageSent,
  sessionId,
  uploadedFilename,
  language,
  onLanguageChange,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [autoTTS, setAutoTTS] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);

  const labels = getLabels(language);

  // Reset chat when session changes (e.g. initial load)
  useEffect(() => {
    setMessages([]);
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;

    const currentMsg = input;
    // Optimistic UI update
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: currentMsg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    onMessageSent?.(currentMsg);
    setInput("");

    try {
      const response = await fetch("http://localhost:8888/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentMsg,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          sessionId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let aiText = data.response;

        if (language !== "english") {
          const transRes = await fetch(
            "http://localhost:8888/api/translate_response",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: aiText, language }),
            },
          );
          if (transRes.ok) {
            const transData = await transRes.json();
            aiText = transData.text;
          }
        }

        const msgId = Date.now().toString();

        if (autoTTS) {
          toggleSpeech(msgId, aiText, true);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: "ai",
            content: aiText,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to send message", err);
    }
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

  const handleSummarize = async () => {
    if (isSummarizing || !sessionId) return;
    setIsSummarizing(true);
    setMessages((prev) => [
      ...prev,
      {
        id: "summarizing" + Date.now(),
        role: "ai",
        content: "⏳ " + labels.summarizing,
        timestamp: new Date(),
      },
    ]);

    try {
      const response = await fetch("http://localhost:8888/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        const data = await response.json();
        let summaryText = `## 📄 ${labels.summarize}\n\n${data.summary}`;

        if (language !== "english") {
          const transRes = await fetch(
            "http://localhost:8888/api/translate_response",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: summaryText, language }),
            },
          );
          if (transRes.ok) {
            const transData = await transRes.json();
            summaryText = transData.text;
          }
        }

        const msgId = Date.now().toString();

        if (autoTTS) {
          toggleSpeech(msgId, summaryText, true);
        }

        setMessages((prev) =>
          prev
            .filter((m) => !m.id.startsWith("summarizing"))
            .concat([
              {
                id: msgId,
                role: "ai",
                content: summaryText,
                timestamp: new Date(),
              },
            ]),
        );
      }
    } catch (err) {
      console.error("Failed to summarize", err);
      // Remove loading indicator
      setMessages((prev) =>
        prev.filter((m) => !m.id.startsWith("summarizing")),
      );
    } finally {
      setIsSummarizing(false);
    }
  };

  const selectedLang = LANGUAGES.find((l) => l.code === language);
  const selectedLangLabel = selectedLang?.label ?? "English";

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setInterimTranscript("");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let finalTrans = "";
        let interimTrans = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTrans += event.results[i][0].transcript;
          } else {
            interimTrans += event.results[i][0].transcript;
          }
        }

        if (finalTrans) {
          setInput((prev) =>
            prev ? `${prev} ${finalTrans.trim()}` : finalTrans.trim(),
          );
        }
        setInterimTranscript(interimTrans);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== "no-speech") {
          setIsListening(false);
          setInterimTranscript("");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };

      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("Error starting speech recognition", err);
      alert("Could not start speech recognition.");
    }
  };

  const toggleSpeech = (
    id: string,
    text: string,
    forcePlay: boolean = false,
  ) => {
    if (!("speechSynthesis" in window)) return;

    if (playingMessageId === id && !forcePlay) {
      window.speechSynthesis.cancel();
      setPlayingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[#*`_]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";

    utterance.onstart = () => setPlayingMessageId(id);
    utterance.onend = () =>
      setPlayingMessageId((prev) => (prev === id ? null : prev));
    utterance.onerror = () =>
      setPlayingMessageId((prev) => (prev === id ? null : prev));

    window.speechSynthesis.speak(utterance);
  };

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
              onClick={() => setAutoTTS(!autoTTS)}
              title={autoTTS ? "Auto Speech: ON" : "Auto Speech: OFF"}
              className={`h-8 w-8 p-0 border-0 ${autoTTS ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-white/15 hover:bg-white/25 text-white"}`}
            >
              {autoTTS ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </Button>

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
      <ScrollArea className="flex-1 p-4 overflow-auto w-full">
        <div className="space-y-4 pb-12 overflow-scroll w-full">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "ai" && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2.5 shrink-0 mt-0.5 border border-primary/20">
                  <span className="text-[11px]">✨</span>
                </div>
              )}

              <div
                className={`relative flex flex-col max-w-[85%] ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-sm text-[13px] leading-relaxed transition-all ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border/60 text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "ai" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`absolute -right-8 top-0 h-6 w-6 transition-opacity ${playingMessageId === msg.id ? "opacity-100 text-destructive hover:text-destructive/80" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"}`}
                      onClick={() => toggleSpeech(msg.id, msg.content)}
                      title={
                        playingMessageId === msg.id
                          ? "Stop Speech"
                          : "Read Aloud"
                      }
                    >
                      {playingMessageId === msg.id ? (
                        <StopCircle size={14} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                    </Button>
                  )}
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-headings:my-2.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return match ? (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          ) : (
                            <code
                              className="bg-muted/80 text-foreground px-1.5 py-0.5 rounded border text-[11.5px] font-mono before:hidden after:hidden"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                        pre({ node, children, ...props }: any) {
                          return (
                            <pre
                              className="overflow-x-auto text-[11.5px] font-mono !bg-muted/50 p-3 rounded-lg border border-border/50 !text-foreground my-2"
                              {...props}
                            >
                              {children}
                            </pre>
                          );
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <div
                  className={`text-[9px] mt-1.5 px-1 font-medium select-none ${msg.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}
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

      {/* Input Area */}
      <div className="p-3 border-t bg-background/80 backdrop-blur-sm mt-auto z-10 w-full relative shrink-0">
        {/* Floating Interim Transcript */}
        {isListening && interimTranscript && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 w-full px-4 z-20 pointer-events-none">
            <div className="bg-foreground text-background text-[11px] py-1.5 px-3 rounded-full shadow-lg inline-block animate-in fade-in slide-in-from-bottom-2 max-w-[80%] mx-auto block w-max">
              <span className="opacity-70 animate-pulse mr-1.5">🎙️</span>
              <i>{interimTranscript}</i>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 bg-muted/40 border border-border/50 rounded-[1.25rem] p-1.5 focus-within:bg-card focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/30 transition-all shadow-sm max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title={labels.uploadPrompt}
            disabled={isUploading}
            className="rounded-full shrink-0 h-8 w-8 text-muted-foreground hover:bg-muted/80"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-[1.5px] border-muted-foreground border-t-foreground rounded-full animate-spin" />
            ) : (
              <Paperclip size={15} />
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
          </Button>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={labels.placeholder}
            className="flex-1 border-0 bg-transparent px-2 h-8 text-[13px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60 rounded-none w-full"
          />

          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
              {isListening && (
                <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-20 pointer-events-none"></span>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleListening}
                className={`rounded-full h-8 w-8 transition-colors relative z-10 ${isListening ? "bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 dark:bg-red-950/50" : "text-muted-foreground hover:bg-muted/80"}`}
                title="Voice Input"
              >
                {isListening ? (
                  <MicOff size={15} className="animate-pulse" />
                ) : (
                  <Mic size={15} />
                )}
              </Button>
            </div>

            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim()}
              className="rounded-full h-8 w-8 shrink-0 bg-primary shadow-sm hover:opacity-90 transition-opacity"
            >
              <Send size={14} className="ml-0.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
