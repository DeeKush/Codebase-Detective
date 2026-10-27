import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// A render error must never leave a blank page: the round is saved, so reloading is safe.
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="lobby">
        <h1>Something broke.</h1>
        <p className="lede">Your round is saved. Reload the page to continue where you left off.</p>
        <button className="cta" onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
