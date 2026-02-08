import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Image as ImageIcon, Loader2, AlertCircle, Info, Key } from 'lucide-react';
import { askGallery, AskGalleryResponse } from '@/services/askGalleryService';
import { Link } from 'react-router-dom';

interface AskSectionProps {
    workspaceId: string;
    galleryId: string;
    expanded?: boolean;
    onToggle?: () => void;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    citedPhotos?: string[];
    timestamp: Date;
}

export const AskSection: React.FC<AskSectionProps> = ({
    workspaceId,
    galleryId,
    expanded,
    onToggle,
}) => {
    const [query, setQuery] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [missingKey, setMissingKey] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isThinking) return;

        const userMessage: Message = {
            role: 'user',
            content: query,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setQuery('');
        setIsThinking(true);
        setError(null);
        setMissingKey(false);

        try {
            const result: AskGalleryResponse = await askGallery(workspaceId, galleryId, userMessage.content);

            // Check for specific error codes internally if API returns 200 but has error field
            const resultAny = result as any;
            if (resultAny.error && resultAny.code === 'API_KEY_MISSING') {
                setMissingKey(true);
                return;
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: result.answer,
                citedPhotos: result.cited_photos,
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err: any) {
            // Handle specific error messages from service
            if (err.message && err.message.includes("API Key")) {
                setMissingKey(true);
            } else {
                setError(err.message || 'Failed to get an answer. Please try again.');
            }
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="flex flex-col h-[500px] max-h-[80vh]">
            {/* Header */}
            <div className="flex-none p-4 border-b border-border/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">Ask Your Gallery</h3>
                        <p className="text-sm text-text-secondary">
                            Ask questions about photos, events, or moments.
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !missingKey && (
                    <div className="text-center py-10 text-text-secondary space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                            <ImageIcon className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-lg font-medium text-text-primary">What would you like to know?</p>
                        <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                            {['Find the best photos of the cake', 'Show me emotional moments', 'What is the color theme?', 'Find group photos'].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => setQuery(suggestion)}
                                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>

                        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-800 dark:text-blue-200 flex items-start text-left gap-3">
                            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold mb-1">How it works</p>
                                <p className='opacity-90'>
                                    We first find relevant photos using search, then use Gemini Vision to look at the top 20 matches to answer your specific question.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user'
                                ? 'bg-primary text-white rounded-tr-none'
                                : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                                }`}
                        >
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.citedPhotos && msg.citedPhotos.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
                                    <p className="text-xs font-medium opacity-70 mb-2">
                                        Referenced Photos ({msg.citedPhotos.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {msg.citedPhotos.slice(0, 5).map(id => (
                                            <div key={id} className="text-xs bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                {id.split('-')[0]}...
                                            </div>
                                        ))}
                                        {msg.citedPhotos.length > 5 && (
                                            <div className="text-xs bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                +{msg.citedPhotos.length - 5}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isThinking && (
                    <div className="flex justify-start">
                        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 rounded-tl-none flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm text-text-secondary">Analyzing photos...</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex justify-center">
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    </div>
                )}

                {missingKey && (
                    <div className="flex justify-center p-4">
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 max-w-md w-full">
                            <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-200 font-semibold">
                                <Key className="w-5 h-5" />
                                <span>Gemini API Key Required</span>
                            </div>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                                To use generic reasoning (Ask Gallery), you need to provide your own Google Gemini API Key. This ensures you control your usage limits and privacy.
                            </p>
                            <Link to="/settings/ai" className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors w-full">
                                Configure in Settings
                            </Link>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-none p-4 border-t border-border/50">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={missingKey ? "Please configure API key first..." : "Ask a question..."}
                        disabled={isThinking || missingKey}
                        className="w-full pl-4 pr-12 py-3 rounded-xl border border-border bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || isThinking || missingKey}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isThinking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </form>
                <div className="text-center mt-2">
                    <p className="text-[10px] text-text-tertiary">
                        Uses Gemini 1.5 Flash (via your API Key) • Analyzes top 20 relevant photos
                    </p>
                </div>
            </div>
        </div>
    );
};
