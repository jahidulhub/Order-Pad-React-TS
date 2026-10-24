import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Profile } from '../types.ts';

interface Props { profile: Profile | null; onSave(profile: Profile): string | void; onCancel(): void }
export function ProfileForm({ profile, onSave, onCancel }: Props) {
  const [name, setName] = useState(profile?.name ?? '');
  const [company, setCompany] = useState(profile?.company ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    for (const field of ['name', 'company']) {
      const input = form.elements.namedItem(field) as HTMLInputElement;
      input.setCustomValidity(input.value.trim() ? '' : `Please enter ${field === 'name' ? 'your name.' : 'your company name.'}`);
    }
    if (!form.reportValidity()) return;
    setError(onSave({ name: name.trim(), company: company.trim() }) || '');
  }
  return <section id="welcome" aria-labelledby={profile ? 'page-title' : 'welcome-title'}>
    {!profile && <h1 id="welcome-title">Let’s get started</h1>}
    <p className="muted">Tell us who’s ordering. You’ll only need to do this once on this browser.</p>
    <form id="profile-form" onSubmit={submit}>
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" autoComplete="name" placeholder="e.g. Alex" maxLength={100} required value={name} onChange={event => { event.currentTarget.setCustomValidity(''); setName(event.currentTarget.value); }} />
      <label htmlFor="company">Company name</label>
      <input id="company" name="company" autoComplete="organization" placeholder="e.g. The Old Town Cafe" maxLength={150} required value={company} onChange={event => { event.currentTarget.setCustomValidity(''); setCompany(event.currentTarget.value); }} />
      <div className={profile ? 'profile-actions' : undefined}>
        {profile && <button id="cancel-profile" className="cancel-button" type="button" onClick={onCancel}>Cancel</button>}
        <button id="save-profile" type="submit" className="primary">{profile ? 'Save' : 'Go to order page →'}</button>
      </div>
      <p id="profile-error" className="error" role="alert">{error}</p>
    </form>
  </section>;
}
