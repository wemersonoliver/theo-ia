import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations, useConversation, Message } from "@/hooks/useConversations";
import { MessageSquare, Send, Loader2, User, Bot, ArrowLeft, Power, PowerOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function Conversations() {
  const { conversations, isLoading, sendMessage, toggleAI } = useConversations();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const { messages } = useConversation(selectedPhone || "");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!selectedPhone || !messageInput.trim()) return;
    
    await sendMessage.mutateAsync({ phone: selectedPhone, content: messageInput });
    setMessageInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  if (isLoading) {
    return (
      <DashboardLayout title="Conversas" description="Gerencie suas conversas">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Conversas" 
      description="Visualize e responda mensagens do WhatsApp"
    >
      <div className="grid h-[calc(100vh-180px)] gap-4 lg:grid-cols-3">
        {/* Conversation List */}
        <Card className={cn("lg:col-span-1", selectedPhone && "hidden lg:block")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <MessageSquare className="mx-auto h-12 w-12 opacity-30" />
                  <p className="mt-4">Nenhuma conversa ainda</p>
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((conv) => {
                    const lastMessage = (conv.messages as Message[])?.[conv.messages?.length - 1];
                    return (
                      <button
                        key={conv.id}
                        className={cn(
                          "w-full p-4 text-left transition-colors hover:bg-muted",
                          selectedPhone === conv.phone && "bg-muted"
                        )}
                        onClick={() => setSelectedPhone(conv.phone)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {conv.contact_name || conv.phone}
                          </span>
                          {conv.ai_active ? (
                            <Badge variant="outline" className="text-xs">IA</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Humano</Badge>
                          )}
                        </div>
                        {lastMessage && (
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {lastMessage.from_me ? "Você: " : ""}{lastMessage.content}
                          </p>
                        )}
                        {conv.last_message_at && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat View */}
        <Card className={cn("lg:col-span-2", !selectedPhone && "hidden lg:block")}>
          {selectedPhone ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      onClick={() => setSelectedPhone(null)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                      <CardTitle>
                        {selectedConversation?.contact_name || selectedPhone}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{selectedPhone}</p>
                    </div>
                  </div>
                  
                  {/* Toggle AI Button */}
                  <Button
                    variant={selectedConversation?.ai_active ? "outline" : "default"}
                    size="sm"
                    onClick={() => toggleAI.mutate({ 
                      phone: selectedPhone, 
                      active: !selectedConversation?.ai_active 
                    })}
                    disabled={toggleAI.isPending}
                    className="gap-2"
                  >
                    {toggleAI.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedConversation?.ai_active ? (
                      <>
                        <PowerOff className="h-4 w-4" />
                        <span className="hidden sm:inline">Desativar IA</span>
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4" />
                        <span className="hidden sm:inline">Reativar IA</span>
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex h-[calc(100vh-340px)] flex-col p-0">
                {/* Messages */}
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <div
                        key={msg.id || index}
                        className={cn(
                          "flex",
                          msg.from_me ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-4 py-2",
                            msg.from_me
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          )}
                        >
                          {!msg.from_me && (
                            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                              {msg.sent_by === "ai" || msg.sent_by === "ai_first_contact" ? (
                                <><Bot className="h-3 w-3" /> IA</>
                              ) : (
                                <><User className="h-3 w-3" /> Cliente</>
                              )}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                          <p className={cn(
                            "mt-1 text-right text-xs",
                            msg.from_me ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Digite sua mensagem..."
                      disabled={sendMessage.isPending}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessage.isPending}
                    >
                      {sendMessage.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedConversation?.ai_active 
                      ? "IA ativa - respondendo automaticamente" 
                      : "IA desativada - ao enviar mensagem, você assume o atendimento"}
                  </p>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="mx-auto h-16 w-16 opacity-30" />
                <p className="mt-4">Selecione uma conversa para visualizar</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
