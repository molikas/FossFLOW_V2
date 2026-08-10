/**
 * Notification severity precedence — E4/CLIP-10 (ADR 0011).
 *
 * The notification is a single slot. An unread ERROR must never be displaced
 * by an informational toast: progress/success messages are routine (routing
 * N%, pasted N items) and used to bury failure reports — a failed save under
 * a paste toast is unsaved work the user was told nothing about. Errors and
 * explicit clears always land.
 *
 * Promoted from the retired exploratory lane (mop-up wave, 2026-08-10).
 * known_issues: "The notification slot has no queue — a later toast silently
 * buries an unread error".
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  UiStateProvider,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <UiStateProvider>{children}</UiStateProvider>
);

const setup = () => renderHook(() => useUiStateStoreApi(), { wrapper: Providers });

describe('setNotification severity precedence (CLIP-10)', () => {
  it('a success toast does not displace a live error', () => {
    const { result } = setup();
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'error',
        message: 'Could not save your diagram'
      });
    });
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'success',
        message: 'Pasted 3 items'
      });
    });
    expect(result.current.getState().notification?.severity).toBe('error');
    expect(result.current.getState().notification?.message).toMatch(/save/i);
  });

  it('a later error replaces an earlier error', () => {
    const { result } = setup();
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'error',
        message: 'first failure'
      });
    });
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'error',
        message: 'second failure'
      });
    });
    expect(result.current.getState().notification?.message).toBe(
      'second failure'
    );
  });

  it('an explicit clear always lands, and the next toast flows normally', () => {
    const { result } = setup();
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'error',
        message: 'failure'
      });
    });
    act(() => {
      result.current.getState().actions.setNotification(null);
    });
    expect(result.current.getState().notification).toBeNull();

    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'info',
        message: 'routing 40%'
      });
    });
    expect(result.current.getState().notification?.severity).toBe('info');
  });

  it('non-error toasts still replace each other', () => {
    const { result } = setup();
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'info',
        message: 'routing 40%'
      });
    });
    act(() => {
      result.current.getState().actions.setNotification({
        severity: 'success',
        message: 'Pasted 3 items'
      });
    });
    expect(result.current.getState().notification?.severity).toBe('success');
  });
});
