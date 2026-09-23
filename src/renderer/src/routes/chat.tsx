import { Link, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { UIMessage } from 'ai'
import type { AiBlockedReason } from '@shared/ipc'
import { KeyRound } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea
} from '@/components/ai-elements/prompt-input'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { useThreadChat } from '@/hooks/use-thread-chat'
import { errorMessage } from '@/lib/format'

const SUGGESTIONS = [
  'How is my portfolio doing overall, and what drives the result?',
  'How concentrated am I? Show my top holdings by weight.',
  'How much dividend income did I get in the last 12 months, and from what?',
  'What have I paid in fees and FX costs this year?',
  'How much currency exposure do I have outside my account currency?'
]

export function ChatPage(): React.JSX.Element {
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => window.ot212.ai.getStatus() })
  // The route redirects to a fresh id when none is given, so this is always set.
  const { id } = useSearch({ from: '/chat' })
  const chatId = id ?? ''
  // Always read the thread fresh: main may have saved more of it since this page last saw it.
  const saved = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => window.ot212.chats.get(chatId),
    enabled: chatId !== '',
    gcTime: 0
  })

  const initial = (saved.data?.messages as UIMessage[] | undefined) ?? []
  const blocked = ai.data?.blocked ?? null
  const providerName = ai.data?.providers.find((p) => p.id === ai.data?.provider)?.name ?? 'AI'
  const copy: Record<NonNullable<AiBlockedReason>, { title: string; body: string }> = {
    'local-only': {
      title: 'Local-only mode is on',
      body: `${providerName} runs in the cloud, so it is blocked while local-only mode is on. Turn it off, or switch to Ollama to chat with a model on this computer.`
    },
    'no-key': {
      title: `Add a ${providerName} API key`,
      body: 'The key is stored in your OS keychain and only used to talk to that provider directly.'
    },
    'no-model': {
      title: 'Pick a model',
      body: `Choose which ${providerName} model answers in the chat.`
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-5">
      {blocked ? (
        <Empty className="m-auto max-w-md border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>{copy[blocked].title}</EmptyTitle>
            <EmptyDescription>{copy[blocked].body}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <Link to="/settings" search={{ tab: 'ai' }}>
                Open AI settings
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : saved.isFetchedAfterMount ? (
        <ChatThread key={chatId} chatId={chatId} initialMessages={initial} />
      ) : null}
    </div>
  )
}

function ChatThread({
  chatId,
  initialMessages
}: {
  chatId: string
  initialMessages: UIMessage[]
}): React.JSX.Element {
  const { messages, sendMessage, status, stop, error } = useThreadChat(chatId, initialMessages)

  const busy = status === 'streaming' || status === 'submitted'
  const ask = (text: string): void => {
    void sendMessage({ text })
  }

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="w-full">
          {messages.length === 0 ? (
            <ConversationEmptyState className="min-h-[50vh]">
              <div className="space-y-1">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  Ask about your portfolio
                </h3>
                <p className="text-sm text-muted-foreground">
                  Answers come from your locally synced Trading 212 data. Try one of these:
                </p>
              </div>
              <div className="mt-2 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Suggestion
                    key={s}
                    suggestion={s}
                    onClick={ask}
                    className="h-auto whitespace-normal py-1.5 text-left font-normal text-muted-foreground hover:text-foreground"
                  />
                ))}
              </div>
            </ConversationEmptyState>
          ) : null}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return <MessageResponse key={i}>{part.text}</MessageResponse>
                  }
                  if (part.type === 'reasoning') {
                    return (
                      <Reasoning key={i} isStreaming={busy && part.state === 'streaming'}>
                        <ReasoningTrigger />
                        <ReasoningContent>{part.text}</ReasoningContent>
                      </Reasoning>
                    )
                  }
                  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                    const tp = part as Extract<typeof part, { toolCallId: string }>
                    const toolName = 'toolName' in tp ? tp.toolName : tp.type.replace(/^tool-/, '')
                    return (
                      <Tool key={tp.toolCallId} defaultOpen={false}>
                        <ToolHeader
                          type="dynamic-tool"
                          toolName={toolName}
                          state={tp.state}
                          title={`Sent to the AI · ${toolName}`}
                        />
                        <ToolContent>
                          <ToolInput input={tp.input} />
                          <ToolOutput output={tp.output} errorText={tp.errorText} />
                        </ToolContent>
                      </Tool>
                    )
                  }
                  return null
                })}
              </MessageContent>
            </Message>
          ))}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="w-full pt-3">
        <PromptInput
          onSubmit={(message) => {
            if (message.text.trim()) ask(message.text.trim())
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about your holdings, returns, dividends, fees…" />
          </PromptInputBody>
          <PromptInputFooter>
            <span className="text-[11px] text-muted-foreground">
              Only the tool results shown above leave this computer.
            </span>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  )
}
