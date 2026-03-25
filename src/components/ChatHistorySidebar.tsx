import { MessageSquare, Plus, MoreVertical, Trash2, Edit2, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { getLabels } from "../lib/translations";

interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
}

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  currentChatId: string | null;
  language: string;
}

export function ChatHistorySidebar({
  isOpen,
  onClose,
  onSelectChat,
  onNewChat,
  currentChatId,
  language,
}: ChatHistorySidebarProps) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);

  // Advanced Inline Action States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const labels = getLabels(language);

  useEffect(() => {
    if (isOpen) {
      fetchChats();
    }
    // Cleanup states when closing
    if (!isOpen) {
      setEditingId(null);
      setDeleteId(null);
    }
  }, [isOpen]);

  const fetchChats = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8888/api/chats");
      if (response.ok) {
        const data = await response.json();
        setChats(data);
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async (chatId: string) => {
    try {
      await fetch(`http://localhost:8888/api/chats/${chatId}`, {
        method: "DELETE",
      });
      if (currentChatId === chatId) {
        onNewChat();
      }
      fetchChats();
    } catch (error) {
      console.error(error);
    } finally {
      setDeleteId(null);
    }
  };

  const saveEdit = async (chatId: string) => {
    if (editTitle.trim() && editTitle.trim() !== "") {
      try {
        await fetch(`http://localhost:8888/api/chats/${chatId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editTitle.trim() }),
        });
        fetchChats();
      } catch (error) {
        console.error(error);
      }
    }
    setEditingId(null);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        className="w-[300px] p-0 flex flex-col sm:w-[350px]"
      >
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{labels.chatHistory}</SheetTitle>
        </SheetHeader>

        <div className="p-4">
          <Button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center gap-2"
          >
            <Plus size={18} />
            {labels.newChat}
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : chats.length > 0 ? (
            <div className="space-y-2">
              {chats.map((chat) => (
                <div key={chat.id} className="group relative flex w-full">
                  {editingId === chat.id ? (
                    // Inline Rename UI
                    <div className="flex flex-col w-full gap-2 p-2 bg-muted/50 rounded-md border border-border">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(chat.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="h-8 text-sm"
                        placeholder="Chat Name"
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2 hover:bg-red-500/10 hover:text-red-500"
                          onClick={() => setEditingId(null)}
                        >
                          <X size={12} className="mr-1" /> Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs px-2 hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400"
                          onClick={() => saveEdit(chat.id)}
                        >
                          <Check size={12} className="mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : deleteId === chat.id ? (
                    // Inline Delete Confirmation UI
                    <div className="flex flex-col w-full gap-2 p-3 bg-red-500/10 text-red-600 dark:text-red-400 rounded-md border border-red-500/20">
                      <span className="text-sm font-medium">Delete this chat entirely?</span>
                      <div className="flex justify-end gap-2 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2 hover:bg-red-500/20"
                          onClick={() => setDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs px-3"
                          onClick={() => confirmDelete(chat.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Default List Item
                    <>
                      <Button
                        variant={currentChatId === chat.id ? "secondary" : "ghost"}
                        onClick={() => {
                          onSelectChat(chat.id);
                          onClose();
                        }}
                        className="w-full justify-start h-auto py-3 px-3 hover:bg-muted/50 pr-10"
                      >
                        <MessageSquare
                          size={16}
                          className="mt-0.5 shrink-0 text-muted-foreground mr-3"
                        />
                        <div className="flex flex-col items-start overflow-hidden w-full">
                          <span className="font-medium truncate w-full text-left">
                            {chat.title || "New Chat"}
                          </span>
                          <span className="text-xs text-muted-foreground mt-1">
                            {new Date(chat.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 h-8 w-8 transition-opacity"
                          >
                            <MoreVertical
                              size={14}
                              className="text-muted-foreground"
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              // Don't close immediately if we want smooth transition, but Radix handles it fine.
                              setEditingId(chat.id);
                              setEditTitle(chat.title);
                            }}
                          >
                            <Edit2 size={14} className="mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              setDeleteId(chat.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 size={14} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-sm mt-8">
              {labels.noChatHistory}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
