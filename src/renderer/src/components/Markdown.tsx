import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { CheckIcon, CopyIcon } from './icons'

/** Renders agent output: GitHub-flavored Markdown with highlighted code blocks. */
export const Markdown = memo(function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="markdown text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** A fenced code block with its language and a copy button. */
function CodeBlock({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const code = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>
  const language = /language-(\S+)/.exec(code?.props?.className ?? '')?.[1]
  const text = (): string => {
    const flatten = (n: React.ReactNode): string =>
      typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(flatten).join('') : n && typeof n === 'object' && 'props' in n ? flatten((n as React.ReactElement<{ children?: React.ReactNode }>).props.children) : ''
    return flatten(code?.props?.children)
  }
  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-100 px-3 py-1 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="font-mono">{language ?? 'code'}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(text().replace(/\n$/, ''))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-white p-3 text-xs leading-relaxed dark:bg-neutral-950">{children}</pre>
    </div>
  )
}
