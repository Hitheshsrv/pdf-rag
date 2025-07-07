"use client";

import * as React from "react";
import { Input } from "./ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { User, Bot, ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: Array<{
    content: string;
    metadata: unknown;
  }>;
  model_used?: string;
}

const isMetadataWithSource = (metadata: unknown): metadata is { source: string } => {
  return typeof metadata === 'object' && metadata !== null && 'source' in metadata;
};

const ChatComponent: React.FC = () => {
  const [message, setMessage] = React.useState<string>("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [expandedContexts, setExpandedContexts] = React.useState<Set<string>>(new Set());
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendChatMessage = async () => {
    if (!message.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);

    try {
      const res = await fetch(`http://localhost:8000/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: message.trim(),
          model: 'llama3.1' // You can make this configurable
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.answer || "I couldn't generate a response.",
        timestamp: new Date(),
        context: data.context || [],
        model_used: data.model_used || 'unknown',
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

  const toggleContextExpansion = (messageId: string) => {
    setExpandedContexts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const clearChat = () => {
    setMessages([]);
    setExpandedContexts(new Set());
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="p-4 border-b bg-white sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">PDF Chat Assistant</h1>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clearChat}
            disabled={messages.length === 0}
          >
            Clear Chat
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 pb-20">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <Bot className="mx-auto mb-2 h-12 w-12 text-gray-300" />
              <p>Start a conversation by asking a question about your PDF documents.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.type === 'assistant' && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                </div>
              )}
              
              <div className={`max-w-[70%] ${msg.type === 'user' ? 'order-1' : ''}`}>
                <Card className={msg.type === 'user' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}>
                  <CardContent className="p-3">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatTimestamp(msg.timestamp)}
                      {msg.model_used && ` • ${msg.model_used}`}
                    </p>
                  </CardContent>
                </Card>

                {/* Context Section for Assistant Messages */}
                {msg.type === 'assistant' && msg.context && msg.context.length > 0 && (
                  <div className="mt-2">
                    <Collapsible>
                      <CollapsibleTrigger 
                        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 p-2 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
                        onClick={() => toggleContextExpansion(msg.id)}
                      >
                        <FileText className="w-3 h-3" />
                        <span>View Context ({msg.context.length} sources)</span>
                        {expandedContexts.has(msg.id) ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="space-y-2">
                          {msg.context.map((ctx, idx) => (
                            <Card key={idx} className="bg-yellow-50 border-yellow-200">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium text-yellow-800">
                                  Source {idx + 1}
                                  {isMetadataWithSource(ctx.metadata) && (
                                    <span className="ml-2 text-yellow-600">
                                      • {ctx.metadata.source}
                                    </span>
                                  )}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <p className="text-xs text-gray-700 line-clamp-3">
                                  {ctx.content}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>

              {msg.type === 'user' && (
                <div className="flex-shrink-0 order-2">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              </div>
              <Card className="bg-gray-50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-gray-600">Thinking...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-white sticky bottom-0">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            placeholder="Ask a question about your PDF documents..."
            disabled={isLoading}
          />
          <Button 
            onClick={handleSendChatMessage} 
            disabled={!message.trim() || isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatComponent;