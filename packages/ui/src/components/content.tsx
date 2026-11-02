"use client";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight } from "sugar-high";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const html = React.useMemo(() => highlight(code), [code]);
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border bg-muted/60", className)}>
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language || "code"}</span>
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="sh max-h-[480px] overflow-auto p-4 font-mono text-[13px] leading-6"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}

/** Renders trusted-ish Markdown (GFM) with safe links and highlighted code. Raw HTML is not rendered. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-lms text-[15px]", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            const text = String(children ?? "");
            if (lang || text.includes("\n")) return <CodeBlock code={text.replace(/\n$/, "")} language={lang} className="not-prose my-4" />;
            return <code>{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
