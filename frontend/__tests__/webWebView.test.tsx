import React, { createRef } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { webcrypto } from 'node:crypto';
import { WebView } from '../web/WebView';

test('flushes player commands on a trusted bridge message before iframe load', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const addEventListener = jest.fn();
  const evaluate = jest.fn();
  const contentWindow = { eval: evaluate };
  const onMessage = jest.fn();
  const ref = createRef<{ injectJavaScript: (script: string) => void }>();
  let tree: Renderer.ReactTestRenderer | undefined;
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'http://localhost:5173',
          href: 'http://localhost:5173/',
        },
        addEventListener,
        removeEventListener: jest.fn(),
      },
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto,
    });
    await act(async () => {
      tree = Renderer.create(
        <WebView
          ref={ref}
          source={{ html: '<html><head></head><body></body></html>' }}
          onMessage={onMessage}
        />,
        {
          createNodeMock: () => ({ contentWindow }),
        },
      );
    });
    const iframe = tree!.root.findByType('iframe');
    const channel = iframe.props.srcDoc.match(/channel:"([a-f0-9]+)"/)[1];
    const receive = addEventListener.mock.calls.find(
      call => call[0] === 'message',
    )![1];
    ref.current!.injectJavaScript('window.updateShadowing({continuous:false})');
    expect(evaluate).not.toHaveBeenCalled();
    const event = {
      source: contentWindow,
      origin: 'http://localhost:5173',
      data: { channel, data: '{"type":"ready"}' },
    };
    receive({ ...event, origin: 'https://untrusted.example' });
    expect(evaluate).not.toHaveBeenCalled();
    receive(event);
    expect(evaluate).toHaveBeenCalledWith(
      'window.updateShadowing({continuous:false})',
    );
    expect(onMessage).toHaveBeenCalledTimes(1);
    ref.current!.injectJavaScript('window.player.pauseVideo()');
    expect(evaluate).toHaveBeenLastCalledWith('window.player.pauseVideo()');
    await act(async () => iframe.props.onLoad());
    expect(evaluate).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => tree?.unmount());
    if (originalWindow)
      Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalCrypto)
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});
