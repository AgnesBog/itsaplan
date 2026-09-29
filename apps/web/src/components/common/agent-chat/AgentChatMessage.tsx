'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { ChatMessage } from '@/hooks/useAgentChat';
import { cn } from '@/lib/utils';
import type { AiChatPart, AiChatToolPart } from '@/lib/api/endpoints/agentChat';
import { formatLongDate, formatTime } from '@/utils/dates';
import Markdown from '@/components/common/Markdown';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { Message, MessageContent, MessageFooter } from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { Button } from '@/components/ui/button';
import AgentChatToolCalls from './AgentChatToolCalls';
import AgentChatUserText from './AgentChatUserText';
import { useTranslations } from 'next-intl';

type Block = { text: string } | { tools: AiChatToolPart[] };

// Tool calls that follow one another are shown as one block, in the place between the
// two stretches of text where they were made.
function blocksOf(parts: AiChatPart[]): Block[] {
  const blocks: Block[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      blocks.push({ text: part.text });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && 'tools' in last) last.tools.push(part);
    else blocks.push({ tools: [part] });
  }
  return blocks;
}

function getMessageText(parts: AiChatPart[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n')
    .trim();
}

export default function AgentChatMessage({
  message,
  showDate,
  complete = true,
}: {
  message: ChatMessage;
  showDate: boolean;
  complete?: boolean;
}) {
  const t = useTranslations('common.agentChat');
  const tc = useTranslations('common');
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const textToCopy = getMessageText(message.parts);

  const handleCopy = async () => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Ignore clipboard failure
      }
    }
  };

  return (
    <MessageScrollerItem
      messageId={message.id}
      scrollAnchor={isUser}
      className="flex flex-col gap-6 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
    >
      {showDate && (
        <Marker variant="separator">
          <MarkerContent>{formatLongDate(message.createdAt)}</MarkerContent>
        </Marker>
      )}
      <Message align={isUser ? 'end' : 'start'}>
        <MessageContent>
          <Bubble variant={isUser ? 'muted' : 'ghost'} className={cn('gap-2', !isUser && 'w-full')}>
            {blocksOf(message.parts).map((block, index) =>
              'tools' in block ? (
                <AgentChatToolCalls key={index} tools={block.tools} />
              ) : (
                <BubbleContent key={index} className={cn(!isUser && 'w-full')}>
                  {isUser ? (
                    <AgentChatUserText text={block.text} />
                  ) : (
                    <Markdown complete={complete}>{block.text}</Markdown>
                  )}
                </BubbleContent>
              ),
            )}
          </Bubble>
          {message.error && <p className="text-xs text-destructive">{message.error}</p>}
          <MessageFooter className="flex items-center gap-1.5">
            <span>
              {message.stopped
                ? `${t('stopped')} · ${formatTime(message.createdAt)}`
                : formatTime(message.createdAt)}
            </span>
            {!isUser && textToCopy && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title={copied ? tc('copied') : tc('copy')}
                onClick={() => void handleCopy()}
                className={cn(
                  'size-6 rounded-md text-muted-foreground transition-opacity hover:text-foreground',
                  copied
                    ? 'opacity-100 text-emerald-600 dark:text-emerald-400'
                    : 'opacity-70 sm:opacity-0 sm:group-hover/message:opacity-100 focus-visible:opacity-100',
                )}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span className="sr-only">{copied ? tc('copied') : tc('copy')}</span>
              </Button>
            )}
          </MessageFooter>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}
