/**
 * The language comes from the server (the `sg-language` cookie), so the first
 * render is already translated and a choice is written back to the cookie.
 */
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from './LocaleProvider';
import { Tr } from './website';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'sg-language' ? { value: cookie } : undefined) }),
}));
let cookie = '';

function Picker() {
  const { setLanguage } = useLocale();
  return <button type="button" onClick={() => setLanguage('hi')}><Tr>Help</Tr></button>;
}

afterEach(() => {
  document.cookie = 'sg-language=; path=/; max-age=0';
  localStorage.clear();
});

describe('LocaleProvider and the sg-language cookie', () => {
  it('renders the server language in the first HTML', () => {
    const html = renderToString(<LocaleProvider initialLanguage="te"><Tr>Help</Tr></LocaleProvider>);
    expect(html).toContain('సహాయం');
  });

  it('writes the cookie for a year when the visitor picks a language', async () => {
    render(<LocaleProvider><Picker /></LocaleProvider>);
    await act(async () => { screen.getByRole('button').click(); });
    expect(document.cookie).toContain('sg-language=hi');
    expect(screen.getByRole('button').textContent).toBe('मदद');
  });

  it('copies a choice stored before the cookie existed into it', async () => {
    localStorage.setItem('sg-language', 'es');
    render(<LocaleProvider><Tr>Help</Tr></LocaleProvider>);
    await act(async () => {});
    expect(document.cookie).toContain('sg-language=es');
  });

  it('keeps English without a cookie, whatever the browser prefers', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['te-IN']);
    const { container } = render(<LocaleProvider><Tr>Help</Tr></LocaleProvider>);
    await act(async () => {});
    expect(container.textContent).toBe('Help');
  });

  it('reads the cookie on the server, and falls back to English', async () => {
    const { requestLanguage, localized } = await import('./server');
    cookie = 'te';
    expect(await requestLanguage()).toBe('te');
    expect((await localized({ title: 'Help — SaaradhiGo' })()).title).toBe('సహాయం — SaaradhiGo');
    cookie = 'xx';
    expect(await requestLanguage()).toBe('en');
  });
});
