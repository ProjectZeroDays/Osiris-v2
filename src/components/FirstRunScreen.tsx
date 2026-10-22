import { useState } from 'react';

export default function FirstRunScreen({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('operator@osiris.local');
  const [password, setPassword] = useState('');
  return (
    <div className="first-run" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1>Welcome to OSIRIS</h1>
      <p>No accounts exist yet. Create the first administrator to begin.</p>
      <label>Admin email: <input value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password: <input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button onClick={onCreated}>Create administrator</button>
    </div>
  );
}
