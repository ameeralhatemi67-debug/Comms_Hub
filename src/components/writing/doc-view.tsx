// A written document, read only, for the work page and the review screen. It draws from the checked JSON with React, so no HTML
// is ever injected. The same tables, fonts and colours as the editor (MVP_draft.md 68.2).
'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cellStyle, designOf, designVars, imageSrc, type DocMark, type DocNode } from '@/lib/writing/doc';
import { loadVersion } from './api';

function marked(text: ReactNode, marks: DocMark[] | undefined): ReactNode {
  let out = text;
  for (const m of marks ?? []) {
    if (m.type === 'bold') out = <strong>{out}</strong>;
    else if (m.type === 'italic') out = <em>{out}</em>;
    else if (m.type === 'underline') out = <u>{out}</u>;
    else if (m.type === 'strike') out = <s>{out}</s>;
    else if (m.type === 'link')
      out = (
        <a href={String(m.attrs?.href)} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      );
    else if (m.type === 'textStyle') {
      const a = m.attrs ?? {};
      const style: CSSProperties = {};
      if (a.color) style.color = String(a.color);
      if (a.backgroundColor) style.backgroundColor = String(a.backgroundColor);
      if (a.fontFamily) style.fontFamily = `'${String(a.fontFamily)}',var(--f-body)`;
      if (a.fontSize) style.fontSize = String(a.fontSize);
      out = <span style={style}>{out}</span>;
    }
  }
  return out;
}

const blockStyle = (a: Record<string, unknown> | undefined): CSSProperties => ({
  ...(a?.textAlign ? { textAlign: a.textAlign as CSSProperties['textAlign'] } : {}),
  ...(a?.lineHeight ? { lineHeight: Number(a.lineHeight) } : {}),
});

function kids(n: DocNode, work: string) {
  return (n.content ?? []).map((c, i) => <Node key={i} n={c} work={work} />);
}

function Node({ n, work }: { n: DocNode; work: string }) {
  const a = n.attrs;
  switch (n.type) {
    case 'text':
      return <>{marked(n.text, n.marks)}</>;
    case 'hardBreak':
      return <br />;
    case 'paragraph':
      return (
        <p style={blockStyle(a)} dir={a?.dir as string | undefined}>
          {kids(n, work)}
        </p>
      );
    case 'heading': {
      const H = `h${Number(a?.level ?? 2)}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <H style={blockStyle(a)} dir={a?.dir as string | undefined}>
          {kids(n, work)}
        </H>
      );
    }
    case 'blockquote':
      return <blockquote>{kids(n, work)}</blockquote>;
    case 'bulletList':
      return <ul>{kids(n, work)}</ul>;
    case 'orderedList':
      return <ol start={a?.start as number | undefined}>{kids(n, work)}</ol>;
    case 'listItem':
      return <li>{kids(n, work)}</li>;
    case 'horizontalRule':
      return <hr />;
    case 'table':
      return (
        <div className="wr-tablewrap">
          <table data-design={String(a?.design ?? 'grid')} data-lines={designOf(a?.design).lines} style={designVars(a?.design) as CSSProperties}>
            <tbody>{kids(n, work)}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr>{kids(n, work)}</tr>;
    case 'tableCell':
    case 'tableHeader': {
      const Cell = n.type === 'tableHeader' ? 'th' : 'td';
      return (
        <Cell colSpan={a?.colspan as number | undefined} rowSpan={a?.rowspan as number | undefined} style={cellStyle(a) as CSSProperties}>
          {kids(n, work)}
        </Cell>
      );
    }
    case 'image':
      return (
        <div className="wr-img" data-align={String(a?.align ?? 'center')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc(work, a ?? {})} alt={String(a?.alt ?? '')} style={{ width: `${Number(a?.width ?? 75)}%` }} />
        </div>
      );
    case 'mediaLink':
      return (
        <a className="wr-mlink" href={imageSrc(work, a ?? {})} target="_blank" rel="noopener noreferrer">
          {String(a?.name ?? '')} · الإصدار {String(a?.v ?? '')}
        </a>
      );
    default:
      return <>{kids(n, work)}</>;
  }
}

export function DocView({ doc, work }: { doc: DocNode; work: string }) {
  return <div className="wr-doc">{kids(doc, work)}</div>;
}

/** A saved version: its formatted master from Drive, and its plain copy until then or if Drive cannot answer. */
export function TextShow({ work, n, body, master }: { work: string; n: number; body: string; master?: string | null }) {
  const [doc, setDoc] = useState<DocNode | null>(null);
  useEffect(() => {
    let live = true;
    setDoc(null);
    if (master) void loadVersion(work, n).then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [work, n, master]);
  return doc ? <DocView doc={doc} work={work} /> : <div className="wk-textbox">{body}</div>;
}
