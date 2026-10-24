import type { Page } from '../types.ts';
import { Icon } from './Icon.tsx';

interface Props { page: Page; hasProfile: boolean; onBack(): void; onNavigate(page: Page): void }
export function Header({ page, hasProfile, onBack, onNavigate }: Props) {
  return <header className="app-header">
    {page === 'home' ? <>
      <strong id="home-title">Order Pad</strong>
      {hasProfile && <div className="header-actions">
        <button id="settings" className="icon-button" type="button" aria-label="Settings: edit your name and company" title="Edit your details" onClick={() => onNavigate('Settings')}><Icon name="settings" /></button>
        <button id="view-items" className="icon-button" type="button" aria-label="View suggestion items" aria-controls="item-catalog" title="View suggestion items" onClick={() => onNavigate('Suggestions')}><Icon name="book" /></button>
      </div>}
    </> : <div className="subpage-header">
      <button id="header-back" className="icon-button" type="button" aria-label="Back to Order Pad" title="Back to Order Pad" onClick={onBack}><Icon name="back" /></button>
      <h1 id="page-title">{page}</h1>
    </div>}
  </header>;
}
