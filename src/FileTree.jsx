import React, { useState } from 'react';

function buildTree(paths) {
  const root = { name: '', children: {}, path: '' };
  for (const path of paths) {
    let node = root;
    path.split('/').forEach((part, i, parts) => {
      node.children[part] ??= { name: part, children: {}, path: parts.slice(0, i + 1).join('/'), file: i === parts.length - 1 };
      node = node.children[part];
    });
  }
  return root;
}
const order = nodes => Object.values(nodes).sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
const ICONS = { js: ['JS', '#e5c07b'], md: ['M↓', '#6cb6ff'], json: ['{}', '#98c379'], py: ['PY', '#61afef'] };

function Icon({ name }) {
  const [label, color] = ICONS[name.split('.').pop()] || ['•', '#9a9a9a'];
  return <span className="ficon" style={{ color }}>{label}</span>;
}

function Node({ node, depth, active, changed, onOpen, collapsed, toggle }) {
  const pad = { paddingLeft: 8 + depth * 14 };
  if (node.file) {
    return (
      <button className={`tree-item ${node.path === active ? 'active' : ''}`} style={pad} onClick={() => onOpen(node.path)}>
        <Icon name={node.name} /><span className="fname">{node.name}</span>{changed.has(node.path) && <span className="dot" title="Modified">●</span>}
      </button>
    );
  }
  const closed = collapsed.has(node.path);
  return (
    <>
      <button className="tree-item folder" style={pad} onClick={() => toggle(node.path)}>
        <span className="caret">{closed ? '▸' : '▾'}</span><span className="fname">{node.name}</span>
      </button>
      {!closed && order(node.children).map(child => <Node key={child.path} node={child} depth={depth + 1} {...{ active, changed, onOpen, collapsed, toggle }} />)}
    </>
  );
}

export default function FileTree({ paths, active, changed, onOpen }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const toggle = path => setCollapsed(old => { const next = new Set(old); next.has(path) ? next.delete(path) : next.add(path); return next; });
  const tree = buildTree(paths);
  return <div className="tree" role="tree">{order(tree.children).map(n => <Node key={n.path} node={n} depth={0} {...{ active, changed, onOpen, collapsed, toggle }} />)}</div>;
}
