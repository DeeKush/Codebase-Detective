import React, { useState } from 'react';

// Formats inline tokens: **bold**, *italic*, `code`, and links [title](url)
function renderInline(text, keyPrefix = 'inline') {
  if (!text) return null;
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const k = `${keyPrefix}-${idx++}`;
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={k} className="inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={k}>{renderInline(token.slice(2, -2), `${k}-b`)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={k}>{renderInline(token.slice(1, -1), `${k}-i`)}</em>);
    } else if (match[2] && match[3]) {
      parts.push(<a key={k} href={match[3]} target="_blank" rel="noopener noreferrer" className="msg-link">{match[2]}</a>);
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function CodeSnippet({ code, lang }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="code-block-wrap">
      <div className="code-block-bar">
        <span className="code-lang-tag">{lang || 'code'}</span>
        <button type="button" className="code-copy-btn" onClick={handleCopy} aria-label="Copy code">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-pre"><code>{code}</code></pre>
    </div>
  );
}

function ProseBlock({ text, secKey }) {
  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;
  let currentQuote = null;
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const pText = currentParagraph.join('\n').trim();
      if (pText) {
        blocks.push({ type: 'p', content: pText });
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  const flushQuote = () => {
    if (currentQuote) {
      blocks.push({ type: 'quote', content: currentQuote.join('\n').trim() });
      currentQuote = null;
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    // Headings (###, ##, #)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      blocks.push({ type: 'heading', level, content: headingMatch[2] });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      const quoteText = trimmed.replace(/^>\s?/, '');
      if (!currentQuote) currentQuote = [];
      currentQuote.push(quoteText);
      continue;
    } else {
      flushQuote();
    }

    // Bullet list (- or *)
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Numbered list (1. 2. etc)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[2]);
      continue;
    }

    // Regular line
    flushList();
    currentParagraph.push(line);
  }

  flushAll();

  return (
    <>
      {blocks.map((block, idx) => {
        const k = `block-${secKey}-${idx}`;
        if (block.type === 'heading') {
          const Tag = block.level <= 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
          return <Tag key={k} className={`msg-heading msg-h${block.level}`}>{renderInline(block.content, k)}</Tag>;
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={k} className="msg-quote">
              {renderInline(block.content, k)}
            </blockquote>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={k} className="msg-list msg-ul">
              {block.items.map((item, itemIdx) => (
                <li key={`${k}-${itemIdx}`}>{renderInline(item, `${k}-${itemIdx}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={k} className="msg-list msg-ol">
              {block.items.map((item, itemIdx) => (
                <li key={`${k}-${itemIdx}`}>{renderInline(item, `${k}-${itemIdx}`)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'p') {
          return <p key={k} className="msg-p">{renderInline(block.content, k)}</p>;
        }
        return null;
      })}
    </>
  );
}

export default function MarkdownMessage({ text }) {
  if (!text) return null;

  // Split on code fences: ```lang?\n ... \n```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const sections = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({ type: 'prose', content: text.slice(lastIndex, match.index) });
    }
    sections.push({ type: 'code', lang: match[1]?.trim() || '', content: match[2].trimEnd() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    sections.push({ type: 'prose', content: text.slice(lastIndex) });
  }

  return (
    <div className="markdown-body">
      {sections.map((sec, secIdx) => {
        if (sec.type === 'code') {
          return <CodeSnippet key={secIdx} code={sec.content} lang={sec.lang} />;
        }
        return <ProseBlock key={secIdx} text={sec.content} secKey={secIdx} />;
      })}
    </div>
  );
}
