import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as Sentry from '@sentry/react-native';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';

const Broken = () => {
  throw new Error('render failed');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // React logs caught render errors; keep the test output clean.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children when nothing throws', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ErrorBoundary>
          <Text>fine</Text>
        </ErrorBoundary>,
      );
    });

    expect(renderer!.root.findByType(Text).props.children).toBe('fine');
  });

  it('shows the fallback and reports the error with its component stack', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      );
    });

    const texts = renderer!.root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Oops! Something went wrong.');
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      expect.objectContaining({ contexts: { react: { componentStack: expect.any(String) } } }),
    );
  });
});
